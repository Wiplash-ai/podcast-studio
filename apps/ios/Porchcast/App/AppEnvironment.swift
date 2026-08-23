import Foundation

nonisolated struct AppEnvironment: Sendable {
    static let runtimeEnvironmentKey = "PORCHCAST_RUNTIME"

    let configuration: AppConfiguration
    let adapterMode: RuntimeAdapterMode
    let authentication: any AuthenticationService
    let porches: any PorchRepository
    let media: any MediaSessionService
    let recordings: any RecordingService
    let entitlements: any EntitlementService
    let notifications: any NotificationService
    let watchBridge: any WatchBridge

    /// Local Debug launches start in the deterministic offline experience so
    /// a fresh checkout is immediately runnable without private services.
    /// Release builds remain Cloud-first, and any explicit runtime value wins.
    static func selectedForAppLaunch(
        runtimeValue: String? = ProcessInfo.processInfo.environment[runtimeEnvironmentKey],
        configuration: AppConfiguration = .cloudDefault
    ) -> AppEnvironment {
        #if DEBUG
        let isDebugBuild = true
        #else
        let isDebugBuild = false
        #endif

        return selectedForAppLaunch(
            runtimeValue: runtimeValue,
            configuration: configuration,
            isDebugBuild: isDebugBuild
        )
    }

    static func selectedForAppLaunch(
        runtimeValue: String?,
        configuration: AppConfiguration = .cloudDefault,
        isDebugBuild: Bool
    ) -> AppEnvironment {
        if runtimeValue != nil {
            return selected(runtimeValue: runtimeValue, configuration: configuration)
        }
        if isDebugBuild {
            return .deterministicDemo(configuration: configuration)
        }
        return selected(runtimeValue: nil, configuration: configuration)
    }

    /// Cloud is the default. Demo mode requires an explicit environment value
    /// or configuration preference. Unknown environment values fail to Cloud.
    static func selected(
        runtimeValue: String? = ProcessInfo.processInfo.environment[runtimeEnvironmentKey],
        configuration: AppConfiguration = .cloudDefault
    ) -> AppEnvironment {
        if let runtimeValue {
            if runtimeValue.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "demo" {
                return .deterministicDemo(configuration: configuration)
            }
            return .cloud(configuration: configuration)
        }

        switch configuration.preferredBackend {
        case .cloud:
            return .cloud(configuration: configuration)
        case .demo:
            return .deterministicDemo(configuration: configuration)
        }
    }

    static func cloud(
        configuration: AppConfiguration = .cloudDefault
    ) -> AppEnvironment {
        AppEnvironment(
            configuration: configuration,
            adapterMode: .cloud,
            authentication: UnavailableCloudAuthenticationService(),
            porches: UnavailableCloudPorchRepository(),
            media: UnavailableCloudMediaSessionService(),
            recordings: UnavailableCloudRecordingService(),
            entitlements: UnavailableCloudEntitlementService(),
            notifications: UnavailableCloudNotificationService(),
            watchBridge: UnavailableCloudWatchBridge()
        )
    }

    /// The intended production configuration remains Cloud-first. Every
    /// injected adapter here is deterministic and performs no I/O, so the
    /// source scaffold is safe to launch before live adapters exist.
    static func deterministicDemo(
        configuration: AppConfiguration = .cloudDefault
    ) -> AppEnvironment {
        let recordings = DemoRecordingService()

        return AppEnvironment(
            configuration: configuration,
            adapterMode: .deterministicDemo,
            authentication: DemoAuthenticationService(),
            porches: DemoPorchRepository(
                universalLinkHost: configuration.cloud.universalLinkHost
            ),
            media: DemoMediaSessionService(),
            recordings: recordings,
            entitlements: DemoEntitlementService(),
            notifications: DemoNotificationService(),
            watchBridge: DemoWatchBridge()
        )
    }
}

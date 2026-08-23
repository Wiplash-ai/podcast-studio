import Foundation

nonisolated struct AppConfiguration: Equatable, Sendable {
    enum PreferredBackend: String, CaseIterable, Sendable, Identifiable {
        case cloud
        case demo

        var id: Self { self }
    }

    struct Cloud: Equatable, Sendable {
        var apiBaseURL: URL
        var oidcIssuerURL: URL
        var oidcClientID: String
        var callbackScheme: String
        var universalLinkHost: String
    }

    var preferredBackend: PreferredBackend
    var cloud: Cloud

    static let cloudDefault = AppConfiguration(
        preferredBackend: .cloud,
        cloud: Cloud(
            apiBaseURL: URL(string: "https://labs.wiplash.ai/v1")!,
            oidcIssuerURL: URL(string: "https://labs.wiplash.ai")!,
            oidcClientID: "porchcast-ios",
            callbackScheme: "porchcast",
            universalLinkHost: "labs.wiplash.ai"
        )
    )
}

nonisolated enum RuntimeAdapterMode: String, Equatable, Sendable {
    case deterministicDemo
    case cloud
}

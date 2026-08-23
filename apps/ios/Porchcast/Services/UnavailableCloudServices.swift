import Foundation

nonisolated enum UnavailableCloudAdapter {
    static let message = "Cloud adapters are not connected in this source scaffold. Set PORCHCAST_RUNTIME=demo to run the deterministic local UI."

    static var error: PorchcastError {
        .unavailable(message)
    }
}

nonisolated struct UnavailableCloudAuthenticationService: AuthenticationService {
    func currentAccount() async throws -> Account { throw UnavailableCloudAdapter.error }
    func signIn() async throws -> Account { throw UnavailableCloudAdapter.error }
    func signOut() async throws -> Account { throw UnavailableCloudAdapter.error }
}

nonisolated struct UnavailableCloudPorchRepository: PorchRepository {
    func listPorches(for account: Account) async throws -> [PorchSummary] {
        throw UnavailableCloudAdapter.error
    }

    func createPorch(
        _ request: CreatePorchRequest,
        host: Account
    ) async throws -> PorchSummary {
        throw UnavailableCloudAdapter.error
    }

    func resolvePorch(_ reference: JoinReference) async throws -> PorchSummary {
        throw UnavailableCloudAdapter.error
    }

    func loadPorch(id: PorchID) async throws -> PorchSummary {
        throw UnavailableCloudAdapter.error
    }
}

nonisolated struct UnavailableCloudMediaSessionService: MediaSessionService {
    func connect(
        to porch: PorchSummary,
        as account: Account,
        consent: ParticipantConsent
    ) async throws -> StudioSnapshot {
        throw UnavailableCloudAdapter.error
    }

    func setMicrophoneEnabled(_ enabled: Bool) async throws -> StudioSnapshot {
        throw UnavailableCloudAdapter.error
    }

    func setCameraEnabled(_ enabled: Bool) async throws -> StudioSnapshot {
        throw UnavailableCloudAdapter.error
    }

    func setSpeakerEnabled(_ enabled: Bool) async throws -> StudioSnapshot {
        throw UnavailableCloudAdapter.error
    }

    func sendMessage(_ body: String) async throws -> StudioSnapshot {
        throw UnavailableCloudAdapter.error
    }

    func disconnect() async {}
}

nonisolated struct UnavailableCloudRecordingService: RecordingService {
    func history(for account: Account) async throws -> [RecordingSummary] {
        throw UnavailableCloudAdapter.error
    }

    func startCloudRecording(for porch: PorchSummary) async throws -> RecordingState {
        throw UnavailableCloudAdapter.error
    }

    func stopCloudRecording(for porch: PorchSummary) async throws -> RecordingState {
        throw UnavailableCloudAdapter.error
    }
}

nonisolated struct UnavailableCloudEntitlementService: EntitlementService {
    func currentEntitlements(for account: Account) async throws -> Entitlements {
        throw UnavailableCloudAdapter.error
    }
}

nonisolated struct UnavailableCloudNotificationService: NotificationService {
    func prepareForAdmissionAndRecordingNotifications() async throws {
        throw UnavailableCloudAdapter.error
    }
}

/// WatchBridge cannot report errors through its interface. Until a live bridge
/// exists, Cloud composition drops status publication without storing fake state.
nonisolated struct UnavailableCloudWatchBridge: WatchBridge {
    func publish(_ status: WatchPorchStatus) async {}
    func publishRecordingReady(_ recording: RecordingSummary) async {}
}

import Foundation

nonisolated protocol AuthenticationService: Sendable {
    func currentAccount() async throws -> Account
    func signIn() async throws -> Account
    func signOut() async throws -> Account
}

/// Application-facing data seam. A live adapter owns OpenAPI transport,
/// credentials, response validation, pagination, and service error mapping.
nonisolated protocol PorchRepository: Sendable {
    func listPorches(for account: Account) async throws -> [PorchSummary]
    func createPorch(_ request: CreatePorchRequest, host: Account) async throws -> PorchSummary
    func resolvePorch(_ reference: JoinReference) async throws -> PorchSummary
    func loadPorch(id: PorchID) async throws -> PorchSummary
}

/// Owns one native media session. A future live adapter contains WHIP/WHEP and
/// WebRTC details; views only send participant intents and render snapshots.
nonisolated protocol MediaSessionService: Sendable {
    func connect(
        to porch: PorchSummary,
        as account: Account,
        consent: ParticipantConsent
    ) async throws -> StudioSnapshot
    func setMicrophoneEnabled(_ enabled: Bool) async throws -> StudioSnapshot
    func setCameraEnabled(_ enabled: Bool) async throws -> StudioSnapshot
    func setSpeakerEnabled(_ enabled: Bool) async throws -> StudioSnapshot
    func sendMessage(_ body: String) async throws -> StudioSnapshot
    func disconnect() async
}

/// Cloud recording is the default provider. This seam also leaves room for a
/// future local provider without exposing provider state to SwiftUI.
nonisolated protocol RecordingService: Sendable {
    func history(for account: Account) async throws -> [RecordingSummary]
    func startCloudRecording(for porch: PorchSummary) async throws -> RecordingState
    func stopCloudRecording(for porch: PorchSummary) async throws -> RecordingState
}

/// Entitlements are read-only in native v1. A future StoreKit adapter can
/// conform without coupling billing UI to the studio.
nonisolated protocol EntitlementService: Sendable {
    func currentEntitlements(for account: Account) async throws -> Entitlements
}

nonisolated protocol NotificationService: Sendable {
    func prepareForAdmissionAndRecordingNotifications() async throws
}

/// No watchOS target ships in v1. This interface reserves status publication,
/// ready alerts, and "open on iPhone" handoff for a future bridge adapter.
nonisolated protocol WatchBridge: Sendable {
    func publish(_ status: WatchPorchStatus) async
    func publishRecordingReady(_ recording: RecordingSummary) async
}

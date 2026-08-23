import Foundation
import Observation

@MainActor
@Observable
final class AppModel {
    enum PresentedSheet: String, Identifiable {
        case createPorch
        case joinPorch

        var id: Self { self }
    }

    let environment: AppEnvironment

    private(set) var account: Account?
    private(set) var porches: [PorchSummary] = []
    private(set) var recordings: [RecordingSummary] = []
    private(set) var entitlements = Entitlements.unavailable
    private(set) var pendingPorch: PorchSummary?
    private(set) var studio: StudioSnapshot?
    private(set) var isLoaded = false
    private(set) var launchFailureMessage: String?
    private(set) var isBusy = false
    private(set) var isMediaIntentInFlight = false
    var presentedSheet: PresentedSheet?
    var errorMessage: String?

    init(environment: AppEnvironment) {
        self.environment = environment
    }

    var isDeterministicDemo: Bool {
        environment.adapterMode == .deterministicDemo
    }

    var preferredBackendName: String {
        environment.configuration.preferredBackend == .cloud ? "Cloud" : "Demo"
    }

    func launch() async {
        guard !isLoaded, !isBusy else { return }
        isBusy = true
        launchFailureMessage = nil
        defer { isBusy = false }

        do {
            let account = try await environment.authentication.currentAccount()
            self.account = account
            porches = try await environment.porches.listPorches(for: account)
            recordings = try await environment.recordings.history(for: account)
            entitlements = try await environment.entitlements.currentEntitlements(for: account)
            isLoaded = true
        } catch {
            launchFailureMessage = Self.message(for: error)
            report(error)
        }
    }

    func refreshPorches() async {
        guard let account, !isBusy else { return }
        do {
            porches = try await environment.porches.listPorches(for: account)
        } catch {
            report(error)
        }
    }

    func createPorch(_ request: CreatePorchRequest) async {
        guard let account, !isBusy else { return }
        isBusy = true
        defer { isBusy = false }

        do {
            let porch = try await environment.porches.createPorch(request, host: account)
            presentedSheet = nil
            pendingPorch = porch
            upsertPorch(porch)

            do {
                let refreshedPorches = try await environment.porches.listPorches(for: account)
                porches = Self.upserting(porch, in: refreshedPorches)
            } catch {
                // Creation already succeeded. Keep the returned Porch so a
                // transient list failure cannot turn a retry into a duplicate.
            }
        } catch {
            report(error)
        }
    }

    func joinPorch(using reference: JoinReference) async {
        guard !isBusy else { return }
        isBusy = true
        defer { isBusy = false }

        do {
            let porch = try await environment.porches.resolvePorch(reference)
            presentedSheet = nil
            pendingPorch = porch
        } catch {
            report(error)
        }
    }

    func prepareToJoin(_ porch: PorchSummary) {
        guard porch.participantCount < porch.capacity else {
            report(PorchcastError.capacityReached)
            return
        }
        pendingPorch = porch
    }

    func cancelConsent() {
        pendingPorch = nil
    }

    func connect(with consent: ParticipantConsent) async {
        guard let account, let pendingPorch, !isBusy else { return }
        isBusy = true
        defer { isBusy = false }

        do {
            let snapshot = try await environment.media.connect(
                to: pendingPorch,
                as: account,
                consent: consent
            )
            studio = snapshot
            self.pendingPorch = nil
            await publishWatchStatus(for: snapshot)
        } catch {
            report(error)
        }
    }

    func setMicrophoneEnabled(_ enabled: Bool) async {
        await updateStudio {
            try await environment.media.setMicrophoneEnabled(enabled)
        }
    }

    func setCameraEnabled(_ enabled: Bool) async {
        await updateStudio {
            try await environment.media.setCameraEnabled(enabled)
        }
    }

    func setSpeakerEnabled(_ enabled: Bool) async {
        await updateStudio {
            try await environment.media.setSpeakerEnabled(enabled)
        }
    }

    func sendMessage(_ body: String) async -> Bool {
        guard !isMediaIntentInFlight, let expectedPorchID = studio?.porch.id else {
            return false
        }
        isMediaIntentInFlight = true
        defer { isMediaIntentInFlight = false }

        do {
            let snapshot = try await environment.media.sendMessage(body)
            guard studio?.porch.id == expectedPorchID else { return false }
            studio = snapshot
            return true
        } catch {
            report(error)
            return false
        }
    }

    func toggleRecording() async {
        guard var snapshot = studio, !isMediaIntentInFlight else { return }
        guard entitlements.canUseCloudRecording else {
            report(PorchcastError.unavailable("Cloud recording is not included for this account."))
            return
        }
        guard snapshot.porch.cloudRecordingEnabled else {
            report(PorchcastError.unavailable("Cloud recording was disabled for this Porch."))
            return
        }
        let expectedPorchID = snapshot.porch.id
        var shouldRefreshHistory = false
        isMediaIntentInFlight = true
        defer { isMediaIntentInFlight = false }

        do {
            switch snapshot.recordingState {
            case .idle:
                snapshot.recordingState = try await environment.recordings
                    .startCloudRecording(for: snapshot.porch)
            case .recording:
                snapshot.recordingState = try await environment.recordings
                    .stopCloudRecording(for: snapshot.porch)
                shouldRefreshHistory = true
            case .processing:
                return
            }
            guard studio?.porch.id == expectedPorchID else { return }
            studio = snapshot
            await publishWatchStatus(for: snapshot)

            if shouldRefreshHistory, let account {
                do {
                    recordings = try await environment.recordings.history(for: account)
                } catch {
                    report(error)
                }
            }
        } catch {
            report(error)
        }
    }

    func leaveStudio() async {
        guard let snapshot = studio, !isMediaIntentInFlight else { return }
        let expectedPorchID = snapshot.porch.id
        isMediaIntentInFlight = true
        defer { isMediaIntentInFlight = false }

        var finalizationError: Error?
        if case .recording = snapshot.recordingState {
            do {
                _ = try await environment.recordings.stopCloudRecording(for: snapshot.porch)
                if let account {
                    do {
                        recordings = try await environment.recordings.history(for: account)
                    } catch {
                        finalizationError = error
                    }
                }
            } catch {
                finalizationError = error
            }
        }

        await environment.media.disconnect()
        if studio?.porch.id == expectedPorchID {
            studio = nil
        }
        await environment.watchBridge.publish(.idle)

        if let finalizationError {
            report(finalizationError)
        }
    }

    func toggleAccount() async {
        guard !isBusy else { return }
        isBusy = true
        defer { isBusy = false }

        do {
            let newAccount: Account
            if account?.kind == .registered {
                newAccount = try await environment.authentication.signOut()
            } else {
                newAccount = try await environment.authentication.signIn()
            }

            account = newAccount
            porches = []
            recordings = []
            entitlements = .unavailable

            let refreshedPorches = try await environment.porches.listPorches(for: newAccount)
            let refreshedRecordings = try await environment.recordings.history(for: newAccount)
            let refreshedEntitlements = try await environment.entitlements
                .currentEntitlements(for: newAccount)
            porches = refreshedPorches
            recordings = refreshedRecordings
            entitlements = refreshedEntitlements
        } catch {
            report(error)
        }
    }

    func dismissError() {
        errorMessage = nil
    }

    private func updateStudio(
        operation: () async throws -> StudioSnapshot
    ) async {
        guard !isMediaIntentInFlight, let expectedPorchID = studio?.porch.id else {
            return
        }
        isMediaIntentInFlight = true
        defer { isMediaIntentInFlight = false }

        do {
            let snapshot = try await operation()
            guard studio?.porch.id == expectedPorchID else { return }
            studio = snapshot
            await publishWatchStatus(for: snapshot)
        } catch {
            report(error)
        }
    }

    private func publishWatchStatus(for snapshot: StudioSnapshot) async {
        let isRecording: Bool
        if case .recording = snapshot.recordingState {
            isRecording = true
        } else {
            isRecording = false
        }
        await environment.watchBridge.publish(
            WatchPorchStatus(
                porchID: snapshot.porch.id,
                title: snapshot.porch.title,
                participantCount: snapshot.participants.count,
                isRecording: isRecording
            )
        )
    }

    private func upsertPorch(_ porch: PorchSummary) {
        porches = Self.upserting(porch, in: porches)
    }

    private static func upserting(
        _ porch: PorchSummary,
        in porches: [PorchSummary]
    ) -> [PorchSummary] {
        [porch] + porches.filter { $0.id != porch.id }
    }

    private func report(_ error: Error) {
        errorMessage = Self.message(for: error)
    }

    private static func message(for error: Error) -> String {
        (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
    }
}

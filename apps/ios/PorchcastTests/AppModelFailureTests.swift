import Foundation
import Testing
@testable import Porchcast

@MainActor
struct AppModelFailureTests {
    @Test("A created Porch survives a follow-up list failure")
    func createCommitsBeforeRefreshing() async {
        let createdPorch = PorchSummary(
            id: PorchID("created-before-refresh-failure"),
            title: "Resilient room",
            topic: "Keep successful writes visible",
            hostName: DemoFixtures.anonymousAccount.displayName,
            inviteCode: "SAFE-01",
            participantCount: 1,
            capacity: 5,
            activity: .live,
            admissionMode: .hostApproval,
            cloudRecordingEnabled: true
        )
        let repository = SequencedPorchRepository(
            porches: [],
            createdPorch: createdPorch,
            failListAfterFirstCall: true
        )
        let model = AppModel(
            environment: testEnvironment(
                authentication: TestAuthenticationService(),
                porches: repository,
                media: TrackingMediaSessionService(),
                recordings: ControlledRecordingService()
            )
        )

        await model.launch()
        model.presentedSheet = .createPorch
        await model.createPorch(
            CreatePorchRequest(
                title: createdPorch.title,
                topic: createdPorch.topic,
                guestCapacity: 4,
                admissionMode: .hostApproval,
                cloudRecordingEnabled: true
            )
        )

        let createCount = await repository.createCount()
        #expect(createCount == 1)
        #expect(model.presentedSheet == nil)
        #expect(model.pendingPorch?.id == createdPorch.id)
        #expect(model.porches.first?.id == createdPorch.id)
        #expect(model.errorMessage == nil)
    }

    @Test("A stopped recording stays stopped when history refresh fails")
    func stopCommitsBeforeRefreshingHistory() async {
        let porch = DemoFixtures.porches[1]
        let recording = ControlledRecordingService(mode: .historyFailsAfterFirstCall)
        let model = AppModel(
            environment: testEnvironment(
                authentication: TestAuthenticationService(),
                porches: SequencedPorchRepository(porches: [porch]),
                media: TrackingMediaSessionService(),
                recordings: recording
            )
        )

        await model.launch()
        model.prepareToJoin(porch)
        await model.connect(with: acceptedConsent)
        await model.toggleRecording()
        await model.toggleRecording()

        #expect(model.studio?.recordingState == RecordingState.idle)
        #expect(model.errorMessage == AppModelTestFailure.recordingHistory.errorDescription)

        await model.toggleRecording()
        let startCount = await recording.startCount()
        #expect(startCount == 2)
        if case .recording = model.studio?.recordingState {
            // A new recording can start because the prior stop was committed.
        } else {
            Issue.record("Expected recording to restart after the history failure")
        }
    }

    @Test("Leaving disconnects media even when recording finalization fails")
    func leaveAlwaysDisconnects() async {
        let porch = DemoFixtures.porches[1]
        let media = TrackingMediaSessionService()
        let recording = ControlledRecordingService(mode: .stopFails)
        let model = AppModel(
            environment: testEnvironment(
                authentication: TestAuthenticationService(),
                porches: SequencedPorchRepository(porches: [porch]),
                media: media,
                recordings: recording
            )
        )

        await model.launch()
        model.prepareToJoin(porch)
        await model.connect(with: acceptedConsent)
        await model.toggleRecording()
        await model.leaveStudio()

        let disconnectCount = await media.disconnectCount()
        #expect(disconnectCount == 1)
        #expect(model.studio == nil)
        #expect(model.errorMessage == AppModelTestFailure.recordingStop.errorDescription)
    }

    @Test("Sign-out clears prior account data before reload")
    func signOutDoesNotLeakPriorAccountState() async {
        let porch = DemoFixtures.porches[1]
        let repository = SequencedPorchRepository(
            porches: [porch],
            failListAfterFirstCall: true
        )
        let recording = ControlledRecordingService(
            recordings: DemoFixtures.recordingHistory
        )
        let model = AppModel(
            environment: testEnvironment(
                authentication: TestAuthenticationService(
                    account: DemoFixtures.registeredAccount
                ),
                porches: repository,
                media: TrackingMediaSessionService(),
                recordings: recording
            )
        )

        await model.launch()
        #expect(!model.porches.isEmpty)
        #expect(!model.recordings.isEmpty)

        await model.toggleAccount()

        #expect(model.account?.kind == .anonymous)
        #expect(model.porches.isEmpty)
        #expect(model.recordings.isEmpty)
        #expect(model.entitlements == .unavailable)
        #expect(model.errorMessage == AppModelTestFailure.porchReload.errorDescription)
    }

    @Test("Launch defers notification permission to a contextual trigger")
    func launchDoesNotPrepareNotifications() async {
        let notifications = TestNotificationService(shouldFail: true)
        let model = AppModel(
            environment: testEnvironment(
                authentication: TestAuthenticationService(),
                porches: SequencedPorchRepository(porches: []),
                media: TrackingMediaSessionService(),
                recordings: ControlledRecordingService(),
                notifications: notifications
            )
        )

        await model.launch()

        let prepareCount = await notifications.prepareCount()
        #expect(prepareCount == 0)
        #expect(model.isLoaded)
        #expect(model.launchFailureMessage == nil)
        #expect(model.account == DemoFixtures.anonymousAccount)
        #expect(model.errorMessage == nil)
    }

    private var acceptedConsent: ParticipantConsent {
        ParticipantConsent(
            allowsMicrophoneAndCamera: true,
            allowsCloudRecording: true
        )
    }
}

@MainActor
private func testEnvironment(
    authentication: any AuthenticationService,
    porches: any PorchRepository,
    media: any MediaSessionService,
    recordings: any RecordingService,
    notifications: any NotificationService = TestNotificationService()
) -> AppEnvironment {
    AppEnvironment(
        configuration: .cloudDefault,
        adapterMode: .deterministicDemo,
        authentication: authentication,
        porches: porches,
        media: media,
        recordings: recordings,
        entitlements: DemoEntitlementService(),
        notifications: notifications,
        watchBridge: DemoWatchBridge()
    )
}

nonisolated private enum AppModelTestFailure: Error, LocalizedError, Sendable {
    case porchReload
    case recordingHistory
    case recordingStop
    case notificationDenied

    var errorDescription: String? {
        switch self {
        case .porchReload: "Porch reload failed."
        case .recordingHistory: "Recording history failed."
        case .recordingStop: "Recording stop failed."
        case .notificationDenied: "Notifications were denied."
        }
    }
}

private actor TestAuthenticationService: AuthenticationService {
    private var account: Account

    init(account: Account = DemoFixtures.anonymousAccount) {
        self.account = account
    }

    func currentAccount() async throws -> Account {
        account
    }

    func signIn() async throws -> Account {
        account = DemoFixtures.registeredAccount
        return account
    }

    func signOut() async throws -> Account {
        account = DemoFixtures.anonymousAccount
        return account
    }
}

private actor SequencedPorchRepository: PorchRepository {
    private let porches: [PorchSummary]
    private let createdPorch: PorchSummary?
    private let failListAfterFirstCall: Bool
    private var listCallCount = 0
    private var porchCreateCount = 0

    init(
        porches: [PorchSummary],
        createdPorch: PorchSummary? = nil,
        failListAfterFirstCall: Bool = false
    ) {
        self.porches = porches
        self.createdPorch = createdPorch
        self.failListAfterFirstCall = failListAfterFirstCall
    }

    func listPorches(for account: Account) async throws -> [PorchSummary] {
        listCallCount += 1
        if failListAfterFirstCall, listCallCount > 1 {
            throw AppModelTestFailure.porchReload
        }
        return porches
    }

    func createPorch(
        _ request: CreatePorchRequest,
        host: Account
    ) async throws -> PorchSummary {
        porchCreateCount += 1
        guard let createdPorch else {
            throw PorchcastError.unavailable("No created Porch fixture was configured.")
        }
        return createdPorch
    }

    func resolvePorch(_ reference: JoinReference) async throws -> PorchSummary {
        guard let porch = porches.first else { throw PorchcastError.porchNotFound }
        return porch
    }

    func loadPorch(id: PorchID) async throws -> PorchSummary {
        guard let porch = porches.first(where: { $0.id == id }) else {
            throw PorchcastError.porchNotFound
        }
        return porch
    }

    func createCount() -> Int {
        porchCreateCount
    }
}

private actor TrackingMediaSessionService: MediaSessionService {
    private var snapshot: StudioSnapshot?
    private var mediaDisconnectCount = 0

    func connect(
        to porch: PorchSummary,
        as account: Account,
        consent: ParticipantConsent
    ) async throws -> StudioSnapshot {
        guard consent.allowsMicrophoneAndCamera,
              !porch.cloudRecordingEnabled || consent.allowsCloudRecording else {
            throw PorchcastError.consentRequired
        }
        let localID = ParticipantID("test-local-participant")
        let connected = StudioSnapshot(
            porch: porch,
            localParticipantID: localID,
            participants: [
                Participant(
                    id: localID,
                    displayName: account.displayName,
                    role: .guest,
                    connectionQuality: .excellent,
                    isMuted: false,
                    isCameraEnabled: true,
                    isSpeaking: false
                )
            ],
            messages: [],
            localMedia: .initial,
            connectionState: .connected,
            recordingState: .idle
        )
        snapshot = connected
        return connected
    }

    func setMicrophoneEnabled(_ enabled: Bool) async throws -> StudioSnapshot {
        try currentSnapshot()
    }

    func setCameraEnabled(_ enabled: Bool) async throws -> StudioSnapshot {
        try currentSnapshot()
    }

    func setSpeakerEnabled(_ enabled: Bool) async throws -> StudioSnapshot {
        try currentSnapshot()
    }

    func sendMessage(_ body: String) async throws -> StudioSnapshot {
        try currentSnapshot()
    }

    func disconnect() async {
        mediaDisconnectCount += 1
        snapshot = nil
    }

    func disconnectCount() -> Int {
        mediaDisconnectCount
    }

    private func currentSnapshot() throws -> StudioSnapshot {
        guard let snapshot else {
            throw PorchcastError.unavailable("No test media session is connected.")
        }
        return snapshot
    }
}

nonisolated private enum RecordingFailureMode: Sendable {
    case stable
    case historyFailsAfterFirstCall
    case stopFails
}

private actor ControlledRecordingService: RecordingService {
    private let mode: RecordingFailureMode
    private let recordings: [RecordingSummary]
    private var historyCallCount = 0
    private var recordingStartCount = 0
    private var state = RecordingState.idle

    init(
        mode: RecordingFailureMode = .stable,
        recordings: [RecordingSummary] = []
    ) {
        self.mode = mode
        self.recordings = recordings
    }

    func history(for account: Account) async throws -> [RecordingSummary] {
        historyCallCount += 1
        if case .historyFailsAfterFirstCall = mode, historyCallCount > 1 {
            throw AppModelTestFailure.recordingHistory
        }
        return recordings
    }

    func startCloudRecording(for porch: PorchSummary) async throws -> RecordingState {
        recordingStartCount += 1
        state = .recording(startedAt: Date(timeIntervalSince1970: 1_783_420_800))
        return state
    }

    func stopCloudRecording(for porch: PorchSummary) async throws -> RecordingState {
        if case .stopFails = mode {
            throw AppModelTestFailure.recordingStop
        }
        state = .idle
        return state
    }

    func startCount() -> Int {
        recordingStartCount
    }
}

private actor TestNotificationService: NotificationService {
    private let shouldFail: Bool
    private var notificationPrepareCount = 0

    init(shouldFail: Bool = false) {
        self.shouldFail = shouldFail
    }

    func prepareForAdmissionAndRecordingNotifications() async throws {
        notificationPrepareCount += 1
        if shouldFail {
            throw AppModelTestFailure.notificationDenied
        }
    }

    func prepareCount() -> Int {
        notificationPrepareCount
    }
}

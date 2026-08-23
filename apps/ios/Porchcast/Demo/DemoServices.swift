import Foundation

actor DemoAuthenticationService: AuthenticationService {
    private var account = DemoFixtures.anonymousAccount

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

actor DemoPorchRepository: PorchRepository {
    private var storedPorches = DemoFixtures.porches
    private var nextPorchNumber = 1
    private let universalLinkHost: String

    init(universalLinkHost: String = "labs.wiplash.ai") {
        self.universalLinkHost = universalLinkHost.lowercased()
    }

    func listPorches(for account: Account) async throws -> [PorchSummary] {
        storedPorches
    }

    func createPorch(
        _ request: CreatePorchRequest,
        host: Account
    ) async throws -> PorchSummary {
        let title = request.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let topic = request.topic.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !title.isEmpty else {
            throw PorchcastError.invalidInput("Give the Porch a title.")
        }
        guard !topic.isEmpty else {
            throw PorchcastError.invalidInput("Add a topic so guests know what to expect.")
        }
        guard (1...12).contains(request.guestCapacity) else {
            throw PorchcastError.invalidInput("Choose room for 1 to 12 guests.")
        }

        let sequence = nextPorchNumber
        nextPorchNumber += 1
        let porch = PorchSummary(
            id: PorchID("demo-created-\(sequence)"),
            title: title,
            topic: topic,
            hostName: host.displayName,
            inviteCode: String(format: "DEMO-%02d", sequence),
            participantCount: 1,
            capacity: request.guestCapacity + 1,
            activity: .live,
            admissionMode: request.admissionMode,
            cloudRecordingEnabled: request.cloudRecordingEnabled
        )
        storedPorches.insert(porch, at: 0)
        return porch
    }

    func resolvePorch(_ reference: JoinReference) async throws -> PorchSummary {
        let candidate: String
        switch reference {
        case .inviteCode(let value):
            candidate = value
        case .universalLink(let url):
            let scheme = url.scheme?.lowercased()
            let isExpectedHTTPSLink = scheme == "https" &&
                url.host?.lowercased() == universalLinkHost
            let isExpectedCallback = scheme == "porchcast" &&
                ["join", "porch"].contains(url.host?.lowercased() ?? "")
            guard isExpectedHTTPSLink || isExpectedCallback else {
                throw PorchcastError.invalidInput(
                    "Use a \(universalLinkHost) invite or Porchcast join link."
                )
            }
            let queryCode = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?
                .first(where: { $0.name == "code" })?
                .value
            candidate = queryCode ?? url.lastPathComponent
        }

        let normalized = candidate
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .uppercased()
        guard !normalized.isEmpty else {
            throw PorchcastError.invalidInput("Enter an invite code or Porch link.")
        }
        guard let porch = storedPorches.first(where: {
            $0.inviteCode.uppercased() == normalized ||
                $0.id.rawValue.uppercased() == normalized
        }) else {
            throw PorchcastError.porchNotFound
        }
        guard porch.participantCount < porch.capacity else {
            throw PorchcastError.capacityReached
        }
        return porch
    }

    func loadPorch(id: PorchID) async throws -> PorchSummary {
        guard let porch = storedPorches.first(where: { $0.id == id }) else {
            throw PorchcastError.porchNotFound
        }
        return porch
    }
}

actor DemoMediaSessionService: MediaSessionService {
    private var snapshot: StudioSnapshot?
    private var nextMessageNumber = DemoFixtures.welcomeMessages.count + 1

    func connect(
        to porch: PorchSummary,
        as account: Account,
        consent: ParticipantConsent
    ) async throws -> StudioSnapshot {
        guard consent.allowsMicrophoneAndCamera,
              !porch.cloudRecordingEnabled || consent.allowsCloudRecording else {
            throw PorchcastError.consentRequired
        }

        let localID = ParticipantID("local-participant")
        let localRole: Participant.Role = porch.hostName == account.displayName ? .host : .guest
        let localParticipant = Participant(
            id: localID,
            displayName: account.displayName,
            role: localRole,
            connectionQuality: .excellent,
            isMuted: false,
            isCameraEnabled: true,
            isSpeaking: false
        )

        let remoteCount = min(
            12,
            max(0, porch.participantCount - (localRole == .host ? 1 : 0))
        )
        let remoteParticipants = DemoFixtures.participantNames
            .prefix(remoteCount)
            .enumerated()
            .map { index, name in
                Participant(
                    id: ParticipantID("demo-participant-\(index + 1)"),
                    displayName: name,
                    role: index == 0 && localRole != .host ? .host : .guest,
                    connectionQuality: quality(at: index),
                    isMuted: index.isMultiple(of: 3),
                    isCameraEnabled: !index.isMultiple(of: 4),
                    isSpeaking: index == 0
                )
            }

        let connected = StudioSnapshot(
            porch: porch,
            localParticipantID: localID,
            participants: [localParticipant] + remoteParticipants,
            messages: DemoFixtures.welcomeMessages,
            localMedia: .initial,
            connectionState: .connected,
            recordingState: .idle
        )
        snapshot = connected
        return connected
    }

    func setMicrophoneEnabled(_ enabled: Bool) async throws -> StudioSnapshot {
        try updateLocalParticipant { participant, media in
            participant.isMuted = !enabled
            media.isMicrophoneEnabled = enabled
        }
    }

    func setCameraEnabled(_ enabled: Bool) async throws -> StudioSnapshot {
        try updateLocalParticipant { participant, media in
            participant.isCameraEnabled = enabled
            media.isCameraEnabled = enabled
        }
    }

    func setSpeakerEnabled(_ enabled: Bool) async throws -> StudioSnapshot {
        guard var current = snapshot else {
            throw PorchcastError.unavailable("Join a Porch before changing speaker output.")
        }
        current.localMedia.isSpeakerEnabled = enabled
        snapshot = current
        return current
    }

    func sendMessage(_ body: String) async throws -> StudioSnapshot {
        guard var current = snapshot else {
            throw PorchcastError.unavailable("Join a Porch before sending a message.")
        }
        let text = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            throw PorchcastError.invalidInput("Write a message first.")
        }
        guard let sender = current.participants.first(where: {
            $0.id == current.localParticipantID
        }) else {
            throw PorchcastError.unavailable("The local participant is unavailable.")
        }

        let sequence = nextMessageNumber
        nextMessageNumber += 1
        current.messages.append(
            ChatMessage(
                id: MessageID("demo-message-\(sequence)"),
                senderID: sender.id,
                senderName: sender.displayName,
                body: text,
                sentAt: Date(timeIntervalSince1970: 1_783_420_260 + Double(sequence * 60)),
                kind: .text
            )
        )
        snapshot = current
        return current
    }

    func disconnect() async {
        snapshot = nil
    }

    private func updateLocalParticipant(
        _ update: (inout Participant, inout LocalMediaState) -> Void
    ) throws -> StudioSnapshot {
        guard var current = snapshot,
              let index = current.participants.firstIndex(where: {
                  $0.id == current.localParticipantID
              }) else {
            throw PorchcastError.unavailable("Join a Porch before changing media controls.")
        }
        update(&current.participants[index], &current.localMedia)
        snapshot = current
        return current
    }

    private func quality(at index: Int) -> Participant.ConnectionQuality {
        if index.isMultiple(of: 7) && index > 0 {
            return .limited
        }
        return index.isMultiple(of: 3) ? .good : .excellent
    }
}

actor DemoRecordingService: RecordingService {
    private var recordings = DemoFixtures.recordingHistory
    private var state = RecordingState.idle
    private var nextRecordingNumber = 1

    func history(for account: Account) async throws -> [RecordingSummary] {
        recordings
    }

    func startCloudRecording(for porch: PorchSummary) async throws -> RecordingState {
        guard case .idle = state else {
            throw PorchcastError.unavailable("Recording is already active.")
        }
        state = .recording(startedAt: Date(timeIntervalSince1970: 1_783_420_800))
        return state
    }

    func stopCloudRecording(for porch: PorchSummary) async throws -> RecordingState {
        guard case .recording = state else {
            throw PorchcastError.unavailable("There is no active recording to stop.")
        }
        let sequence = nextRecordingNumber
        nextRecordingNumber += 1
        recordings.insert(
            RecordingSummary(
                id: RecordingID("demo-new-recording-\(sequence)"),
                porchID: porch.id,
                porchTitle: porch.title,
                createdAt: Date(timeIntervalSince1970: 1_783_421_100 + Double(sequence)),
                durationSeconds: nil,
                availability: .processing
            ),
            at: 0
        )
        state = .idle
        return .idle
    }
}

nonisolated struct DemoEntitlementService: EntitlementService {
    func currentEntitlements(for account: Account) async throws -> Entitlements {
        .demo
    }
}

actor DemoNotificationService: NotificationService {
    private(set) var isPrepared = false

    func prepareForAdmissionAndRecordingNotifications() async throws {
        isPrepared = true
    }
}

actor DemoWatchBridge: WatchBridge {
    private var mostRecentStatus = WatchPorchStatus.idle
    private var mostRecentRecording: RecordingSummary?

    func publish(_ status: WatchPorchStatus) async {
        mostRecentStatus = status
    }

    func publishRecordingReady(_ recording: RecordingSummary) async {
        mostRecentRecording = recording
    }

    func status() -> WatchPorchStatus {
        mostRecentStatus
    }

    func recording() -> RecordingSummary? {
        mostRecentRecording
    }
}

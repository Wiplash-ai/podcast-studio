import Foundation

nonisolated struct PorchID: Hashable, Codable, Sendable, Identifiable {
    let rawValue: String

    var id: String { rawValue }

    init(_ rawValue: String) {
        self.rawValue = rawValue
    }
}

nonisolated struct ParticipantID: Hashable, Codable, Sendable, Identifiable {
    let rawValue: String

    var id: String { rawValue }

    init(_ rawValue: String) {
        self.rawValue = rawValue
    }
}

nonisolated struct MessageID: Hashable, Codable, Sendable, Identifiable {
    let rawValue: String

    var id: String { rawValue }

    init(_ rawValue: String) {
        self.rawValue = rawValue
    }
}

nonisolated struct RecordingID: Hashable, Codable, Sendable, Identifiable {
    let rawValue: String

    var id: String { rawValue }

    init(_ rawValue: String) {
        self.rawValue = rawValue
    }
}

nonisolated struct Account: Equatable, Codable, Sendable, Identifiable {
    enum Kind: String, Codable, Sendable {
        case anonymous
        case registered
    }

    let id: String
    var displayName: String
    let kind: Kind
}

nonisolated enum AdmissionMode: String, CaseIterable, Codable, Sendable, Identifiable {
    case open
    case hostApproval

    var id: Self { self }

    var title: String {
        switch self {
        case .open: "Open"
        case .hostApproval: "Host approval"
        }
    }

    var detail: String {
        switch self {
        case .open: "Guests enter immediately."
        case .hostApproval: "The host admits each guest."
        }
    }
}

nonisolated enum PorchActivity: String, Codable, Sendable {
    case live
    case scheduled
    case ended
}

nonisolated struct PorchSummary: Equatable, Codable, Sendable, Identifiable {
    let id: PorchID
    var title: String
    var topic: String
    var hostName: String
    var inviteCode: String
    var participantCount: Int
    var capacity: Int
    var activity: PorchActivity
    var admissionMode: AdmissionMode
    var cloudRecordingEnabled: Bool

    var guestCapacity: Int { max(0, capacity - 1) }
}

nonisolated struct CreatePorchRequest: Equatable, Sendable {
    var title: String
    var topic: String
    var guestCapacity: Int
    var admissionMode: AdmissionMode
    var cloudRecordingEnabled: Bool

    static let blank = CreatePorchRequest(
        title: "",
        topic: "",
        guestCapacity: 4,
        admissionMode: .hostApproval,
        cloudRecordingEnabled: true
    )
}

nonisolated enum JoinReference: Equatable, Sendable {
    case inviteCode(String)
    case universalLink(URL)
}

nonisolated struct Participant: Equatable, Codable, Sendable, Identifiable {
    enum Role: String, Codable, Sendable {
        case host
        case guest
    }

    enum ConnectionQuality: String, Codable, Sendable {
        case excellent
        case good
        case limited
    }

    let id: ParticipantID
    var displayName: String
    var role: Role
    var connectionQuality: ConnectionQuality
    var isMuted: Bool
    var isCameraEnabled: Bool
    var isSpeaking: Bool

    var initials: String {
        let parts = displayName.split(separator: " ").prefix(2)
        let result = parts.compactMap(\.first).map(String.init).joined()
        return result.isEmpty ? "?" : result.uppercased()
    }
}

nonisolated struct ParticipantConsent: Equatable, Sendable {
    var allowsMicrophoneAndCamera: Bool
    var allowsCloudRecording: Bool

    static let pending = ParticipantConsent(
        allowsMicrophoneAndCamera: false,
        allowsCloudRecording: false
    )
}

nonisolated struct LocalMediaState: Equatable, Sendable {
    var isMicrophoneEnabled: Bool
    var isCameraEnabled: Bool
    var isSpeakerEnabled: Bool

    static let initial = LocalMediaState(
        isMicrophoneEnabled: true,
        isCameraEnabled: true,
        isSpeakerEnabled: true
    )
}

nonisolated enum StudioConnectionState: String, Equatable, Sendable {
    case disconnected
    case connecting
    case connected
}

nonisolated struct ChatMessage: Equatable, Codable, Sendable, Identifiable {
    enum Kind: String, Codable, Sendable {
        case text
        case system
    }

    let id: MessageID
    let senderID: ParticipantID?
    var senderName: String
    var body: String
    var sentAt: Date
    var kind: Kind
}

nonisolated enum RecordingState: Equatable, Sendable {
    case idle
    case recording(startedAt: Date)
    case processing
}

nonisolated enum RecordingAvailability: String, Codable, Sendable {
    case processing
    case ready
    case failed
}

nonisolated struct RecordingSummary: Equatable, Codable, Sendable, Identifiable {
    let id: RecordingID
    let porchID: PorchID
    var porchTitle: String
    var createdAt: Date
    var durationSeconds: Int?
    var availability: RecordingAvailability
}

nonisolated struct StudioSnapshot: Equatable, Sendable {
    var porch: PorchSummary
    var localParticipantID: ParticipantID
    var participants: [Participant]
    var messages: [ChatMessage]
    var localMedia: LocalMediaState
    var connectionState: StudioConnectionState
    var recordingState: RecordingState
}

nonisolated struct Entitlements: Equatable, Sendable {
    var canUseCloudRecording: Bool
    var canHostTwelveGuests: Bool

    static let unavailable = Entitlements(
        canUseCloudRecording: false,
        canHostTwelveGuests: false
    )

    static let demo = Entitlements(
        canUseCloudRecording: true,
        canHostTwelveGuests: true
    )
}

nonisolated enum NotificationEvent: Equatable, Sendable {
    case admissionRequested(porchID: PorchID, displayName: String)
    case recordingReady(recordingID: RecordingID)
}

nonisolated struct WatchPorchStatus: Equatable, Sendable {
    var porchID: PorchID?
    var title: String
    var participantCount: Int
    var isRecording: Bool

    static let idle = WatchPorchStatus(
        porchID: nil,
        title: "No active Porch",
        participantCount: 0,
        isRecording: false
    )
}

nonisolated enum PorchcastError: Error, Equatable, LocalizedError, Sendable {
    case invalidInput(String)
    case porchNotFound
    case capacityReached
    case consentRequired
    case unavailable(String)

    var errorDescription: String? {
        switch self {
        case .invalidInput(let message), .unavailable(let message): message
        case .porchNotFound: "That Porch could not be found."
        case .capacityReached: "This Porch already has 13 participants."
        case .consentRequired: "Consent is required before connecting media."
        }
    }
}

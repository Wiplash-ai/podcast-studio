import Foundation

nonisolated enum DemoFixtures {
    static let anonymousAccount = Account(
        id: "demo-account-guest",
        displayName: "Alex Rivera",
        kind: .anonymous
    )

    static let registeredAccount = Account(
        id: "demo-account-member",
        displayName: "Alex Rivera",
        kind: .registered
    )

    static let porches: [PorchSummary] = [
        PorchSummary(
            id: PorchID("porch-roundtable"),
            title: "Creator roundtable",
            topic: "How independent shows build a loyal audience",
            hostName: "Maya Chen",
            inviteCode: "PORCH-13",
            participantCount: 12,
            capacity: 13,
            activity: .live,
            admissionMode: .hostApproval,
            cloudRecordingEnabled: true
        ),
        PorchSummary(
            id: PorchID("porch-field-notes"),
            title: "Field notes",
            topic: "A sound-rich walk through neighborhood stories",
            hostName: "Noah Williams",
            inviteCode: "FIELD-07",
            participantCount: 4,
            capacity: 7,
            activity: .live,
            admissionMode: .open,
            cloudRecordingEnabled: true
        ),
        PorchSummary(
            id: PorchID("porch-sunday-edit"),
            title: "Sunday edit",
            topic: "A quiet production review for next week's episode",
            hostName: "Alex Rivera",
            inviteCode: "EDIT-24",
            participantCount: 1,
            capacity: 5,
            activity: .scheduled,
            admissionMode: .hostApproval,
            cloudRecordingEnabled: false
        )
    ]

    static let participantNames = [
        "Maya Chen",
        "Noah Williams",
        "Priya Shah",
        "Jordan Brooks",
        "Sam Okafor",
        "Elena García",
        "Theo Martin",
        "Avery Kim",
        "Riley Morgan",
        "Morgan Lee",
        "Jamie Patel",
        "Casey Nguyen"
    ]

    static let welcomeMessages = [
        ChatMessage(
            id: MessageID("demo-message-1"),
            senderID: ParticipantID("demo-participant-1"),
            senderName: "Maya Chen",
            body: "Welcome to the Porch. We will start with a quick sound check.",
            sentAt: Date(timeIntervalSince1970: 1_783_420_200),
            kind: .text
        ),
        ChatMessage(
            id: MessageID("demo-message-2"),
            senderID: nil,
            senderName: "Porchcast",
            body: "Demo media is simulated. No camera, microphone, or network is active.",
            sentAt: Date(timeIntervalSince1970: 1_783_420_260),
            kind: .system
        )
    ]

    static let recordingHistory = [
        RecordingSummary(
            id: RecordingID("recording-ready-1"),
            porchID: PorchID("porch-field-notes"),
            porchTitle: "Field notes",
            createdAt: Date(timeIntervalSince1970: 1_783_040_400),
            durationSeconds: 2_746,
            availability: .ready
        ),
        RecordingSummary(
            id: RecordingID("recording-processing-1"),
            porchID: PorchID("porch-sunday-edit"),
            porchTitle: "Sunday edit",
            createdAt: Date(timeIntervalSince1970: 1_783_385_100),
            durationSeconds: nil,
            availability: .processing
        )
    ]
}

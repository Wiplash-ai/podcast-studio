import Testing
@testable import Porchcast

struct DemoMediaTests {
    @Test("Media cannot connect until both session consents are accepted")
    func requiresConsent() async {
        let media = DemoMediaSessionService()
        let porch = DemoFixtures.porches[0]

        do {
            _ = try await media.connect(
                to: porch,
                as: DemoFixtures.anonymousAccount,
                consent: .pending
            )
            Issue.record("Expected consent to be required")
        } catch let error as PorchcastError {
            #expect(error == .consentRequired)
        } catch {
            Issue.record("Unexpected error: \(error)")
        }
    }

    @Test("A non-recording Porch does not request recorder consent")
    func skipsRecorderConsentWhenDisabled() async throws {
        let media = DemoMediaSessionService()
        let consent = ParticipantConsent(
            allowsMicrophoneAndCamera: true,
            allowsCloudRecording: false
        )

        let snapshot = try await media.connect(
            to: DemoFixtures.porches[2],
            as: DemoFixtures.registeredAccount,
            consent: consent
        )

        #expect(snapshot.porch.cloudRecordingEnabled == false)
        #expect(snapshot.participants.count == 1)
    }

    @Test("The adaptive demo studio supports one host and twelve guests")
    func supportsThirteenParticipants() async throws {
        let media = DemoMediaSessionService()
        let consent = ParticipantConsent(
            allowsMicrophoneAndCamera: true,
            allowsCloudRecording: true
        )

        let snapshot = try await media.connect(
            to: DemoFixtures.porches[0],
            as: DemoFixtures.anonymousAccount,
            consent: consent
        )

        #expect(snapshot.participants.count == 13)
        #expect(snapshot.connectionState == .connected)
        #expect(snapshot.participants.filter { $0.role == .host }.count == 1)
    }

    @Test("Local controls and chat return complete deterministic snapshots")
    func changesLocalStateAndSendsChat() async throws {
        let media = DemoMediaSessionService()
        let consent = ParticipantConsent(
            allowsMicrophoneAndCamera: true,
            allowsCloudRecording: true
        )
        _ = try await media.connect(
            to: DemoFixtures.porches[1],
            as: DemoFixtures.anonymousAccount,
            consent: consent
        )

        let muted = try await media.setMicrophoneEnabled(false)
        let cameraOff = try await media.setCameraEnabled(false)
        let sent = try await media.sendMessage("  Ready to record  ")

        #expect(muted.localMedia.isMicrophoneEnabled == false)
        #expect(cameraOff.localMedia.isCameraEnabled == false)
        #expect(sent.messages.last?.id == MessageID("demo-message-3"))
        #expect(sent.messages.last?.body == "Ready to record")
    }
}

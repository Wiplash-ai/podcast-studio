import Testing
@testable import Porchcast

@MainActor
struct AppModelTests {
    @Test("Cloud launch reports unavailable adapters without presenting demo data")
    func cloudLaunchIsTruthful() async {
        let model = AppModel(environment: .selected(runtimeValue: nil))

        await model.launch()

        #expect(model.isDeterministicDemo == false)
        #expect(model.isLoaded == false)
        #expect(model.porches.isEmpty)
        #expect(model.launchFailureMessage == UnavailableCloudAdapter.message)
    }

    @Test("The native demo completes list, join, consent, studio, chat, recording, and leave")
    func completesPrimaryDemoFlow() async {
        let model = AppModel(environment: .deterministicDemo())

        await model.launch()
        #expect(model.isLoaded)
        #expect(model.porches.count == 3)
        #expect(model.account?.kind == .anonymous)

        await model.joinPorch(using: .inviteCode("PORCH-13"))
        #expect(model.pendingPorch?.id == PorchID("porch-roundtable"))

        await model.connect(
            with: ParticipantConsent(
                allowsMicrophoneAndCamera: true,
                allowsCloudRecording: true
            )
        )
        #expect(model.studio?.participants.count == 13)
        #expect(model.pendingPorch == nil)

        let sent = await model.sendMessage("Hello from iOS")
        #expect(sent)
        #expect(model.studio?.messages.last?.body == "Hello from iOS")

        await model.toggleRecording()
        if case .recording = model.studio?.recordingState {
            // Expected state.
        } else {
            Issue.record("Expected recording to start")
        }

        await model.toggleRecording()
        #expect(model.recordings.first?.availability == .processing)

        await model.leaveStudio()
        #expect(model.studio == nil)
    }

    @Test("Creating a Porch leads to the per-session consent gate")
    func createLeadsToConsent() async {
        let model = AppModel(environment: .deterministicDemo())
        await model.launch()

        await model.createPorch(
            CreatePorchRequest(
                title: "Native production room",
                topic: "Review the SwiftUI flow",
                guestCapacity: 3,
                admissionMode: .hostApproval,
                cloudRecordingEnabled: true
            )
        )

        #expect(model.porches.first?.id == PorchID("demo-created-1"))
        #expect(model.pendingPorch?.id == PorchID("demo-created-1"))
        #expect(model.studio == nil)
    }

    @Test("Leaving while recording finalizes it and permits a later recording")
    func leaveFinalizesRecording() async {
        let model = AppModel(environment: .deterministicDemo())
        let consent = ParticipantConsent(
            allowsMicrophoneAndCamera: true,
            allowsCloudRecording: true
        )
        await model.launch()
        await model.joinPorch(using: .inviteCode("PORCH-13"))
        await model.connect(with: consent)
        await model.toggleRecording()

        await model.leaveStudio()
        #expect(model.studio == nil)
        #expect(model.recordings.first?.availability == .processing)

        await model.joinPorch(using: .inviteCode("PORCH-13"))
        await model.connect(with: consent)
        await model.toggleRecording()
        if case .recording = model.studio?.recordingState {
            // The provider is ready for the new session.
        } else {
            Issue.record("Expected a new recording to start")
        }
    }
}

import SwiftUI

struct StudioView: View {
    @Bindable var model: AppModel
    let snapshot: StudioSnapshot
    @State private var isChatPresented = false
    @State private var isLeaveConfirmationPresented = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                studioHeader

                if model.isDeterministicDemo {
                    Label(
                        "Simulated studio · no camera, microphone, media, or network",
                        systemImage: "hammer.fill"
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 7)
                    .background(PorchcastTheme.sage)
                }

                ParticipantGridView(
                    participants: snapshot.participants,
                    localParticipantID: snapshot.localParticipantID
                )

                StudioControlBar(
                    snapshot: snapshot,
                    canRecord: model.entitlements.canUseCloudRecording &&
                        snapshot.porch.cloudRecordingEnabled,
                    isInteractionDisabled: model.isMediaIntentInFlight,
                    openChat: { isChatPresented = true },
                    toggleMicrophone: {
                        Task {
                            await model.setMicrophoneEnabled(
                                !snapshot.localMedia.isMicrophoneEnabled
                            )
                        }
                    },
                    toggleCamera: {
                        Task {
                            await model.setCameraEnabled(!snapshot.localMedia.isCameraEnabled)
                        }
                    },
                    toggleSpeaker: {
                        Task {
                            await model.setSpeakerEnabled(!snapshot.localMedia.isSpeakerEnabled)
                        }
                    },
                    toggleRecording: {
                        Task { await model.toggleRecording() }
                    },
                    leave: {
                        isLeaveConfirmationPresented = true
                    }
                )
            }
            .background(PorchcastTheme.stage)
            .toolbar(.hidden, for: .navigationBar)
            .inspector(isPresented: $isChatPresented) {
                NavigationStack {
                    ChatPanelView(model: model, snapshot: snapshot)
                        .toolbar {
                            ToolbarItem(placement: .confirmationAction) {
                                Button("Done") { isChatPresented = false }
                            }
                        }
                }
                .inspectorColumnWidth(min: 300, ideal: 360, max: 430)
            }
            .confirmationDialog(
                "Leave this Porch?",
                isPresented: $isLeaveConfirmationPresented,
                titleVisibility: .visible
            ) {
                Button("Leave Porch", role: .destructive) {
                    Task { await model.leaveStudio() }
                }
                Button("Stay", role: .cancel) {}
            } message: {
                Text("Your demo media session will end.")
            }
        }
        .statusBarHidden(false)
    }

    private var studioHeader: some View {
        HStack(spacing: 12) {
            PorchcastMark()
            VStack(alignment: .leading, spacing: 2) {
                Text(snapshot.porch.title)
                    .font(.headline)
                    .lineLimit(1)
                Text("\(snapshot.participants.count) participants")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            recordingBadge
            Button {
                isLeaveConfirmationPresented = true
            } label: {
                Label("Leave", systemImage: "rectangle.portrait.and.arrow.right")
            }
            .buttonStyle(.bordered)
            .tint(.red)
            .disabled(model.isMediaIntentInFlight)
        }
        .padding(.horizontal)
        .padding(.vertical, 10)
        .background(.regularMaterial)
    }

    @ViewBuilder
    private var recordingBadge: some View {
        switch snapshot.recordingState {
        case .idle:
            EmptyView()
        case .recording:
            Label("Recording", systemImage: "record.circle.fill")
                .font(.caption.weight(.bold))
                .foregroundStyle(.red)
                .accessibilityLabel("Cloud recording active")
        case .processing:
            Label("Processing", systemImage: "hourglass")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
        }
    }
}

private struct StudioControlBar: View {
    let snapshot: StudioSnapshot
    let canRecord: Bool
    let isInteractionDisabled: Bool
    let openChat: () -> Void
    let toggleMicrophone: () -> Void
    let toggleCamera: () -> Void
    let toggleSpeaker: () -> Void
    let toggleRecording: () -> Void
    let leave: () -> Void

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 14) {
                control(
                    title: snapshot.localMedia.isMicrophoneEnabled ? "Mute" : "Unmute",
                    systemImage: snapshot.localMedia.isMicrophoneEnabled ? "mic.fill" : "mic.slash.fill",
                    isActive: snapshot.localMedia.isMicrophoneEnabled,
                    action: toggleMicrophone
                )
                control(
                    title: snapshot.localMedia.isCameraEnabled ? "Camera" : "Camera off",
                    systemImage: snapshot.localMedia.isCameraEnabled ? "video.fill" : "video.slash.fill",
                    isActive: snapshot.localMedia.isCameraEnabled,
                    action: toggleCamera
                )
                control(
                    title: snapshot.localMedia.isSpeakerEnabled ? "Speaker" : "Speaker off",
                    systemImage: snapshot.localMedia.isSpeakerEnabled ? "speaker.wave.2.fill" : "speaker.slash.fill",
                    isActive: snapshot.localMedia.isSpeakerEnabled,
                    action: toggleSpeaker
                )
                control(
                    title: "Chat",
                    systemImage: "bubble.left.and.bubble.right.fill",
                    isActive: false,
                    action: openChat
                )
                recordingControl

                Button(role: .destructive, action: leave) {
                    Label("Leave", systemImage: "phone.down.fill")
                }
                .buttonStyle(.borderedProminent)
                .tint(.red)
            }
            .padding(.horizontal)
            .padding(.vertical, 10)
        }
        .disabled(isInteractionDisabled)
        .scrollIndicators(.hidden)
        .background(.ultraThinMaterial)
    }

    private func control(
        title: String,
        systemImage: String,
        isActive: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
        }
        .buttonStyle(.bordered)
        .tint(isActive ? PorchcastTheme.healthy : .secondary)
    }

    @ViewBuilder
    private var recordingControl: some View {
        switch snapshot.recordingState {
        case .idle:
            Button(action: toggleRecording) {
                Label("Record", systemImage: "record.circle")
            }
            .buttonStyle(.bordered)
            .tint(.red)
            .disabled(!canRecord)
        case .recording:
            Button(action: toggleRecording) {
                Label("Stop recording", systemImage: "stop.circle.fill")
            }
            .buttonStyle(.borderedProminent)
            .tint(.red)
        case .processing:
            Button(action: {}) {
                Label("Processing", systemImage: "hourglass")
            }
            .buttonStyle(.bordered)
            .disabled(true)
        }
    }
}

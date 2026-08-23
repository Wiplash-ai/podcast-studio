import SwiftUI

struct ConsentView: View {
    @Bindable var model: AppModel
    let porch: PorchSummary
    @State private var consent = ParticipantConsent.pending

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 10) {
                        PorchcastWordmark()
                        Text("Before you step onto the Porch")
                            .font(.largeTitle.bold())
                            .minimumScaleFactor(0.8)
                        Text(porch.title)
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(PorchcastTheme.signal)
                        Text("Consent is requested again for every session.")
                            .foregroundStyle(.secondary)
                    }

                    VStack(spacing: 0) {
                        consentToggle(
                            title: "Microphone and camera",
                            detail: "Publish my selected microphone and camera to this Porch.",
                            systemImage: "video.fill",
                            isOn: $consent.allowsMicrophoneAndCamera
                        )
                        Divider()
                        if porch.cloudRecordingEnabled {
                            consentToggle(
                                title: "Trusted Cloud recorder",
                                detail: "Allow Porchcast's Cloud recorder to capture my published media.",
                                systemImage: "record.circle",
                                isOn: $consent.allowsCloudRecording
                            )
                        } else {
                            Label {
                                VStack(alignment: .leading, spacing: 5) {
                                    Text("Cloud recording is off")
                                        .font(.headline)
                                    Text("This Porch cannot start a Cloud recording.")
                                        .font(.footnote)
                                        .foregroundStyle(.secondary)
                                }
                            } icon: {
                                Image(systemName: "record.circle")
                                    .foregroundStyle(.secondary)
                            }
                            .padding(.vertical, 12)
                        }
                    }
                    .porchCard()

                    if model.isDeterministicDemo {
                        Label(
                            "Demo mode never opens hardware or records media.",
                            systemImage: "checkmark.shield.fill"
                        )
                        .font(.footnote)
                        .foregroundStyle(PorchcastTheme.healthy)
                    }

                    Button {
                        Task { await model.connect(with: consent) }
                    } label: {
                        HStack {
                            Text("Accept and enter")
                            Spacer()
                            Image(systemName: "arrow.right")
                        }
                        .fontWeight(.bold)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(
                        !consent.allowsMicrophoneAndCamera ||
                            (porch.cloudRecordingEnabled && !consent.allowsCloudRecording) ||
                            model.isBusy
                    )
                    .accessibilityHint("Connects after all required consent choices are accepted")
                }
                .frame(maxWidth: 720, alignment: .leading)
                .padding()
                .frame(maxWidth: .infinity)
            }
            .background(PorchcastTheme.paperMuted)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Back", systemImage: "chevron.left") {
                        model.cancelConsent()
                    }
                }
            }
        }
    }

    private func consentToggle(
        title: String,
        detail: String,
        systemImage: String,
        isOn: Binding<Bool>
    ) -> some View {
        Toggle(isOn: isOn) {
            Label {
                VStack(alignment: .leading, spacing: 5) {
                    Text(title)
                        .font(.headline)
                    Text(detail)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            } icon: {
                Image(systemName: systemImage)
                    .foregroundStyle(PorchcastTheme.signal)
            }
        }
        .padding(.vertical, 12)
    }
}

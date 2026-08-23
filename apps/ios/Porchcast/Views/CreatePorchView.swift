import SwiftUI

struct CreatePorchView: View {
    @Bindable var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var request = CreatePorchRequest.blank

    var body: some View {
        Form {
            Section("Porch details") {
                TextField("Title", text: $request.title)
                    .textInputAutocapitalization(.sentences)
                TextField("What will you talk about?", text: $request.topic, axis: .vertical)
                    .lineLimit(2...4)
            }

            Section("Guests") {
                Stepper(value: $request.guestCapacity, in: 1...12) {
                    LabeledContent("Guest seats", value: "\(request.guestCapacity)")
                }

                Picker("Admission", selection: $request.admissionMode) {
                    ForEach(AdmissionMode.allCases) { mode in
                        Text(mode.title).tag(mode)
                    }
                }

                Text(request.admissionMode.detail)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Section("Recording") {
                Toggle("Allow Cloud recording", isOn: $request.cloudRecordingEnabled)
                    .disabled(!model.entitlements.canUseCloudRecording)
                Text("Every participant must consent before their media is published.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            if model.isDeterministicDemo {
                Section {
                    Label(
                        "This creates local demo state only.",
                        systemImage: "hammer.fill"
                    )
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("Create a Porch")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Create") {
                    Task { await model.createPorch(request) }
                }
                .disabled(
                    request.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                        request.topic.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                        model.isBusy
                )
            }
        }
        .interactiveDismissDisabled(model.isBusy)
    }
}

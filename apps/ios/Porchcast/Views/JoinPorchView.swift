import SwiftUI

struct JoinPorchView: View {
    private enum EntryKind: String, CaseIterable, Identifiable {
        case code
        case link

        var id: Self { self }
        var title: String { rawValue.capitalized }
    }

    @Bindable var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var entryKind = EntryKind.code
    @State private var value = ""

    var body: some View {
        Form {
            Section {
                Picker("Invite format", selection: $entryKind) {
                    ForEach(EntryKind.allCases) { kind in
                        Text(kind.title).tag(kind)
                    }
                }
                .pickerStyle(.segmented)

                TextField(
                    entryKind == .code ? "PORCH-13" : "https://labs.wiplash.ai/porch/…",
                    text: $value
                )
                .textInputAutocapitalization(entryKind == .code ? .characters : .never)
                .keyboardType(entryKind == .code ? .asciiCapable : .URL)
                .autocorrectionDisabled()
                .accessibilityLabel(entryKind == .code ? "Invite code" : "Porch link")
            } footer: {
                if model.isDeterministicDemo {
                    Text("Try PORCH-13 or FIELD-07. No request leaves this device.")
                } else {
                    Text("Paste the invite sent by the Porch host.")
                }
            }
        }
        .navigationTitle("Join a Porch")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Continue") {
                    Task { await join() }
                }
                .disabled(
                    value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                        model.isBusy
                )
            }
        }
        .onChange(of: entryKind) {
            value = ""
        }
        .interactiveDismissDisabled(model.isBusy)
    }

    private func join() async {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        let reference: JoinReference
        switch entryKind {
        case .code:
            reference = .inviteCode(trimmed)
        case .link:
            guard let url = URL(string: trimmed),
                  let scheme = url.scheme?.lowercased() else {
                model.errorMessage = "Enter a valid Porch link."
                return
            }
            let expectedHost = model.environment.configuration.cloud
                .universalLinkHost.lowercased()
            let isExpectedHTTPSLink = scheme == "https" &&
                url.host?.lowercased() == expectedHost
            let isExpectedCallback = scheme == "porchcast" &&
                ["join", "porch"].contains(url.host?.lowercased() ?? "")
            guard isExpectedHTTPSLink || isExpectedCallback else {
                model.errorMessage = "Use a \(expectedHost) invite or Porchcast join link."
                return
            }
            reference = .universalLink(url)
        }
        await model.joinPorch(using: reference)
    }
}

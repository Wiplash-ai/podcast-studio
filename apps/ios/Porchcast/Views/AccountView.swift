import SwiftUI

struct AccountView: View {
    @Bindable var model: AppModel

    var body: some View {
        NavigationStack {
            List {
                Section("Identity") {
                    if let account = model.account {
                        LabeledContent("Name", value: account.displayName)
                        LabeledContent(
                            "Session",
                            value: account.kind == .registered ? "Signed in" : "Anonymous guest"
                        )
                    }

                    Button {
                        Task { await model.toggleAccount() }
                    } label: {
                        Text(accountActionTitle)
                    }
                    .disabled(model.isBusy)
                }

                Section("Runtime") {
                    LabeledContent(
                        "Preferred backend",
                        value: model.preferredBackendName
                    )
                    LabeledContent(
                        "Injected adapters",
                        value: model.isDeterministicDemo ? "Deterministic demo" : "Cloud"
                    )
                    LabeledContent(
                        "API host",
                        value: model.environment.configuration.cloud.apiBaseURL.host ?? "Not configured"
                    )
                    Text(
                        "Cloud is the composition default. Change AppConfiguration at launch to select another provider. Demo adapters never silently replace a live Cloud adapter."
                    )
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                }

                Section("Native v1 guardrails") {
                    Label("Per-session media consent", systemImage: "checkmark.shield.fill")
                    Label("Privacy-first telemetry boundary", systemImage: "hand.raised.fill")
                    Label("Future watch status bridge", systemImage: "applewatch")
                    Label("Read-only entitlements", systemImage: "checkmark.seal.fill")
                }

                Section("About") {
                    LabeledContent("Minimum iOS", value: "18.0")
                    LabeledContent("Devices", value: "iPhone + iPad")
                    LabeledContent("Language mode", value: "Swift 6")
                }
            }
            .navigationTitle("Account")
        }
    }

    private var accountActionTitle: String {
        if model.account?.kind == .registered {
            return "Sign out"
        }
        return model.isDeterministicDemo ? "Demo sign in" : "Sign in"
    }
}

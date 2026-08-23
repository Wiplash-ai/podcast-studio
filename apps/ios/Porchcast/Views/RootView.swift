import SwiftUI

struct RootView: View {
    @Bindable var model: AppModel

    var body: some View {
        Group {
            if let studio = model.studio {
                StudioView(model: model, snapshot: studio)
            } else if let pendingPorch = model.pendingPorch {
                ConsentView(model: model, porch: pendingPorch)
            } else if model.isLoaded {
                MainTabsView(model: model)
            } else if let launchFailureMessage = model.launchFailureMessage {
                launchFailure(launchFailureMessage)
            } else {
                launchPlaceholder
            }
        }
        .tint(PorchcastTheme.signal)
        .sheet(item: $model.presentedSheet) { sheet in
            NavigationStack {
                switch sheet {
                case .createPorch:
                    CreatePorchView(model: model)
                case .joinPorch:
                    JoinPorchView(model: model)
                }
            }
            .presentationDetents([.medium, .large])
        }
        .alert(
            "Porchcast needs attention",
            isPresented: Binding(
                get: { model.errorMessage != nil },
                set: { isPresented in
                    if !isPresented { model.dismissError() }
                }
            ),
            actions: {
                Button("OK", role: .cancel) {
                    model.dismissError()
                }
            },
            message: {
                Text(model.errorMessage ?? "Please try again.")
            }
        )
    }

    private var launchPlaceholder: some View {
        VStack(spacing: 20) {
            PorchcastWordmark()
            ProgressView("Opening your Porches…")
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(PorchcastTheme.paperMuted)
    }

    private func launchFailure(_ message: String) -> some View {
        VStack(spacing: 18) {
            PorchcastWordmark()
            Image(systemName: "icloud.slash")
                .font(.system(size: 42))
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text("Cloud adapter unavailable")
                .font(.title2.bold())
            Text(message)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .frame(maxWidth: 520)
            Button("Try Again") {
                Task { await model.launch() }
            }
            .buttonStyle(.borderedProminent)
            .disabled(model.isBusy)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(PorchcastTheme.paperMuted)
    }
}

private struct MainTabsView: View {
    @Bindable var model: AppModel

    var body: some View {
        TabView {
            Tab("Porches", systemImage: "person.3.fill") {
                PorchListView(model: model)
            }
            Tab("Recordings", systemImage: "waveform") {
                RecordingsView(model: model)
            }
            Tab("Account", systemImage: "person.crop.circle") {
                AccountView(model: model)
            }
        }
    }
}

import SwiftUI

struct PorchListView: View {
    @Bindable var model: AppModel

    var body: some View {
        NavigationStack {
            List {
                if model.isDeterministicDemo {
                    Section {
                        DemoModeBanner(preferredBackendName: model.preferredBackendName)
                            .listRowInsets(EdgeInsets())
                    }
                }

                porchSection(title: "Live now", activity: .live)
                porchSection(title: "Coming up", activity: .scheduled)
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Your Porches")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    PorchcastWordmark(compact: true)
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button {
                        model.presentedSheet = .joinPorch
                    } label: {
                        Label("Join Porch", systemImage: "rectangle.portrait.and.arrow.right")
                    }

                    Button {
                        model.presentedSheet = .createPorch
                    } label: {
                        Label("Create Porch", systemImage: "plus")
                    }
                }
            }
            .refreshable {
                await model.refreshPorches()
            }
            .overlay {
                if model.porches.isEmpty {
                    ContentUnavailableView(
                        "No Porches yet",
                        systemImage: "person.3",
                        description: Text("Create a Porch or join one with an invite.")
                    )
                }
            }
        }
    }

    @ViewBuilder
    private func porchSection(title: String, activity: PorchActivity) -> some View {
        let matches = model.porches.filter { $0.activity == activity }
        if !matches.isEmpty {
            Section(title) {
                ForEach(matches) { porch in
                    Button {
                        model.prepareToJoin(porch)
                    } label: {
                        PorchRow(porch: porch)
                    }
                    .buttonStyle(.plain)
                    .disabled(porch.participantCount >= porch.capacity)
                    .accessibilityHint(
                        porch.participantCount >= porch.capacity
                            ? "This Porch is full"
                            : "Opens the consent screen"
                    )
                }
            }
        }
    }
}

private struct PorchRow: View {
    let porch: PorchSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(porch.title)
                    .font(.headline)
                    .foregroundStyle(.primary)
                Spacer()
                activityBadge
            }

            Text(porch.topic)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(2)

            HStack(spacing: 14) {
                Label(porch.hostName, systemImage: "person.fill")
                Label(
                    "\(porch.participantCount) of \(porch.capacity)",
                    systemImage: "person.2.fill"
                )
                Label(porch.inviteCode, systemImage: "number")
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
        .padding(.vertical, 5)
        .accessibilityElement(children: .combine)
    }

    private var activityBadge: some View {
        Text(porch.activity == .live ? "LIVE" : "SCHEDULED")
            .font(.caption2.weight(.bold))
            .tracking(0.8)
            .foregroundStyle(porch.activity == .live ? PorchcastTheme.signal : .secondary)
    }
}

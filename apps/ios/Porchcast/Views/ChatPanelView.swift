import SwiftUI

struct ChatPanelView: View {
    @Bindable var model: AppModel
    let snapshot: StudioSnapshot
    @State private var draft = ""
    @FocusState private var composerFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Porch chat")
                    .font(.headline)
                Spacer()
                Text("\(snapshot.messages.count)")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .accessibilityLabel("\(snapshot.messages.count) messages")
            }
            .padding()

            Divider()

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 16) {
                        ForEach(snapshot.messages) { message in
                            MessageRow(message: message)
                                .id(message.id)
                        }
                    }
                    .padding()
                }
                .onChange(of: snapshot.messages.count) {
                    if let last = snapshot.messages.last {
                        withAnimation {
                            proxy.scrollTo(last.id, anchor: .bottom)
                        }
                    }
                }
            }

            Divider()

            HStack(alignment: .bottom, spacing: 10) {
                TextField("Message the Porch", text: $draft, axis: .vertical)
                    .lineLimit(1...4)
                    .textFieldStyle(.roundedBorder)
                    .focused($composerFocused)
                    .submitLabel(.send)
                    .onSubmit { send() }

                Button(action: send) {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title)
                }
                .disabled(
                    draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                        model.isMediaIntentInFlight
                )
                .accessibilityLabel("Send message")
            }
            .padding()

            if model.isDeterministicDemo {
                Text("Messages stay in deterministic demo memory.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .padding(.bottom, 8)
            }
        }
        .background(.regularMaterial)
        .navigationTitle("Chat")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func send() {
        let message = draft
        Task {
            if await model.sendMessage(message) {
                draft = ""
                composerFocused = true
            }
        }
    }
}

private struct MessageRow: View {
    let message: ChatMessage

    var body: some View {
        if message.kind == .system {
            Label(message.body, systemImage: "info.circle.fill")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(PorchcastTheme.sage.opacity(0.55), in: RoundedRectangle(cornerRadius: 12))
        } else {
            VStack(alignment: .leading, spacing: 5) {
                HStack {
                    Text(message.senderName)
                        .font(.caption.weight(.bold))
                    Spacer()
                    Text(message.sentAt, style: .time)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                Text(message.body)
                    .font(.body)
                    .textSelection(.enabled)
            }
            .accessibilityElement(children: .combine)
        }
    }
}

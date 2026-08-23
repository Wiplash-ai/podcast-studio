import SwiftUI

struct RecordingsView: View {
    @Bindable var model: AppModel

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Label {
                        Text("Cloud recording history")
                            .font(.headline)
                        + Text(" · read-only native v1")
                            .foregroundStyle(.secondary)
                    } icon: {
                        Image(systemName: "icloud.fill")
                            .foregroundStyle(PorchcastTheme.signal)
                    }
                }

                Section("Recent") {
                    ForEach(model.recordings) { recording in
                        RecordingRow(recording: recording)
                    }
                }

                Section {
                    Text(
                        "Playback, download, and system sharing attach here when the Cloud adapter provides signed media assets."
                    )
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Recordings")
            .overlay {
                if model.recordings.isEmpty {
                    ContentUnavailableView(
                        "No recordings",
                        systemImage: "waveform",
                        description: Text("Cloud recordings will appear here.")
                    )
                }
            }
        }
    }
}

private struct RecordingRow: View {
    let recording: RecordingSummary

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: statusSymbol)
                .font(.title2)
                .foregroundStyle(statusColor)
                .frame(width: 34, height: 34)
                .background(statusColor.opacity(0.12), in: Circle())

            VStack(alignment: .leading, spacing: 5) {
                Text(recording.porchTitle)
                    .font(.headline)
                HStack(spacing: 8) {
                    Text(recording.createdAt, format: .dateTime.month(.abbreviated).day().hour().minute())
                    if let durationSeconds = recording.durationSeconds {
                        Text("·")
                        Text(duration(seconds: durationSeconds))
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }

            Spacer()

            Text(recording.availability.rawValue.capitalized)
                .font(.caption.weight(.semibold))
                .foregroundStyle(statusColor)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }

    private var statusSymbol: String {
        switch recording.availability {
        case .processing: "hourglass"
        case .ready: "play.fill"
        case .failed: "exclamationmark.triangle.fill"
        }
    }

    private var statusColor: Color {
        switch recording.availability {
        case .processing: .orange
        case .ready: PorchcastTheme.healthy
        case .failed: .red
        }
    }

    private func duration(seconds: Int) -> String {
        let minutes = seconds / 60
        let remainder = seconds % 60
        return "\(minutes):\(String(format: "%02d", remainder))"
    }
}

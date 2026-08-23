import SwiftUI

struct ParticipantGridView: View {
    let participants: [Participant]
    let localParticipantID: ParticipantID
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        GeometryReader { proxy in
            ScrollView {
                LazyVGrid(columns: columns(for: proxy.size.width), spacing: 10) {
                    ForEach(Array(participants.enumerated()), id: \.element.id) { index, participant in
                        ParticipantTile(
                            participant: participant,
                            isLocal: participant.id == localParticipantID,
                            color: tileColors[index % tileColors.count]
                        )
                        .containerRelativeFrame(.vertical, count: rowCount, spacing: 10)
                        .frame(minHeight: dynamicTypeSize.isAccessibilitySize ? 210 : 150)
                    }
                }
                .padding(10)
            }
            .scrollIndicators(.visible)
        }
        .background(PorchcastTheme.stage)
    }

    private var rowCount: Int {
        participants.count <= 2 ? 1 : 2
    }

    private func columns(for width: CGFloat) -> [GridItem] {
        let minimumWidth: CGFloat = dynamicTypeSize.isAccessibilitySize ? 280 : 190
        let proposed = Int((width + 10) / (minimumWidth + 10))
        let count = min(4, max(1, proposed))
        return Array(
            repeating: GridItem(.flexible(minimum: 120), spacing: 10),
            count: count
        )
    }

    private var tileColors: [Color] {
        [
            Color(red: 0.20, green: 0.24, blue: 0.20),
            Color(red: 0.22, green: 0.18, blue: 0.25),
            Color(red: 0.16, green: 0.23, blue: 0.27),
            Color(red: 0.28, green: 0.21, blue: 0.17),
            Color(red: 0.18, green: 0.18, blue: 0.19)
        ]
    }
}

private struct ParticipantTile: View {
    let participant: Participant
    let isLocal: Bool
    let color: Color

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 18)
                .fill(
                    LinearGradient(
                        colors: [color.opacity(0.82), color],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            if participant.isCameraEnabled {
                Text(participant.initials)
                    .font(.system(size: 38, weight: .black, design: .rounded))
                    .foregroundStyle(.white.opacity(0.92))
                    .accessibilityHidden(true)
            } else {
                VStack(spacing: 9) {
                    Image(systemName: "video.slash.fill")
                        .font(.title2)
                    Text("Camera off")
                        .font(.caption)
                }
                .foregroundStyle(.white.opacity(0.66))
                .accessibilityHidden(true)
            }

            VStack {
                HStack(alignment: .top) {
                    if participant.role == .host {
                        Text("HOST")
                            .font(.caption2.bold())
                            .tracking(0.8)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 5)
                            .background(.black.opacity(0.42), in: Capsule())
                    }
                    Spacer()
                    connectionIndicator
                }
                Spacer()
                HStack {
                    Text(participant.displayName + (isLocal ? " · You" : ""))
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    Spacer()
                    if participant.isMuted {
                        Image(systemName: "mic.slash.fill")
                            .accessibilityLabel("Muted")
                    }
                }
                .padding(10)
                .background(.black.opacity(0.52), in: RoundedRectangle(cornerRadius: 12))
            }
            .padding(10)
            .foregroundStyle(.white)
        }
        .overlay {
            RoundedRectangle(cornerRadius: 18)
                .stroke(
                    participant.isSpeaking ? PorchcastTheme.signal : .white.opacity(0.14),
                    lineWidth: participant.isSpeaking ? 3 : 1
                )
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilitySummary)
    }

    private var connectionIndicator: some View {
        Label(
            participant.connectionQuality.rawValue.capitalized,
            systemImage: connectionSymbol
        )
        .labelStyle(.iconOnly)
        .foregroundStyle(connectionColor)
        .padding(7)
        .background(.black.opacity(0.42), in: Circle())
        .accessibilityLabel("\(participant.connectionQuality.rawValue) connection")
    }

    private var connectionSymbol: String {
        switch participant.connectionQuality {
        case .excellent: "wifi"
        case .good: "wifi"
        case .limited: "wifi.exclamationmark"
        }
    }

    private var connectionColor: Color {
        switch participant.connectionQuality {
        case .excellent: .green
        case .good: .yellow
        case .limited: .orange
        }
    }

    private var accessibilitySummary: String {
        var parts = [participant.displayName]
        if isLocal { parts.append("you") }
        parts.append(participant.role.rawValue)
        parts.append(participant.isMuted ? "muted" : "microphone on")
        parts.append(participant.isCameraEnabled ? "camera on" : "camera off")
        parts.append("\(participant.connectionQuality.rawValue) connection")
        if participant.isSpeaking { parts.append("speaking") }
        return parts.joined(separator: ", ")
    }
}

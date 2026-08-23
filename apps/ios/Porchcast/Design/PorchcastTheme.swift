import SwiftUI

enum PorchcastTheme {
    static let ink = Color(red: 39 / 255, green: 40 / 255, blue: 34 / 255)
    static let paper = Color(red: 250 / 255, green: 248 / 255, blue: 242 / 255)
    static let paperMuted = Color(red: 236 / 255, green: 232 / 255, blue: 223 / 255)
    static let sage = Color(red: 223 / 255, green: 229 / 255, blue: 214 / 255)
    static let signal = Color(red: 238 / 255, green: 86 / 255, blue: 60 / 255)
    static let healthy = Color(red: 92 / 255, green: 125 / 255, blue: 75 / 255)
    static let stage = Color(red: 21 / 255, green: 23 / 255, blue: 20 / 255)
}

struct PorchcastMark: View {
    var color = PorchcastTheme.signal

    var body: some View {
        HStack(alignment: .bottom, spacing: 3) {
            bar(height: 11)
            bar(height: 24)
            bar(height: 17)
        }
        .frame(width: 25, height: 26)
        .accessibilityHidden(true)
    }

    private func bar(height: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: 1.5)
            .fill(color)
            .frame(width: 5, height: height)
    }
}

struct PorchcastWordmark: View {
    var compact = false

    var body: some View {
        HStack(spacing: 9) {
            PorchcastMark()
            if !compact {
                Text("PORCHCAST")
                    .font(.headline.weight(.black))
                    .tracking(2.2)
            }
        }
        .foregroundStyle(PorchcastTheme.ink)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Porchcast")
    }
}

struct DemoModeBanner: View {
    let preferredBackendName: String

    var body: some View {
        Label {
            Text("Deterministic demo")
                .fontWeight(.semibold)
            + Text(" · \(preferredBackendName) remains the default configuration")
        } icon: {
            Image(systemName: "hammer.fill")
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal)
        .padding(.vertical, 9)
        .background(PorchcastTheme.sage.opacity(0.7))
        .accessibilityLabel(
            "Deterministic demo. \(preferredBackendName) remains the default configuration."
        )
    }
}

struct PorchCardStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding()
            .background(PorchcastTheme.paper, in: RoundedRectangle(cornerRadius: 18))
            .overlay {
                RoundedRectangle(cornerRadius: 18)
                    .stroke(PorchcastTheme.ink.opacity(0.12), lineWidth: 1)
            }
    }
}

extension View {
    func porchCard() -> some View {
        modifier(PorchCardStyle())
    }
}

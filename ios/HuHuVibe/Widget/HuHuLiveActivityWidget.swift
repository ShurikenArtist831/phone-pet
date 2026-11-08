import ActivityKit
import SwiftUI
import WidgetKit

@main
struct HuHuLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: PenguinActivity.self) { context in
            PenguinSummary(state: context.state.state)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .activityBackgroundTint(Color(red: 0.91, green: 0.96, blue: 0.92))
                .foregroundStyle(Color(red: 0.13, green: 0.25, blue: 0.20))
        } dynamicIsland: { context in
            let state = context.state.state
            DynamicIsland {
                DynamicIslandExpandedRegion(.center) {
                    PenguinSummary(state: state)
                }
            } compactLeading: {
                ActivityPenguin(state: state, size: 28)
                    .accessibilityHidden(true)
            } compactTrailing: {
                Text(state.label)
                    .font(.caption2.weight(.semibold))
                    .lineLimit(1)
            } minimal: {
                ActivityPenguin(state: state, size: 26)
                    .accessibilityLabel("乎乎：\(state.label)")
            }
        }
    }
}

private struct PenguinSummary: View {
    let state: PetState

    var body: some View {
        HStack(spacing: 12) {
            ActivityPenguin(state: state, size: 60, large: true)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text("乎乎")
                    .font(.headline)
                Text(state.label)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }
}

private struct ActivityPenguin: View {
    let state: PetState
    let size: CGFloat
    var large = false

    var body: some View {
        Image(large ? "\(state.imageName)-large" : state.imageName)
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
    }
}

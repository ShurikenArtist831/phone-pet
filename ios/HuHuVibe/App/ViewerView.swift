import SwiftUI

@MainActor
struct ViewerView: View {
    let model: ViewerModel

    var body: some View {
        VStack(spacing: 18) {
            Text("乎乎")
                .font(.largeTitle.bold())
                .accessibilityAddTraits(.isHeader)

            if let pet = model.pet {
                VStack(spacing: 8) {
                    Image(pet.state.imageName)
                        .resizable()
                        .scaledToFit()
                        .frame(height: 230)
                        .accessibilityHidden(true)
                    Text(pet.state.label)
                        .font(.title2.bold())
                }
                .frame(maxWidth: .infinity)
                .padding(20)
                .background(.background, in: RoundedRectangle(cornerRadius: 24))
            } else if model.message == nil {
                ProgressView("正在读取乎乎的状态…")
            }

            if let activity = model.liveActivity {
                activityControls(activity)
            }
            if let message = model.message {
                Text(message)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }
            if let message = model.activityMessage {
                Text(message)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 16)
    }

    @ViewBuilder
    private func activityControls(_ activity: LiveActivityManager) -> some View {
        if activity.isRunning {
            switch activity.registration {
            case .waiting:
                ProgressView("正在等待灵动岛推送凭证…")
            case .sending:
                ProgressView("正在登记灵动岛推送…")
            case .registered:
                Text("已登记灵动岛推送")
                    .foregroundStyle(.secondary)
            case .failed(let message):
                Text(message)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                Button("重试登记") { activity.retryRegistration() }
            }
            Button("结束灵动岛展示") { Task { await model.endActivity() } }
                .buttonStyle(.bordered)
                .controlSize(.large)
                .disabled(model.work != nil)
        } else {
            Button {
                Task { await model.startActivity() }
            } label: {
                Text(model.work == .starting ? "正在启动…" : "放到灵动岛")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(model.work != nil)
        }

        if activity.hasPendingEnds {
            Text("本机已结束展示，等待同步到服务。")
                .font(.footnote)
                .foregroundStyle(.secondary)
            Button("重试同步") { Task { await activity.syncPendingEnds() } }
                .font(.footnote)
        }
    }
}

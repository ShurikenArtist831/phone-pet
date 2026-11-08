import SwiftUI

@main
@MainActor
struct HuHuVibeApp: App {
    var body: some Scene {
        WindowGroup { ViewerRootView() }
    }
}

@MainActor
struct ViewerRootView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var model = ViewerModel()

    var body: some View {
        ScrollView {
            Group {
                if !model.isConfigured {
                    ContentUnavailableView("尚未配置乎乎服务", systemImage: "link",
                                           description: Text("请在 Xcode 中填写服务地址后重新安装。"))
                } else if model.loadingCredential {
                    ProgressView("正在读取配对信息…")
                } else if model.isPaired {
                    ViewerView(model: model)
                } else {
                    PairingView(model: model)
                }
            }
            .frame(maxWidth: 440)
            .padding(24)
            .frame(maxWidth: .infinity)
        }
        .background(Color(uiColor: .systemGroupedBackground).ignoresSafeArea())
        .tint(Color(red: 0.18, green: 0.42, blue: 0.34))
        .refreshable { await model.refresh() }
        .onOpenURL { model.openInvitation($0) }
        .task(id: ForegroundSession(active: scenePhase == .active, paired: model.isPaired)) {
            if scenePhase == .active { await model.foreground() }
        }
    }

    private struct ForegroundSession: Equatable {
        let active: Bool
        let paired: Bool
    }
}

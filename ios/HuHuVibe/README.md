# 乎乎 Vibe · iPhone 展示端

这是只读的原生 Viewer。手机 A 继续在现有 PWA 切换状态，手机 B 用这款 App 配对、查看乎乎并手动启动或结束灵动岛展示。

| 目录 | 内容 |
| --- | --- |
| App | 配对与展示界面、HTTPS API、Keychain 和 Live Activity 生命周期 |
| Shared | App 与扩展共用的状态枚举和 ActivityKit 数据契约 |
| Widget | 锁屏及灵动岛的紧凑、最小、展开布局 |
| Assets | 原版企鹅图片，以及用相同原图缩放得到的活动图片和 App 图标 |
| Config | 本地构建设置及主 App 的推送 entitlement |

## 在 macOS 上打开工程

需要带 iOS SDK 的 Xcode（至少 Xcode 15.2）、XcodeGen 2.42 或更新版本，以及 iOS 17.2 或更新版本。真机测试灵动岛时，使用支持灵动岛的 iPhone。

在仓库根目录执行：

~~~sh
brew install xcodegen
cd ios/HuHuVibe
cp Config/Local.xcconfig.example Config/Local.xcconfig
~~~

在 Config/Local.xcconfig 中填入实际值：

| 设置 | 填写内容 |
| --- | --- |
| HUHU_API_HOST | 已部署 Worker 的正式域名，只有主机名。App 以 HTTPS 访问该域名的根路径。 |
| HUHU_BUNDLE_ID | Apple Developer 注册的主 App Bundle ID，与 Worker 的 APNS_BUNDLE_ID 完全一致。扩展使用同一 ID 加 .LiveActivity。 |
| DEVELOPMENT_TEAM | Apple Developer Team ID，用于两个 target 的自动签名。 |

然后生成并打开工程：

~~~sh
xcodegen generate
open HuHuVibe.xcodeproj
~~~

1. 在 Xcode 的 **Signing & Capabilities** 检查 HuHuVibe 和 HuHuLiveActivity 两个 target 都选中了同一团队，启用 **Automatically manage signing**。为主 App 的 Apple App ID 启用 **Push Notifications**。主 App 的配置已包含推送 entitlement 和 NSSupportsLiveActivities，扩展由主 App 嵌入。
2. 选择 **HuHuVibe** scheme 和 iPhone Simulator，按 **⌘B** 编译。需要只检查编译时也可执行以下命令：

   ~~~sh
   xcodebuild -project HuHuVibe.xcodeproj -scheme HuHuVibe -configuration Debug \
     -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build
   ~~~

3. 真机上用 **Debug** 跑开发签名构建，对应 APNs sandbox。**Release** 用于 TestFlight 或 App Store 分发，对应 production。环境由 Config/Debug.xcconfig 和 Config/Release.xcconfig 注入。如果自定义构建或签名方式，请确认 App 的 HuHuAPNsEnvironment 和签名后的 aps-environment 一致，development 对应 sandbox。无需 App Group 或后台执行权限。
4. 真实推送前，确认 Worker 已应用 0003_live_activities.sql，并按[后端部署说明](../../docs/live-activity.md)配置匹配环境的 APNs 凭证与 Token 存储密钥。Apple 私钥只配置在 Worker。

[Apple 推送签名 entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/aps-environment) · [ActivityKit 远程更新](https://developer.apple.com/documentation/activitykit/starting-and-updating-live-activities-with-activitykit-push-notifications) · [XcodeGen 工程配置](https://github.com/yonaskolb/XcodeGen/blob/master/Docs/ProjectSpec.md)

## 双机验证

1. 在手机 A 的 PWA 生成新邀请。每只宠物只能有一个有效 Viewer。如果已经配对了网页 Viewer，先在管理员页面撤销旧 Viewer，再生成新邀请。
2. 手机 B 在 App 中粘贴原来的 HTTPS 邀请链接或输入 64 位邀请码，也可以直接打开 `huhuvibe://join/<邀请码>` 并确认配对。原有 HTTPS 链接仍由浏览器打开。本工程使用自定义链接来直接打开原生 App，未配置 Universal Links。
3. 点击「放到灵动岛」，等待显示「已登记灵动岛推送」。将 App 切到后台或锁屏，再在手机 A 切换心情，检查手机 B 的灵动岛和锁屏是否更新。「已登记」表示 Worker 接受了 Token，收到 APNs 更新才算端到端验证成功。
4. 重新打开 App，确认恢复现有活动。点击「结束灵动岛展示」，确认可手动开始新活动。离线结束会先关闭本地活动，在下次进入前台时同步给服务，也可点「重试同步」。在管理员页撤销 Viewer 后，App 应在下次读取状态时清除授权并回到配对页。

客户端沿用 POST /api/invites/claim、GET /api/pets/{petId}、POST /api/live-activities/register 和 POST /api/live-activities/end。活动以默认 Codable 解码 petId、state 和 Int64 version。App 只在前台定期读取宠物状态，灵动岛远程更新由 ActivityKit 和 APNs 处理。活动结束或到期后由用户手动重启。

Windows 可检查 Swift 源码、工程配置和资源清单。Xcode 构建、签名、ActivityKit 运行行为及 APNs 投递需要在 macOS 和 iPhone 上验证。

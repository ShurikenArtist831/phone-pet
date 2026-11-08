# Live Activity 后端

## Viewer API

两个接口使用 HTTPS、`Content-Type: application/json` 和 `Authorization: Bearer <viewer-device-token>`。Viewer 凭证来自现有的 `POST /api/invites/claim`，原生 App 应保存到 Keychain。Worker 从这份凭证查找对应设备及宠物，请求中带有 `petId` 或 `deviceId` 会被拒绝。

| 接口 | JSON 请求体 | 成功响应 |
| --- | --- | --- |
| `POST /api/live-activities/register` | `{ "activityId": "<Activity.id>", "pushToken": "<hex>", "environment": "sandbox" }` | `200 { "ok": true }` |
| `POST /api/live-activities/end` | `{ "activityId": "<Activity.id>" }` | `200 { "ok": true }` |

`activityId` 区分大小写，接受 1–128 个 ASCII 字母、数字、下划线或连字符。`pushToken` 是 `Data` 的十六进制表示，每个字节占两位，接受大小写，无空格、`0x` 或分隔符。长度可变，最多 512 字节。`environment` 使用 `sandbox` 或 `production`，由原生构建的 `aps-environment` entitlement 决定，`development` 对应 `sandbox`。TestFlight 和 App Store 构建使用 `production`。

- `401` 表示设备凭证无效，`403` 表示凭证属于 Controller，`400` 表示参数不合法。
- 注册时返回 `409` 表示当前活动或 Token 无法登记，例如活动已结束、被替代或归属其他设备。`503` 表示尚未配置 Token 存储密钥。
- `end` 只结束当前 Viewer 自己的记录，可重复提交。其他 Viewer 的活动和未知活动都返回 `404`。原生 App 负责在手机上结束活动。

## SwiftUI 接入顺序

1. 用 Viewer 凭证调用 `GET /api/pets/{petId}`，以当前快照初始化活动。
2. 用户点「放到灵动岛」后，用 ActivityKit 创建活动，给 `Activity.request` 传 `pushType: .token`。
3. 观察这项活动的 `pushTokenUpdates`，把每个 `Data` 转成十六进制，连同 `activity.id` 和构建对应的 APNs 环境调用 `register`。同一活动的 Token 轮换按顺序提交。注册成功后可以再读一次宠物快照，用更大的版本补齐启动时的状态变化。
4. 活动结束后调用 `end`。如果系统结束活动时 App 无法上报，Worker 会在后续状态更新时检查活动时限和 APNs 的失效响应。用户可以再次启动一项新活动。

`ActivityAttributes.ContentState` 使用默认 `Codable`。字段名和大小写保持一致，四种状态可以定义为一个遵循 `Codable` 的 Swift `String` 枚举。

| JSON 字段 | Swift 类型 | 约定 |
| --- | --- | --- |
| `petId` | `String` | 现有 API 快照中的 `id` |
| `state` | `String` 或 `PetState` | `angry`、`happy`、`comfortable`、`sleeping` |
| `version` | `Int64` | D1 中从 1 开始递增的宠物状态版本，JSON 整数 |

APNs 更新示例：

```json
{
  "aps": {
    "timestamp": 1794094800,
    "event": "update",
    "content-state": { "petId": "cf513a80-13e2-4f84-ae61-c433681b3c3e", "state": "happy", "version": 12 }
  }
}
```

[Apple ActivityKit 推送与 Codable 说明](https://developer.apple.com/documentation/activitykit/starting-and-updating-live-activities-with-activitykit-push-notifications)

## Token 生命周期和推送

每个 Viewer 最多有一项有效活动。同一 `activityId` 重新注册更新 Token，保留首次登记时间。登记新活动会在同一个 D1 事务中结束旧活动，旧活动不能再注册。手动结束、换配对和过期都会清除 Token 密文及其去重指纹。八小时上限从首次登记计算，轮换 Token 不延长时限。八小时内 APNs 判失效的活动，可在 App 再次收到活动 Token 时重新登记，前提是活动尚未结束或被替代。

D1 保存 AES-256-GCM 密文，密钥保存在 Worker Secret。更换密钥后，已保存的 Token 需要由原 Viewer 重新注册才能解密使用。Controller API、管理员列表和日志均不暴露 Token。

Controller 状态先写入 D1，再用 `ctx.waitUntil` 推送。发送前跳过已被更新版本覆盖的状态，`timestamp` 使用状态写入时间的 Unix 秒。APNs 对同一秒内已发出的多个更新没有可依赖的排序保证。每次更新最多尝试一次，APNs 请求超时为 5 秒。APNs `410` 或 `BadDeviceToken` 会让该次发送所用的 Token 失效，失败不会回滚状态。鉴权和 topic 错误保留 Token，便于修正配置。当前优先级为 `10`，仅尝试即时投递，APNs 接受请求也不保证 iPhone 实际显示更新。

[Apple APNs 响应说明](https://developer.apple.com/documentation/usernotifications/handling-notification-responses-from-apns) · [Cloudflare Worker `waitUntil`](https://developers.cloudflare.com/workers/runtime-apis/context/#waituntil)

## Windows 本地验证

```powershell
npm run build
npm run check:worker
node scripts/mock-live-activities.mjs
```

Mock 使用临时生成的签名密钥、本机 Miniflare 和内存 D1。它校验沙盒及生产目标地址、ES256 签名、APNs 请求头、负载和活动失效行为。真实 APNs 连接与灵动岛显示需要后续使用 Apple 凭证和 iPhone 验证。APNs 要求 HTTP/2，本地 workerd 的 APNs 请求使用 Mock。 [Apple APNs 连接要求](https://developer.apple.com/documentation/usernotifications/establishing-a-connection-to-apns) · [workerd 的本地与线上传输差异](https://github.com/cloudflare/workerd/issues/4841)

## 手动部署

现在只有 Windows 后端和 APNs Mock 时，直接使用以下命令部署。未配置 APNs 时，现有 PWA 照常同步宠物状态。

```powershell
npm run build
npm run check:worker
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
```

### 实测 iPhone 时配置 APNs

为启用了 Push Notifications 的 App ID 准备以下 Worker Secrets：

| Secret | 值 |
| --- | --- |
| `APNS_KEY_ID` | Apple Developer APNs Key ID |
| `APNS_TEAM_ID` | Apple Developer Team ID |
| `APNS_PRIVATE_KEY` | Apple 下载的 `.p8` PEM 全文，可用 `\n` 表示换行 |
| `APNS_BUNDLE_ID` | iOS 主 App 的 Bundle ID |
| `LIVE_ACTIVITY_TOKEN_KEY` | 单独生成的 32 字节随机密钥，填 64 位十六进制字符 |

当前每个 Worker 部署使用一套 APNs 凭证。Apple 新建的 APNs Key 通常限定单一环境，因此给对应环境的 Worker 使用匹配的 Key。已有可同时用于 Sandbox 和 Production 的团队 Key 也受支持。 [Apple APNs Key 的环境限制](https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns)

生成存储密钥：

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

将上面五个值填入已被 Git 忽略的 `.env.apns`，用 `NAME=value` 格式。私钥可放在一对双引号中，用字面 `\n` 表示每次换行。保存 `.p8` 时放在仓库外。

确认 `.env.apns` 已创建并填好后，在项目目录中上传 Secrets：

```powershell
npx wrangler deploy --secrets-file .env.apns
```

[Cloudflare Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

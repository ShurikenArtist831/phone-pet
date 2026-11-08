import ActivityKit
import Foundation
import Observation

@MainActor
@Observable
final class LiveActivityManager {
    private typealias LiveActivity = Activity<PenguinActivity>

    enum Registration: Equatable {
        case waiting, sending, registered, failed(String)
    }

    private(set) var isRunning = false
    private(set) var registration = Registration.waiting
    private(set) var hasPendingEnds = false

    private let api: ViewerAPI
    private let viewer: ViewerCredential
    private let onRevoked: @MainActor () -> Void
    private let pendingKey: String
    private var activity: LiveActivity?
    private var tokenWatcher: Task<Void, Never>?
    private var stateWatcher: Task<Void, Never>?
    private var tokenDeadline: Task<Void, Never>?
    private var registering: Task<Void, Never>?
    private var newestToken: Data?
    private var registeredToken: Data?
    private var sendingEnds = false
    private var discarded = false

    init(api: ViewerAPI, viewer: ViewerCredential, onRevoked: @escaping @MainActor () -> Void) {
        self.api = api
        self.viewer = viewer
        self.onRevoked = onRevoked
        pendingKey = "activity.ends.\(api.configuration.baseURL.absoluteString).\(viewer.petId)"
        hasPendingEnds = !pendingEnds.isEmpty
    }

    func restore() {
        guard !discarded else { return }
        if let activity, !isActive(activity.activityState) { activityFinished(activity.id) }
        guard activity == nil, let existing = existingActivity() else { return }
        observe(existing)
    }

    func start(with pet: PetSnapshot) async throws {
        await registering?.value
        guard !discarded else { return }
        restore()
        guard activity == nil else { return }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            throw StartError.disabled
        }
        do {
            let started = try LiveActivity.request(
                attributes: PenguinActivity(petId: pet.id),
                content: ActivityContent(state: pet.activityState, staleDate: nil),
                pushType: .token
            )
            observe(started)
        } catch {
            throw StartError.requestFailed
        }
    }

    func retryRegistration() {
        guard let activity else { return }
        if let token = activity.pushToken ?? newestToken {
            receive(token, for: activity.id)
        } else {
            waitForToken(activity.id)
        }
    }

    func end() async {
        guard let activity else { return }
        rememberEnd(activity.id)
        detach()
        await activity.end(nil, dismissalPolicy: .immediate)
        await syncPendingEnds()
    }

    func discardAuthorization() {
        discarded = true
        let running = activity ?? existingActivity()
        detach()
        pendingEnds = []
        if let running {
            Task { await running.end(nil, dismissalPolicy: .immediate) }
        }
    }

    func syncPendingEnds() async {
        guard !discarded, !sendingEnds, hasPendingEnds else { return }
        sendingEnds = true
        defer { sendingEnds = false }
        // Let a registration already sent for the ending activity complete before clearing it.
        await registering?.value
        for id in pendingEnds {
            guard !discarded else { return }
            if let local = LiveActivity.activities.first(where: { $0.id == id && isActive($0.activityState) }) {
                await local.end(nil, dismissalPolicy: .immediate)
            }
            guard !discarded else { return }
            do {
                try await api.end(id, viewer: viewer)
            } catch let error as ViewerError where error.missingActivity {
                // The local activity may have ended before any token was registered.
            } catch let error as ViewerError where error.unauthorized {
                onRevoked()
                return
            } catch {
                return
            }
            pendingEnds = pendingEnds.filter { $0 != id }
        }
    }

    private func existingActivity() -> LiveActivity? {
        let closing = pendingEnds
        return LiveActivity.activities.first {
            $0.attributes.petId == viewer.petId && isActive($0.activityState) && !closing.contains($0.id)
        }
    }

    private func isActive(_ state: ActivityState) -> Bool {
        state == .active || state == .stale
    }

    private func observe(_ activity: LiveActivity) {
        self.activity = activity
        isRunning = true
        waitForToken(activity.id)

        tokenWatcher = Task { [weak self] in
            let updates = activity.pushTokenUpdates
            if let token = activity.pushToken { self?.receive(token, for: activity.id) }
            for await token in updates {
                guard !Task.isCancelled else { return }
                self?.receive(activity.pushToken ?? token, for: activity.id)
            }
        }
        stateWatcher = Task { [weak self] in
            let updates = activity.activityStateUpdates
            if activity.activityState == .ended || activity.activityState == .dismissed {
                self?.activityFinished(activity.id)
                return
            }
            for await state in updates {
                guard !Task.isCancelled else { return }
                if state == .ended || state == .dismissed {
                    self?.activityFinished(activity.id)
                    return
                }
            }
        }
    }

    private func waitForToken(_ activityId: String) {
        registration = .waiting
        tokenDeadline?.cancel()
        tokenDeadline = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(15)) } catch { return }
            guard let self, self.activity?.id == activityId, self.registration == .waiting else { return }
            self.registration = .failed("暂未收到灵动岛推送凭证，请稍后重试。")
        }
    }

    private func receive(_ token: Data, for activityId: String) {
        guard activity?.id == activityId, !token.isEmpty else { return }
        newestToken = token
        guard registering == nil, token != registeredToken else { return }
        tokenDeadline?.cancel()
        registration = .sending
        registering = Task { [weak self] in
            guard let self else { return }
            await self.registerLatestToken(for: activityId)
        }
    }

    private func registerLatestToken(for activityId: String) async {
        defer { registering = nil }
        // Serialize updates so a slow request cannot overwrite a more recent token.
        while activity?.id == activityId, let token = newestToken, token != registeredToken {
            do {
                try await api.register(activityId, token: token, viewer: viewer)
                guard activity?.id == activityId else { return }
                registeredToken = token
                registration = newestToken == token ? .registered : .sending
            } catch {
                if (error as? ViewerError)?.unauthorized == true {
                    if !discarded { onRevoked() }
                    return
                }
                guard activity?.id == activityId else { return }
                if newestToken == token {
                    registration = .failed(error.localizedDescription)
                    return
                }
            }
        }
    }

    private func activityFinished(_ id: String) {
        guard activity?.id == id else { return }
        rememberEnd(id)
        detach()
        Task { [weak self] in await self?.syncPendingEnds() }
    }

    private func detach() {
        tokenWatcher?.cancel()
        stateWatcher?.cancel()
        tokenDeadline?.cancel()
        tokenWatcher = nil
        stateWatcher = nil
        tokenDeadline = nil
        activity = nil
        isRunning = false
        newestToken = nil
        registeredToken = nil
        registration = .waiting
    }

    private var pendingEnds: [String] {
        get { UserDefaults.standard.stringArray(forKey: pendingKey) ?? [] }
        set {
            UserDefaults.standard.set(newValue, forKey: pendingKey)
            hasPendingEnds = !newValue.isEmpty
        }
    }

    private func rememberEnd(_ id: String) {
        if !pendingEnds.contains(id) { pendingEnds.append(id) }
    }

    private enum StartError: LocalizedError {
        case disabled, requestFailed

        var errorDescription: String? {
            switch self {
            case .disabled: "请在 iPhone 设置中允许乎乎 Vibe 的实时活动后重试。"
            case .requestFailed: "无法启动灵动岛展示，请检查系统设置后重试。"
            }
        }
    }
}

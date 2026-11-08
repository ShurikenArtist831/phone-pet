import Foundation
import Observation

@MainActor
@Observable
final class ViewerModel {
    enum Work: Equatable { case pairing, starting, ending }

    var invitation = ""
    private(set) var liveActivity: LiveActivityManager?
    private(set) var isPaired = false
    private(set) var pet: PetSnapshot?
    private(set) var message: String?
    private(set) var activityMessage: String?
    private(set) var work: Work?
    private(set) var loadingCredential = true
    private(set) var credentialLoadFailed = false

    private let api: ViewerAPI?
    private let keychain: ViewerKeychain?
    private var viewer: ViewerCredential?
    private var unsavedPairing: Pairing?

    init() {
        if let configuration = ViewerConfiguration() {
            api = ViewerAPI(configuration: configuration)
            keychain = ViewerKeychain(origin: configuration.baseURL)
        } else {
            api = nil
            keychain = nil
            loadingCredential = false
        }
    }

    var isConfigured: Bool { api != nil }
    var canPair: Bool {
        !loadingCredential && work == nil && (unsavedPairing != nil || !invitation.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    func openInvitation(_ url: URL) {
        guard !isPaired, work == nil, let api else { return }
        guard let token = api.configuration.invitationToken(url.absoluteString) else {
            message = ViewerError.invalidInvitation.errorDescription
            return
        }
        invitation = token
        message = nil
    }

    func foreground() async {
        if loadingCredential { loadCredential() }
        await refresh()
        guard !Task.isCancelled else { return }
        liveActivity?.restore()
        if case .failed? = liveActivity?.registration { liveActivity?.retryRegistration() }
        await liveActivity?.syncPendingEnds()
        while !Task.isCancelled {
            do { try await Task.sleep(for: .seconds(5)) } catch { return }
            await refresh()
            if !isPaired { return }
        }
    }

    func loadCredential() {
        guard let keychain, !isPaired else { return }
        defer { loadingCredential = false }
        credentialLoadFailed = false
        message = nil
        do {
            if let saved = try keychain.load() { use(saved) }
        } catch {
            credentialLoadFailed = true
            message = error.localizedDescription
        }
    }

    func pair() async {
        guard let api, let keychain, canPair, !isPaired else { return }
        work = .pairing
        message = nil
        defer { work = nil }
        do {
            let pairing: Pairing
            if let unsavedPairing {
                pairing = unsavedPairing
            } else {
                guard let token = api.configuration.invitationToken(invitation) else { throw ViewerError.invalidInvitation }
                pairing = try await api.claim(token)
                unsavedPairing = pairing
                invitation = ""
            }
            try keychain.save(pairing.device)
            unsavedPairing = nil
            use(pairing.device)
            pet = pairing.pet
        } catch {
            message = error.localizedDescription
        }
    }

    func refresh() async {
        guard let api, let viewer else { return }
        do {
            let snapshot = try await api.pet(for: viewer)
            guard self.viewer == viewer, !Task.isCancelled else { return }
            apply(snapshot)
        } catch {
            guard self.viewer == viewer, !Task.isCancelled else { return }
            handle(error, viewer: viewer)
        }
    }

    func startActivity() async {
        guard work == nil, let api, let viewer, let liveActivity else { return }
        work = .starting
        activityMessage = nil
        defer { work = nil }
        do {
            let snapshot = try await api.pet(for: viewer)
            guard self.viewer == viewer else { return }
            apply(snapshot)
            guard let pet else { return }
            try await liveActivity.start(with: pet)
        } catch {
            guard self.viewer == viewer else { return }
            if (error as? ViewerError)?.unauthorized == true {
                revoke(viewer)
            } else {
                activityMessage = error.localizedDescription
            }
        }
    }

    func endActivity() async {
        guard work == nil else { return }
        work = .ending
        activityMessage = nil
        defer { work = nil }
        await liveActivity?.end()
    }

    private func use(_ viewer: ViewerCredential) {
        guard let api else { return }
        self.viewer = viewer
        isPaired = true
        liveActivity = LiveActivityManager(api: api, viewer: viewer) { [weak self] in
            self?.revoke(viewer)
        }
    }

    private func apply(_ snapshot: PetSnapshot) {
        if snapshot.version >= (pet?.version ?? 0) { pet = snapshot }
        if work == nil { message = nil }
    }

    private func handle(_ error: Error, viewer: ViewerCredential) {
        if (error as? ViewerError)?.unauthorized == true {
            revoke(viewer)
        } else if !(error is CancellationError) {
            message = error.localizedDescription
        }
    }

    private func revoke(_ viewer: ViewerCredential) {
        guard self.viewer == viewer else { return }
        self.viewer = nil
        liveActivity?.discardAuthorization()
        liveActivity = nil
        isPaired = false
        pet = nil
        activityMessage = nil
        invitation = ""
        do {
            try keychain?.remove()
            message = "配对授权已失效，请使用新的邀请链接。"
        } catch {
            message = "配对授权已失效，旧凭证暂时无法清除。请解锁手机后使用新邀请配对。"
        }
    }
}

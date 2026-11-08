import Foundation

enum APNsEnvironment: String {
    case sandbox, production
}

struct ViewerConfiguration {
    let baseURL: URL
    let environment: APNsEnvironment

    init?(bundle: Bundle = .main) {
        guard let host = bundle.object(forInfoDictionaryKey: "HuHuAPIHost") as? String,
              host.range(of: "^[A-Za-z0-9.-]+\\.[A-Za-z0-9-]+$", options: .regularExpression) != nil,
              let url = URL(string: "https://\(host.lowercased())"),
              let value = bundle.object(forInfoDictionaryKey: "HuHuAPNsEnvironment") as? String,
              let environment = APNsEnvironment(rawValue: value) else { return nil }
        baseURL = url
        self.environment = environment
    }

    func invitationToken(_ input: String) -> String? {
        let value = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if isToken(value) { return value.lowercased() }

        guard let url = URLComponents(string: value), url.user == nil, url.password == nil,
              url.port == nil || url.port == 443, url.query == nil, url.fragment == nil,
              let scheme = url.scheme?.lowercased(), let host = url.host?.lowercased() else { return nil }
        let parts = url.path.split(separator: "/")
        switch (scheme, host) {
        case ("https", _) where host == baseURL.host && parts.count == 2 && parts.first == "join":
            break
        case ("huhuvibe", "join") where parts.count == 1 && url.port == nil:
            break
        default:
            return nil
        }
        guard let token = parts.last.map(String.init), isToken(token) else { return nil }
        return token.lowercased()
    }
}

private func isToken(_ value: String) -> Bool {
    value.utf8.count == 64 && value.utf8.allSatisfy {
        (48...57).contains($0) || (65...70).contains($0) || (97...102).contains($0)
    }
}

struct ViewerCredential: Codable, Equatable {
    let petId: String
    let role: String
    let token: String

    var isValid: Bool { role == "viewer" && UUID(uuidString: petId) != nil && isToken(token) }
}

struct PetSnapshot: Decodable {
    let id: String
    let state: PetState
    let version: Int64

    var activityState: PenguinActivity.ContentState {
        .init(petId: id, state: state, version: version)
    }
}

struct Pairing: Decodable {
    let pet: PetSnapshot
    let device: ViewerCredential
}

enum ViewerError: LocalizedError {
    case invalidInvitation, invalidResponse, network, credentialStorage
    case server(Int, String?)

    var unauthorized: Bool {
        switch self {
        case .server(401, _), .server(403, _): true
        default: false
        }
    }

    var missingActivity: Bool {
        if case .server(404, _) = self { return true }
        return false
    }

    var errorDescription: String? {
        switch self {
        case .invalidInvitation: "请输入有效的邀请链接或邀请码。"
        case .invalidResponse: "乎乎服务返回了无法识别的数据，请稍后再试。"
        case .network: "连接失败，请检查网络后重试。"
        case .credentialStorage: "无法读取或保存配对凭证，请解锁手机后重试。"
        case .server(401, _), .server(403, _): "配对授权已失效，请使用新的邀请链接。"
        case .server(_, let message): message ?? "乎乎服务暂时不可用，请稍后再试。"
        }
    }
}

private final class NoRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

struct ViewerAPI {
    let configuration: ViewerConfiguration

    private static let session: URLSession = {
        let settings = URLSessionConfiguration.ephemeral
        settings.httpShouldSetCookies = false
        settings.urlCredentialStorage = nil
        settings.timeoutIntervalForRequest = 10
        settings.timeoutIntervalForResource = 15
        return URLSession(configuration: settings, delegate: NoRedirects(), delegateQueue: nil)
    }()

    func claim(_ token: String) async throws -> Pairing {
        let pairing: Pairing = try await send("api/invites/claim", body: ["token": token])
        guard pairing.device.isValid, pairing.pet.id == pairing.device.petId else { throw ViewerError.invalidResponse }
        return pairing
    }

    func pet(for viewer: ViewerCredential) async throws -> PetSnapshot {
        let pet: PetSnapshot = try await send("api/pets/\(viewer.petId)", viewer: viewer)
        guard pet.id == viewer.petId else { throw ViewerError.invalidResponse }
        return pet
    }

    func register(_ activityId: String, token: Data, viewer: ViewerCredential) async throws {
        let hex = token.map { String(format: "%02x", $0) }.joined()
        let result: Acknowledgment = try await send("api/live-activities/register", viewer: viewer, body: [
            "activityId": activityId,
            "pushToken": hex,
            "environment": configuration.environment.rawValue,
        ])
        guard result.ok else { throw ViewerError.invalidResponse }
    }

    func end(_ activityId: String, viewer: ViewerCredential) async throws {
        let result: Acknowledgment = try await send("api/live-activities/end", viewer: viewer, body: ["activityId": activityId])
        guard result.ok else { throw ViewerError.invalidResponse }
    }

    private struct Acknowledgment: Decodable { let ok: Bool }
    private struct Failure: Decodable { let error: String }

    private func send<T: Decodable>(_ path: String, viewer: ViewerCredential? = nil,
                                   body: [String: String]? = nil) async throws -> T {
        var request = URLRequest(url: configuration.baseURL.appendingPathComponent(path),
                                 cachePolicy: .reloadIgnoringLocalCacheData)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let viewer { request.setValue("Bearer \(viewer.token)", forHTTPHeaderField: "Authorization") }
        if let body {
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await Self.session.data(for: request)
        } catch {
            if Task.isCancelled { throw CancellationError() }
            throw ViewerError.network
        }
        guard let http = response as? HTTPURLResponse else { throw ViewerError.invalidResponse }
        let decoder = JSONDecoder()
        guard (200..<300).contains(http.statusCode) else {
            let failure = try? decoder.decode(Failure.self, from: data)
            throw ViewerError.server(http.statusCode, failure?.error)
        }
        guard let value = try? decoder.decode(T.self, from: data) else { throw ViewerError.invalidResponse }
        return value
    }
}

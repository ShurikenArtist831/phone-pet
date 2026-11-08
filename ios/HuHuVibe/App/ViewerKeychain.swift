import Foundation
import Security

struct ViewerKeychain {
    let origin: URL

    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: Bundle.main.bundleIdentifier ?? "HuHuVibe",
         kSecAttrAccount as String: origin.absoluteString]
    }

    func load() throws -> ViewerCredential? {
        var request = query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var value: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &value)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = value as? Data,
              let credential = try? JSONDecoder().decode(ViewerCredential.self, from: data), credential.isValid else {
            throw ViewerError.credentialStorage
        }
        return credential
    }

    func save(_ credential: ViewerCredential) throws {
        let data = try JSONEncoder().encode(credential)
        let values: [String: Any] = [kSecValueData as String: data]
        let status = SecItemUpdate(query as CFDictionary, values as CFDictionary)
        if status == errSecItemNotFound {
            var entry = query
            entry[kSecValueData as String] = data
            entry[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            guard SecItemAdd(entry as CFDictionary, nil) == errSecSuccess else { throw ViewerError.credentialStorage }
        } else if status != errSecSuccess {
            throw ViewerError.credentialStorage
        }
    }

    func remove() throws {
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw ViewerError.credentialStorage }
    }
}

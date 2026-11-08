import ActivityKit

enum PetState: String, Codable, Hashable {
    case angry, happy, comfortable, sleeping

    var label: String {
        switch self {
        case .angry: "生气"
        case .happy: "开心"
        case .comfortable: "舒服"
        case .sleeping: "睡觉"
        }
    }

    var imageName: String { "penguin-\(rawValue)" }
}

struct PenguinActivity: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        let petId: String
        let state: PetState
        let version: Int64
    }

    let petId: String
}

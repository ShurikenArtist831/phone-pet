import SwiftUI

@MainActor
struct PairingView: View {
    @Bindable var model: ViewerModel

    var body: some View {
        VStack(spacing: 18) {
            Image(PetState.happy.imageName)
                .resizable()
                .scaledToFit()
                .frame(height: 170)
                .accessibilityHidden(true)
            Text("和乎乎配对")
                .font(.largeTitle.bold())
                .accessibilityAddTraits(.isHeader)
            Text("请向乎乎的控制端获取邀请链接，然后粘贴链接或输入邀请码。")
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            TextField("邀请链接或邀请码", text: $model.invitation)
                .textFieldStyle(.roundedBorder)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.URL)
                .privacySensitive()
                .disabled(model.work == .pairing)
            Button {
                Task { await model.pair() }
            } label: {
                Text(model.work == .pairing ? "正在配对…" : "配对乎乎")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(!model.canPair)
            if let message = model.message {
                Text(message)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }
            if model.credentialLoadFailed {
                Button("重试读取配对信息") { model.loadCredential() }
                    .disabled(model.work != nil)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 20)
    }
}

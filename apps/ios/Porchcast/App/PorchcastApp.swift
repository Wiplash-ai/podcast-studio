import SwiftUI

@main
@MainActor
struct PorchcastApp: App {
    @State private var model = AppModel(environment: .selected())

    var body: some Scene {
        WindowGroup {
            RootView(model: model)
                .task {
                    await model.launch()
                }
        }
    }
}

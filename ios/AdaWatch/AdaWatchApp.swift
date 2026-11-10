import SwiftUI

@main
struct AdaWatchApp: App {
  @StateObject private var store = WatchCompanionStore()

  var body: some Scene {
    WindowGroup {
      WatchRootView()
        .environmentObject(store)
    }
  }
}

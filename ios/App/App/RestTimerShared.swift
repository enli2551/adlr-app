// Shared between the App target and the RestTimerWidget extension (member of BOTH):
// the Live Activity data model and the lock-screen button intents.
import Foundation
import ActivityKit
import AppIntents

/// Live rest countdown (iOS counterpart of the Android RestChrono notification).
@available(iOS 16.1, *)
struct RestTimerAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var endTime: Date
        var title: String
        var body: String
        var doneLabel: String
    }
}

extension Notification.Name {
    /// Posted in the app process when a Live Activity button is tapped.
    static let adlrRestTimerAction = Notification.Name("ADLRRestTimerAction")
}

/// "✓ Done" / "+30s" buttons on the Live Activity (iOS 17+ interactive widgets).
/// LiveActivityIntent runs in the APP process, so we just forward the action to the
/// RestChrono plugin, which relays it to JS (same `restAction` event as Android).
@available(iOS 17.0, *)
struct RestTimerActionIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Rest timer action"
    static var isDiscoverable: Bool = false

    @Parameter(title: "Action")
    var action: String

    init() { action = "done" }
    init(action: String) { self.action = action }

    func perform() async throws -> some IntentResult {
        await MainActor.run {
            NotificationCenter.default.post(name: .adlrRestTimerAction, object: nil, userInfo: ["action": action])
        }
        return .result()
    }
}

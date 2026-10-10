// Shared between the App target and the RestTimerWidget extension (member of BOTH):
// the Live Activity data model, the lock-screen workout flow and the button intents.
import Foundation
import ActivityKit
import AppIntents
import UserNotifications

/// Lock-screen workout flow (iOS counterpart of the Android RestFlow notification):
/// rest countdown → "Jetzt dran: next set" with ✓ → next rest …
@available(iOS 16.1, *)
struct RestTimerAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// "rest" | "set" | "done". A rest whose end has passed is shown as "set"
        /// (the view checks `isStale`/the time — the app may be asleep at that moment).
        var phase: String
        var endTime: Date
        var restTitle: String
        /// "Als Nächstes: Bankdrücken · Satz 2/4 · 80 kg × 8"
        var upNext: String
        /// "Jetzt dran: Bankdrücken"
        var nowTitle: String
        /// "Satz 2/4 · 80 kg × 8"
        var nowBody: String
        var doneLabel: String
    }
}

extension Notification.Name {
    /// Posted in the app process after a Live Activity button was handled.
    static let adlrRestTimerAction = Notification.Name("ADLRRestTimerAction")
}

/// One set in the queue handed over by the web app (see src/lib/restChrono.ts).
struct RestStep: Codable {
    var key: String
    var title: String
    var body: String
    /// rest in seconds after this set (0 = none)
    var rest: Double
}

struct RestFlowState: Codable {
    var phase: String
    /// epoch milliseconds
    var endTime: Double
    var steps: [RestStep]
    var labels: [String: String]
}

struct RestFlowEvent: Codable {
    var type: String
    var key: String?
    var at: Double
}

/// The flow runs natively so it keeps going while the WebView sleeps: state in UserDefaults,
/// taps recorded as events the web app collects with `drain()`.
enum RestFlow {
    private static let stateKey = "adlr_rest_flow_state"
    private static let eventsKey = "adlr_rest_flow_events"
    static let alertId = "adlr-rest-end"
    /// App visible → the web app beeps itself, no notification. False after a background launch.
    static var foreground = false

    static func load() -> RestFlowState? {
        guard let data = UserDefaults.standard.data(forKey: stateKey) else { return nil }
        return try? JSONDecoder().decode(RestFlowState.self, from: data)
    }

    static func save(_ state: RestFlowState?) {
        if let state = state, let data = try? JSONEncoder().encode(state) {
            UserDefaults.standard.set(data, forKey: stateKey)
        } else {
            UserDefaults.standard.removeObject(forKey: stateKey)
        }
    }

    private static func events() -> [RestFlowEvent] {
        guard let data = UserDefaults.standard.data(forKey: eventsKey) else { return [] }
        return (try? JSONDecoder().decode([RestFlowEvent].self, from: data)) ?? []
    }

    private static func addEvent(_ event: RestFlowEvent) {
        var all = events()
        all.append(event)
        if let data = try? JSONEncoder().encode(all) { UserDefaults.standard.set(data, forKey: eventsKey) }
    }

    /// Returns and clears the taps recorded since the last call.
    static func takeEvents() -> [RestFlowEvent] {
        let all = events()
        UserDefaults.standard.removeObject(forKey: eventsKey)
        return all
    }

    static func label(_ s: RestFlowState, _ key: String, _ fallback: String) -> String {
        let v = s.labels[key] ?? ""
        return v.isEmpty ? fallback : v
    }

    @available(iOS 16.1, *)
    static func content(_ s: RestFlowState) -> RestTimerAttributes.ContentState {
        let step = s.steps.first
        return RestTimerAttributes.ContentState(
            phase: step == nil ? "done" : s.phase,
            endTime: Date(timeIntervalSince1970: s.endTime / 1000),
            restTitle: label(s, "rest", "Pause"),
            upNext: step.map { "\(label(s, "next", "Als Nächstes")): \($0.title) · \($0.body)" } ?? "",
            nowTitle: step.map { "\(label(s, "now", "Jetzt dran")): \($0.title)" } ?? label(s, "finished", "Alle Sätze erledigt"),
            nowBody: step?.body ?? label(s, "finishedBody", ""),
            doneLabel: label(s, "done", "✓")
        )
    }

    /// Shows the state on the Live Activity (a new one can only be started while the app is in
    /// the foreground) and (re)schedules the end-of-rest alert.
    @available(iOS 16.2, *)
    static func apply(_ s: RestFlowState, allowCreate: Bool) async {
        let state = content(s)
        // When the rest ends the system marks the content stale and re-renders → next set + ✓.
        let ac = ActivityContent(state: state, staleDate: state.phase == "rest" ? state.endTime : nil)
        if let current = Activity<RestTimerAttributes>.activities.first {
            await current.update(ac)
        } else if allowCreate && ActivityAuthorizationInfo().areActivitiesEnabled {
            _ = try? Activity.request(attributes: RestTimerAttributes(), content: ac, pushType: nil)
        }
        scheduleAlert(s)
    }

    @available(iOS 16.2, *)
    static func end() async {
        save(nil)
        scheduleAlert(nil)
        for activity in Activity<RestTimerAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }

    /// Sound + vibration when a rest is over and the app isn't open (follows the silent switch).
    static func scheduleAlert(_ s: RestFlowState?) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [alertId])
        center.removeDeliveredNotifications(withIdentifiers: [alertId])
        guard let s = s, !foreground, s.phase == "rest", let step = s.steps.first else { return }
        let interval = s.endTime / 1000 - Date().timeIntervalSince1970
        guard interval > 0.5 else { return }
        let content = UNMutableNotificationContent()
        content.title = label(s, "alert", "Pause vorbei!")
        content.body = "\(step.title) · \(step.body)"
        content.sound = .default
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false)
        center.add(UNNotificationRequest(identifier: alertId, content: content, trigger: trigger))
    }

    /// A Live Activity button: "done" ticks the current set and starts the next rest,
    /// "add15"/"sub15" change the running rest.
    @available(iOS 16.2, *)
    static func handle(action: String) async {
        guard var s = load() else { return }
        let now = Date().timeIntervalSince1970 * 1000
        switch action {
        case "done":
            guard !s.steps.isEmpty else { return }
            let cur = s.steps.removeFirst()
            if s.steps.isEmpty {
                s.phase = "done"
            } else if cur.rest > 0 {
                s.phase = "rest"
                s.endTime = now + cur.rest * 1000
            } else {
                s.phase = "set"
            }
            addEvent(RestFlowEvent(type: "done", key: cur.key, at: now))
        case "add15", "sub15":
            guard s.phase == "rest" else { return }
            s.endTime += action == "add15" ? 15000 : -15000
            if s.endTime <= now + 1000 { s.phase = s.steps.isEmpty ? "done" : "set" }
            addEvent(RestFlowEvent(type: "adjust", key: nil, at: now))
        default:
            return
        }
        save(s)
        await apply(s, allowCreate: false)
    }
}

/// ✓ / −15s / +15s buttons on the Live Activity (iOS 17+ interactive widgets).
/// LiveActivityIntent runs in the APP process (launched in the background if needed), so the
/// flow advances even while the web app sleeps; the plugin then tells JS to collect the taps.
@available(iOS 17.0, *)
struct RestTimerActionIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Rest timer action"
    static var isDiscoverable: Bool = false

    @Parameter(title: "Action")
    var action: String

    init() { action = "done" }
    init(action: String) { self.action = action }

    func perform() async throws -> some IntentResult {
        await RestFlow.handle(action: action)
        await MainActor.run {
            NotificationCenter.default.post(name: .adlrRestTimerAction, object: nil, userInfo: ["action": action])
        }
        return .result()
    }
}

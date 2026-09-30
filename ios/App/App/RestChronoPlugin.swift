// iOS implementation of the "RestChrono" Capacitor plugin (see src/lib/restChrono.ts):
// a Live Activity with a native countdown on the lock screen / Dynamic Island.
// Same JS API as the Android plugin: start({ endTime, title, body, doneLabel }),
// stop(), and the `restAction` event ({ action: 'done' | 'add_30s' }).
import Foundation
import Capacitor
import ActivityKit

@objc(RestChronoPlugin)
public class RestChronoPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RestChronoPlugin"
    public let jsName = "RestChrono"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    private var observer: NSObjectProtocol?

    override public func load() {
        observer = NotificationCenter.default.addObserver(forName: .adlrRestTimerAction, object: nil, queue: .main) { [weak self] note in
            let action = (note.userInfo?["action"] as? String) ?? "done"
            self?.notifyListeners("restAction", data: ["action": action])
        }
    }

    deinit {
        if let observer = observer { NotificationCenter.default.removeObserver(observer) }
    }

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(); return }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { call.resolve(); return }
        let endMs = call.getDouble("endTime") ?? Date().timeIntervalSince1970 * 1000
        let state = RestTimerAttributes.ContentState(
            endTime: Date(timeIntervalSince1970: endMs / 1000),
            title: call.getString("title") ?? "Pause",
            body: call.getString("body") ?? "",
            doneLabel: call.getString("doneLabel") ?? "✓"
        )
        let content = ActivityContent(state: state, staleDate: state.endTime.addingTimeInterval(120))
        Task {
            if let current = Activity<RestTimerAttributes>.activities.first {
                await current.update(content)
            } else {
                _ = try? Activity.request(attributes: RestTimerAttributes(), content: content, pushType: nil)
            }
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(); return }
        Task {
            for activity in Activity<RestTimerAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            call.resolve()
        }
    }
}

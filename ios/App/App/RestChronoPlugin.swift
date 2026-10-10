// iOS implementation of the "RestChrono" Capacitor plugin (see src/lib/restChrono.ts):
// the lock-screen workout flow as a Live Activity (logic in RestTimerShared.swift → RestFlow).
// Same JS API as the Android plugin: start({ endTime, steps, labels }), stop(), drain(),
// setForeground({ value }) and the `restAction` event.
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
        CAPPluginMethod(name: "drain", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setForeground", returnType: CAPPluginReturnPromise),
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

    private func number(_ value: JSValue?) -> Double {
        if let d = value as? Double { return d }
        if let i = value as? Int { return Double(i) }
        if let n = value as? NSNumber { return n.doubleValue }
        return 0
    }

    @objc func start(_ call: CAPPluginCall) {
        let now = Date().timeIntervalSince1970 * 1000
        let endTime = call.getDouble("endTime") ?? now
        let rawSteps = call.getArray("steps") ?? []
        let steps: [RestStep] = rawSteps.compactMap { item in
            guard let o = item as? JSObject else { return nil }
            return RestStep(
                key: (o["key"] as? String) ?? "",
                title: (o["title"] as? String) ?? "",
                body: (o["body"] as? String) ?? "",
                rest: number(o["rest"])
            )
        }
        var labels: [String: String] = [:]
        for (k, v) in call.getObject("labels") ?? [:] {
            if let s = v as? String { labels[k] = s }
        }
        let phase = steps.isEmpty ? "done" : (endTime > now + 300 ? "rest" : "set")
        let state = RestFlowState(phase: phase, endTime: endTime, steps: steps, labels: labels)
        RestFlow.save(state)
        guard #available(iOS 16.2, *) else {
            RestFlow.scheduleAlert(state)
            call.resolve()
            return
        }
        Task {
            await RestFlow.apply(state, allowCreate: true)
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            RestFlow.save(nil)
            RestFlow.scheduleAlert(nil)
            call.resolve()
            return
        }
        Task {
            await RestFlow.end()
            call.resolve()
        }
    }

    @objc func drain(_ call: CAPPluginCall) {
        var events = JSArray()
        for e in RestFlow.takeEvents() {
            var o: JSObject = ["type": e.type, "at": e.at]
            if let key = e.key { o["key"] = key }
            events.append(o)
        }
        let state = RestFlow.load()
        call.resolve([
            "events": events,
            "phase": state?.phase ?? "none",
            "endTime": state?.endTime ?? 0,
        ])
    }

    @objc func setForeground(_ call: CAPPluginCall) {
        RestFlow.foreground = call.getBool("value") ?? false
        RestFlow.scheduleAlert(RestFlow.load())
        call.resolve()
    }
}

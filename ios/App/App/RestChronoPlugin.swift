// iOS implementation of the "RestChrono" Capacitor plugin (see src/lib/restChrono.ts):
// the lock-screen workout flow as a Live Activity (logic in RestTimerShared.swift → RestFlow).
// Same JS API as the Android plugin: start({ endTime, steps, labels }), stop(), drain(),
// setForeground({ value }) and the `restAction` event.
import Foundation
import Capacitor
import ActivityKit
import AVFoundation

@objc(RestChronoPlugin)
public class RestChronoPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RestChronoPlugin"
    public let jsName = "RestChrono"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "drain", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setForeground", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "beep", returnType: CAPPluginReturnPromise),
    ]

    private var observer: NSObjectProtocol?
    private var player: AVAudioPlayer?

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

    // End-of-rest beep while the app is open. Category .playback plays even with the silent
    // switch on; .mixWithOthers keeps the user's music playing at full volume (no ducking,
    // no interruption). The category stays like this — WebKit's own sounds mix the same way.
    @objc func beep(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let session = AVAudioSession.sharedInstance()
            do {
                try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
                try session.setActive(true)
                let p = try AVAudioPlayer(data: RestChronoPlugin.beepWav)
                p.volume = 1.0
                p.play()
                self.player = p
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                    self.player = nil
                    try? session.setActive(false, options: .notifyOthersOnDeactivation)
                }
                call.resolve()
            } catch {
                call.reject("audio unavailable")
            }
        }
    }

    /// Three short beeps (880, 880, 1175 Hz) as a 16-bit mono WAV, generated once.
    static let beepWav: Data = {
        let rate = 44100.0
        let tones: [(start: Double, freq: Double, dur: Double)] = [(0, 880, 0.16), (0.24, 880, 0.16), (0.48, 1175, 0.32)]
        let total = Int(rate * 0.85)
        var samples = [Int16](repeating: 0, count: total)
        for tone in tones {
            let s0 = Int(tone.start * rate)
            let n = Int(tone.dur * rate)
            for i in 0..<n where s0 + i < total {
                let t = Double(i) / rate
                let env = min(1.0, t / 0.01) * min(1.0, max(0, tone.dur - t) / 0.03)
                let v = sin(2 * Double.pi * tone.freq * t) * 0.7 * env
                samples[s0 + i] = Int16(max(-1.0, min(1.0, v)) * 32767)
            }
        }
        var d = Data()
        func u32(_ v: UInt32) { withUnsafeBytes(of: v.littleEndian) { d.append(contentsOf: $0) } }
        func u16(_ v: UInt16) { withUnsafeBytes(of: v.littleEndian) { d.append(contentsOf: $0) } }
        let dataBytes = UInt32(total * 2)
        d.append(contentsOf: Array("RIFF".utf8)); u32(36 + dataBytes)
        d.append(contentsOf: Array("WAVE".utf8))
        d.append(contentsOf: Array("fmt ".utf8)); u32(16); u16(1); u16(1); u32(44100); u32(44100 * 2); u16(2); u16(16)
        d.append(contentsOf: Array("data".utf8)); u32(dataBytes)
        for s in samples { withUnsafeBytes(of: s.littleEndian) { d.append(contentsOf: $0) } }
        return d
    }()

    @objc func setForeground(_ call: CAPPluginCall) {
        RestFlow.foreground = call.getBool("value") ?? false
        RestFlow.scheduleAlert(RestFlow.load())
        call.resolve()
    }
}

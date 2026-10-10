// ADLR lock-screen workout flow — Live Activity UI (lock screen + Dynamic Island).
// Rest: system-rendered countdown (Text(timerInterval:), ticks without the app) + −15s/+15s.
// When the rest is over the content goes stale and the view switches to the next set with ✓.
// Buttons need iOS 17 (interactive Live Activities).
import WidgetKit
import SwiftUI
import ActivityKit
import AppIntents

private let gold = Color(red: 0.788, green: 0.659, blue: 0.298) // #C9A84C

@main
struct RestTimerWidgetBundle: WidgetBundle {
    var body: some Widget {
        RestTimerLiveActivity()
    }
}

private func countdown(_ state: RestTimerAttributes.ContentState) -> Text {
    let now = Date()
    let end = max(state.endTime, now)
    return Text(timerInterval: now...end, countsDown: true)
}

/// "rest" | "set" | "done" as it should be shown right now.
private func shownPhase(_ context: ActivityViewContext<RestTimerAttributes>) -> String {
    let s = context.state
    if s.phase == "rest" && (context.isStale || s.endTime <= Date()) { return "set" }
    return s.phase
}

struct RestTimerButtons: View {
    let state: RestTimerAttributes.ContentState
    let phase: String

    var body: some View {
        if #available(iOS 17.0, *) {
            if phase == "rest" {
                HStack(spacing: 8) {
                    Button(intent: RestTimerActionIntent(action: "sub15")) {
                        Text("−15s").font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity)
                    }
                    .tint(.gray)
                    Button(intent: RestTimerActionIntent(action: "add15")) {
                        Text("+15s").font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity)
                    }
                    .tint(.gray)
                }
                .buttonStyle(.borderedProminent)
            } else if phase == "set" {
                Button(intent: RestTimerActionIntent(action: "done")) {
                    Text(state.doneLabel).font(.headline.weight(.semibold)).frame(maxWidth: .infinity)
                }
                .tint(gold)
                .buttonStyle(.borderedProminent)
            }
        }
    }
}

struct RestTimerLockScreenView: View {
    let context: ActivityViewContext<RestTimerAttributes>

    var body: some View {
        let state = context.state
        let phase = shownPhase(context)
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 12) {
                Image(systemName: phase == "rest" ? "timer" : phase == "set" ? "figure.strengthtraining.traditional" : "checkmark.circle.fill")
                    .font(.title2)
                    .foregroundColor(gold)
                VStack(alignment: .leading, spacing: 2) {
                    Text(phase == "rest" ? state.restTitle : state.nowTitle)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                    let sub = phase == "rest" ? state.upNext : state.nowBody
                    if !sub.isEmpty {
                        Text(sub).font(.caption).foregroundColor(.white.opacity(0.7)).lineLimit(2)
                    }
                }
                Spacer(minLength: 8)
                if phase == "rest" {
                    countdown(state)
                        .font(.system(size: 34, weight: .bold, design: .rounded).monospacedDigit())
                        .foregroundColor(gold)
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 110)
                }
            }
            RestTimerButtons(state: state, phase: phase)
        }
        .padding(16)
    }
}

struct RestTimerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestTimerAttributes.self) { context in
            RestTimerLockScreenView(context: context)
                .activityBackgroundTint(Color.black.opacity(0.85))
                .activitySystemActionForegroundColor(gold)
        } dynamicIsland: { context in
            let phase = shownPhase(context)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: phase == "rest" ? "timer" : "figure.strengthtraining.traditional").font(.title2).foregroundColor(gold)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if phase == "rest" {
                        countdown(context.state)
                            .font(.title2.weight(.bold).monospacedDigit())
                            .foregroundColor(gold)
                            .multilineTextAlignment(.trailing)
                            .frame(maxWidth: 90)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(phase == "rest" ? context.state.restTitle : context.state.nowTitle).font(.subheadline.weight(.semibold)).lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 8) {
                        let sub = phase == "rest" ? context.state.upNext : context.state.nowBody
                        if !sub.isEmpty {
                            Text(sub).font(.caption).foregroundColor(.secondary).lineLimit(1)
                        }
                        RestTimerButtons(state: context.state, phase: phase)
                    }
                }
            } compactLeading: {
                Image(systemName: phase == "rest" ? "timer" : "figure.strengthtraining.traditional").foregroundColor(gold)
            } compactTrailing: {
                if phase == "rest" {
                    countdown(context.state)
                        .monospacedDigit()
                        .foregroundColor(gold)
                        .frame(maxWidth: 48)
                } else {
                    Image(systemName: phase == "done" ? "checkmark.circle.fill" : "checkmark.circle").foregroundColor(gold)
                }
            } minimal: {
                Image(systemName: phase == "rest" ? "timer" : "checkmark.circle").foregroundColor(gold)
            }
            .keylineTint(gold)
        }
    }
}

// ADLR rest timer — Live Activity UI (lock screen + Dynamic Island).
// The countdown is rendered by the system (Text(timerInterval:)), so it ticks
// without the app running. Buttons need iOS 17 (interactive Live Activities).
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

struct RestTimerButtons: View {
    let state: RestTimerAttributes.ContentState

    var body: some View {
        if #available(iOS 17.0, *) {
            HStack(spacing: 8) {
                Button(intent: RestTimerActionIntent(action: "done")) {
                    Text(state.doneLabel).font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity)
                }
                .tint(gold)
                Button(intent: RestTimerActionIntent(action: "add_30s")) {
                    Text("+30s").font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity)
                }
                .tint(.gray)
            }
            .buttonStyle(.borderedProminent)
        }
    }
}

struct RestTimerLockScreenView: View {
    let state: RestTimerAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 12) {
                Image(systemName: "timer").font(.title2).foregroundColor(gold)
                VStack(alignment: .leading, spacing: 2) {
                    Text(state.title).font(.subheadline.weight(.semibold)).foregroundColor(.white)
                    if !state.body.isEmpty {
                        Text(state.body).font(.caption).foregroundColor(.white.opacity(0.7)).lineLimit(2)
                    }
                }
                Spacer(minLength: 8)
                countdown(state)
                    .font(.system(size: 34, weight: .bold, design: .rounded).monospacedDigit())
                    .foregroundColor(gold)
                    .multilineTextAlignment(.trailing)
                    .frame(maxWidth: 110)
            }
            RestTimerButtons(state: state)
        }
        .padding(16)
    }
}

struct RestTimerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestTimerAttributes.self) { context in
            RestTimerLockScreenView(state: context.state)
                .activityBackgroundTint(Color.black.opacity(0.85))
                .activitySystemActionForegroundColor(gold)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "timer").font(.title2).foregroundColor(gold)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    countdown(context.state)
                        .font(.title2.weight(.bold).monospacedDigit())
                        .foregroundColor(gold)
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 90)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.title).font(.subheadline.weight(.semibold)).lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 8) {
                        if !context.state.body.isEmpty {
                            Text(context.state.body).font(.caption).foregroundColor(.secondary).lineLimit(1)
                        }
                        RestTimerButtons(state: context.state)
                    }
                }
            } compactLeading: {
                Image(systemName: "timer").foregroundColor(gold)
            } compactTrailing: {
                countdown(context.state)
                    .monospacedDigit()
                    .foregroundColor(gold)
                    .frame(maxWidth: 48)
            } minimal: {
                Image(systemName: "timer").foregroundColor(gold)
            }
            .keylineTint(gold)
        }
    }
}

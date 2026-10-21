package com.adlr.app;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.ToneGenerator;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Lock-screen workout flow (see src/lib/restChrono.ts): rest countdown → "Jetzt dran: next set"
 * with a ✓ button → next rest, and so on through the queue of sets the app handed over.
 *
 * Runs entirely natively so it keeps working while the WebView sleeps or the app process was
 * killed: the state lives in SharedPreferences, buttons and the end-of-rest alarm go to the
 * manifest-registered {@link RestFlowReceiver}. Every tap is recorded as an event that the
 * app collects with drain() when it's back.
 */
final class RestFlow {
    static final String ACTION_DONE = "com.adlr.app.REST_DONE";
    static final String ACTION_ADD15 = "com.adlr.app.REST_ADD15";
    static final String ACTION_SUB15 = "com.adlr.app.REST_SUB15";
    static final String ACTION_END = "com.adlr.app.REST_END";

    private static final String PREFS = "adlr_rest_flow";
    // Live countdown: quiet, ongoing. Alert: a fresh id (never used before) so it's created
    // with HIGH importance, sound and vibration on every device (channel settings are frozen
    // at first creation — see the old "rest-timer" mixup).
    private static final String LIVE_CHANNEL = "rest-timer-live";
    // v3: no channel sound — a notification sound ducks the user's music; the beep plays on the
    // media stream instead (see beep()). Channel settings are fixed once created, hence the new id.
    private static final String ALERT_CHANNEL = "rest-alert-v3";
    private static final int LIVE_ID = 8002;
    private static final int ALERT_ID = 8003;

    interface Listener { void onAction(String action); }

    /** Set while the Capacitor plugin is alive, to tell JS that something happened. */
    static volatile Listener listener;
    /** App visible → JS beeps itself, no native alert. False after a cold start from a receiver. */
    static volatile boolean foreground = false;

    private static final Handler handler = new Handler(Looper.getMainLooper());

    private RestFlow() {}

    // ── State ────────────────────────────────────────────────────────────────
    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static JSONObject load(Context c) {
        String raw = prefs(c).getString("state", null);
        if (raw == null) return null;
        try { return new JSONObject(raw); } catch (JSONException e) { return null; }
    }

    private static void save(Context c, JSONObject s) {
        SharedPreferences.Editor e = prefs(c).edit();
        if (s == null) e.remove("state"); else e.putString("state", s.toString());
        e.commit();
    }

    private static void addEvent(Context c, JSONObject ev) {
        try {
            JSONArray arr = new JSONArray(prefs(c).getString("events", "[]"));
            arr.put(ev);
            prefs(c).edit().putString("events", arr.toString()).commit();
        } catch (JSONException ignored) {
        }
    }

    /** Returns and clears the taps recorded since the last call. */
    static JSONArray takeEvents(Context c) {
        JSONArray arr;
        try { arr = new JSONArray(prefs(c).getString("events", "[]")); } catch (JSONException e) { arr = new JSONArray(); }
        prefs(c).edit().remove("events").commit();
        return arr;
    }

    // ── Commands ─────────────────────────────────────────────────────────────
    static void start(Context c, JSONObject s) {
        long now = System.currentTimeMillis();
        JSONArray steps = s.optJSONArray("steps");
        try {
            if (steps == null || steps.length() == 0) s.put("phase", "done");
            else s.put("phase", s.optLong("endTime", 0) > now + 300 ? "rest" : "set");
        } catch (JSONException ignored) {
        }
        save(c, s);
        cancelAlert(c);
        render(c, s);
        schedule(c, s);
    }

    static void stop(Context c) {
        save(c, null);
        cancelEnd(c);
        NotificationManagerCompat nm = NotificationManagerCompat.from(c);
        nm.cancel(LIVE_ID);
        nm.cancel(ALERT_ID);
    }

    static void handle(Context c, String action) {
        JSONObject s = load(c);
        if (s == null || action == null) return;
        long now = System.currentTimeMillis();
        String phase = s.optString("phase", "set");
        JSONArray steps = s.optJSONArray("steps");
        if (steps == null) steps = new JSONArray();
        try {
            if (ACTION_END.equals(action)) {
                if (!"rest".equals(phase)) return;
                long end = s.optLong("endTime", 0);
                if (now < end - 1000) { schedule(c, s); return; } // early wake-up (handler) — wait for the real end
                s.put("phase", steps.length() > 0 ? "set" : "done");
                save(c, s);
                render(c, s);
                if (!foreground) alert(c, s);
                return;
            }
            if (ACTION_DONE.equals(action)) {
                if (steps.length() == 0) return;
                JSONObject cur = steps.getJSONObject(0);
                steps.remove(0);
                s.put("steps", steps);
                long rest = cur.optLong("rest", 0);
                if (steps.length() == 0) {
                    s.put("phase", "done");
                } else if (rest > 0) {
                    s.put("phase", "rest");
                    s.put("endTime", now + rest * 1000);
                } else {
                    s.put("phase", "set");
                }
                JSONObject ev = new JSONObject();
                ev.put("type", "done");
                ev.put("key", cur.optString("key"));
                ev.put("at", now);
                addEvent(c, ev);
            } else if (ACTION_ADD15.equals(action) || ACTION_SUB15.equals(action)) {
                if (!"rest".equals(phase)) return;
                long end = s.optLong("endTime", now) + (ACTION_ADD15.equals(action) ? 15000 : -15000);
                if (end <= now + 1000) s.put("phase", steps.length() > 0 ? "set" : "done");
                s.put("endTime", end);
                JSONObject ev = new JSONObject();
                ev.put("type", "adjust");
                ev.put("at", now);
                addEvent(c, ev);
            } else {
                return;
            }
        } catch (JSONException e) {
            return;
        }
        save(c, s);
        cancelAlert(c);
        render(c, s);
        schedule(c, s);
        Listener l = listener;
        if (l != null) l.onAction(action);
    }

    // ── Notifications ────────────────────────────────────────────────────────
    static void ensureChannels(Context c, JSONObject labels) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (nm.getNotificationChannel(LIVE_CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(LIVE_CHANNEL, c.getString(R.string.rest_channel_name), NotificationManager.IMPORTANCE_LOW);
            ch.setDescription(c.getString(R.string.rest_channel_desc));
            ch.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(ch);
        }
        if (nm.getNotificationChannel(ALERT_CHANNEL) == null) {
            String name = labels != null ? labels.optString("channel", "") : "";
            if (name.isEmpty()) name = c.getString(R.string.rest_alert_channel_name);
            NotificationChannel ch = new NotificationChannel(ALERT_CHANNEL, name, NotificationManager.IMPORTANCE_HIGH);
            ch.enableVibration(true);
            ch.setVibrationPattern(new long[]{0, 450, 200, 450, 200, 700});
            ch.setSound(null, null);
            ch.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(ch);
            nm.deleteNotificationChannel("rest-alert-v2");
        }
    }

    private static String label(JSONObject s, String key, String fallback) {
        JSONObject l = s.optJSONObject("labels");
        String v = l != null ? l.optString(key, "") : "";
        return v.isEmpty() ? fallback : v;
    }

    private static void render(Context c, JSONObject s) {
        ensureChannels(c, s.optJSONObject("labels"));
        String phase = s.optString("phase", "set");
        JSONArray steps = s.optJSONArray("steps");
        JSONObject step = steps != null && steps.length() > 0 ? steps.optJSONObject(0) : null;

        NotificationCompat.Builder b = new NotificationCompat.Builder(c, LIVE_CHANNEL)
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setCategory(NotificationCompat.CATEGORY_PROGRESS)
                // An abandoned session (app never reopened) must not stay on the lock screen forever.
                .setTimeoutAfter(6 * 60 * 60 * 1000);
        PendingIntent open = openApp(c);
        if (open != null) b.setContentIntent(open);

        if ("rest".equals(phase) && step != null) {
            String text = label(s, "next", "Als Nächstes") + ": " + step.optString("title") + " · " + step.optString("body");
            b.setContentTitle(label(s, "rest", "Pause"))
                    .setContentText(text)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                    .setOngoing(true)
                    .setShowWhen(true)
                    .setUsesChronometer(true)
                    .setWhen(s.optLong("endTime", System.currentTimeMillis()))
                    .addAction(0, "−15s", action(c, ACTION_SUB15, 11))
                    .addAction(0, "+15s", action(c, ACTION_ADD15, 12));
            if (Build.VERSION.SDK_INT >= 24) b.setChronometerCountDown(true);
        } else if (step != null) {
            b.setContentTitle(label(s, "now", "Jetzt dran") + ": " + step.optString("title"))
                    .setContentText(step.optString("body"))
                    .setOngoing(true)
                    .setShowWhen(false)
                    .addAction(0, label(s, "done", "✓ Erledigt"), action(c, ACTION_DONE, 10));
        } else {
            b.setContentTitle(label(s, "finished", "Alle Sätze erledigt"))
                    .setContentText(label(s, "finishedBody", ""))
                    .setOngoing(false)
                    .setAutoCancel(true)
                    .setShowWhen(false)
                    .setTimeoutAfter(30 * 60 * 1000);
        }
        try {
            NotificationManagerCompat.from(c).notify(LIVE_ID, b.build());
        } catch (SecurityException ignored) {
            // POST_NOTIFICATIONS not granted
        }
    }

    /**
     * End-of-rest chime on the MEDIA stream: plays with the phone on silent/vibrate (only the
     * media volume counts), goes to the headphones when music is playing there, and takes no
     * audio focus — the music keeps playing at full volume, the chime is mixed in.
     * Sound: public/sounds/rest-chime.wav (web assets); a tone if it can't be played.
     */
    static void beep(Context c) {
        try {
            AssetFileDescriptor fd = c.getAssets().openFd("public/sounds/rest-chime.wav");
            MediaPlayer mp = new MediaPlayer();
            mp.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            mp.setDataSource(fd.getFileDescriptor(), fd.getStartOffset(), fd.getLength());
            fd.close();
            mp.setOnCompletionListener(MediaPlayer::release);
            mp.prepare();
            mp.start();
            return;
        } catch (Exception ignored) {
            // asset missing / compressed / no audio — fall back to the tone
        }
        try {
            final ToneGenerator tg = new ToneGenerator(AudioManager.STREAM_MUSIC, 90);
            tg.startTone(ToneGenerator.TONE_PROP_BEEP2, 700);
            new Handler(Looper.getMainLooper()).postDelayed(tg::release, 1200);
        } catch (RuntimeException ignored) {
            // no audio hardware / too many tone generators
        }
    }

    /** Heads-up with sound + vibration when a rest is over and the app isn't open. */
    private static void alert(Context c, JSONObject s) {
        // The channel is silent: the beep goes to the media stream, mixed into the music.
        beep(c);
        JSONArray steps = s.optJSONArray("steps");
        JSONObject step = steps != null && steps.length() > 0 ? steps.optJSONObject(0) : null;
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, ALERT_CHANNEL)
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle(label(s, "alert", "Pause vorbei!"))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setDefaults(NotificationCompat.DEFAULT_LIGHTS)
                .setVibrate(new long[]{0, 450, 200, 450, 200, 700})
                .setAutoCancel(true)
                .setTimeoutAfter(2 * 60 * 1000);
        if (step != null) {
            b.setContentText(step.optString("title") + " · " + step.optString("body"))
                    .addAction(0, label(s, "done", "✓ Erledigt"), action(c, ACTION_DONE, 13));
        }
        PendingIntent open = openApp(c);
        if (open != null) b.setContentIntent(open);
        try {
            NotificationManagerCompat.from(c).notify(ALERT_ID, b.build());
        } catch (SecurityException ignored) {
        }
    }

    static void cancelAlert(Context c) {
        NotificationManagerCompat.from(c).cancel(ALERT_ID);
    }

    // ── End-of-rest alarm ────────────────────────────────────────────────────
    private static void schedule(Context c, JSONObject s) {
        cancelEnd(c);
        if (!"rest".equals(s.optString("phase"))) return;
        long end = s.optLong("endTime", 0);
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am != null) {
            PendingIntent pi = action(c, ACTION_END, 20);
            try {
                if (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, end, pi);
                } else {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, end, pi);
                }
            } catch (SecurityException e) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, end, pi);
            }
        }
        // While the process is awake this is on time even if the alarm is inexact.
        final Context app = c.getApplicationContext();
        handler.postDelayed(() -> handle(app, ACTION_END), Math.max(0, end - System.currentTimeMillis()));
    }

    private static void cancelEnd(Context c) {
        handler.removeCallbacksAndMessages(null);
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(action(c, ACTION_END, 20));
    }

    // ── Intents ──────────────────────────────────────────────────────────────
    private static PendingIntent action(Context c, String action, int requestCode) {
        Intent i = new Intent(c, RestFlowReceiver.class).setAction(action);
        return PendingIntent.getBroadcast(c, requestCode, i, flags());
    }

    private static PendingIntent openApp(Context c) {
        Intent launch = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        if (launch == null) return null;
        launch.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(c, 0, launch, flags());
    }

    private static int flags() {
        int f = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) f |= PendingIntent.FLAG_IMMUTABLE;
        return f;
    }
}

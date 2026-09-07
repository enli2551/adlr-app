package com.adlr.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * RestChrono — live countdown notification for rest between sets.
 *
 * Uses Android's native chronometer (setUsesChronometer + setChronometerCountDown +
 * setWhen(endTime)) so the MM:SS ticks down on the lock screen even while the app is
 * asleep — the system updates it, no foreground service required. Action buttons
 * (✓ Erledigt / +30s) are delivered back to JS via notifyListeners("restAction", ...),
 * reusing the same best-effort delivery path the existing rest-timer already relies on.
 */
@CapacitorPlugin(name = "RestChrono")
public class RestChronoPlugin extends Plugin {
    private static final String CHANNEL_ID = "rest-timer";
    private static final int NOTIF_ID = 8002;
    static final String ACTION_DONE = "com.adlr.app.REST_DONE";
    static final String ACTION_ADD30 = "com.adlr.app.REST_ADD30";

    private BroadcastReceiver receiver;

    @Override
    public void load() {
        createChannel();
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                String a = intent.getAction();
                JSObject data = new JSObject();
                if (ACTION_DONE.equals(a)) {
                    data.put("action", "done");
                    notifyListeners("restAction", data);
                } else if (ACTION_ADD30.equals(a)) {
                    data.put("action", "add_30s");
                    notifyListeners("restAction", data);
                }
            }
        };
        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_DONE);
        filter.addAction(ACTION_ADD30);
        if (Build.VERSION.SDK_INT >= 33) {
            getContext().registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(receiver, filter);
        }
    }

    @Override
    protected void handleOnDestroy() {
        try {
            if (receiver != null) getContext().unregisterReceiver(receiver);
        } catch (Exception ignored) {
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel ch = new NotificationChannel(
                        CHANNEL_ID,
                        "Trainings-Pausen-Timer",
                        NotificationManager.IMPORTANCE_LOW);
                ch.setDescription("Live-Countdown für Pausen zwischen Sätzen");
                nm.createNotificationChannel(ch);
            }
        }
    }

    /** start({ endTime: epochMillis, title, body, ongoing }) */
    @PluginMethod
    public void start(PluginCall call) {
        Long endTime = call.getLong("endTime");
        if (endTime == null) endTime = System.currentTimeMillis();
        String title = call.getString("title", "Pause läuft");
        String body = call.getString("body", "");
        boolean ongoing = Boolean.TRUE.equals(call.getBoolean("ongoing", true));

        PendingIntent donePi = actionIntent(ACTION_DONE, 1);
        PendingIntent add30Pi = actionIntent(ACTION_ADD30, 2);

        PendingIntent contentPi = null;
        Intent launch = getContext().getPackageManager().getLaunchIntentForPackage(getContext().getPackageName());
        if (launch != null) {
            contentPi = PendingIntent.getActivity(getContext(), 0, launch, pendingFlags());
        }

        NotificationCompat.Builder b = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle(title)
                .setContentText(body)
                .setOngoing(ongoing)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setUsesChronometer(true)
                .setWhen(endTime)
                .addAction(0, "✓ Erledigt", donePi)
                .addAction(0, "+30s", add30Pi);
        if (contentPi != null) b.setContentIntent(contentPi);
        if (Build.VERSION.SDK_INT >= 24) {
            b.setChronometerCountDown(true);
        }

        try {
            NotificationManagerCompat.from(getContext()).notify(NOTIF_ID, b.build());
        } catch (SecurityException ignored) {
            // POST_NOTIFICATIONS not granted
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        NotificationManagerCompat.from(getContext()).cancel(NOTIF_ID);
        call.resolve();
    }

    private PendingIntent actionIntent(String action, int requestCode) {
        Intent i = new Intent(action).setPackage(getContext().getPackageName());
        return PendingIntent.getBroadcast(getContext(), requestCode, i, pendingFlags());
    }

    private int pendingFlags() {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        return flags;
    }
}

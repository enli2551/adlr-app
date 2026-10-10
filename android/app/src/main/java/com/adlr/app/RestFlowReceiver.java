package com.adlr.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Lock-screen buttons (✓ / ±15s) and the end-of-rest alarm — works with the app process asleep or dead. */
public class RestFlowReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        RestFlow.handle(context.getApplicationContext(), intent.getAction());
    }
}

package com.adlr.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Tells JS whether remote push can work in this build. The google-services Gradle plugin
 * (applied only when android/app/google-services.json exists) generates the google_app_id
 * string resource; without it there is no FirebaseApp and PushNotifications.register()
 * would throw natively — src/lib/push.ts only registers when this says available.
 */
@CapacitorPlugin(name = "PushSupport")
public class PushSupportPlugin extends Plugin {

    @PluginMethod
    public void isAvailable(PluginCall call) {
        int id = getContext().getResources().getIdentifier("google_app_id", "string", getContext().getPackageName());
        JSObject ret = new JSObject();
        ret.put("available", id != 0);
        call.resolve(ret);
    }
}

package com.adlr.app;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * RestChrono — JS bridge for the lock-screen workout flow (logic in {@link RestFlow}).
 *
 * start({ endTime, steps: [{ key, title, body, rest }], labels }) shows the rest countdown
 * (Android chronometer, ticks without the app running) followed by the next set with ✓.
 * Taps are stored natively; the "restAction" event only tells JS to call drain().
 */
@CapacitorPlugin(name = "RestChrono")
public class RestChronoPlugin extends Plugin {

    @Override
    public void load() {
        RestFlow.ensureChannels(getContext(), null);
        RestFlow.listener = action -> {
            JSObject data = new JSObject();
            data.put("action", action);
            notifyListeners("restAction", data);
        };
    }

    @Override
    protected void handleOnDestroy() {
        RestFlow.listener = null;
    }

    @PluginMethod
    public void start(PluginCall call) {
        try {
            JSONObject s = new JSONObject();
            Long endTime = call.getLong("endTime");
            s.put("endTime", endTime != null ? endTime : System.currentTimeMillis());
            JSArray steps = call.getArray("steps");
            s.put("steps", steps != null ? new JSONArray(steps.toString()) : new JSONArray());
            JSObject labels = call.getObject("labels");
            s.put("labels", labels != null ? new JSONObject(labels.toString()) : new JSONObject());
            RestFlow.start(getContext(), s);
            call.resolve();
        } catch (JSONException e) {
            call.reject("invalid options");
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        RestFlow.stop(getContext());
        call.resolve();
    }

    @PluginMethod
    public void drain(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            ret.put("events", new JSArray(RestFlow.takeEvents(getContext()).toString()));
        } catch (JSONException e) {
            ret.put("events", new JSArray());
        }
        JSONObject s = RestFlow.load(getContext());
        ret.put("phase", s != null ? s.optString("phase", "none") : "none");
        ret.put("endTime", s != null ? s.optLong("endTime", 0) : 0);
        call.resolve(ret);
    }

    @PluginMethod
    public void setForeground(PluginCall call) {
        boolean value = Boolean.TRUE.equals(call.getBoolean("value", false));
        RestFlow.foreground = value;
        if (value) RestFlow.cancelAlert(getContext());
        call.resolve();
    }
}

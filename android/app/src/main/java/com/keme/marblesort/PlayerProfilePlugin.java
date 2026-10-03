package com.keme.marblesort;

import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Identity preferences survive process restarts and in-place app updates. */
@CapacitorPlugin(name = "PlayerProfile")
public class PlayerProfilePlugin extends Plugin {
    private static final String STORE = "marble_player_identity";
    @PluginMethod
    public void get(PluginCall call) {
        JSObject result = new JSObject();
        result.put("value", getContext().getSharedPreferences(STORE, Context.MODE_PRIVATE)
            .getString("identity", ""));
        call.resolve(result);
    }
    @PluginMethod
    public void set(PluginCall call) {
        String value = call.getString("value");
        if (value == null || value.length() > 1024) {
            call.reject("Invalid player identity");
            return;
        }
        boolean saved = getContext().getSharedPreferences(STORE, Context.MODE_PRIVATE)
            .edit().putString("identity", value).commit();
        if (saved) call.resolve();
        else call.reject("Could not save player identity");
    }
}

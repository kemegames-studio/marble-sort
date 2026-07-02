package com.kemegames.marblesort;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

@CapacitorPlugin(name = "KemeSupport")
public class KemeSupportPlugin extends Plugin {
    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", KemeSupportBridge.hasRuntimeArtifact());
        result.put("configured", KemeSupportBridge.hasConfiguration());
        result.put("initialized", KemeSupportBridge.isInitialized());
        result.put("identifiedUserId", KemeSupportBridge.getIdentifiedUserId());
        result.put("lastError", KemeSupportBridge.getLastError());
        call.resolve(result);
    }

    @PluginMethod
    public void identifyUser(PluginCall call) {
        JSObject metadataObject = call.getObject("metadata", new JSObject());
        Map<String, String> metadata = new HashMap<>();
        Iterator<String> keys = metadataObject.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            Object value = metadataObject.opt(key);
            if (value != null) {
                metadata.put(key, String.valueOf(value));
            }
        }

        String error = KemeSupportBridge.identifyUser(
            getContext(),
            call.getString("userId", ""),
            call.getString("displayName", ""),
            call.getString("email", ""),
            metadata
        );

        if (!error.isEmpty()) {
            call.reject(error);
            return;
        }

        JSObject result = new JSObject();
        result.put("identifiedUserId", call.getString("userId", ""));
        call.resolve(result);
    }

    @PluginMethod
    public void clearUser(PluginCall call) {
        String error = KemeSupportBridge.clearUser();
        if (!error.isEmpty()) {
            call.reject(error);
            return;
        }

        call.resolve();
    }

    @PluginMethod
    public void openSupportCenter(PluginCall call) {
        String error = KemeSupportBridge.openSupportCenter(getActivity());
        if (!error.isEmpty()) {
            call.reject(error);
            return;
        }

        call.resolve();
    }
}

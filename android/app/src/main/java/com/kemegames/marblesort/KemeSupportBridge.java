package com.kemegames.marblesort;

import android.app.Activity;
import android.content.Context;
import android.text.TextUtils;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.HashMap;
import java.util.Map;

public final class KemeSupportBridge {
    private static final String SUPPORT_CLASS = "com.kemegames.support.KemeSupport";
    private static final String CONFIG_CLASS = "com.kemegames.support.KemeConfig";
    private static final String CONFIG_BUILDER_CLASS = "com.kemegames.support.KemeConfig$Builder";
    private static final String ENVIRONMENT_CLASS = "com.kemegames.support.KemeEnvironment";
    private static final String REMOTE_MESSAGE_CLASS = "com.google.firebase.messaging.RemoteMessage";

    private static boolean initialized = false;
    private static String lastError = "";
    private static String identifiedUserId = "";

    private KemeSupportBridge() {}

    public static synchronized boolean initialize(Context context) {
        if (initialized) {
            return true;
        }

        if (!hasRuntimeArtifact()) {
            lastError = "Keme Android SDK artifact not found in the APK build.";
            return false;
        }

        if (TextUtils.isEmpty(BuildConfig.KEME_SDK_KEY)) {
            lastError = "Keme SDK key is missing. Set KEME_SDK_KEY before building the APK.";
            return false;
        }

        if (TextUtils.isEmpty(BuildConfig.KEME_ORG_ID)) {
            lastError = "Keme organization ID is missing. Set KEME_ORG_ID before building the APK.";
            return false;
        }

        try {
            Class<?> supportClass = Class.forName(SUPPORT_CLASS);
            Class<?> configClass = Class.forName(CONFIG_CLASS);
            Class<?> builderClass = Class.forName(CONFIG_BUILDER_CLASS);
            Class<?> environmentClass = Class.forName(ENVIRONMENT_CLASS);

            Object builder = builderClass.getDeclaredConstructor().newInstance();
            builderClass.getMethod("sdkKey", String.class).invoke(builder, BuildConfig.KEME_SDK_KEY);
            builderClass.getMethod("organizationId", String.class).invoke(builder, BuildConfig.KEME_ORG_ID);
            builderClass
                .getMethod("environment", environmentClass)
                .invoke(builder, resolveEnvironment(environmentClass, BuildConfig.KEME_ENVIRONMENT));

            Object config = builderClass.getMethod("build").invoke(builder);
            invoke(supportClass, "init", new Class<?>[] { Context.class, configClass }, context, config);
            initialized = true;
            lastError = "";
            return true;
        } catch (Throwable error) {
            lastError = "Failed to initialize Keme Support: " + error.getMessage();
            return false;
        }
    }

    public static synchronized String openSupportCenter(Activity activity) {
        if (!initialize(activity.getApplicationContext())) {
            return lastError;
        }

        try {
            Class<?> supportClass = Class.forName(SUPPORT_CLASS);
            invoke(supportClass, "openSupportCenter", new Class<?>[] { Activity.class }, activity);
            return "";
        } catch (Throwable error) {
            lastError = "Failed to open Keme Support: " + error.getMessage();
            return lastError;
        }
    }

    public static synchronized String identifyUser(
        Context context,
        String userId,
        String displayName,
        String email,
        Map<String, String> metadata
    ) {
        if (!initialize(context)) {
            return lastError;
        }

        if (TextUtils.isEmpty(userId)) {
            lastError = "Keme userId is required before opening support.";
            return lastError;
        }

        try {
            Class<?> supportClass = Class.forName(SUPPORT_CLASS);
            Map<String, String> normalizedMetadata = new HashMap<>();
            if (metadata != null) {
                normalizedMetadata.putAll(metadata);
            }
            normalizedMetadata.putIfAbsent("platform", "android");
            normalizedMetadata.putIfAbsent("gameVersion", BuildConfig.VERSION_NAME);

            invokeIdentifyUser(
                supportClass,
                userId,
                emptyToNull(displayName),
                emptyToNull(email),
                normalizedMetadata
            );

            identifiedUserId = userId;
            lastError = "";
            return "";
        } catch (Throwable error) {
            lastError = "Failed to identify Keme user: " + error.getMessage();
            return lastError;
        }
    }

    public static synchronized String clearUser() {
        if (!hasRuntimeArtifact()) {
            return "";
        }

        try {
            Class<?> supportClass = Class.forName(SUPPORT_CLASS);
            invoke(supportClass, "clearUser", new Class<?>[0]);
            identifiedUserId = "";
            lastError = "";
            return "";
        } catch (Throwable error) {
            lastError = "Failed to clear Keme user: " + error.getMessage();
            return lastError;
        }
    }

    public static synchronized boolean isKemeNotification(Object remoteMessage) {
        if (!hasRuntimeArtifact() || remoteMessage == null) {
            return false;
        }

        try {
            Class<?> supportClass = Class.forName(SUPPORT_CLASS);
            Class<?> remoteMessageClass = Class.forName(REMOTE_MESSAGE_CLASS);
            Object result = invoke(
                supportClass,
                "isKemeNotification",
                new Class<?>[] { remoteMessageClass },
                remoteMessage
            );
            return Boolean.TRUE.equals(result);
        } catch (Throwable ignored) {
            return false;
        }
    }

    public static synchronized boolean handleNotification(Context context, Object remoteMessage) {
        if (!initialize(context) || remoteMessage == null) {
            return false;
        }

        try {
            Class<?> supportClass = Class.forName(SUPPORT_CLASS);
            Class<?> remoteMessageClass = Class.forName(REMOTE_MESSAGE_CLASS);
            invoke(
                supportClass,
                "handleNotification",
                new Class<?>[] { Context.class, remoteMessageClass },
                context,
                remoteMessage
            );
            lastError = "";
            return true;
        } catch (Throwable error) {
            lastError = "Failed to handle Keme notification: " + error.getMessage();
            return false;
        }
    }

    public static synchronized boolean updatePushToken(String token) {
        if (!hasRuntimeArtifact() || TextUtils.isEmpty(token)) {
            return false;
        }

        try {
            Class<?> supportClass = Class.forName(SUPPORT_CLASS);
            invoke(supportClass, "updatePushToken", new Class<?>[] { String.class }, token);
            lastError = "";
            return true;
        } catch (Throwable error) {
            lastError = "Failed to update Keme push token: " + error.getMessage();
            return false;
        }
    }

    public static String getLastError() {
        return lastError;
    }

    public static boolean hasConfiguration() {
        return !TextUtils.isEmpty(BuildConfig.KEME_SDK_KEY) && !TextUtils.isEmpty(BuildConfig.KEME_ORG_ID);
    }

    public static boolean hasRuntimeArtifact() {
        try {
            Class.forName(SUPPORT_CLASS);
            return true;
        } catch (Throwable ignored) {
            return false;
        }
    }

    public static boolean isInitialized() {
        return initialized;
    }

    public static String getIdentifiedUserId() {
        return identifiedUserId;
    }

    private static Object resolveEnvironment(Class<?> environmentClass, String environmentName) throws Exception {
        String normalized = "sandbox".equalsIgnoreCase(environmentName) ? "SANDBOX" : "PRODUCTION";
        Field field = environmentClass.getField(normalized);
        return field.get(null);
    }

    private static void invokeIdentifyUser(
        Class<?> supportClass,
        String userId,
        String displayName,
        String email,
        Map<String, String> metadata
    ) throws Exception {
        try {
            invoke(
                supportClass,
                "identifyUser",
                new Class<?>[] { String.class, String.class, String.class, Map.class },
                userId,
                displayName,
                email,
                metadata
            );
            return;
        } catch (NoSuchMethodException ignored) {
        }

        try {
            invoke(
                supportClass,
                "identifyUser",
                new Class<?>[] { String.class, String.class, Map.class },
                userId,
                displayName,
                metadata
            );
            return;
        } catch (NoSuchMethodException ignored) {
        }

        invoke(
            supportClass,
            "identifyUser",
            new Class<?>[] { String.class, Map.class },
            userId,
            metadata
        );
    }

    private static Object invoke(Class<?> type, String methodName, Class<?>[] parameterTypes, Object... args) throws Exception {
        Method method = type.getMethod(methodName, parameterTypes);
        if (Modifier.isStatic(method.getModifiers())) {
            return method.invoke(null, args);
        }

        Object target = resolveSingleton(type);
        if (target == null) {
            throw new IllegalStateException("Unable to resolve Keme singleton target for " + methodName);
        }

        return method.invoke(target, args);
    }

    private static Object resolveSingleton(Class<?> type) {
        try {
            Field instanceField = type.getField("INSTANCE");
            return instanceField.get(null);
        } catch (Throwable ignored) {
            return null;
        }
    }

    private static String emptyToNull(String value) {
        return TextUtils.isEmpty(value) ? null : value;
    }
}

package com.kemegames.marblesort;

import android.app.Application;

public class MainApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        KemeSupportBridge.initialize(this);
    }
}

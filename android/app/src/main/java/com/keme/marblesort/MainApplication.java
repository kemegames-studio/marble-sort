package com.keme.marblesort;

import android.app.Application;

import com.google.android.gms.ads.MobileAds;

public class MainApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        MobileAds.initialize(this);
        KemeSupportBridge.initialize(this);
    }
}

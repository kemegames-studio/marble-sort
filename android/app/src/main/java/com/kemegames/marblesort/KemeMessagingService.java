package com.kemegames.marblesort;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class KemeMessagingService extends FirebaseMessagingService {
    @Override
    public void onMessageReceived(RemoteMessage message) {
        if (KemeSupportBridge.isKemeNotification(message)) {
            KemeSupportBridge.handleNotification(this, message);
            return;
        }

        super.onMessageReceived(message);
    }

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        KemeSupportBridge.updatePushToken(token);
    }
}

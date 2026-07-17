package com.keme.marblesort;

import android.app.Activity;

import androidx.annotation.NonNull;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;

@CapacitorPlugin(name = "MarbleAds")
public class MarbleAdsPlugin extends Plugin {
    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", true);
        result.put("appId", getContext().getString(R.string.admob_app_id));
        result.put("rewardedCoinsAdUnitId", getContext().getString(R.string.admob_rewarded_coins_ad_unit_id));
        result.put("rewardedLivesAdUnitId", getContext().getString(R.string.admob_rewarded_lives_ad_unit_id));
        result.put("rewardedExtraTubeAdUnitId", getContext().getString(R.string.admob_rewarded_extra_tube_ad_unit_id));
        result.put("rewardedUndoAdUnitId", getContext().getString(R.string.admob_rewarded_undo_ad_unit_id));
        result.put("rewardedShuffleAdUnitId", getContext().getString(R.string.admob_rewarded_shuffle_ad_unit_id));
        result.put("interstitialAdUnitId", getContext().getString(R.string.admob_interstitial_ad_unit_id));
        call.resolve(result);
    }

    @PluginMethod
    public void showRewardedCoins(PluginCall call) {
        showRewarded(call, getContext().getString(R.string.admob_rewarded_coins_ad_unit_id));
    }

    @PluginMethod
    public void showRewardedLives(PluginCall call) {
        showRewarded(call, getContext().getString(R.string.admob_rewarded_lives_ad_unit_id));
    }

    @PluginMethod
    public void showRewardedExtraTube(PluginCall call) {
        showRewarded(call, getContext().getString(R.string.admob_rewarded_extra_tube_ad_unit_id));
    }

    @PluginMethod
    public void showRewardedUndo(PluginCall call) {
        showRewarded(call, getContext().getString(R.string.admob_rewarded_undo_ad_unit_id));
    }

    @PluginMethod
    public void showRewardedShuffle(PluginCall call) {
        showRewarded(call, getContext().getString(R.string.admob_rewarded_shuffle_ad_unit_id));
    }

    @PluginMethod
    public void showInterstitial(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Ad activity is not available.");
            return;
        }

        activity.runOnUiThread(() -> InterstitialAd.load(
            activity,
            getContext().getString(R.string.admob_interstitial_ad_unit_id),
            new AdRequest.Builder().build(),
            new InterstitialAdLoadCallback() {
                @Override
                public void onAdLoaded(@NonNull InterstitialAd ad) {
                    ad.setFullScreenContentCallback(new FullScreenContentCallback() {
                        @Override
                        public void onAdDismissedFullScreenContent() {
                            call.resolve();
                        }

                        @Override
                        public void onAdFailedToShowFullScreenContent(@NonNull AdError adError) {
                            call.reject(adError.getMessage());
                        }
                    });
                    ad.show(activity);
                }

                @Override
                public void onAdFailedToLoad(@NonNull LoadAdError loadAdError) {
                    call.reject(loadAdError.getMessage());
                }
            }
        ));
    }

    private void showRewarded(PluginCall call, String adUnitId) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Ad activity is not available.");
            return;
        }

        activity.runOnUiThread(() -> RewardedAd.load(
            activity,
            adUnitId,
            new AdRequest.Builder().build(),
            new RewardedAdLoadCallback() {
                @Override
                public void onAdLoaded(@NonNull RewardedAd ad) {
                    final boolean[] earnedReward = { false };
                    ad.setFullScreenContentCallback(new FullScreenContentCallback() {
                        @Override
                        public void onAdDismissedFullScreenContent() {
                            if (!earnedReward[0]) {
                                call.reject("Rewarded ad was closed before reward was earned.");
                            }
                        }

                        @Override
                        public void onAdFailedToShowFullScreenContent(@NonNull AdError adError) {
                            call.reject(adError.getMessage());
                        }
                    });
                    ad.show(activity, rewardItem -> {
                        earnedReward[0] = true;
                        JSObject result = new JSObject();
                        result.put("amount", rewardItem.getAmount());
                        result.put("type", rewardItem.getType());
                        call.resolve(result);
                    });
                }

                @Override
                public void onAdFailedToLoad(@NonNull LoadAdError loadAdError) {
                    call.reject(loadAdError.getMessage());
                }
            }
        ));
    }
}

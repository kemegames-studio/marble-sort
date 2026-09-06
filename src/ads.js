// =============================================================================
//  AdMob bridge — wraps the native "MarbleAds" Capacitor plugin.
//  Exposes every AdMob ad unit the game uses:
//    • interstitial
//    • rewarded: coins, lives, extra-tube, undo, shuffle
//  Each helper resolves TRUE when a native ad was shown and (for rewarded)
//  the reward was earned, and FALSE when native ads are unavailable (web/dev)
//  or the ad failed / was dismissed early. Callers use the boolean to decide
//  whether to grant the reward, and fall back to the in-app flow off-device.
// =============================================================================

function getPlugin() {
  return globalThis.Capacitor?.Plugins?.MarbleAds ?? null;
}

/** True only on a device where the native AdMob plugin is present. */
export function hasNativeAds() {
  const plugin = getPlugin();
  return Boolean(plugin && typeof plugin.showRewardedCoins === "function");
}

async function runRewarded(method) {
  const plugin = getPlugin();
  if (!plugin || typeof plugin[method] !== "function") return false;
  try {
    await plugin[method](); // resolves only when the reward is earned
    return true;
  } catch {
    // No fill, load error, or the user closed the ad before earning it.
    return false;
  }
}

export const showRewardedCoinsAd = () => runRewarded("showRewardedCoins");
export const showRewardedLivesAd = () => runRewarded("showRewardedLives");
export const showRewardedExtraTubeAd = () => runRewarded("showRewardedExtraTube");
export const showRewardedUndoAd = () => runRewarded("showRewardedUndo");
export const showRewardedShuffleAd = () => runRewarded("showRewardedShuffle");

/** Interstitial: resolves true once shown+dismissed, false if unavailable. */
export async function showInterstitialAd() {
  const plugin = getPlugin();
  if (!plugin || typeof plugin.showInterstitial !== "function") return false;
  try {
    await plugin.showInterstitial();
    return true;
  } catch {
    return false;
  }
}

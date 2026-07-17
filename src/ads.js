function getPlugin() {
  return globalThis.Capacitor?.Plugins?.MarbleAds ?? null;
}

export function hasNativeAds() {
  const plugin = getPlugin();
  return Boolean(plugin && typeof plugin.showRewardedCoins === "function");
}

export async function showRewardedCoinsAd() {
  const plugin = getPlugin();
  if (!plugin || typeof plugin.showRewardedCoins !== "function") return false;
  await plugin.showRewardedCoins();
  return true;
}

export async function showRewardedLivesAd() {
  const plugin = getPlugin();
  if (!plugin || typeof plugin.showRewardedLives !== "function") return false;
  await plugin.showRewardedLives();
  return true;
}

export async function showInterstitialAd() {
  const plugin = getPlugin();
  if (!plugin || typeof plugin.showInterstitial !== "function") return false;
  await plugin.showInterstitial();
  return true;
}

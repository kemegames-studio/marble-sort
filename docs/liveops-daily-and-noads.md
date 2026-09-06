# LiveOps: Daily Login Rewards, Daily Missions & No-Ads Bundle

Three retention/monetization features live in `src/app.js` (state, logic, modal markup,
action handlers) and `src/styles.css` (the `.liveops-*`, `.dl-*`, `.dm-*`, `.na-*`
classes). All state persists in the existing profile object under
`localStorage["marble-sort-state-v1"]` and mirrors to Firestore via the normal `save()`.

## Profile state added

```js
dailyLogin: { streak, lastClaimDate }        // streak = days claimed in current 7-day cycle
missions:   { date, progress:{coins,levels,undo,shuffle,tube}, claimed:{}, bonusClaimed }
noAds:      { active, until }                 // until = epoch ms; null = permanent (one-time)
unlimitedLivesUntil                           // epoch ms; missions all-complete bonus
```

`loadProfile()` deep-merges these so existing saves migrate cleanly.

## 1. Daily Login Rewards  (home "Rewards" icon → `modal = "rewards"`)

7-day cycle, config in `DAILY_LOGIN_REWARDS`. Each day grants coins and (day 2+) a
booster bundle:

| Day | Coins | Booster |
|-----|-------|---------|
| 1 | 1,000 | — |
| 2 | 1,500 | Undo ×2 |
| 3 | 2,000 | Extra Tube ×1 |
| 4 | 2,500 | Shuffle ×2 |
| 5 | 3,000 | Extra Tube ×2 |
| 6 | 3,500 | Undo ×3 |
| 7 | 5,000 | Shuffle ×3 |

`dailyLoginStatus()` rules: one claim per calendar day; claiming a consecutive day
advances the streak; **missing a day resets to Day 1**; finishing Day 7 restarts the
cycle. Claim action `claim-daily` grants coins + booster, records the streak, and also
feeds the "collect coins" mission. Unlocks at level 5 (existing gate).

## 2. Daily Missions  (home "Missions" icon → `modal = "missions"`)

Config in `DAILY_MISSIONS`. Progress resets at local midnight (`ensureMissionsToday()`),
countdown shown via `missionsResetCountdown()`.

| Mission | Target | Reward |
|---------|--------|--------|
| Collect coins | 300 | 100 |
| Complete levels | 4 | 250 |
| Use Undo | 3 | 400 |
| Use Shuffle | 3 | 500 |
| Use Extra Tube | 2 | 700 |

**Progress hooks:** `spendBooster()` increments the matching booster mission on every
use (inventory or coin-bought); level-complete increments `levels` and `coins`.
Each mission has its own `claim-mission` button (enabled only when complete).
When all five are claimed, `claim-mission-bonus` grants **1,000 coins + unlimited lives
for 2 hours** (`MISSIONS_UNLIMITED_LIVES_MS`). Unlocks at level 7 (existing gate).

**Unlimited lives:** `hasUnlimitedLives()` gates the "no lives" play block and the
level-fail life loss; the HUD shows `∞`.

## 3. No-Ads Bundle  (floating home icon → `modal = "noads"`)

Uses the **exact source artwork** (hybrid approach): the floating icon is
`public/assets/no-ads-bundle.png` (cropped badge) and the popup is
`public/assets/no-ads-popup.png` rendered full-bleed with invisible `.na-hot`
tap-zones over Monthly / One-time / Close (positions are %-of-image in
`.na-hot-*`). Daily Rewards & Daily Missions stay as live DOM popups (dynamic
progress/claim state, no baked text) rather than static art.

Floating icon (`.home-noads-fab`) sits on the home screen's **left column, just under
the Daily Rewards icon**. Hidden once No-Ads is active.

Plans in `NO_ADS_PLANS`:

| Plan | Price | Duration |
|------|-------|----------|
| Monthly | SAR 15.99 | 30 days (`noAds.until = now + 30d`) |
| One-time | SAR 29.99 | Permanent (`noAds.until = null`) |

`buy-noads` activates the entitlement for the selected period. `noAdsActive()` gates the
forced interstitial in `beginLevel()` (the "Remove all ads" promise). Opt-in *rewarded*
ads (extra life, win bonus) are left available.

> **Billing note:** the purchase currently activates the entitlement locally (prototype).
> Real money requires wiring Google Play Billing / StoreKit to the `buy-noads` handler;
> the entitlement model (`profile.noAds`) is already in place for that.

## Boot flow & booster grant (fixed 2026-07-07)

- **Boot:** only the very first launch (`!profile.launched && !onboarded && unlocked<=1 && level<=1`)
  drops into Level 1 gameplay + onboarding; the boot then sets `profile.launched`.
  Every later launch (or any save with prior progress) lands on **Home** after the
  splash. Previously it keyed off `onboarded`, which is only set by a Level-1-only
  button — so any player past level 1 booted into gameplay forever.
- **Booster unlock grant:** `booster-intro-ok` now SETS the count to
  `BOOSTER_UNLOCK_GRANT` (2), not `+= 2`, so a stale/old count can't inflate it to 7.

## Known follow-up

The home feature icons (Daily Rewards / Daily Missions) show padlock badges baked into
`public/assets/home-screen-refined.png`; all unlock-state CSS classes point at that same
image, so they look locked even after unlocking (the tap still opens the popup). Replacing
the home art with an unlocked variant (no padlocks) is the fix.

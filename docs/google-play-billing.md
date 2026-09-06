# Google Play Billing

In-app purchases + subscription, implemented with the **Google Play Billing Library v7**
through a small native Capacitor plugin plus a JS `BillingService`.

## Architecture

| Layer | File | Responsibility |
|-------|------|----------------|
| Product catalog | `src/billing/products.js` | **Single source of truth** — all Product IDs, types, consumable flags, reward grants, fallback prices (req 10) |
| Native bridge | `android/app/src/main/java/com/kemegames/marblesort/BillingPlugin.java` | Talks to Play: connect, query products, launch flow, query owned purchases, acknowledge, consume. Emits `purchasesUpdated` |
| Service | `src/billing/billing-service.js` | Orchestration: load prices, purchase flow, ack/consume, restore, subscription state, logging/errors (req 11) |
| Integration | `src/app.js` | `initBilling()` on boot, localized prices in the store, `buy-product` actions, reward granting, Restore button |

The plugin is registered in `MainActivity.java` via `registerPlugin(BillingPlugin.class)`.

## App identity (must match the live Play listing)

- **`applicationId` = `com.keme.marblesort`** — the immutable Play identity of the
  existing production-approved listing. Any AAB uploaded as an update **must** use this.
- **`namespace` = `com.kemegames.marblesort`** — internal Java package for `R`/`BuildConfig`
  only; it does **not** need to equal the `applicationId` and is left unchanged.
- Because `applicationId` is `com.keme.marblesort`, `android/app/google-services.json`
  **must contain a client for `com.keme.marblesort`** or the `google-services` Gradle plugin
  fails the build. **Done:** the Firebase project `marble-sort-kemegames` now has a
  `com.keme.marblesort` Android app registered, and `android/app/google-services.json`
  contains clients for both `com.keme.marblesort` and the legacy `com.kemegames.marblesort`.
  Billing does **not** depend on Firebase — the build also succeeds with no
  `google-services.json` (the apply block is guarded), it just disables FCM push + Analytics.
- **`versionCode`** must be strictly greater than the last code uploaded to Play. Set to `27`
  (after "v26"); verify in Play Console → App bundle explorer before each upload.

## Products (Product IDs — must match Play Console exactly)

**One-time (INAPP):**
`starter_bundle`, `pro_bundle`, `legend_bundle`,
`coin_pack_1` … `coin_pack_6`, `remove_ads_lifetime`

**Subscription (SUBS):** `remove_ads_monthly`

`starter/pro/legend_bundle` and `coin_pack_*` are **consumable** (consumed after the
reward is granted, so they can be re-bought). `remove_ads_lifetime` is **non-consumable**
(acknowledged, never consumed — req 6). `remove_ads_monthly` is a subscription.

## Requirement mapping

1. **Load all products** — `getProducts()` queries INAPP + SUBS `ProductDetails`.
2. **Localized price/currency** — `formattedPrice` / `priceCurrencyCode` from Play; store cards render `priceFor(id)`. (The Play purchase sheet always shows the real localized price.)
3. **Outcomes** — `purchasesUpdated` handles OK / `USER_CANCELED` / failures; `purchaseState PENDING` surfaces a "pending approval" toast and grants nothing.
4. **Acknowledge all** — non-consumables/subs → `acknowledge()`; consumables → `consume()` (which also acknowledges).
5. **Consume consumables** — after `onGrant`, `_finishPurchase` consumes consumables.
6. **Never consume `remove_ads_lifetime`** — `consumable:false` → acknowledge only.
7. **Detect + auto-restore lifetime** — `restore()` runs on init; owned `remove_ads_lifetime` re-applies the entitlement.
8. **Restore after reinstall** — `queryPurchases()` returns durable entitlements from the Play account; also exposed via the **Restore Purchases** button in the store.
9. **Subscription active/expired** — Play only returns *active* subs from `queryPurchases`; `isSubscriptionActive()` reflects that, and `reconcileNoAds()` drops the entitlement when the sub lapses.
10. **Single config file** — `src/billing/products.js`.
11. **Clean architecture** — native bridge / service / catalog separation, structured `log()` + `emit()`, try/catch around every Play call, graceful degrade off-Play.
12. **AAB billing-compatible** — `com.android.vending.BILLING` permission in the manifest + `com.android.billingclient:billing:7.1.1` dependency. Verified present in the built merged manifest and dex (`billingclient` classes).
13. **No duplicate rewards** — `BillingService` persists granted `purchaseToken`s in
    `localStorage` (`billing.processedTokens.v1`). A token is granted **once**; a repeat
    callback, the init-restore-vs-live-event race, or an app kill between grant and consume
    all skip the grant but still finish (consume/acknowledge) the purchase so no orphaned
    entitlement is lost (req 14; tests 10, 11).

## Build

```
npm run build && npx cap sync android
cd android
./gradlew.bat :app:bundleRelease   # → app/build/outputs/bundle/release/app-release.aab
```

The repo has **no release signing config**, so `bundleRelease` emits an **unsigned** AAB.
Sign it with the existing upload keystore before uploading (the app is enrolled in Play
App Signing), e.g. via Android Studio → *Generate Signed Bundle*, or `jarsigner` +
`apksigner` with your keystore. Signing keys are intentionally kept out of the repo.

## Play Console setup still required (server-side — cannot be done from code)

Billing can only be exercised on a build **installed from Google Play** (internal testing
track or higher), not via sideloaded APK or web. Before purchases work:

1. Upload the AAB to an **Internal testing** track (this is also what makes Play Console
   flip on "this app uses Google Play Billing").
2. Create every Product ID above under **Monetize → Products** (in-app products) and
   **Subscriptions** — IDs must match `products.js` exactly.
3. Add **license testers** (Play Console → Setup → License testing) so test accounts get
   the real purchase flow without being charged.
4. Sign the AAB with your upload key / enroll in **Play App Signing**.

> Note: the reward amounts (coins, boosters, unlimited-lives hours) are granted
> **client-side** on purchase. For production-grade fraud protection, verify purchase
> tokens server-side with the Google Play Developer API before granting high-value items.

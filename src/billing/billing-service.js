// =============================================================================
//  BillingService — clean wrapper over the native "Billing" Capacitor plugin
//  (Google Play Billing Library v7).
//
//  Responsibilities:
//    • connect to Google Play and load localized product details (req 1, 2)
//    • run the purchase flow and handle every outcome:
//        purchased / cancelled / pending / failed                    (req 3)
//    • acknowledge every purchase                                     (req 4)
//    • consume consumables after the reward is granted               (req 5)
//    • never consume remove_ads_lifetime                             (req 6)
//    • detect & auto-restore remove_ads_lifetime                     (req 7)
//    • restore durable purchases after reinstall                     (req 8)
//    • check remove_ads_monthly active / expired                     (req 9)
//
//  Reward-granting itself is delegated to the host app via the `onGrant`
//  callback — this service only talks to Play and decides ack/consume.
//
//  Off Google Play (web / dev / iOS) the service degrades gracefully:
//  `available` is false, prices fall back to the catalog, and buy() reports
//  that billing is unavailable instead of throwing.
// =============================================================================

import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  PRODUCTS,
  INAPP_PRODUCT_IDS,
  SUBS_PRODUCT_IDS,
  getProduct,
} from "./products.js";

const Billing = registerPlugin("Billing");

// Play BillingResponseCode values we care about.
const RESP = { OK: 0, USER_CANCELED: 1, ITEM_ALREADY_OWNED: 7 };
// Purchase.getPurchaseState()
const PURCHASE_STATE = { UNSPECIFIED: 0, PURCHASED: 1, PENDING: 2 };

// localStorage key holding the set of purchase tokens whose reward has already
// been granted. Persisted so a reward is never granted twice — not across a
// double purchasesUpdated callback, not across the init-restore vs live-event
// race, and not after an app kill between grant and consume (req 14; tests 10, 11).
const PROCESSED_KEY = "billing.processedTokens.v1";

class BillingService {
  constructor() {
    this.available = false;
    this.connected = false;
    this.details = {};          // productId -> { price, currency, priceAmountMicros, ... }
    this.ownedSubs = {};        // productId -> true when an active subscription is owned
    this.callbacks = {};        // onGrant, onEvent, onPricesLoaded, onLog
    this._listener = null;
    this._initPromise = null;
    this.processed = this._loadProcessed(); // Set<purchaseToken> already granted
  }

  // ── processed-token bookkeeping (duplicate-grant guard) ──────────────────────
  _loadProcessed() {
    try {
      const raw = globalThis.localStorage?.getItem(PROCESSED_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch { return new Set(); }
  }

  _saveProcessed() {
    try {
      // Cap the stored list so it can't grow unbounded over the app's lifetime.
      const arr = Array.from(this.processed).slice(-500);
      globalThis.localStorage?.setItem(PROCESSED_KEY, JSON.stringify(arr));
    } catch { /* storage may be unavailable */ }
  }

  // ── logging ────────────────────────────────────────────────────────────────
  log(level, message, data) {
    const line = `[billing] ${message}`;
    try {
      if (level === "error") console.error(line, data ?? "");
      else if (level === "warn") console.warn(line, data ?? "");
      else console.log(line, data ?? "");
    } catch { /* console may be unavailable */ }
    this.callbacks.onLog?.(level, message, data);
  }

  emit(type, payload) {
    this.log(type === "error" ? "error" : "info", `event:${type}`, payload);
    this.callbacks.onEvent?.(type, payload);
  }

  isAvailable() { return this.available && this.connected; }

  // ── init: connect, load prices, restore ─────────────────────────────────────
  async init(callbacks = {}) {
    this.callbacks = callbacks;
    if (this._initPromise) return this._initPromise;
    this._initPromise = this._doInit();
    return this._initPromise;
  }

  async _doInit() {
    const platform = Capacitor.getPlatform();
    if (platform !== "android" || !Capacitor.isPluginAvailable("Billing")) {
      this.available = false;
      this.log("warn", `Billing unavailable on platform "${platform}" — using fallback prices`);
      return { available: false };
    }
    this.available = true;
    try {
      const { connected } = await Billing.initialize();
      this.connected = !!connected;
      this.log("info", `connected=${this.connected}`);

      // Route asynchronous purchase results.
      this._listener = await Billing.addListener("purchasesUpdated", (ev) =>
        this._onPurchasesUpdated(ev),
      );

      await this.loadProducts();
      await this.restore({ silent: true }); // auto-restore durable entitlements (req 7, 8, 9)
      return { available: true, connected: this.connected };
    } catch (e) {
      this.connected = false;
      this.log("error", "init failed", e?.message || e);
      return { available: this.available, connected: false, error: e?.message || String(e) };
    }
  }

  // ── load localized product details (req 1, 2) ────────────────────────────────
  async loadProducts() {
    if (!this.available) return this.details;
    try {
      const { products } = await Billing.getProducts({
        inAppProductIds: INAPP_PRODUCT_IDS,
        subscriptionProductIds: SUBS_PRODUCT_IDS,
      });
      (products || []).forEach((p) => {
        this.details[p.productId] = {
          price: p.price,
          currency: p.currency,
          priceAmountMicros: p.priceAmountMicros,
          title: p.title,
          billingPeriod: p.billingPeriod,
          type: p.type,
        };
      });
      this.log("info", `loaded ${Object.keys(this.details).length} product(s)`);
      this.callbacks.onPricesLoaded?.(this.details);
    } catch (e) {
      this.log("error", "loadProducts failed", e?.message || e);
    }
    return this.details;
  }

  /** Localized formatted price for a product, or its catalog fallback. */
  getPrice(productId) {
    return this.details[productId]?.price || getProduct(productId)?.fallbackPrice || "";
  }

  getCurrency(productId) {
    return this.details[productId]?.currency || "";
  }

  /** Is the monthly subscription currently active? (req 9) */
  isSubscriptionActive(productId = "remove_ads_monthly") {
    return !!this.ownedSubs[productId];
  }

  // ── purchase flow (req 3) ────────────────────────────────────────────────────
  async buy(productId) {
    const product = getProduct(productId);
    if (!product) { this.emit("error", { productId, message: "Unknown product" }); return { ok: false }; }
    if (!this.isAvailable()) {
      this.emit("unavailable", { productId });
      return { ok: false, unavailable: true };
    }
    try {
      this.log("info", `purchase → ${productId}`);
      await Billing.purchase({ productId });
      // Outcome is delivered asynchronously via purchasesUpdated.
      return { ok: true, pendingResult: true };
    } catch (e) {
      const code = e?.code;
      if (String(code) === String(RESP.USER_CANCELED)) {
        this.emit("cancelled", { productId });
      } else {
        this.emit("error", { productId, code, message: e?.message || String(e) });
      }
      return { ok: false, code };
    }
  }

  // ── purchasesUpdated handler (req 3, 4, 5) ───────────────────────────────────
  async _onPurchasesUpdated(ev) {
    const code = ev?.responseCode;
    const purchases = ev?.purchases || [];
    if (code === RESP.USER_CANCELED) {
      this.emit("cancelled", {});
      return;
    }
    if (code !== RESP.OK) {
      this.emit("error", { code, message: ev?.debugMessage || "Purchase failed" });
      return;
    }
    for (const p of purchases) {
      await this._processPurchase(p, { restore: false });
    }
  }

  /**
   * Grant + finish a single purchase.
   *  - PENDING            → notify, grant nothing (req 3)
   *  - PURCHASED consumable    → grant → consume            (req 5)
   *  - PURCHASED non-consumable/subs → grant → acknowledge  (req 4, 6)
   */
  async _processPurchase(purchase, { restore }) {
    const productId = purchase.productId;
    const product = getProduct(productId);
    if (!product) { this.log("warn", `purchase for unknown product ${productId}`); return; }

    if (purchase.purchaseState === PURCHASE_STATE.PENDING) {
      this.emit("pending", { productId });
      return;
    }
    if (purchase.purchaseState !== PURCHASE_STATE.PURCHASED) {
      return; // UNSPECIFIED — ignore
    }

    // Track active subscription state for req 9.
    if (product.type === "subs") this.ownedSubs[productId] = true;

    const token = purchase.purchaseToken;

    // Duplicate-grant guard: a token whose reward we already granted must never
    // be granted again (double callback, restore-vs-live race, or an app kill
    // that left the purchase un-consumed). We still fall through to finish the
    // purchase so an orphaned entitlement is consumed/acknowledged (test 11).
    if (token && this.processed.has(token)) {
      this.log("info", `skip duplicate grant for ${productId} (token already processed)`);
    } else {
      // Grant the reward (idempotent for durable entitlements). The host decides
      // how to apply it; we always finish the purchase with Play afterwards.
      try {
        this.callbacks.onGrant?.(productId, product, { restore });
        if (token) { this.processed.add(token); this._saveProcessed(); }
        this.emit(restore ? "restored" : "purchased", { productId });
      } catch (e) {
        this.log("error", `grant failed for ${productId}`, e?.message || e);
        // Do NOT finish the purchase if granting threw — let Play resurface it so
        // the reward isn't lost.
        return;
      }
    }

    await this._finishPurchase(purchase, product);
  }

  /** Consume consumables (req 5); acknowledge everything else (req 4, 6). */
  async _finishPurchase(purchase, product) {
    const token = purchase.purchaseToken;
    if (!token) return;
    try {
      if (product.consumable) {
        // Consuming also acknowledges — enables repurchase. Never for lifetime (req 6).
        await Billing.consume({ purchaseToken: token });
        this.log("info", `consumed ${product.id}`);
      } else if (!purchase.acknowledged) {
        await Billing.acknowledge({ purchaseToken: token });
        this.log("info", `acknowledged ${product.id}`);
      }
    } catch (e) {
      this.log("error", `finish failed for ${product.id}`, e?.message || e);
    }
  }

  // ── restore (req 7, 8, 9) ────────────────────────────────────────────────────
  /**
   * Query owned purchases from Play and re-apply durable entitlements. Called
   * automatically on init and manually from a "Restore Purchases" button.
   *  - remove_ads_lifetime  → restored + acknowledged if needed
   *  - remove_ads_monthly   → active subs are returned by Play → restored
   *  - any consumable still owned (paid but never granted, e.g. app killed
   *    mid-grant) → grant + consume so it isn't lost
   */
  async restore({ silent = false } = {}) {
    if (!this.isAvailable()) {
      if (!silent) this.emit("unavailable", {});
      return { ok: false };
    }
    try {
      const { purchases } = await Billing.queryPurchases();
      const owned = purchases || [];
      this.log("info", `restore: ${owned.length} owned purchase(s)`);

      // Subscriptions returned by Play are the currently-active ones (req 9).
      this.ownedSubs = {};
      owned.forEach((p) => {
        if (getProduct(p.productId)?.type === "subs" &&
            p.purchaseState === PURCHASE_STATE.PURCHASED) {
          this.ownedSubs[p.productId] = true;
        }
      });

      let restoredCount = 0;
      for (const p of owned) {
        if (p.purchaseState === PURCHASE_STATE.PURCHASED) {
          await this._processPurchase(p, { restore: true });
          restoredCount += 1;
        }
      }
      // A monthly sub NOT returned here is expired/inactive → make sure the host
      // knows so it can drop the entitlement.
      this.callbacks.onRestoreComplete?.({
        subscriptionActive: this.isSubscriptionActive(),
        lifetimeOwned: owned.some(
          (p) => p.productId === "remove_ads_lifetime" &&
                 p.purchaseState === PURCHASE_STATE.PURCHASED,
        ),
        count: restoredCount,
      });
      if (!silent) this.emit("restore-done", { count: restoredCount });
      return { ok: true, count: restoredCount };
    } catch (e) {
      this.log("error", "restore failed", e?.message || e);
      if (!silent) this.emit("error", { message: e?.message || String(e) });
      return { ok: false, error: e?.message || String(e) };
    }
  }
}

export const billing = new BillingService();
export default billing;

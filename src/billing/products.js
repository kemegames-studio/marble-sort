// =============================================================================
//  Google Play Billing — Product catalog (single source of truth)
// -----------------------------------------------------------------------------
//  Every Play product ID the game sells lives here. The native BillingPlugin,
//  the JS BillingService and the store/no-ads UI all read from this file, so a
//  product only ever needs to be defined once.
//
//  `type`       — Play product type: "inapp" (one-time) or "subs" (subscription)
//  `consumable` — true  → consume after granting  (repeatable purchases)
//                 false → acknowledge only         (durable entitlements)
//  `grant`      — what the player receives once the purchase is verified:
//                   coins            : number of coins
//                   boostersEach     : N of EACH booster (undo/shuffle/tube)
//                   unlimitedLivesMs : ms of unlimited lives
//                   noAds            : "lifetime" | "subscription"
//  `fallbackPrice` — shown only when Play prices can't be loaded (dev / web /
//                    offline). Real localized prices always override this.
// =============================================================================

export const PRODUCT_TYPE = { INAPP: "inapp", SUBS: "subs" };

const HOUR = 60 * 60 * 1000;

export const PRODUCTS = {
  // ── Bundles (consumable one-time) ─────────────────────────────────────────
  starter_bundle: {
    id: "starter_bundle", type: "inapp", consumable: true,
    grant: { coins: 5000, boostersEach: 10, unlimitedLivesMs: 2 * HOUR, noAds: "lifetime" },
    fallbackPrice: "$2.99",
  },
  pro_bundle: {
    id: "pro_bundle", type: "inapp", consumable: true,
    grant: { coins: 20000, boostersEach: 25, unlimitedLivesMs: 12 * HOUR, noAds: "lifetime" },
    fallbackPrice: "$6.99",
  },
  legend_bundle: {
    id: "legend_bundle", type: "inapp", consumable: true,
    grant: { coins: 50000, boostersEach: 50, unlimitedLivesMs: 24 * HOUR, noAds: "lifetime" },
    fallbackPrice: "$12.99",
  },

  // ── Coin packs (consumable one-time) ──────────────────────────────────────
  coin_pack_1: { id: "coin_pack_1", type: "inapp", consumable: true, grant: { coins: 2500 },   fallbackPrice: "$1.99" },
  coin_pack_2: { id: "coin_pack_2", type: "inapp", consumable: true, grant: { coins: 6500 },   fallbackPrice: "$4.99" },
  coin_pack_3: { id: "coin_pack_3", type: "inapp", consumable: true, grant: { coins: 15000 },  fallbackPrice: "$9.99" },
  coin_pack_4: { id: "coin_pack_4", type: "inapp", consumable: true, grant: { coins: 35000 },  fallbackPrice: "$19.99" },
  coin_pack_5: { id: "coin_pack_5", type: "inapp", consumable: true, grant: { coins: 75000 },  fallbackPrice: "$39.99" },
  coin_pack_6: { id: "coin_pack_6", type: "inapp", consumable: true, grant: { coins: 160000 }, fallbackPrice: "$69.99" },

  // ── Remove ads — lifetime (non-consumable one-time) ───────────────────────
  remove_ads_lifetime: {
    id: "remove_ads_lifetime", type: "inapp", consumable: false,
    grant: { noAds: "lifetime" },
    fallbackPrice: "$4.99",
  },

  // ── Remove ads — monthly (subscription) ───────────────────────────────────
  remove_ads_monthly: {
    id: "remove_ads_monthly", type: "subs", consumable: false,
    grant: { noAds: "subscription" },
    fallbackPrice: "$1.99/mo",
  },
};

export const ALL_PRODUCT_IDS = Object.keys(PRODUCTS);
export const INAPP_PRODUCT_IDS = ALL_PRODUCT_IDS.filter((id) => PRODUCTS[id].type === PRODUCT_TYPE.INAPP);
export const SUBS_PRODUCT_IDS = ALL_PRODUCT_IDS.filter((id) => PRODUCTS[id].type === PRODUCT_TYPE.SUBS);

export function getProduct(id) {
  return PRODUCTS[id] || null;
}

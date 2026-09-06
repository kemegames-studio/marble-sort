# Marble Sort — Booster System

**Game Design Document (GDD) + Technical Design Document (TDD)**
Version 1.0 · Owner: Game Design / Economy · Status: Ready for implementation

> Scope: exactly three boosters — **Undo**, **Shuffle**, **Extra Tube**. This document is the single source of truth for design, economy, backend, client architecture, LiveOps, analytics, and edge cases.
>
> **Implementation note.** The shipping client is a Vite + Capacitor web game (vanilla JS). Sections 1–12 and 14 describe the live design and map directly onto the current code (`src/app.js`, `src/economy.js`). Section 13 provides the requested **Unity/C# architecture** for a future native port; the same domain model (services, events, ScriptableObject-equivalent config) is mirrored in the JS client so a port is a re-skin of the same contracts, not a redesign.

---

## 0. Booster summary

| Booster | Effect | Unlock level | Default cost | Per-level limit | Requires prior state |
|--------|--------|:---:|:---:|:---:|---|
| **Undo** | Revert the last move | **9** | 300 coins | Unlimited | A move must exist to undo |
| **Shuffle** | Randomly rearrange all balls; result must stay solvable | **15** | 300 coins | Unlimited | — |
| **Extra Tube** | Add one temporary empty tube; removed on complete/restart | **18** | 900 coins | **1** | Board not already at max tubes |

All bold values are **remotely configurable** (Section 9).

---

## 1. Booster Inventory System

### 1.1 Quantities
- Inventory is a per-booster integer count: `{ undo, shuffle, tube }`.
- New installs seed a **starter grant** (LiveOps `startingGrant`, default `{undo:5, shuffle:3, tube:2}`) so the tutorial has stock.
- Counts are unbounded by default; an optional `maxStack` per booster (default 999) caps hoarding for offer design.

### 1.2 Storage rules
- **Client:** authoritative-cached in the local profile (`localStorage` key `marble-sort-state-v1`, field `boosters`).
- **Server (when online):** mirrored in `player_inventory`. Server is the source of truth for balances that affect revenue (purchased/granted); client is optimistic and reconciles on sync (Section 14.6).
- Each mutation is idempotent via a client-generated `opId` (UUID) so retries never double-apply.

### 1.3 Consumption rules
- A booster use runs **only if**: unlocked for the player's level (Section 2), `count > 0`, and the booster's gameplay precondition holds (e.g. Undo needs history).
- Consumption is **atomic**: decrement → apply effect → persist. If the effect can't apply (precondition fails), the count is **not** decremented and the player sees a contextual toast.
- Extra Tube additionally sets a per-level `extraTubeUsed` flag; the added tube is transient and never persisted into the level's solved/loaded board.

### 1.4 Persistence
- Balances, `lastLevelPlayed`, and pending `opId`s persist across app restarts.
- Transient per-level state (`extraTubeUsed`, added tube, move `history`) lives only in the active session and is cleared on level start/restart/complete.

---

## 2. Unlock System

### 2.1 Level requirements
Boosters unlock as the player progresses, staggering the learning curve:

| Booster | Unlocks at level | Rationale |
|--------|:---:|---|
| Undo | 9 | First "safety net" once boards get non-trivial |
| Shuffle | 15 | Introduced when dead-ends become possible |
| Extra Tube | 18 | Most powerful; gated highest to protect difficulty |

Rule: a booster is unlocked when `max(currentLevel, highestUnlockedLevel) >= unlockLevel`. Config key: `boosterUnlock.{key}`.

### 2.2 Locked presentation
A locked booster shows a dark padlock tile with an **"LV n"** badge (matching the supplied art) in the gameplay booster bar. Tapping it does **not** consume anything — it plays an invalid cue, a light haptic, and a toast: *"{Booster} unlocks at level {n}."*

### 2.3 Tutorial flow
- On the **first level where a booster unlocks**, a one-time coach-mark points at the newly lit booster with a pulse glow and a single-line explainer ("Undo takes back your last move").
- The tutorial fires once per booster (`tutorialSeen.{key}` flag) and is skippable by tapping anywhere.
- Tutorial trigger is remotely toggleable (`tutorial.{key}.enabled`) for A/B tests.

### 2.4 First-time introduction
When a booster first unlocks, the player is granted a **free sample** (`unlockGrant.{key}`, default 1) so they experience the effect before being asked to spend or buy.

---

## 3. Shop System

### 3.1 Coin purchases (soft-currency sink)
Buy individual boosters with coins at the default costs above. Purchase is offered:
- from the **Store** (Boosters section),
- inline from the **empty-inventory** flow when a player taps a booster they own zero of.

### 3.2 Bundle purchases (hard-currency / IAP)
Bundles mix coins + timed perks + booster stacks (already in the Store): Starter ($2.99, ×10 each), Pro ($6.99, ×25 each, best value), Legend ($12.99, ×50 each). Bundle contents are config-driven.

### 3.3 Rewarded ads
- **Earn a booster by watching an ad** offered on the failure screen and from empty-inventory. Config `ads.{key}.enabled`, `ads.dailyCap` (default 5/day), cooldown `ads.cooldownSec`.
- Reuses the existing rewarded-ad overlay (5s placeholder → real SDK seam).

### 3.4 Starter offers
- A one-time, time-boxed **Starter Booster Pack** surfaces after the first booster unlock (level 9) — discounted coins + booster stack. Config `offers.starter.*` (price, contents, ttl).

---

## 4. Reward Sources

Boosters and the coins that buy them flow from many faucets, all quantity-configurable:

| Source | Cadence | Typical grant |
|--------|--------|---------------|
| **Daily rewards** | Once/day | Coins; every 7th day a booster |
| **Login streak** | Consecutive days | Escalating coins → booster at day 5/7 |
| **Level rewards** | Per win | 40 coins base, +80 rewarded-ad bonus |
| **Achievements** | On unlock | Coins + one-off booster grants |
| **Events** | LiveOps windows | Event points → booster milestone rewards |
| **Battle pass** | Seasonal track | Free + premium lanes include booster stacks |
| **Leaderboard** | Weekly Monday | Rank-tier coins/gems (existing system) |
| **LiveOps push** | Ad-hoc | Direct grants to segments (compensation, winback) |

Every grant is logged with a `source` string for analytics (Section 11).

---

## 5. Gameplay Integration

### 5.1 Pre-level
Optional pre-level panel (LiveOps `preLevel.enabled`) lets the player pre-arm boosters for a hard level; pre-armed boosters are reserved but only consumed on use.

### 5.2 In-level
Booster bar is pinned at the bottom of the gameplay screen. Each button shows the icon + owned count, or the locked LV badge. Undo/Shuffle usable anytime; Extra Tube once per level then greys out.

### 5.3 Failure-screen recommendations
On "No Moves Left", the dialog recommends the most relevant recovery booster:
- dead-end with a move history → **Undo**;
- gridlock with no empty tube → **Extra Tube**;
- otherwise → **Shuffle**.
Each recommendation offers use-if-owned, else buy-with-coins, else watch-ad.

### 5.4 Contextual suggestions
- If the engine detects **no legal moves remain**, auto-highlight Shuffle/Extra Tube.
- If the player taps an illegal move 3× in a row, gently pulse Undo/Shuffle.

---

## 6. Economy Design

### 6.1 Pricing strategy
- Undo/Shuffle at **300** (impulse-tier), Extra Tube at **900** (3×, reflects its power and once-per-level scarcity).
- Coin faucets tuned so a mid-funnel player earns ~1 booster-equivalent per 2–3 levels, keeping boosters felt-valuable but attainable.

### 6.2 Sink vs source balancing
- **Sources:** level wins, daily/streak, ads, events, IAP.
- **Sinks:** booster purchases, life refills, cosmetic spends.
- Target a mild **net-negative** coin flow for engaged players (sinks slightly exceed organic faucets) so IAP/ads have pull without hard walls. Monitor via the source/sink dashboard.

### 6.3 Progression pacing
Unlock staggering (9/15/18) plus rising level difficulty keeps boosters relevant as the puzzle space grows; unlock grants smooth the first paid ask.

### 6.4 Coin-inflation prevention
- Diminishing daily/streak curves; per-source daily caps.
- Rewarded-ad daily cap.
- Dynamic difficulty and periodic price reviews from analytics.
- Never grant unbounded coins from a single repeatable action.

---

## 7. UI/UX Design

- **HUD placement:** boosters in a rounded bar at the bottom of gameplay; coin/lives in the top HUD.
- **Booster buttons:** icon + count badge; locked = dark tile + padlock + "LV n"; disabled (Extra Tube used) = greyed with check.
- **Inventory display:** counts visible in-game and in Store.
- **Purchase flow:** tap booster with 0 owned → sheet with Buy (coins) / Watch Ad / (Store) options.
- **Confirmation dialogs:** required for coin spends above a `confirmThreshold` (default 500) — i.e. Extra Tube confirms, Undo/Shuffle don't.
- **Empty-inventory flow:** never a dead end — always routes to a way to obtain the booster.

---

## 8. Animations & Feedback

| Booster | Activation animation | SFX | Haptic |
|--------|----------------------|-----|--------|
| Undo | Last-moved balls fly back to the source tube | `booster` (rate 0.96) | light |
| Shuffle | Balls lift, swirl, and re-drop into tubes | `booster` (rate 1.04) | medium |
| Extra Tube | New tube rises/scales in from the bar | `booster` (rate 1.08) | light |

- Success feedback: coin/label pulse; locked-tap: invalid cue + short buzz.
- Reduced-motion users get the state change without the flourish.

---

## 9. LiveOps Configuration

All values are remote (server config → client cache, with baked defaults for offline). Config document shape:

```json
{
  "boosters": {
    "undo":    { "cost": 300, "unlockLevel": 9,  "dailyUseCap": null, "adEnabled": true,  "unlockGrant": 1, "tutorial": true },
    "shuffle": { "cost": 300, "unlockLevel": 15, "dailyUseCap": null, "adEnabled": true,  "unlockGrant": 1, "tutorial": true },
    "tube":    { "cost": 900, "unlockLevel": 18, "dailyUseCap": null, "adEnabled": true,  "unlockGrant": 1, "tutorial": true, "perLevelLimit": 1 }
  },
  "economy": { "startingGrant": {"undo":5,"shuffle":3,"tube":2}, "confirmThreshold": 500 },
  "ads": { "dailyCap": 5, "cooldownSec": 60 },
  "offers": { "starter": { "enabled": true, "price": "$1.99", "contents": {"coins":2000,"undo":5,"shuffle":5}, "ttlHours": 48 } },
  "events": { "activeEventId": null }
}
```

Remotely configurable per requirement: **coin cost, unlock level, daily limits, event availability, reward quantities, ad availability, tutorial trigger.** Config is versioned (`configVersion`) and hot-applies without an app update.

---

## 10. Admin Dashboard

Panels (web admin, gated by role):

1. **Booster management** — per booster: cost, unlock level, per-level limit, ad on/off, tutorial on/off, starter grant. Live preview + staged rollout %.
2. **Economy management** — starting grants, confirm threshold, source/sink curves, price experiments (A/B buckets).
3. **Reward management** — daily/streak/event/battle-pass/achievement tables; grant quantities; schedule windows.
4. **Analytics monitoring** — funnels and KPIs from Section 11, segmentable by level band, country, platform, spend tier.

All writes are audit-logged (who/when/old→new) and support instant rollback to a prior `configVersion`.

---

## 11. Analytics

Events (all include `playerId`, `sessionId`, `level`, `platform`, `configVersion`, `ts`):

| Event | Key properties |
|-------|----------------|
| `booster_viewed` | `key`, `surface` (hud/failure/store/offer) |
| `booster_purchased` | `key`, `source` (coins/iap/ad), `price`, `currency`, `balanceAfter` |
| `booster_used` | `key`, `remainingAfter`, `levelId`, `moveIndex` |
| `booster_source` | `key`, `source`, `qty` (every grant) |
| `booster_remaining` | `key`, `count` (session snapshot) |
| `level_before_usage` | `levelId`, `attempt`, `boardHash` |
| `level_after_usage` | `levelId`, `key`, `resultPending` |
| `win_after_booster` | `key`, `levelId`, `movesAfter` |
| `failure_after_booster` | `key`, `levelId` |
| `revenue_generated` | `sku`, `price`, `currency`, `store` |

Derived KPIs: booster conversion (viewed→purchased), win-rate lift after each booster, ARPDAU contribution, ad fill/skip, per-booster sink volume.

---

## 12. Backend Design

### 12.1 Database schema (relational)

```sql
player_inventory (
  player_id      TEXT NOT NULL,
  booster_key    TEXT NOT NULL,        -- 'undo' | 'shuffle' | 'tube'
  count          INT  NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (player_id, booster_key)
);

booster_ledger (                        -- append-only audit of every change
  op_id          UUID PRIMARY KEY,      -- idempotency key from client
  player_id      TEXT NOT NULL,
  booster_key    TEXT NOT NULL,
  delta          INT  NOT NULL,         -- +grant / -consume / -purchase
  source         TEXT NOT NULL,         -- 'level_reward','daily','ad','iap','coins','use','liveops'
  level_id       INT,
  created_at     TIMESTAMPTZ NOT NULL
);

remote_config (
  config_version INT PRIMARY KEY,
  payload        JSONB NOT NULL,
  published_at   TIMESTAMPTZ NOT NULL
);
```

### 12.2 API endpoints

```
GET  /api/v1/inventory                 → current balances + configVersion
POST /api/v1/boosters/consume          → spend on a use   (body: {opId,key,levelId})
POST /api/v1/boosters/purchase         → buy with coins   (body: {opId,key})
POST /api/v1/boosters/grant            → server/LiveOps grant (internal/authed)
GET  /api/v1/config                    → active remote config
POST /api/v1/sync                       → reconcile offline op batch
```

### 12.3 Request/response examples

```jsonc
// POST /api/v1/boosters/consume
{ "opId": "b1e...", "key": "undo", "levelId": 27 }
// 200
{ "ok": true, "balances": { "undo": 4, "shuffle": 3, "tube": 2 }, "opId": "b1e..." }
// 409 (already applied — idempotent replay)
{ "ok": true, "duplicate": true, "balances": { "undo": 4, ... } }
// 422 (insufficient)
{ "ok": false, "error": "INSUFFICIENT_BOOSTER", "balances": { "undo": 0, ... } }
```

### 12.4 Inventory & remote-config models (shared contract)

```ts
type BoosterKey = "undo" | "shuffle" | "tube";
interface Inventory { undo: number; shuffle: number; tube: number; }
interface BoosterConfig {
  cost: number; unlockLevel: number; dailyUseCap: number | null;
  adEnabled: boolean; unlockGrant: number; tutorial: boolean; perLevelLimit?: number;
}
interface RemoteConfig {
  configVersion: number;
  boosters: Record<BoosterKey, BoosterConfig>;
  economy: { startingGrant: Inventory; confirmThreshold: number };
  ads: { dailyCap: number; cooldownSec: number };
}
```

---

## 13. Unity Architecture (native-port design)

### 13.1 Layered service architecture
```
UI Layer            BoosterBarView, BoosterButton, ShopView, FailureView
  │ (events)
Application Layer   BoosterManager  (facade)
  ├── InventoryService     balances, consume/grant, persistence
  ├── UnlockService        unlockLevel gating, tutorial triggers
  ├── EconomyService       cost checks, coin spend, confirm rules
  ├── ShopService          coins/IAP/ad purchase flows
  ├── RemoteConfigService  fetch/cache config, hot-apply
  └── AnalyticsService     event emission
Domain Layer        BoosterDefinition (SO), BoosterEffect strategies
Infra Layer         SaveStore, ApiClient, AdProvider, IAPProvider
```

### 13.2 Class diagram (abridged)
```
BoosterManager
  + IReadOnlyInventory Inventory
  + bool IsUnlocked(BoosterKey)
  + Result TryUse(BoosterKey, LevelContext)
  + Result TryPurchase(BoosterKey, PurchaseMethod)
  - InventoryService  _inventory
  - UnlockService     _unlock
  - EconomyService    _economy
  - event Action<BoosterEvent> OnBoosterChanged

IBoosterEffect { bool CanApply(Board); void Apply(Board); }
UndoEffect, ShuffleEffect, ExtraTubeEffect : IBoosterEffect
```

### 13.3 ScriptableObjects
- `BoosterDefinition` (SO): key, displayName, icon, `IBoosterEffect` type, defaultCost, defaultUnlockLevel, perLevelLimit — designer-editable, overridable by RemoteConfig at runtime.
- `BoosterCatalog` (SO): list of all `BoosterDefinition`s → adding a booster = add one SO (Section 15).

### 13.4 Event system
A typed event bus (`OnBoosterUsed`, `OnBoosterPurchased`, `OnBoosterUnlocked`, `OnInventoryChanged`) decouples UI, analytics, and tutorial. The current JS client mirrors this: a single `render()` reacts to profile mutations, and analytics/toasts hang off the same action dispatch — so the contracts port 1:1.

---

## 14. Edge Cases

1. **Offline mode** — all uses/purchases apply optimistically against the cached balance and queue `opId`-stamped ops; UI never blocks on the network.
2. **Internet interruption mid-op** — op stays queued; retried on reconnect; server idempotency (`opId`) prevents double-apply.
3. **Insufficient coins** — purchase blocked with a shake + "Not enough coins" → routes to Store/coin packs.
4. **Full inventory** (`maxStack`) — grants clamp to cap; overflow from paid sources is logged and (optionally) converted to coins.
5. **Booster spam** — per-action debounce (≥250 ms) + `moveAnimating`/`submitting` guards; Extra Tube hard-limited to once per level.
6. **Multi-device sync** — server is source of truth; on login the client reconciles (server balance wins; unsynced local ops replayed by `opId`, conflicts resolved server-side).
7. **Level restart** — transient state cleared: Extra Tube removed, `extraTubeUsed` reset, move history dropped; **owned counts are not refunded** for already-consumed uses (a used booster is spent).
8. **App force-close** — balances and pending ops are persisted synchronously on every mutation, so nothing is lost; queued ops flush on next launch.

Additional: **precondition failure never charges** (e.g. Undo with empty history), and **locked taps never consume**.

---

## 15. Future Scalability

Adding a new booster (e.g. "Color Bomb") requires **no refactor**:
1. Add a `BoosterDefinition` SO (Unity) / an entry in `BOOSTER_META` + `BOOSTER_UNLOCK` (JS).
2. Implement one `IBoosterEffect` (`CanApply`/`Apply`).
3. Add cost/unlock/ad keys to the remote-config schema.
4. Art: icon + locked LV badge (already generic).

The inventory (`Record<key, count>`), ledger, analytics (`key`-parameterized), shop, and UI booster bar are all **data-driven by key**, so they pick up the new booster automatically. No enum-switch sprawl: effects are strategies, config is keyed, and UI iterates the catalog.

---

## Appendix A — Current client mapping (as shipped)

| Design concept | Code location |
|----------------|---------------|
| Unlock levels + gating | `BOOSTER_UNLOCK`, `boosterUnlocked()` in `src/app.js` |
| Locked booster UI (padlock + LV badge) | `boosterButton()` + `.gameplay-booster.is-locked` in `src/styles.css` |
| Inventory counts + persistence | `profile.boosters`, `save()` (`localStorage`) |
| Consumption + preconditions | `undo` / `shuffle()` / `add-tube` handlers |
| Coin purchase / life refill sinks | Store (`storeView`), `LIVES_REFILL_PRICE` |
| Reward faucets | daily reward, level win (`WIN_REWARD_COINS`), leaderboard season rewards |
| Effect animations + SFX | `animateTransfer`, `celebrateCompletedTube`, `playSfx` |

Values in the JS client are constants today; the LiveOps layer (Section 9) is the planned server-config seam that overrides them at runtime.

import { LEVELS } from "./levels.js";
import { canMove, hasAnyMoves, isTubeComplete, move, isSolved, nearestTubeIndex, shuffleTubes } from "./game-engine.js";
import { fetchCloudProfile, fetchLeaderboardEntries, pushLeaderboardEntry, scheduleCloudPush } from "./cloud-save.js";
import { initAnalytics, track } from "./analytics.js";
import { addCoins, loseLife, refreshLives, LIFE_REGEN_MS, MAX_LIVES } from "./economy.js";
import { hasNativeAds, showInterstitialAd, showRewardedLivesAd, showRewardedCoinsAd, showRewardedExtraTubeAd, showRewardedUndoAd, showRewardedShuffleAd } from "./ads.js";
import { pauseMusic, playSfx, preloadMusic, preloadSfx, stopSfx, syncMusic } from "./audio.js";
import {
  buildSpeedBoard,
  buildStarsBoard,
  buildWeeklyBoard,
  computeWeeklyScore,
  formatSeasonCountdown,
  formatSpeedTime,
  getLeague,
  getSeasonEnd,
  getSeasonKey,
  leagueOutcome,
  rewardForRank,
  BOARD_SIZE,
  LEAGUES,
} from "./leaderboard.js";
import {
  createPortalTicket,
  getNativeSupportStatus,
  getKemeSupportConfig,
  identifyNativeSupportUser,
  loadPortalGames,
  loadPortalTickets,
  loginPortal,
  openNativeSupportCenter,
} from "./keme-support.js";
import billing from "./billing/billing-service.js";

const app = document.querySelector("#app");
const STORAGE = "marble-sort-state-v1";
const STATE_VERSION = 2;
const WIN_REWARD_COINS = 40;
const COMPLETE_BONUS_COINS = 40;
const DEFAULT_COINS = 500;
const DAILY_REWARD_COINS = 250;
const MARBLE_ASSETS = {
  red: "/assets/ball-red.svg",
  orange: "/assets/ball-yellow.svg",
  yellow: "/assets/ball-yellow.svg",
  green: "/assets/ball-green.svg",
  olive: "/assets/ball-green.svg",
  gray: "/assets/ball-blue.svg",
  cyan: "/assets/ball-cyan.svg",
  blue: "/assets/ball-blue.svg",
  purple: "/assets/ball-plum.svg",
  pink: "/assets/ball-red.svg",
};
const APP_VERSION = "0.1.0 (1)";
const AVATARS = ["🙂", "😎", "🐱", "🦊", "🐼", "🦁", "🐸", "👾"];
// LiveOps-configurable booster unlock levels (see docs/booster-system.md).
const BOOSTER_UNLOCK = { undo: 9, shuffle: 15, tube: 18 };
const BOOSTER_COST = { undo: 300, shuffle: 300, tube: 900 };
const BOOSTER_META = {
  undo: { name: "Undo", icon: "/assets/booster-undo.png", tip: "Made a wrong move? Undo takes back your last pour. Use it as often as you like." },
  shuffle: { name: "Shuffle", icon: "/assets/booster-shuffle.png", tip: "Stuck with no good moves? Shuffle rearranges every ball — and the board always stays solvable." },
  tube: { name: "Extra Tube", icon: "/assets/booster-add-tube.png", tip: "Out of room? Extra Tube adds one empty tube for this level to give you space to sort." },
};
const BOOSTER_ORDER = ["undo", "shuffle", "tube"];

function boosterUnlockLevel(key) {
  return BOOSTER_UNLOCK[key] || 1;
}
function boosterUnlocked(key) {
  return Math.max(profile.level || 1, profile.unlocked || 1) >= boosterUnlockLevel(key);
}
const ICON_PATHS = {
  music: "M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z",
  sound: "M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05a4.5 4.5 0 0 0 2.5-4.02zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z",
  vibration: "M0 15h2V9H0v6zm3 2h2V7H3v10zm19-8v6h2V9h-2zm-3 8h2V7h-2v10zM16.5 3h-9C6.67 3 6 3.67 6 4.5v15c0 .83.67 1.5 1.5 1.5h9c.83 0 1.5-.67 1.5-1.5v-15c0-.83-.67-1.5-1.5-1.5zM16 19H8V5h8v14z",
  gear: "M19.14 12.94a7.07 7.07 0 0 0 .06-.94 7.07 7.07 0 0 0-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.65 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.42.34.61.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54a7.03 7.03 0 0 0 1.62-.94l2.39.96c.19.12.47.02.61-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z",
  doc: "M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
  shield: "M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z",
  person: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
  camera: "M9 2 7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10z",
  pencil: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
  copy: "M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z",
  headset: "M12 1a9 9 0 0 0-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2a7 7 0 0 1 14 0v2h-4v8h4v1h-7v2h6c1.66 0 3-1.34 3-3V10a9 9 0 0 0-9-9z",
};

function icon(name) {
  return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON_PATHS[name]}"/></svg>`;
}
// Boosters start at 0 — each booster grants BOOSTER_UNLOCK_GRANT when it unlocks.
const BOOSTER_UNLOCK_GRANT = 2;
// Interstitial ads: first at the start of level 11, then every 2nd level (11, 13, 15…).
const INTERSTITIAL_START_LEVEL = 11;
const INTERSTITIAL_EVERY = 2;

function shouldShowInterstitial(level) {
  return level >= INTERSTITIAL_START_LEVEL && (level - INTERSTITIAL_START_LEVEL) % INTERSTITIAL_EVERY === 0;
}

// ── LiveOps: Daily Login Rewards ────────────────────────────────────────────
// 7-day cycle; each day grants coins and (from day 2) a booster bundle.
const DAILY_LOGIN_REWARDS = [
  { day: 1, coins: 1000 },
  { day: 2, coins: 1500, booster: "undo", amount: 2 },
  { day: 3, coins: 2000, booster: "tube", amount: 1 },
  { day: 4, coins: 2500, booster: "shuffle", amount: 2 },
  { day: 5, coins: 3000, booster: "tube", amount: 2 },
  { day: 6, coins: 3500, booster: "undo", amount: 3 },
  { day: 7, coins: 5000, booster: "shuffle", amount: 3 },
];

// ── LiveOps: Daily Missions ─────────────────────────────────────────────────
const DAILY_MISSIONS = [
  { key: "coins",   label: "Collect 300 coins",     icon: "/assets/coin.png",             target: 300, reward: 100 },
  { key: "levels",  label: "Complete 4 levels",     icon: "/assets/complete-star.png",    target: 4,   reward: 250 },
  { key: "undo",    label: "Use Undo 3 times",      icon: "/assets/booster-undo.png",     target: 3,   reward: 400 },
  { key: "shuffle", label: "Use Shuffle 3 times",   icon: "/assets/booster-shuffle.png",  target: 3,   reward: 500 },
  { key: "tube",    label: "Use Extra Tube 2 times",icon: "/assets/booster-add-tube.png", target: 2,   reward: 700 },
];
const MISSIONS_ALL_BONUS_COINS = 1000;
const MISSIONS_UNLIMITED_LIVES_MS = 2 * 60 * 60 * 1000;

// ── LiveOps: No-Ads Bundle ──────────────────────────────────────────────────
const NO_ADS_PLANS = {
  monthly: { label: "MONTHLY", price: "SAR 15.99", note: "per month", durationMs: 30 * 24 * 60 * 60 * 1000 },
  onetime: { label: "ONE TIME PURCHASE", price: "SAR 29.99", note: "Best Value!", durationMs: null },
};
const initial = { version: STATE_VERSION, level: 1, unlocked: 1, coins: DEFAULT_COINS, lives: 5, lastLifeAt: null, lastRewardDate: null, music: true, sound: true, vibration: true, playerName: "", avatar: 0, onboarded: false, launched: false, boosterSeen: {}, boosters: { undo: 0, shuffle: 0, tube: 0 },
  // LiveOps state
  dailyLogin: { streak: 0, lastClaimDate: null },
  missions: { date: null, progress: { coins: 0, levels: 0, undo: 0, shuffle: 0, tube: 0 }, claimed: {}, bonusClaimed: false },
  noAds: { active: false, until: null },
  unlimitedLivesUntil: null,
};

function loadProfile() {
  const raw = JSON.parse(localStorage.getItem(STORAGE) || "{}");
  const next = {
    ...initial,
    ...raw,
    boosters: {
      ...initial.boosters,
      ...(raw.boosters || {}),
    },
    dailyLogin: { ...initial.dailyLogin, ...(raw.dailyLogin || {}) },
    missions: {
      ...initial.missions,
      ...(raw.missions || {}),
      progress: { ...initial.missions.progress, ...((raw.missions || {}).progress || {}) },
      claimed: { ...((raw.missions || {}).claimed || {}) },
    },
    noAds: { ...initial.noAds, ...(raw.noAds || {}) },
  };

  if (!raw.version) {
    next.version = STATE_VERSION;
    if (raw.coins === 2450 || typeof raw.coins !== "number") {
      next.coins = DEFAULT_COINS;
    }
  }

  return refreshLives(next);
}

let profile = loadProfile();
let view = "loading";
let menuNameEditing = false;
let suppressNameEditUntil = 0;
let livesTicker = null;
let adSecondsLeft = 0;
let adReward = "life";
let lbTab = "weekly";
let lbVisibleCount = 25;
let lbRealCache = { key: "", entries: [], at: 0 };
let boosterIntroKey = null;   // booster whose intro popup is showing
let highlightBoosterKey = null; // booster to pulse on its first unlocked level
let levelStartAt = 0;
let levelBoosterUsed = false;
let tubes = [];
let selected = null;
let history = [];
let modal = null;
let toast = "";
let transitionTimer;
let moveAnimating = false;
let completeBonusClaimed = false;
let supportDraft = defaultSupportDraft();
let supportState = {
  loading: false,
  submitting: false,
  token: "",
  profile: null,
  games: [],
  tickets: [],
  error: "",
  success: "",
  nativeAvailable: false,
  nativeConfigured: false,
  nativeIdentifiedUserId: "",
  nativeError: "",
};

function defaultSupportDraft() {
  return {
    gameId: "",
    category: "gameplay",
    priority: "P3",
    subject: "",
    description: "",
  };
}

preloadSfx();
preloadMusic();
syncMusic(Boolean(profile.music));

function playSound(effect, options) {
  return playSfx(Boolean(profile.sound), effect, options);
}

function buzz(pattern) {
  if (profile.vibration && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(pattern);
  }
}

// ── LiveOps helpers ─────────────────────────────────────────────────────────
function dateKey(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function grantBooster(key, amount) {
  profile.boosters[key] = (profile.boosters[key] || 0) + amount;
}

// Daily login: returns claim state + which day (1..7) is current.
function dailyLoginStatus() {
  const dl = profile.dailyLogin || { streak: 0, lastClaimDate: null };
  const today = dateKey(0);
  const claimedToday = dl.lastClaimDate === today;
  const streak = dl.streak || 0;
  if (claimedToday) {
    const currentDay = ((streak - 1 + 7) % 7) + 1; // day just claimed (1..7)
    return { canClaim: false, claimDay: currentDay, currentDay, today };
  }
  let base = streak >= 7 ? 0 : streak;                       // finished cycle → restart
  if (dl.lastClaimDate && dl.lastClaimDate !== dateKey(-1)) base = 0; // missed a day → reset
  const claimDay = base + 1;                                 // 1..7
  return { canClaim: true, claimDay, currentDay: claimDay, today };
}

// Daily missions: reset progress at local midnight.
function ensureMissionsToday() {
  const today = dateKey(0);
  if (!profile.missions || profile.missions.date !== today) {
    profile.missions = { date: today, progress: { coins: 0, levels: 0, undo: 0, shuffle: 0, tube: 0 }, claimed: {}, bonusClaimed: false };
    save();
  }
  return profile.missions;
}
function addMissionProgress(key, amount = 1) {
  const m = ensureMissionsToday();
  m.progress[key] = (m.progress[key] || 0) + amount;
  save();
}
function missionDone(def, m) { return (m.progress[def.key] || 0) >= def.target; }
function missionsAllClaimed(m) { return DAILY_MISSIONS.every(d => m.claimed[d.key]); }
function missionsResetCountdown() {
  const now = new Date();
  const midnight = new Date(now); midnight.setHours(24, 0, 0, 0);
  const ms = midnight - now;
  const h = Math.floor(ms / 3600000);
  const mnt = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${String(mnt).padStart(2, "0")}m`;
}

// No-ads entitlement + unlimited-lives (missions bonus) checks.
function noAdsActive() {
  const na = profile.noAds;
  if (!na || !na.active) return false;
  if (na.until && Date.now() > na.until) return false;
  return true;
}
function hasUnlimitedLives() {
  return Boolean(profile.unlimitedLivesUntil && Date.now() < profile.unlimitedLivesUntil);
}

let musicSuppressed = false;
function syncBackgroundMusic() {
  syncMusic(Boolean(profile.music) && !musicSuppressed, { volume: 0.3 });
}

function save() {
  profile.version = STATE_VERSION;
  localStorage.setItem(STORAGE, JSON.stringify(profile));
  // Mirror the profile to Firestore (players/{gameUid}), debounced + best-effort.
  scheduleCloudPush(getKemeSupportConfig().gameUid, () => profile);
}
function setView(next) { if (next === "home") musicSuppressed = false; highlightBoosterKey = null; view = next; modal = null; selected = null; moveAnimating = false; render(); syncBackgroundMusic(); }
function showToast(message) { toast = message; render(); clearTimeout(transitionTimer); transitionTimer = setTimeout(() => { toast = ""; render(); }, 1700); }
function levelData() { return LEVELS[Math.min(profile.level, 100) - 1]; }
function beginLevel() {
  profile = refreshLives(profile);
  completeBonusClaimed = false;
  musicSuppressed = false;
  if (profile.lives <= 0 && !hasUnlimitedLives()) {
    // Out of lives → show the Lives popup (offers +1 life via ad / coin refill)
    // instead of just a toast, so the player can top up and keep playing.
    playSound("invalid", { volume: 0.56 });
    profile = refreshLives(profile);
    save(); modal = "lives"; render(); return;
  }
  const lb = ensureLeaderboardState();
  lb.tries[profile.level] = (lb.tries[profile.level] || 0) + 1;
  levelStartAt = Date.now();
  levelBoosterUsed = false;
  tubes = structuredClone(levelData().tubes); history = []; selected = null; save(); setView("game");
  track("level_start", { level: profile.level });
  const introShown = maybeShowLevelIntro();
  // Interstitial at level start (skipped when a tutorial/unlock popup is up).
  if (!introShown && shouldShowInterstitial(profile.level) && !noAdsActive()) {
    track("interstitial_shown", { level: profile.level });
    playAd("none");
  }
}

// After entering gameplay, surface a first-time onboarding (level 1) or a
// booster-unlock announcement + how-it-works tutorial (levels 9/15/18).
// Returns true when a popup was opened.
function maybeShowLevelIntro() {
  profile.boosterSeen = profile.boosterSeen || {};
  if (profile.level === 1 && !profile.onboarded) {
    modal = "onboarding";
    render();
    return true;
  }
  const key = BOOSTER_ORDER.find(k => Math.max(profile.level, profile.unlocked) >= BOOSTER_UNLOCK[k] && !profile.boosterSeen[k]);
  if (key) {
    boosterIntroKey = key;
    highlightBoosterKey = key;
    modal = "booster-unlock";
    render();
    return true;
  }
  return false;
}

function button(label, cls, action, attrs = "") {
  return `<button class="${cls}" data-action="${action}" ${attrs}>${label}</button>`;
}

// ---- Leaderboard state -----------------------------------------------------

function ensureLeaderboardState() {
  if (!profile.lb) {
    const beatenLevels = Math.max(0, (profile.unlocked || 1) - 1);
    profile.lb = {
      season: getSeasonKey(),
      league: "bronze",
      weekly: { levels: 0, stars: 0, firstTry: 0, noBooster: 0, daily: 0, event: 0 },
      totals: { stars: beatenLevels * 3, levels: beatenLevels },
      tries: {},
      lastRank: null,
      speedTime: null,
      speedDate: null,
      gems: 0,
      cosmetics: { skins: [], badges: [] },
      pendingReward: null,
      seasonIntro: false,
    };
  }
  const lb = profile.lb;
  const currentSeason = getSeasonKey();
  if (lb.season !== currentSeason) {
    // Finalize the season that just ended: rank at end-of-week, rewards,
    // promotion/relegation — then start the new competition fresh.
    const endOfOldWeek = getSeasonEnd(Date.now() - 1) - 1;
    const finalBoard = buildWeeklyBoard({
      seasonKey: lb.season,
      leagueId: lb.league,
      playerEntry: {
        playerName: profile.playerName || defaultPlayerName(),
        avatar: profile.avatar || 0,
        weeklyPoints: computeWeeklyScore(lb.weekly),
        stars: lb.totals.stars,
        totalLevels: lb.totals.levels,
        lastRank: lb.lastRank,
      },
      now: Math.min(endOfOldWeek, Date.now()),
    });
    const finalRank = finalBoard.player.rank;
    const reward = rewardForRank(finalRank, BOARD_SIZE);
    const outcome = leagueOutcome(finalRank, BOARD_SIZE, lb.league);
    lb.pendingReward = (reward || outcome.outcome !== "stayed")
      ? { season: lb.season, rank: finalRank, league: lb.league, reward, outcome: outcome.outcome, newLeague: outcome.league }
      : null;
    lb.league = outcome.league;
    lb.season = currentSeason;
    lb.weekly = { levels: 0, stars: 0, firstTry: 0, noBooster: 0, daily: 0, event: 0 };
    lb.lastRank = null;
    lb.speedTime = null;
    lb.speedDate = null;
    lb.seasonIntro = true;
    save();
  }
  return lb;
}

function leaderboardPlayerEntry(lb) {
  return {
    playerName: profile.playerName || defaultPlayerName(),
    avatar: profile.avatar || 0,
    weeklyPoints: computeWeeklyScore(lb.weekly),
    stars: lb.totals.stars,
    totalLevels: lb.totals.levels,
    lastRank: lb.lastRank,
    speedTime: lb.speedTime,
    speedDate: lb.speedDate,
  };
}

function recordWeeklyWin() {
  const lb = ensureLeaderboardState();
  const seconds = levelStartAt ? Math.max(1, Math.round((Date.now() - levelStartAt) / 100) / 10) : null;
  lb.weekly.levels += 1;
  lb.weekly.stars += 3;
  lb.totals.stars += 3;
  lb.totals.levels += 1;
  if ((lb.tries[profile.level] || 0) <= 1) lb.weekly.firstTry += 1;
  if (!levelBoosterUsed) {
    lb.weekly.noBooster += 1;
    // Speed board counts booster-free clears only.
    if (seconds && (!lb.speedTime || seconds < lb.speedTime)) {
      lb.speedTime = seconds;
      lb.speedDate = Date.now();
    }
  }
  // Publish the fresh score to the live Firestore leaderboard (best-effort).
  pushLeaderboardEntry(getKemeSupportConfig().gameUid, lb.season, lb.league, leaderboardPlayerEntry(lb));
}

function tubeLayoutStyle(index, columnCount, totalTubes) {
  const overlapRatio = 349 / 632;
  const widthPercent = 97 / (1 + (overlapRatio * Math.max(columnCount - 1, 0)));
  const stepPercent = widthPercent * overlapRatio;
  const row = Math.floor(index / columnCount);
  const rowCount = row === 0 ? Math.min(columnCount, totalTubes) : Math.max(0, totalTubes - columnCount);
  const indexInRow = row === 0 ? index : index - columnCount;
  const singleRowTop = totalTubes <= 3 ? 38.8 : 34.6;
  const rowTop = totalTubes <= columnCount ? singleRowTop : row === 0 ? 24.2 : 54.5;
  const rowSpan = widthPercent + (stepPercent * Math.max(rowCount - 1, 0));
  const leftStart = (100 - rowSpan) / 2;
  const left = leftStart + (stepPercent * indexInRow);
  return `--tube-width:${widthPercent.toFixed(3)}%;--tube-left:${left.toFixed(3)}%;--tube-top:${rowTop.toFixed(3)}%;`;
}

function hud(back = false) {
  return `<header class="hud">
    ${back
      ? button('<img class="btn-icon" src="/assets/back-arrow.svg" alt="" />', "icon-button icon-back", "home", 'aria-label="Back"')
      : button('<img class="btn-icon" src="/assets/settings-icon.svg" alt="" />', "icon-button icon-gear", "settings", 'aria-label="Settings"')}
    <button class="pill pill-tap" data-action="lives" aria-label="Open lives"><span>❤</span><span>${profile.lives}/5</span></button>
    <div class="pill"><span class="coin-icon" aria-hidden="true"></span><span>${profile.coins.toLocaleString()}</span></div>
  </header>`;
}

function loadingView() {
  return `<section class="screen loading" aria-label="Loading"></section>`;
}

function homeView() {
  const rewardsUnlocked = profile.level >= 5;
  const missionsUnlocked = profile.level >= 7;
  const featureState = missionsUnlocked ? "features-unlocked" : rewardsUnlocked ? "rewards-unlocked" : "features-locked";
  return `<section class="screen home ${featureState}">
    <div class="home-level-number" aria-label="Current level ${profile.level}"><span class="home-level-number-text">${profile.level}</span></div>
    <div class="home-life-value" aria-label="${hasUnlimitedLives() ? "unlimited lives" : `${profile.lives} of 5 lives`}"><span class="home-pill-text">${hasUnlimitedLives() ? "∞" : `${profile.lives}/5`}</span></div>
    <div class="home-coin-value"><span class="home-pill-text">${profile.coins.toLocaleString()}</span></div>
    ${button("Menu", "hotspot home-menu", "menu")}
    ${button("Settings", "hotspot home-settings", "settings")}
    ${button("Lives", "hotspot home-lives", "lives", 'aria-label="Open lives"')}
    ${button("Coins", "hotspot home-coins", "store", 'aria-label="Open coin store"')}
    ${button("Rewards", "hotspot home-rewards", rewardsUnlocked ? "rewards" : "locked-rewards", `aria-label="${rewardsUnlocked ? "Open Daily Rewards" : "Daily Rewards unlock at level 5"}"`)}
    ${button("Missions", "hotspot home-missions", missionsUnlocked ? "missions" : "locked-missions", `aria-label="${missionsUnlocked ? "Open Daily Missions" : "Daily Missions unlock at level 7"}"`)}
    ${rewardsUnlocked ? '<img class="home-feature-art home-rewards-art" src="/assets/daily-rewards-unlocked.png" alt="" />' : ""}
    ${missionsUnlocked ? '<img class="home-feature-art home-missions-art" src="/assets/daily-missions-unlocked.png" alt="" />' : ""}
    ${noAdsActive() ? "" : button('<img class="home-noads-art" src="/assets/no-ads-bundle.png" alt="" />', "home-noads-fab", "noads", 'aria-label="Open No-Ads Bundle"')}
    ${button('<img class="home-play-art" src="/assets/home-play-button.png" alt="" />', "hotspot home-play", "play", 'aria-label="Play level"')}
    ${button("Home", "hotspot home-current", "home")}
    ${button("Store", "hotspot home-store", "store")}
    ${button(`Leaderboard${profile.lb?.pendingReward ? '<span class="home-lb-badge" aria-label="Leaderboard rewards available">!</span>' : ""}`, "hotspot home-leaderboard", "leaderboard")}
  </section>`;
}

function marble(color) {
  const src = MARBLE_ASSETS[color] || MARBLE_ASSETS.blue;
  return `<span class="marble ${color}" aria-label="${color} marble"><img class="marble-art" src="${src}" alt="" /></span>`;
}
function gameView() {
  const columnCount = tubes.length <= 3 ? tubes.length : tubes.length === 5 ? 5 : tubes.length <= 8 ? 4 : tubes.length <= 10 ? 5 : 6;
  const renderedTubes = tubes.map((tube, i) => {
    const complete = isTubeComplete(tube);
    const valid = selected !== null && canMove(tubes, selected, i);
    return `<button class="game-tube ${complete ? "complete" : ""} ${selected === i ? "selected" : ""} ${valid ? "valid-target" : ""}" style="${tubeLayoutStyle(i, columnCount, tubes.length)}" data-action="tube" data-index="${i}" aria-label="Tube ${i + 1}, ${complete ? "completed and sealed" : `${tube.length} marbles`}"><span class="game-tube-marbles">${tube.map(marble).join("")}</span>${complete ? `<span class="game-tube-complete-cap" aria-hidden="true"></span>` : ""}</button>`;
  }).join("");
  return `<section class="screen gameplay">
    <header class="gameplay-hud">
      <div class="gameplay-coins" aria-label="${profile.coins.toLocaleString()} coins">
        <img class="gameplay-coin-bar" src="/assets/coin-bar.png" alt="" />
        <img class="gameplay-coin" src="/assets/coin.png" alt="" />
        <span><span class="gameplay-coin-value">${profile.coins.toLocaleString()}</span></span>
      </div>
      ${button('<img src="/assets/settings-icon.svg" alt="" />', "gameplay-settings", "settings", 'aria-label="Settings"')}
    </header>
    <div class="gameplay-level" aria-label="Current level ${profile.level}">
      <img src="/assets/game-level-holder.png" alt="" />
      <span class="gameplay-level-value"><span class="gameplay-level-text">LEVEL ${profile.level}</span></span>
    </div>
    <div class="gameplay-tube-board" style="--tube-columns:${columnCount}">${renderedTubes}</div>
    <nav class="gameplay-boosters" aria-label="Boosters">
      ${boosterButton("undo", "undo")}
      ${boosterButton("shuffle", "shuffle")}
      ${boosterButton("tube", "add-tube")}
    </nav>
  </section>`;
}

function boosterButton(key, action) {
  const meta = BOOSTER_META[key];
  if (!boosterUnlocked(key)) {
    return `<button class="gameplay-booster is-locked" data-action="booster-locked" data-key="${key}" aria-label="${meta.name} unlocks at level ${boosterUnlockLevel(key)}">
      <span class="booster-lock-tile" aria-hidden="true"><span class="booster-lock">🔒</span></span>
      <span class="booster-lock-lv">LV ${boosterUnlockLevel(key)}</span>
    </button>`;
  }
  const count = profile.boosters[key];
  const badge = count > 0
    ? `<small>${count}</small>`
    : `<small class="booster-cost"><span class="coin-icon"></span>${BOOSTER_COST[key]}</small>`;
  const cls = `gameplay-booster${key === highlightBoosterKey ? " is-new" : ""}`;
  return button(`<img src="${meta.icon}" alt="" />${badge}`, cls, action, `aria-label="${meta.name}${count > 0 ? "" : `, costs ${BOOSTER_COST[key]} coins`}"`);
}

// Consume one owned booster, or pay its coin cost if none are owned.
// Returns true if the booster may be applied, false if the player was blocked.
function spendBooster(key) {
  if (profile.boosters[key] > 0) {
    profile.boosters[key] -= 1;
    track("booster_used", { booster: key, source: "inventory", level: profile.level, remaining: profile.boosters[key] });
    addMissionProgress(key, 1);
    return true;
  }
  const cost = BOOSTER_COST[key];
  if (profile.coins >= cost) {
    profile = addCoins(profile, -cost);
    track("booster_used", { booster: key, source: "coins", level: profile.level, price: cost });
    addMissionProgress(key, 1);
    return true;
  }
  // No inventory and not enough coins → on a device, offer a rewarded ad to
  // earn one free use (extra-tube / undo / shuffle AdMob rewarded units).
  if (hasNativeAds()) {
    const adFor = { undo: showRewardedUndoAd, shuffle: showRewardedShuffleAd, tube: showRewardedExtraTubeAd };
    const run = adFor[key];
    if (run) {
      showToast(`Watch an ad for a free ${BOOSTER_META[key].name}`);
      run().then((earned) => {
        if (!earned) return;
        profile.boosters[key] = (profile.boosters[key] || 0) + 1;
        save();
        render();
        playSound("reward", { volume: 0.8 });
        showToast(`Free ${BOOSTER_META[key].name} earned — tap it again to use`);
      });
      return false;
    }
  }
  playSound("invalid", { volume: 0.55 });
  buzz(50);
  showToast(`Not enough coins — ${BOOSTER_META[key].name} costs ${cost}`);
  return false;
}

const STORE_BOOSTERS = [
  { key: "undo", name: "UNDO", icon: "/assets/booster-undo.png", price: 120, desc: "Take back your last move" },
  { key: "shuffle", name: "SHUFFLE", icon: "/assets/booster-shuffle.png", price: 180, desc: "Remix every marble on the board" },
  { key: "tube", name: "EXTRA TUBE", icon: "/assets/booster-add-tube.png", price: 240, desc: "Drop in an empty tube" },
];
const LIVES_REFILL_PRICE = 900;
const STORE_BUNDLES = [
  { key: "starter", product: "starter_bundle", name: "STARTER BUNDLE", coins: 5000, lives: "2 HOURS", boosters: 10, price: "$2.99", theme: "purple" },
  { key: "pro", product: "pro_bundle", name: "PRO BUNDLE", coins: 20000, lives: "12 HOURS", boosters: 25, price: "$6.99", theme: "blue", badge: "BEST VALUE" },
  { key: "legend", product: "legend_bundle", name: "LEGEND BUNDLE", coins: 50000, lives: "24 HOURS", boosters: 50, price: "$12.99", theme: "orange" },
];
const STORE_COIN_PACKS = [
  { product: "coin_pack_1", coins: 2500, price: "$1.99", extra: null, pile: 1 },
  { product: "coin_pack_2", coins: 6500, price: "$4.99", extra: "10%", pile: 2 },
  { product: "coin_pack_3", coins: 15000, price: "$9.99", extra: "20%", pile: 2 },
  { product: "coin_pack_4", coins: 35000, price: "$19.99", extra: "30%", pile: 3 },
  { product: "coin_pack_5", coins: 75000, price: "$39.99", extra: "40%", pile: 3 },
  { product: "coin_pack_6", coins: 160000, price: "$69.99", extra: "50%", pile: 3 },
];

// Localized Play price for a product, falling back to the catalog price.
function priceFor(productId, fallback) {
  const p = billing.getPrice(productId);
  return p || fallback || "";
}

// ── Billing: apply granted rewards + reconcile durable entitlements ──────────
function applyPurchaseGrant(productId, product) {
  const g = (product && product.grant) || {};
  if (g.coins) profile = addCoins(profile, g.coins);
  if (g.boostersEach) {
    profile.boosters.undo = (profile.boosters.undo || 0) + g.boostersEach;
    profile.boosters.shuffle = (profile.boosters.shuffle || 0) + g.boostersEach;
    profile.boosters.tube = (profile.boosters.tube || 0) + g.boostersEach;
  }
  if (g.unlimitedLivesMs) {
    profile.unlimitedLivesUntil = Math.max(profile.unlimitedLivesUntil || 0, Date.now() + g.unlimitedLivesMs);
    profile.lives = MAX_LIVES;
  }
  if (g.noAds === "lifetime") profile.noAds = { active: true, until: null };
  else if (g.noAds === "subscription") profile.noAds = { active: true, until: null, subscription: true };
  save();
  render();
}

// After a Play restore: drop a subscription-based no-ads entitlement once the
// subscription lapses (unless a lifetime purchase also exists).
function reconcileNoAds({ subscriptionActive, lifetimeOwned } = {}) {
  if (profile.noAds && profile.noAds.subscription && !subscriptionActive && !lifetimeOwned) {
    profile.noAds = { active: false, until: null };
    save();
    render();
  }
}

function handleBillingEvent(type, payload) {
  if (type === "purchased") { playSound("reward", { volume: 0.85, rate: 1.04 }); buzz(70); showToast("Purchase complete — thank you!"); }
  else if (type === "pending") showToast("Purchase pending approval…");
  else if (type === "cancelled") showToast("Purchase cancelled");
  else if (type === "unavailable") showToast("Store isn't available right now");
  else if (type === "restore-done") showToast(payload?.count ? `Restored ${payload.count} purchase(s)` : "No purchases to restore");
  else if (type === "error") showToast("Purchase failed — please try again");
}

function initBilling() {
  billing.init({
    onGrant: applyPurchaseGrant,
    onEvent: handleBillingEvent,
    onPricesLoaded: () => { if (view === "store" || modal === "noads") render(); },
    onRestoreComplete: reconcileNoAds,
  });
}

function storeBundleCard(bundle) {
  const boosterTile = icon => `<span class="st-booster-tile"><img src="${icon}" alt="" /><small>x${bundle.boosters}</small></span>`;
  return `<article class="st-bundle st-bundle-${bundle.theme}">
    ${bundle.badge ? `<span class="st-corner-badge">${bundle.badge}</span>` : ""}
    <h3>${bundle.name}</h3>
    <div class="st-bundle-row">
      <div class="st-bundle-coins">
        <span class="st-pile" aria-hidden="true"><span class="coin-icon"></span><span class="coin-icon"></span><span class="coin-icon"></span></span>
        <strong>${bundle.coins.toLocaleString()}</strong>
      </div>
      <div class="st-perks">
        <span class="st-perk"><span class="st-perk-ico" aria-hidden="true">🚫</span>NO ADS</span>
        <span class="st-perk"><span class="st-perk-ico" aria-hidden="true">❤</span>UNLIMITED LIVES <em>${bundle.lives}</em></span>
      </div>
      <div class="st-bundle-boosters" aria-label="${bundle.boosters} of each booster">
        ${boosterTile("/assets/booster-undo.png")}${boosterTile("/assets/booster-shuffle.png")}${boosterTile("/assets/booster-add-tube.png")}
      </div>
      ${button(priceFor(bundle.product, bundle.price), "st-price", "buy-product", `data-product="${bundle.product}" aria-label="Buy ${bundle.name}"`)}
    </div>
  </article>`;
}

function storeCoinCard(pack) {
  const pileCoins = Array.from({ length: pack.pile + 2 }, () => `<span class="coin-icon"></span>`).join("");
  return `<article class="st-coin-card">
    ${pack.extra ? `<span class="st-extra-badge">${pack.extra}<small>EXTRA</small></span>` : ""}
    <strong class="st-coin-amount">${pack.coins.toLocaleString()}</strong>
    <span class="st-pile st-pile-grid" aria-hidden="true">${pileCoins}</span>
    ${button(priceFor(pack.product, pack.price), "st-price", "buy-product", `data-product="${pack.product}" aria-label="Buy ${pack.coins.toLocaleString()} coins"`)}
  </article>`;
}

function storeView() {
  const boosterCards = STORE_BOOSTERS.map(item => `<article class="st-item">
      <span class="st-item-art"><img src="${item.icon}" alt="" /></span>
      <span class="st-item-info"><strong>${item.name}</strong><small>Owned: ${profile.boosters[item.key]}</small></span>
      ${button(`<span class="coin-icon"></span>${item.price}`, "st-price st-price-coin", "buy-booster", `data-key="${item.key}" aria-label="Buy ${item.name} for ${item.price} coins"`)}
    </article>`).join("");
  return `<section class="screen st-screen">
    <header class="st-header">
      ${button('<img class="btn-icon" src="/assets/back-arrow.svg" alt="" />', "icon-button icon-back st-back", "home", 'aria-label="Back"')}
      <div class="st-balance"><span class="coin-icon"></span><strong>${profile.coins.toLocaleString()}</strong><span class="st-plus" aria-hidden="true">＋</span></div>
    </header>
    <div class="st-awning">
      <div class="st-awning-strip"></div>
      <div class="st-scallops"></div>
      <div class="st-title">STORE</div>
    </div>
    <div class="st-ribbon st-ribbon-purple">BUNDLES</div>
    <div class="st-bundles">${STORE_BUNDLES.map(storeBundleCard).join("")}</div>
    <div class="st-ribbon st-ribbon-blue">COINS</div>
    <div class="st-coin-grid">${STORE_COIN_PACKS.map(storeCoinCard).join("")}</div>
    <div class="st-ribbon st-ribbon-blue">BOOSTERS</div>
    <div class="st-items">${boosterCards}</div>
    ${button("↻ Restore Purchases", "st-restore", "restore-purchases", 'aria-label="Restore previous purchases"')}
    <p class="st-footer"><span aria-hidden="true">ℹ</span> All purchases remove ads and support the development of the game.</p>
  </section>`;
}

// ---- Leaderboard UI --------------------------------------------------------

const LB_TABS = [
  { id: "weekly", label: "WEEKLY", icon: "📅" },
  { id: "stars", label: "STARS", icon: "⭐" },
  { id: "speed", label: "SPEED", icon: "⏱" },
  { id: "events", label: "EVENTS", icon: "🎉" },
];

function lbAvatar(entry, extra = "") {
  if (entry.isPlayer) {
    return `<span class="lb-avatar lb-avatar-you ${extra}" aria-hidden="true">${AVATARS[(profile.avatar || 0) % AVATARS.length]}</span>`;
  }
  if (entry.real) {
    return `<span class="lb-avatar lb-avatar-real ${extra}" aria-hidden="true">${AVATARS[(entry.avatar || 0) % AVATARS.length]}</span>`;
  }
  return `<span class="lb-avatar ${extra}" aria-hidden="true"><img src="/assets/ball-${entry.avatar}.svg" alt="" /></span>`;
}

function lbMovement(entry) {
  const movement = entry.movement || 0;
  if (movement > 0) return `<span class="lb-move lb-move-up" aria-label="Moved up ${movement}">▲${movement}</span>`;
  if (movement < 0) return `<span class="lb-move lb-move-down" aria-label="Moved down ${-movement}">▼${-movement}</span>`;
  return `<span class="lb-move lb-move-flat" aria-hidden="true">—</span>`;
}

function lbValue(entry) {
  if (lbTab === "stars") return `<span class="lb-points">⭐ ${entry.stars.toLocaleString()}</span>`;
  if (lbTab === "speed") return `<span class="lb-points lb-time">⏱ ${formatSpeedTime(entry.speedTime)}</span>`;
  return `<span class="lb-points">⭐ ${entry.weeklyPoints.toLocaleString()}</span>`;
}

function lbSub(entry) {
  if (lbTab === "stars") return `<small>${entry.totalLevels.toLocaleString()} levels</small>`;
  if (lbTab === "speed") return `<small>${new Date(entry.speedDate).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</small>`;
  return `<small>${getLeague(entry.league).badge} ${getLeague(entry.league).name}</small>`;
}

function lbRow(entry, index) {
  return `<div class="lb-row ${entry.isPlayer ? "lb-row-you" : ""}" style="--i:${index}">
    <span class="lb-rank">${entry.rank}</span>
    ${lbAvatar(entry)}
    <span class="lb-name"><strong>${entry.isPlayer ? "You" : escapeHtml(entry.playerName)}</strong>${lbSub(entry)}</span>
    ${lbTab === "weekly" ? lbMovement(entry) : ""}
    ${lbValue(entry)}
  </div>`;
}

function lbPodium(entries) {
  const [first, second, third] = entries;
  const seat = (entry, place) => entry ? `<div class="lb-seat lb-seat-${place}">
      <span class="lb-medal lb-medal-${place}">${place}</span>
      ${place === 1 ? `<span class="lb-crown" aria-hidden="true">👑</span>` : ""}
      ${lbAvatar(entry, "lb-avatar-podium")}
      <div class="lb-pedestal">
        <strong>${entry.isPlayer ? "You" : escapeHtml(entry.playerName)}</strong>
        <span class="lb-podium-points">⭐ ${(lbTab === "stars" ? entry.stars : entry.weeklyPoints).toLocaleString()}</span>
      </div>
    </div>` : "";
  return `<div class="lb-podium">${seat(second, 2)}${seat(first, 1)}${seat(third, 3)}</div>`;
}

function lbPinnedYou(player) {
  if (!player) return "";
  return `<div class="lb-row lb-row-you lb-row-pinned">
    <span class="lb-rank">${player.rank}</span>
    ${lbAvatar(player)}
    <span class="lb-name"><strong>You</strong>${lbSub(player)}</span>
    ${lbTab === "weekly" ? lbMovement(player) : ""}
    ${lbValue(player)}
  </div>`;
}

function lbEmptyState(iconGlyph, title, sub) {
  return `<div class="lb-empty">
    <span class="lb-empty-icon" aria-hidden="true">${iconGlyph}</span>
    <h3>${title}</h3>
    <p>${sub}</p>
  </div>`;
}

function lbRealEntries(lb) {
  return lbRealCache.key === `${lb.season}/${lb.league}` ? lbRealCache.entries : [];
}

async function refreshLeaderboardData(lb) {
  const key = `${lb.season}/${lb.league}`;
  if (lbRealCache.key === key && Date.now() - lbRealCache.at < 60000) return;
  // publish our own current entry first so other players see fresh data too
  pushLeaderboardEntry(getKemeSupportConfig().gameUid, lb.season, lb.league, leaderboardPlayerEntry(lb));
  const entries = await fetchLeaderboardEntries(lb.season, lb.league);
  lbRealCache = { key, entries, at: Date.now() };
  if (view === "leaderboard") render();
}

function leaderboardView() {
  const lb = ensureLeaderboardState();
  const now = Date.now();
  const playerEntry = leaderboardPlayerEntry(lb);
  const league = getLeague(lb.league);
  const realEntries = lbRealEntries(lb);
  const playerId = getKemeSupportConfig().gameUid;
  let board = null;
  if (lbTab === "weekly") board = buildWeeklyBoard({ seasonKey: lb.season, leagueId: lb.league, playerEntry, realEntries, playerId, now });
  else if (lbTab === "stars") board = buildStarsBoard({ seasonKey: lb.season, leagueId: lb.league, playerEntry, realEntries, playerId });
  else if (lbTab === "speed") board = buildSpeedBoard({ seasonKey: lb.season, leagueId: lb.league, playerEntry, realEntries, playerId, now });

  const tabs = LB_TABS.map(tab => `<button class="lb-tab ${lbTab === tab.id ? "is-active" : ""}" data-action="lb-tab" data-tab="${tab.id}"><span aria-hidden="true">${tab.icon}</span>${tab.label}</button>`).join("");

  let content = "";
  if (lbTab === "events") {
    content = lbEmptyState("🏆", "No event is currently running", "Come back soon — special competitions with big rewards land here.");
  } else if (lbTab === "speed" && !board.player && !board.entries.length) {
    content = lbEmptyState("⏱", "No times yet", "Finish a level without boosters to set your first time.");
  } else {
    const podium = (lbTab === "weekly" || lbTab === "stars") ? lbPodium(board.entries.slice(0, 3)) : "";
    const listStart = podium ? 3 : 0;
    const visible = board.entries.slice(listStart, lbVisibleCount);
    const rows = visible.map((entry, index) => lbRow(entry, index)).join("");
    const more = board.entries.length > lbVisibleCount
      ? button("SHOW MORE", "lb-more", "lb-more", `aria-label="Show more players"`)
      : "";
    const speedHint = lbTab === "speed" && !board.player
      ? `<p class="lb-hint">Finish a level without boosters to place your best time on the board.</p>`
      : "";
    const pinned = board.player && board.player.rank > lbVisibleCount ? lbPinnedYou(board.player) : "";
    content = `${podium}<div class="lb-list">${rows}</div>${speedHint}${more}${pinned}`;
  }

  const playerRank = board?.player?.rank ?? null;
  const playerPoints = lbTab === "stars" ? playerEntry.stars : playerEntry.weeklyPoints;
  return `<section class="screen lb-screen">
    <span class="lb-orb lb-orb-1" aria-hidden="true"></span>
    <span class="lb-orb lb-orb-2" aria-hidden="true"></span>
    <span class="lb-orb lb-orb-3" aria-hidden="true"></span>
    ${button("", "popup-close lb-close", "home", 'aria-label="Back to home"')}
    <header class="lb-header">
      <span class="lb-crown-top" aria-hidden="true">👑</span>
      <div class="lb-banner"><span aria-hidden="true" class="lb-laurel">🌿</span><h1>LEADERBOARD</h1><span aria-hidden="true" class="lb-laurel lb-laurel-right">🌿</span></div>
    </header>
    <div class="lb-status">
      <span class="lb-league-chip">${league.badge} ${league.name} League</span>
      <span class="lb-status-stat">Rank ${playerRank ? `#${playerRank}` : "—"}</span>
      <span class="lb-status-stat">${playerPoints.toLocaleString()} pts</span>
      ${button("i", "lb-info-btn", "lb-info", 'aria-label="How rankings work"')}
    </div>
    <div class="lb-countdown"><span aria-hidden="true">⏱</span> Season ends in: <strong class="lb-countdown-value">${formatSeasonCountdown(getSeasonEnd(now) - now)}</strong></div>
    <nav class="lb-tabs" aria-label="Leaderboard tabs">${tabs}</nav>
    <div class="lb-panel">${content}</div>
    <p class="lb-footer"><span aria-hidden="true">ℹ</span> New leaderboard every week!</p>
  </section>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatSupportDate(value) {
  if (!value) return "Just now";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Just now" : date.toLocaleDateString();
}

function supportErrorMessage(message) {
  if (!message) return "";
  if (message.includes("No player found with that Game ID")) {
    return `${message}. Add this Player Game ID to Keme, then reopen support.`;
  }
  return message;
}

function getRoutedSupportGames(games, config) {
  if (!config.preferredGameId) {
    return {
      games,
      routeError: "",
    };
  }

  const routedGame = games.find(game => game.id === config.preferredGameId);
  if (!routedGame) {
    return {
      games: [],
      routeError: `Keme connected, but Marble Sort (${config.preferredGameId}) is not available for ticket routing yet.`,
    };
  }

  return {
    games: [routedGame],
    routeError: "",
  };
}

function canSubmitSupport() {
  return Boolean(
    supportState.profile &&
    supportState.token &&
    supportDraft.gameId &&
    supportDraft.subject.trim().length >= 5 &&
    supportDraft.description.trim().length >= 10 &&
    !supportState.loading &&
    !supportState.submitting
  );
}

async function refreshSupportData({ keepSuccess = false } = {}) {
  const config = getKemeSupportConfig();

  if (!config.portalBaseUrl) {
    supportState = {
      ...supportState,
      loading: false,
      submitting: false,
      token: "",
      profile: null,
      games: [],
      tickets: [],
      error: "Add portalBaseUrl to /keme-support-config.js to connect Marble Sort to your Keme portal.",
      success: keepSuccess ? supportState.success : "",
    };
    render();
    return;
  }

  supportState = {
    ...supportState,
    loading: true,
    error: "",
    success: keepSuccess ? supportState.success : "",
  };
  render();

  try {
    const login = await loginPortal(config);
    const games = await loadPortalGames(config, login.token);
    const tickets = await loadPortalTickets(config, login.token);
    const { games: routedGames, routeError } = getRoutedSupportGames(games, config);

    if (!supportDraft.gameId || !routedGames.some(game => game.id === supportDraft.gameId)) {
      supportDraft.gameId = routedGames[0]?.id ?? "";
    }

    supportState = {
      ...supportState,
      loading: false,
      submitting: false,
      token: login.token,
      profile: login.player,
      games: routedGames,
      tickets,
      error: routeError || (routedGames.length ? "" : "Keme is connected, but there are no active games available for ticket routing yet."),
    };
  } catch (error) {
    supportState = {
      ...supportState,
      loading: false,
      submitting: false,
      token: "",
      profile: null,
      games: [],
      tickets: [],
      error: supportErrorMessage(error instanceof Error ? error.message : "Keme support is unavailable right now."),
    };
  }

  render();
}

async function submitSupportTicket() {
  if (supportState.submitting) return;
  // Validate on click (the button is always enabled) so a tap always does
  // something — a re-render on every keystroke would steal input focus.
  const subject = supportDraft.subject.trim();
  const description = supportDraft.description.trim();
  if (subject.length < 5) { playSound("invalid", { volume: 0.5 }); return showToast("Please add a subject (5+ characters)"); }
  if (description.length < 10) { playSound("invalid", { volume: 0.5 }); return showToast("Please add more detail (10+ characters)"); }
  if (!supportState.token || !supportState.profile) {
    playSound("invalid", { volume: 0.5 });
    showToast("Connecting to support — try Send again in a moment");
    refreshSupportData();
    return;
  }
  // Route to the configured game even if the games list didn't populate.
  if (!supportDraft.gameId) supportDraft.gameId = getKemeSupportConfig().preferredGameId || "";

  playSound("uiTap", { volume: 0.56 });
  supportState = {
    ...supportState,
    submitting: true,
    error: "",
    success: "",
  };
  render();

  try {
    const config = getKemeSupportConfig();
    const ticket = await createPortalTicket(config, supportState.token, supportDraft);

    supportDraft = {
      ...defaultSupportDraft(),
      gameId: supportDraft.gameId,
    };
    supportState = {
      ...supportState,
      submitting: false,
      success: `Ticket ${ticket.id} was created in Keme.`,
    };

    await refreshSupportData({ keepSuccess: true });
  } catch (error) {
    supportState = {
      ...supportState,
      submitting: false,
      error: supportErrorMessage(error instanceof Error ? error.message : "Unable to send the ticket to Keme."),
    };
    render();
  }
}

async function refreshNativeSupportState() {
  let status = await getNativeSupportStatus();
  let nativeError = status.lastError || "";

  if (status.available && status.configured) {
    const config = getKemeSupportConfig();
    const identified = await identifyNativeSupportUser({
      userId: config.gameUid,
      displayName: `Player ${config.gameUid.slice(-6).toUpperCase()}`,
      email: "",
      metadata: {
        level: String(profile.level),
        unlockedLevel: String(profile.unlocked),
        lives: String(profile.lives),
        platform: "android",
      },
    });

    if (identified.error) {
      nativeError = identified.error;
    }

    status = await getNativeSupportStatus();
  }

  supportState = {
    ...supportState,
    nativeAvailable: Boolean(status.available),
    nativeConfigured: Boolean(status.configured),
    nativeIdentifiedUserId: status.identifiedUserId || "",
    nativeError: nativeError || status.lastError || "",
  };
  render();
}

async function launchNativeSupport() {
  try {
    const opened = await openNativeSupportCenter();
    if (!opened) {
      showToast("This APK does not include the native Keme support bridge yet.");
      return;
    }
    modal = null;
    render();
    showToast("Opened Keme support");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Unable to open native Keme support");
  }
}

function completeModalMarkup() {
  const confetti = Array.from({ length: 12 }, (_, i) => `<span class="winpop-confetti confetti-${i + 1}" aria-hidden="true"></span>`).join("");
  const pileCoins = Array.from({ length: 7 }, (_, i) => `<span class="coin-icon pile-coin pile-coin-${i + 1}"></span>`).join("");
  return `<div class="modal-backdrop complete-backdrop">${confetti}
    <div class="winpop" role="dialog" aria-modal="true" aria-label="Level complete rewards">
      <div class="winpop-stars" aria-hidden="true">
        <span class="winpop-star winpop-star-left" style="--star-delay:140ms"><img src="/assets/complete-star.png" alt="" /></span>
        <span class="winpop-star winpop-star-center" style="--star-delay:0ms"><img src="/assets/complete-star.png" alt="" /></span>
        <span class="winpop-star winpop-star-right" style="--star-delay:280ms"><img src="/assets/complete-star.png" alt="" /></span>
      </div>
      <div class="winpop-ribbon"><span>LEVEL COMPLETE!</span></div>
      <div class="winpop-card">
        <p class="winpop-youwon"><span class="winpop-leaf" aria-hidden="true">❧</span>YOU WON!<span class="winpop-leaf winpop-leaf-right" aria-hidden="true">❧</span></p>
        <div class="winpop-pile" aria-hidden="true">${pileCoins}</div>
        <div class="winpop-earned">
          <span class="winpop-earned-label">COINS EARNED</span>
          <span class="winpop-earned-value"><span class="coin-icon"></span>${WIN_REWARD_COINS}</span>
        </div>
        ${completeBonusClaimed
          ? `<button class="winpop-ad is-claimed" disabled aria-label="${COMPLETE_BONUS_COINS} bonus coins already claimed"><span class="winpop-ad-icon" aria-hidden="true">🎬</span><span class="winpop-ad-text">BONUS CLAIMED</span><span class="winpop-ad-amount">✓</span></button>`
          : button(`<span class="winpop-ad-icon" aria-hidden="true">🎬</span><span class="winpop-ad-text">WATCH AN AD<small>GET EXTRA</small></span><span class="winpop-ad-amount">+${COMPLETE_BONUS_COINS}<span class="coin-icon"></span></span>`, "winpop-ad", "complete-ad-bonus", `aria-label="Watch an ad to get ${COMPLETE_BONUS_COINS} extra coins"`)}
        <div class="winpop-actions">
          ${button(`<span aria-hidden="true">🏠</span> HOME`, "winpop-btn winpop-home", "complete-home")}
          ${button(`NEXT <span aria-hidden="true">»</span>`, "winpop-btn winpop-next", "next")}
        </div>
      </div>
    </div>
  </div>`;
}

// Hosted legal pages (kemegames.com) — also the URLs to paste into any SDK /
// store console that asks for a Privacy Policy or Terms URL.
const LEGAL_URLS = {
  privacy: "https://kemegames.com/legal/marble-sort/privacy-policy",
  privacyAr: "https://kemegames.com/legal/marble-sort/privacy-policy-ar",
  terms: "https://kemegames.com/legal/marble-sort/terms",
  termsAr: "https://kemegames.com/legal/marble-sort/terms-ar",
};

const MENU_DOCS = {
  terms: {
    title: "TERMS & CONDITIONS",
    body: [
      "Marble Sort & Match is published by Keme Games. By playing, you agree to use the game for personal, non-commercial entertainment.",
      "Coins, lives and boosters are virtual items with no real-world value. They cannot be exchanged, refunded or transferred between players or devices.",
      "We may update, change or discontinue features at any time to keep the game fun, fair and secure. Cheating, exploiting bugs or disrupting other players may result in loss of progress.",
      "These terms may be updated from time to time. Continuing to play after an update means you accept the latest version.",
    ],
  },
  privacy: {
    title: "PRIVACY POLICY",
    body: [
      "Your progress (levels, coins, lives, boosters and settings) is stored locally on your device. We do not sell your data.",
      "A random Player ID is generated on first launch. It contains no personal information and is only used to link your support tickets to this installation.",
      "If you contact customer support, the details you submit (subject, description and your Player ID) are sent to Keme's support platform so our team can help you.",
      "No advertising identifiers, contacts, location or other personal data are collected by the game.",
    ],
  },
  deletion: {
    title: "DELETION POLICY",
    body: [
      "All game progress lives on your device. Uninstalling the app, or clearing its storage from your device settings, permanently deletes your local progress and settings.",
      "To delete support data linked to your Player ID, send a request from the Support screen (or quote the Player ID shown in this menu) and Keme's team will remove your tickets and profile from the support platform.",
      "Deletion requests are processed within 30 days. Once deleted, progress and support history cannot be recovered.",
    ],
  },
};

function formatPlayerId(gameUid) {
  const clean = gameUid.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const tail = clean.slice(-12).padStart(12, "0");
  return `KMG-${tail.slice(0, 4)}-${tail.slice(4, 8)}-${tail.slice(8, 12)}`;
}

function defaultPlayerName() {
  const config = getKemeSupportConfig();
  const suffix = config.gameUid.replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase();
  return `Player${suffix}`;
}

function toggleMarkup(label, action, on) {
  return `<button class="toggle ${on ? "on" : "off"}" data-action="${action}" role="switch" aria-checked="${on}" aria-label="Turn ${label.toLowerCase()} ${on ? "off" : "on"}"><span class="toggle-text">${on ? "ON" : "OFF"}</span><span class="toggle-knob"></span></button>`;
}

function settingsModalMarkup() {
  const row = (icon, label, action, on) => `<div class="popup-row">
      <span class="popup-row-icon" aria-hidden="true">${icon}</span>
      <span class="popup-row-label">${label}</span>
      ${toggleMarkup(label, action, on)}
    </div>`;
  return `<div class="modal-backdrop"><div class="popup settings-popup" role="dialog" aria-modal="true" aria-label="Settings">
    <span class="popup-corner-icon" aria-hidden="true">${icon("gear")}</span>
    <div class="popup-ribbon">SETTINGS</div>
    ${button("", "popup-close", "close-modal", 'aria-label="Close settings"')}
    <div class="popup-body">
      ${row(icon("music"), "MUSIC", "toggle-music", Boolean(profile.music))}
      ${row(icon("sound"), "SOUNDS", "toggle-sound", Boolean(profile.sound))}
      ${row(icon("vibration"), "VIBRATION", "toggle-vibration", Boolean(profile.vibration))}
      <div class="popup-footer">
        ${view === "game" ? button("HOME", "popup-ok popup-ok-secondary", "home") : ""}
        ${button("OK", "popup-ok", "close-modal")}
      </div>
    </div>
  </div></div>`;
}

function menuModalMarkup() {
  const config = getKemeSupportConfig();
  const name = profile.playerName || defaultPlayerName();
  const avatar = AVATARS[(profile.avatar || 0) % AVATARS.length];
  const nameContent = menuNameEditing
    ? `<input class="menu-name-input" data-menu-name maxlength="18" value="${escapeHtml(name)}" aria-label="Player name" />`
    : `<strong>${escapeHtml(name)}</strong>`;
  // Terms & Privacy open the hosted pages on kemegames.com; Deletion stays in-game.
  const link = (doc, tile, tileIcon, label) => `<button class="menu-link" data-action="menu-doc" data-doc="${doc}">
      <span class="menu-tile ${tile}" aria-hidden="true">${tileIcon}</span><span>${label}</span><span class="menu-chevron" aria-hidden="true">›</span>
    </button>`;
  const linkUrl = (url, tile, tileIcon, label) => `<button class="menu-link" data-action="legal-online" data-url="${url}">
      <span class="menu-tile ${tile}" aria-hidden="true">${tileIcon}</span><span>${label}</span><span class="menu-chevron" aria-hidden="true">↗</span>
    </button>`;
  return `<div class="modal-backdrop"><div class="popup menu-popup" role="dialog" aria-modal="true" aria-label="Menu">
    <div class="popup-ribbon">MENU</div>
    ${button("", "popup-close", "close-modal", 'aria-label="Close menu"')}
    <div class="popup-body">
      <div class="menu-profile">
        <button class="menu-avatar" data-action="menu-avatar" aria-label="Change avatar"><span aria-hidden="true">${avatar}</span><span class="menu-avatar-cam" aria-hidden="true">${icon("camera")}</span></button>
        <div class="menu-profile-info">
          <div class="menu-name-row">${nameContent}${button(icon("pencil"), "menu-edit", "menu-edit-name", `aria-label="${menuNameEditing ? "Save player name" : "Edit player name"}"`)}</div>
          <p class="menu-hint">Tap the avatar to change it</p>
        </div>
      </div>
      ${linkUrl(LEGAL_URLS.terms, "tile-purple", icon("doc"), "TERMS & CONDITIONS")}
      ${linkUrl(LEGAL_URLS.privacy, "tile-green", icon("shield"), "PRIVACY POLICY")}
      ${link("deletion", "tile-orange", icon("person"), "DELETION POLICY")}
      <div class="menu-meta">
        <span class="menu-meta-label"><span class="menu-meta-icon" aria-hidden="true">ID</span>PLAYER ID</span>
        <span class="menu-id">${formatPlayerId(config.gameUid)}</span>
        ${button(icon("copy"), "menu-copy", "copy-player-id", 'aria-label="Copy Player ID"')}
      </div>
      <div class="menu-meta">
        <span class="menu-meta-label"><span class="menu-meta-icon" aria-hidden="true">i</span>VERSION</span>
        <span class="menu-version">${APP_VERSION}</span>
      </div>
      <button class="menu-support" data-action="support">${icon("headset")}SUPPORT</button>
    </div>
  </div></div>`;
}

function docModalMarkup(key) {
  const doc = MENU_DOCS[key];
  if (!doc) return "";
  const onlineUrl = key === "terms" ? LEGAL_URLS.terms : LEGAL_URLS.privacy;
  return `<div class="modal-backdrop"><div class="popup doc-popup" role="dialog" aria-modal="true" aria-label="${doc.title}">
    <div class="popup-ribbon popup-ribbon-small">${doc.title}</div>
    ${button("", "popup-close", "close-modal", 'aria-label="Close"')}
    <div class="popup-body">
      <div class="popup-doc-body">${doc.body.map(paragraph => `<p>${paragraph}</p>`).join("")}</div>
      <p class="doc-online">${button("🌐 VIEW FULL VERSION ONLINE", "doc-online-link", "legal-online", `data-url="${onlineUrl}"`)}</p>
      <div class="popup-footer">
        ${button("BACK", "popup-ok popup-ok-secondary", "menu")}
        ${button("OK", "popup-ok", "close-modal")}
      </div>
    </div>
  </div></div>`;
}

function livesCountdownMs() {
  if (profile.lives >= MAX_LIVES || !profile.lastLifeAt) return 0;
  return Math.max(0, (profile.lastLifeAt + LIFE_REGEN_MS) - Date.now());
}

function formatCountdown(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function livesModalMarkup() {
  // Exact LIVES artwork + a live count overlaid on the heart + tap-zones over
  // the close X and the green "GET EXTRA +1 LIFE" (watch-ad) button.
  const p = refreshLives(profile);
  const livesFull = p.lives >= MAX_LIVES;
  const shown = hasUnlimitedLives() ? "∞" : p.lives;
  return `<div class="modal-backdrop liveops-backdrop">
    <div class="lv-art-wrap">
      <img class="lv-art" src="/assets/lives-popup.png" alt="Lives" />
      <span class="lv-count">${shown}</span>
      ${livesFull ? "" : `<span class="lv-timer">More in <b class="lives-countdown">${formatCountdown(livesCountdownMs())}</b></span>`}
      <button class="lv-hot lv-hot-close" data-action="close-modal" aria-label="Close"></button>
      <button class="lv-hot lv-hot-ad" data-action="watch-ad-life" aria-label="Watch an ad to get one extra life"></button>
    </div>
  </div>`;
}

function adModalMarkup() {
  const isBonus = adReward === "win-bonus";
  const isInterstitial = adReward === "none";
  const icon = isInterstitial ? `<span aria-hidden="true">🎮</span>` : isBonus ? `<span class="coin-icon ad-coin"></span>` : "❤";
  const line = isInterstitial ? "Your level starts in a moment…" : isBonus ? "Your bonus coins are on the way…" : "Your extra life is on the way…";
  return `<div class="modal-backdrop ad-backdrop"><div class="ad-screen" role="dialog" aria-modal="true" aria-label="Advertisement">
    <span class="ad-label">AD</span>
    <span class="ad-heart" aria-hidden="true">${icon}</span>
    <p>${line}</p>
    <strong class="ad-countdown">${adSecondsLeft}</strong>
  </div></div>`;
}

function animateWinCoins(amount, sourceSelector) {
  const shell = app.querySelector(".game-shell");
  const hud = app.querySelector(".gameplay-hud");
  const barValue = app.querySelector(".gameplay-coin-value");
  const barCoin = app.querySelector(".gameplay-coin");
  const source = app.querySelector(sourceSelector);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!shell || !hud || !barValue || !barCoin || !source || reduceMotion) return;

  const shellRect = shell.getBoundingClientRect();
  const sourceRect = source.getBoundingClientRect();
  const targetRect = barCoin.getBoundingClientRect();
  const startValue = Math.max(0, profile.coins - amount);
  const flightCount = 6;
  const flightDuration = 640;
  const flightStagger = 90;

  hud.classList.add("coin-flight-focus");
  barValue.textContent = startValue.toLocaleString();

  for (let i = 0; i < flightCount; i++) {
    const coin = document.createElement("span");
    coin.className = "coin-icon flying-coin";
    const size = 30;
    const fromLeft = sourceRect.left + (sourceRect.width / 2) - (size / 2) + (((i % 3) - 1) * 18) - shellRect.left;
    const fromTop = sourceRect.top + (sourceRect.height / 2) - (size / 2) + ((Math.floor(i / 3) - 0.5) * 16) - shellRect.top;
    const toLeft = targetRect.left + (targetRect.width / 2) - (size / 2) - shellRect.left;
    const toTop = targetRect.top + (targetRect.height / 2) - (size / 2) - shellRect.top;
    const dx = toLeft - fromLeft;
    const dy = toTop - fromTop;
    Object.assign(coin.style, { left: `${fromLeft}px`, top: `${fromTop}px`, width: `${size}px`, height: `${size}px` });
    shell.append(coin);
    coin.animate([
      { transform: "translate(0, 0) scale(.6)", opacity: 0, easing: "cubic-bezier(.3,.65,.4,1)", offset: 0 },
      { transform: "translate(0, 0) scale(1.15)", opacity: 1, easing: "cubic-bezier(.35,.5,.45,1)", offset: 0.14 },
      { transform: `translate(${dx * 0.3}px, ${(dy * 0.24) - 44}px) scale(1.08)`, opacity: 1, easing: "cubic-bezier(.5,.05,.75,.4)", offset: 0.44 },
      { transform: `translate(${dx}px, ${dy}px) scale(.55)`, opacity: .92, offset: 1 }
    ], { duration: flightDuration, delay: i * flightStagger, fill: "forwards" });
    setTimeout(() => {
      coin.remove();
      playSound("coinCollect", { volume: 0.34, rate: 1 + (i * 0.03) });
      barCoin.animate([
        { transform: "scale(1)" },
        { transform: "scale(1.3)" },
        { transform: "scale(1)" }
      ], { duration: 200, easing: "ease-out" });
    }, (i * flightStagger) + flightDuration);
  }

  const countDuration = flightDuration + ((flightCount - 1) * flightStagger) + 120;
  const countStart = performance.now();
  const tick = now => {
    const progress = Math.min(1, (now - countStart) / countDuration);
    const node = app.querySelector(".gameplay-coin-value");
    if (!node) return;
    if (progress < 1) {
      node.textContent = Math.round(startValue + (amount * progress)).toLocaleString();
      requestAnimationFrame(tick);
    } else {
      node.textContent = profile.coins.toLocaleString();
    }
  };
  requestAnimationFrame(tick);
  setTimeout(() => {
    const node = app.querySelector(".gameplay-coin-value");
    if (node) node.textContent = profile.coins.toLocaleString();
    hud.classList.remove("coin-flight-focus");
  }, countDuration + 320);
}

// Play an ad for a placement. On a device with AdMob, show the real ad
// (interstitial, or rewarded coins/lives) and grant on success; off-device
// (web/dev) fall back to the existing simulated ad modal + countdown.
//   kind: "none" (interstitial) | "life" (rewarded lives) | "win-bonus" (rewarded coins)
async function playAd(kind) {
  if (hasNativeAds()) {
    if (kind === "none") { await showInterstitialAd(); return; }
    const earned = kind === "life" ? await showRewardedLivesAd() : await showRewardedCoinsAd();
    if (earned) { adReward = kind; grantAdReward(); }
    else showToast("Ad unavailable — please try again");
    return;
  }
  adReward = kind;
  adSecondsLeft = kind === "none" ? 4 : 5;
  modal = "ad";
  render();
}

function grantAdReward() {
  if (adReward === "none") {
    // Interstitial: nothing to grant — just return to the level.
    modal = null;
    render();
    return;
  }
  if (adReward === "win-bonus") {
    profile = addCoins(profile, COMPLETE_BONUS_COINS);
    completeBonusClaimed = true;
    save();
    playSound("reward", { volume: 0.82, rate: 1.06 });
    buzz(50);
    modal = "complete";
    render();
    setTimeout(() => {
      if (modal === "complete") animateWinCoins(COMPLETE_BONUS_COINS, ".winpop-ad");
    }, 480);
    showToast(`${COMPLETE_BONUS_COINS} bonus coins added`);
    return;
  }
  profile = refreshLives(profile);
  if (profile.lives < MAX_LIVES) {
    profile.lives += 1;
    if (profile.lives >= MAX_LIVES) profile.lastLifeAt = null;
  }
  save();
  playSound("reward", { volume: 0.78, rate: 1.04 });
  buzz(50);
  modal = "lives";
  render();
  showToast("+1 life earned");
}

function syncLivesTicker() {
  const needsTicker = modal === "lives" || modal === "ad" || view === "leaderboard";
  if (!needsTicker) {
    if (livesTicker) { clearInterval(livesTicker); livesTicker = null; }
    return;
  }
  if (livesTicker) return;
  livesTicker = setInterval(() => {
    if (view === "leaderboard" && modal === null) {
      const countdown = app.querySelector(".lb-countdown-value");
      if (countdown) countdown.textContent = formatSeasonCountdown(getSeasonEnd(Date.now()) - Date.now());
      return;
    }
    if (modal === "ad") {
      adSecondsLeft -= 1;
      if (adSecondsLeft <= 0) {
        grantAdReward();
        return;
      }
      const counter = app.querySelector(".ad-countdown");
      if (counter) counter.textContent = String(adSecondsLeft);
      return;
    }
    if (modal !== "lives") return;
    const before = profile.lives;
    profile = refreshLives(profile);
    if (profile.lives !== before) {
      save();
      render();
      return;
    }
    const countdown = app.querySelector(".lives-countdown");
    if (countdown) countdown.textContent = formatCountdown(livesCountdownMs());
  }, 1000);
}

function lbInfoModalMarkup() {
  const scoreRow = (label, value) => `<div class="lbi-row"><span>${label}</span><strong>${value}</strong></div>`;
  const rewardRow = (icon, label, value) => `<div class="lbi-row"><span><span class="lbi-icon" aria-hidden="true">${icon}</span>${label}</span><strong>${value}</strong></div>`;
  return `<div class="modal-backdrop"><div class="popup doc-popup" role="dialog" aria-modal="true" aria-label="How rankings work">
    <div class="popup-ribbon popup-ribbon-small">HOW IT WORKS</div>
    ${button("", "popup-close", "close-modal", 'aria-label="Close"')}
    <div class="popup-body">
      <div class="popup-doc-body lbi-body">
        <h4 class="lbi-title">📊 WEEKLY SCORE</h4>
        <div class="lbi-card">
          ${scoreRow("Level completed", "+100")}
          ${scoreRow("Star earned", "+25")}
          ${scoreRow("First-try win", "+20")}
          ${scoreRow("No-booster win", "+15")}
          ${scoreRow("Daily challenge", "+100")}
          ${scoreRow("Event points", "+pts")}
        </div>
        <h4 class="lbi-title">🏅 LEAGUES</h4>
        <div class="lbi-card">
          <div class="lbi-ladder">${LEAGUES.map(l => `<span class="lbi-league"><span aria-hidden="true">${l.badge}</span>${l.name}</span>`).join('<span class="lbi-arrow" aria-hidden="true">›</span>')}</div>
          ${scoreRow("▲ Top 20% every Monday", "Promoted")}
          ${scoreRow("▼ Bottom 20% every Monday", "Relegated")}
        </div>
        <h4 class="lbi-title">⏱ SPEED BOARD</h4>
        <div class="lbi-card">
          <p class="lbi-note">Your fastest level clear of the week competes here — boosters must stay untouched for the run to count.</p>
        </div>
        <h4 class="lbi-title">🎁 WEEKLY REWARDS</h4>
        <div class="lbi-card">
          ${rewardRow("🥇", "Top 1", "Gems + Skin + Badge")}
          ${rewardRow("🏆", "Top 3", "Gems + Skin")}
          ${rewardRow("💎", "Top 10", "Gems")}
          ${rewardRow("💰", "Top 100", "Coins")}
          ${rewardRow("🪙", "Top 10%", "Coins")}
          <p class="lbi-note">Rewards are delivered every Monday when the new season starts.</p>
        </div>
      </div>
      <div class="popup-footer">${button("GOT IT", "popup-ok", "close-modal")}</div>
    </div>
  </div></div>`;
}

function lbSeasonModalMarkup() {
  const lb = ensureLeaderboardState();
  const league = getLeague(lb.league);
  return `<div class="modal-backdrop lb-season-backdrop"><div class="popup lb-season-popup" role="dialog" aria-modal="true" aria-label="New weekly season">
    <div class="popup-ribbon">NEW WEEKLY SEASON</div>
    <div class="popup-body lb-season-body">
      <span class="lb-season-spark" aria-hidden="true">✨</span>
      <span class="lb-season-badge" aria-hidden="true">${league.badge}</span>
      <h3>${league.name} League</h3>
      <p>A fresh competition just started. Climb the board before Monday!</p>
      <div class="popup-footer">${button("LET'S GO", "popup-ok", "lb-season-ok")}</div>
    </div>
  </div></div>`;
}

function lbRewardModalMarkup() {
  const lb = ensureLeaderboardState();
  const pending = lb.pendingReward;
  if (!pending) return "";
  const league = getLeague(pending.league);
  const reward = pending.reward;
  const outcomeLine = pending.outcome === "promoted"
    ? `<p class="lb-outcome lb-outcome-up">▲ Promoted to ${getLeague(pending.newLeague).badge} ${getLeague(pending.newLeague).name} League!</p>`
    : pending.outcome === "relegated"
      ? `<p class="lb-outcome lb-outcome-down">▼ Relegated to ${getLeague(pending.newLeague).badge} ${getLeague(pending.newLeague).name} League</p>`
      : "";
  const rewardRows = reward ? [
    reward.coins ? `<div class="lb-reward-item"><span class="coin-icon"></span>${reward.coins.toLocaleString()} coins</div>` : "",
    reward.gems ? `<div class="lb-reward-item"><span aria-hidden="true">💎</span>${reward.gems} gems</div>` : "",
    reward.skin ? `<div class="lb-reward-item"><span aria-hidden="true">🔮</span>${reward.skin}</div>` : "",
    reward.badge ? `<div class="lb-reward-item"><span aria-hidden="true">🎖</span>${reward.badge} badge</div>` : "",
  ].join("") : `<p class="lb-reward-none">Keep climbing — rewards start at the top 100!</p>`;
  const confetti = Array.from({ length: 10 }, (_, i) => `<span class="winpop-confetti confetti-${i + 1}" aria-hidden="true"></span>`).join("");
  return `<div class="modal-backdrop lb-season-backdrop">${confetti}<div class="popup lb-season-popup" role="dialog" aria-modal="true" aria-label="Season results">
    <div class="popup-ribbon">SEASON RESULTS</div>
    <div class="popup-body lb-season-body">
      <span class="lb-reward-trophy" aria-hidden="true">🏆</span>
      <h3>Rank #${pending.rank} · ${league.badge} ${league.name}</h3>
      ${outcomeLine}
      <div class="lb-reward-list">${rewardRows}</div>
      <div class="popup-footer">${button("CONTINUE", "popup-ok", "lb-claim")}</div>
    </div>
  </div></div>`;
}

function onboardingModalMarkup() {
  return `<div class="modal-backdrop"><div class="popup tut-popup tut-cream" role="dialog" aria-modal="true" aria-label="How to play">
    <span class="pop-badge" aria-hidden="true"><img src="/assets/ball-blue.svg" alt="" /></span>
    <div class="popup-ribbon">HOW TO PLAY</div>
    <div class="popup-body tut-body">
      <div class="tut-demo" aria-hidden="true">
        <span class="tut-tube"><span class="tut-ball red"></span><span class="tut-ball red"></span></span>
        <span class="tut-hand">👆</span>
        <span class="tut-tube tut-tube-empty"></span>
      </div>
      <ol class="tut-steps">
        <li><strong>Tap a tube</strong> to pick up the balls on top.</li>
        <li><strong>Tap another tube</strong> to drop them — colors must match.</li>
        <li>Sort every tube into a <strong>single color</strong> to win!</li>
      </ol>
      <div class="popup-footer">${button("LET'S PLAY", "popup-ok", "onboarding-ok")}</div>
    </div>
  </div></div>`;
}

function boosterIntroModalMarkup() {
  const key = boosterIntroKey || "undo";
  const meta = BOOSTER_META[key];
  return `<div class="modal-backdrop lb-season-backdrop"><div class="popup tut-popup" role="dialog" aria-modal="true" aria-label="New booster unlocked">
    <span class="pop-badge" aria-hidden="true"><img src="/assets/ball-blue.svg" alt="" /></span>
    <div class="popup-ribbon">NEW BOOSTER!</div>
    <div class="popup-body tut-body">
      <span class="tut-booster-badge" aria-hidden="true"><span class="tut-spark tut-spark-1"></span><span class="tut-spark tut-spark-2"></span><span class="tut-spark tut-spark-3"></span><img src="${meta.icon}" alt="" /></span>
      <h3 class="tut-booster-name">${meta.name.toUpperCase()} UNLOCKED</h3>
      <p class="tut-booster-tip">${meta.tip}</p>
      <span class="tut-booster-grant"><span aria-hidden="true">🎁</span> +${BOOSTER_UNLOCK_GRANT} FREE</span>
      <div class="popup-footer">${button("GOT IT", "popup-ok", "booster-intro-ok")}</div>
    </div>
  </div></div>`;
}

function dailyLoginModalMarkup() {
  const st = dailyLoginStatus();
  const cards = DAILY_LOGIN_REWARDS.map(r => {
    const d = r.day;
    let state;
    if (st.canClaim) state = d < st.claimDay ? "claimed" : d === st.claimDay ? "active" : "locked";
    else state = d <= st.currentDay ? "claimed" : "locked";
    const rewardArt = r.booster
      ? `<div class="dl-reward"><img src="${BOOSTER_META[r.booster].icon}" alt=""/><span class="dl-x">x${r.amount}</span></div>`
      : `<div class="dl-reward"><img src="/assets/coin.png" class="dl-coinstack" alt=""/></div>`;
    return `<div class="dl-day dl-${state} ${d === 7 ? "dl-day7" : ""}">
      <div class="dl-day-head">DAY ${d}</div>
      <div class="dl-day-body">
        ${rewardArt}
        <div class="dl-coins"><img src="/assets/coin.png" alt=""/><span>${r.coins.toLocaleString()}</span></div>
        ${state === "active" ? `<button class="dl-claim-btn" data-action="claim-daily">CLAIM</button>` : state === "claimed" ? `<div class="dl-check">✓</div>` : ""}
      </div>
    </div>`;
  }).join("");
  return `<div class="modal-backdrop liveops-backdrop">
    <div class="liveops-modal dl-modal">
      <button class="liveops-close" data-action="close-modal" aria-label="Close">✕</button>
      <div class="liveops-title">DAILY LOGIN<small>REWARDS</small></div>
      <p class="liveops-sub">Log in every day and claim <b>amazing rewards!</b></p>
      <div class="dl-grid">${cards}</div>
      <div class="dl-foot"><img src="/assets/rewards.png" alt=""/><span>${st.canClaim ? "Claim your reward for today!" : "Come back tomorrow for the next reward!"}</span></div>
    </div>
  </div>`;
}

function missionsModalMarkup() {
  const m = ensureMissionsToday();
  const rows = DAILY_MISSIONS.map(def => {
    const cur = Math.min(m.progress[def.key] || 0, def.target);
    const done = missionDone(def, m);
    const claimed = Boolean(m.claimed[def.key]);
    const pct = Math.round((cur / def.target) * 100);
    const btn = claimed
      ? `<div class="dm-check">✓</div>`
      : `<button class="dm-claim ${done ? "" : "dm-disabled"}" data-action="claim-mission" data-key="${def.key}" ${done ? "" : "disabled"}>CLAIM</button>`;
    return `<div class="dm-row ${claimed ? "dm-row-done" : ""}">
      <img class="dm-icon" src="${def.icon}" alt=""/>
      <div class="dm-info">
        <div class="dm-label">${def.label}</div>
        <div class="dm-bar"><span style="width:${pct}%"></span><em>${cur}/${def.target}</em></div>
      </div>
      <div class="dm-reward"><img src="/assets/coin.png" alt=""/><span>${def.reward}</span></div>
      ${btn}
    </div>`;
  }).join("");
  const allClaimed = missionsAllClaimed(m);
  return `<div class="modal-backdrop liveops-backdrop">
    <div class="liveops-modal dm-modal">
      <button class="liveops-close" data-action="close-modal" aria-label="Close">✕</button>
      <div class="liveops-title">DAILY<small>MISSIONS</small></div>
      <p class="liveops-sub">Complete missions every day and <b>get awesome rewards!</b></p>
      <div class="dm-timer">🕐 New missions in: <b>${missionsResetCountdown()}</b></div>
      <div class="dm-list">${rows}</div>
      <div class="dm-bonus ${allClaimed && !m.bonusClaimed ? "dm-bonus-ready" : ""}">
        <div class="dm-bonus-text">
          <span class="dm-bonus-title">COMPLETE ALL MISSIONS TO GET</span>
          <span class="dm-bonus-reward"><img src="/assets/coin.png" alt=""/>${MISSIONS_ALL_BONUS_COINS.toLocaleString()} + <span class="dm-inf">♾ UNLIMITED LIVES FOR 2 HOURS</span></span>
        </div>
        ${allClaimed ? (m.bonusClaimed ? `<div class="dm-check">✓</div>` : `<button class="dm-claim" data-action="claim-mission-bonus">CLAIM</button>`) : ""}
      </div>
    </div>
  </div>`;
}

function noAdsModalMarkup() {
  // Exact artwork + invisible tap-zones over the two price buttons and the close X.
  const active = noAdsActive();
  const until = profile.noAds?.until;
  return `<div class="modal-backdrop liveops-backdrop">
    <div class="na-art-wrap">
      <img class="na-art" src="/assets/no-ads-popup.png" alt="No-Ads Bundle" />
      <button class="na-hot na-hot-close" data-action="close-modal" aria-label="Close"></button>
      ${active
        ? `<div class="na-active-banner">✓ No-Ads active${until ? ` until ${new Date(until).toLocaleDateString()}` : " — forever"}</div>`
        : `<button class="na-hot na-hot-monthly" data-action="buy-product" data-product="remove_ads_monthly" aria-label="Subscribe monthly to remove ads"></button>
           <button class="na-hot na-hot-onetime" data-action="buy-product" data-product="remove_ads_lifetime" aria-label="Remove ads forever, one-time purchase"></button>`}
    </div>
  </div>`;
}

function modalView() {
  if (!modal) return "";
  if (modal === "onboarding") return onboardingModalMarkup();
  if (modal === "booster-unlock") return boosterIntroModalMarkup();
  if (modal === "complete") return completeModalMarkup();
  if (modal === "lb-info") return lbInfoModalMarkup();
  if (modal === "lb-season") return lbSeasonModalMarkup();
  if (modal === "lb-reward") return lbRewardModalMarkup();
  if (modal === "settings") return settingsModalMarkup();
  if (modal === "menu") return menuModalMarkup();
  if (modal === "lives") return livesModalMarkup();
  if (modal === "ad") return adModalMarkup();
  if (modal.startsWith("doc-")) return docModalMarkup(modal.slice(4));
  if (modal === "pause") return `<div class="modal-backdrop"><div class="modal"><h2>PAUSED</h2><div class="modal-actions">${button("HOME", "action secondary", "home")}${button("RESUME", "action", "close-modal")}</div></div></div>`;
  if (modal === "rewards") return dailyLoginModalMarkup();
  if (modal === "missions") return missionsModalMarkup();
  if (modal === "noads") return noAdsModalMarkup();
  if (modal === "failed") return `<div class="modal-backdrop"><div class="failpop" role="dialog" aria-modal="true" aria-label="No moves left">
    <span class="failpop-badge" aria-hidden="true"><img src="/assets/ball-blue.svg" alt="" /></span>
    <div class="failpop-banner">NO MOVES LEFT!</div>
    <div class="failpop-body">
      <span class="failpop-heart" aria-hidden="true">💔</span>
      <p>You lost 1 life.<br/>Try the level again<br/>or go back home.</p>
      <div class="failpop-actions">
        ${button(`<span aria-hidden="true">🏠</span> HOME`, "failpop-btn failpop-home", "failed-home")}
        ${button(`<span aria-hidden="true">↻</span> RETRY`, "failpop-btn failpop-retry", "retry")}
      </div>
    </div>
  </div></div>`;
  if (modal === "support") {
    const config = getKemeSupportConfig();
    const nativeReady = supportState.nativeAvailable && supportState.nativeConfigured;
    const portalMissing = !config.portalBaseUrl;
    const blockingError = Boolean(supportState.error && !(portalMissing && nativeReady));
    const statusClass = blockingError ? "error" : supportState.profile || nativeReady ? "connected" : "pending";
    const statusText = supportState.loading
      ? "Connecting to Keme support..."
      : blockingError
        ? supportState.error
        : supportState.profile
          ? `Connected as ${supportState.profile.username || supportState.profile.nickname || supportState.profile.gameUid}.`
          : nativeReady
            ? `Native Keme support is ready for ${supportState.nativeIdentifiedUserId || config.gameUid}.`
          : "Open customer support after adding your Keme connection details.";
    const ticketsMarkup = supportState.tickets.length
      ? supportState.tickets.map(ticket => `<article class="support-ticket"><div><strong>${escapeHtml(ticket.subject)}</strong><span>${escapeHtml(ticket.status.toUpperCase())}</span></div><small>${escapeHtml(formatSupportDate(ticket.updatedAt || ticket.createdAt))}</small></article>`).join("")
      : `<p class="support-empty">No Keme tickets yet for this player.</p>`;

    const showStatus = supportState.loading || blockingError;
    return `<div class="modal-backdrop"><div class="modal support-modal"><h2>CUSTOMER SUPPORT</h2>${showStatus ? `<div class="support-status ${statusClass}">${escapeHtml(statusText)}</div>` : ""}${supportState.success ? `<p class="support-success">${escapeHtml(supportState.success)}</p>` : ""}<label class="support-field"><span>Subject</span><input data-support-field="subject" maxlength="200" value="${escapeHtml(supportDraft.subject)}" placeholder="What do you need help with?" /></label><label class="support-field"><span>Description</span><textarea data-support-field="description" rows="5" maxlength="5000" placeholder="Describe the issue, what happened, and what you expected.">${escapeHtml(supportDraft.description)}</textarea></label><div class="modal-actions support-actions">${button(supportState.submitting ? "SENDING..." : "SEND", "action", "support-submit", supportState.submitting ? "disabled" : "")}${button("CLOSE", "action secondary", "close-modal")}</div><section class="support-history"><div class="support-history-header"><h3>Recent Tickets</h3>${supportState.loading ? `<small>Loading...</small>` : ""}</div>${ticketsMarkup}</section></div></div>`;
  }
  return "";
}

function render() {
  const content = view === "loading" ? loadingView() : view === "home" ? homeView() : view === "game" ? gameView() : view === "store" ? storeView() : leaderboardView();
  app.innerHTML = `<div class="game-shell">${content}${modalView()}${toast ? `<div class="toast">${toast}</div>` : ""}</div>`;
  syncLivesTicker();
}

function celebrateCompletedTube(index) {
  const tube = app.querySelector(`.game-tube[data-index="${index}"]`);
  if (!tube) return;
  playSound("tubeComplete", { volume: 0.6, rate: 1.03 });
  // Lid thud lands when the cover-drop settles (~0.6 of its 700ms fall).
  setTimeout(() => playSound("lidClose", { volume: 0.7 }), 420);
  setTimeout(() => playSound("reward", { volume: 0.34, rate: 1.6 }), 520);
  buzz([25, 30, 45]);
  const cap = tube.querySelector(".game-tube-complete-cap");
  const coverDrop = document.createElement("span");
  const burst = document.createElement("span");
  const glow = document.createElement("span");
  const seal = document.createElement("span");
  const sparks = Array.from({ length: 4 }, (_, sparkIndex) => {
    const spark = document.createElement("span");
    spark.className = `tube-complete-spark spark-${sparkIndex + 1}`;
    return spark;
  });
  coverDrop.className = "tube-cover-drop";
  burst.className = "tube-complete-burst";
  glow.className = "tube-complete-glow";
  seal.className = "tube-complete-seal";
  tube.append(glow);
  tube.append(coverDrop);
  tube.append(seal);
  tube.append(burst);
  sparks.forEach(spark => tube.append(spark));
  coverDrop.animate([
    { opacity: 0, transform: "translateY(-360%) rotate(-9deg)", easing: "cubic-bezier(.5,.05,.85,.4)", offset: 0 },
    { opacity: 1, transform: "translateY(-230%) rotate(5deg)", easing: "cubic-bezier(.55,.05,.9,.5)", offset: 0.3 },
    { opacity: 1, transform: "translateY(0) rotate(-1deg) scale(1.06, .9)", easing: "ease-out", offset: 0.6 },
    { opacity: 1, transform: "translateY(-12%) rotate(.5deg) scale(.98, 1.03)", easing: "ease-in", offset: 0.78 },
    { opacity: 1, transform: "translateY(0) rotate(0deg) scale(1)", offset: 1 }
  ], { duration: 700, fill: "forwards" });
  glow.animate([
    { opacity: 0, transform: "translate(-50%, -50%) scale(.42)" },
    { opacity: .95, transform: "translate(-50%, -50%) scale(1.02)", offset: 0.42 },
    { opacity: .5, transform: "translate(-50%, -50%) scale(1.2)", offset: 0.74 },
    { opacity: 0, transform: "translate(-50%, -50%) scale(1.36)", offset: 1 }
  ], { duration: 880, easing: "ease-out" });
  seal.animate([
    { opacity: 0, transform: "translate(-50%, -50%) scale(.42, .78)" },
    { opacity: 1, transform: "translate(-50%, -50%) scale(1.06, 1.08)", offset: 0.34 },
    { opacity: .66, transform: "translate(-50%, -50%) scale(1.3, .78)", offset: 0.72 },
    { opacity: 0, transform: "translate(-50%, -50%) scale(1.55, .58)", offset: 1 }
  ], { duration: 620, easing: "cubic-bezier(.16,.84,.26,1)" });
  cap?.animate([
    { opacity: 0, offset: 0 },
    { opacity: 0, offset: 0.58 },
    { opacity: 1, offset: 0.66 },
    { opacity: 1, offset: 1 }
  ], { duration: 700, fill: "forwards" });
  tube.animate([
    { transform: "translateY(0) scale(1)", filter: "brightness(1) drop-shadow(0 0 0 transparent)" },
    { transform: "translateY(-7%) scale(1.1)", filter: "brightness(1.34) drop-shadow(0 0 24px #fff56a)", offset: 0.34 },
    { transform: "translateY(2.8%) scale(.98, 1.03)", filter: "brightness(1.12) drop-shadow(0 0 16px #b8ff66)", offset: 0.72 },
    { transform: "translateY(-1.2%) scale(1.015, .995)", filter: "brightness(1.04) drop-shadow(0 0 10px #7dff62)", offset: 0.9 },
    { transform: "translateY(0) scale(1)", filter: "brightness(1) drop-shadow(0 0 8px #7dff62)", offset: 1 }
  ], { duration: 980, easing: "cubic-bezier(.2,.88,.24,1)" });
  [...tube.querySelectorAll(".marble")].forEach((marbleNode, marbleIndex) => {
    marbleNode.animate([
      { transform: "translateY(0) scale(1)", filter: "brightness(1)" },
      { transform: "translateY(-9%) scale(1.15)", filter: "brightness(1.18)", offset: 0.34 },
      { transform: "translateY(5%) scale(.96, 1.04)", filter: "brightness(1.08)", offset: 0.66 },
      { transform: "translateY(0) scale(1)", filter: "brightness(1)", offset: 1 }
    ], { duration: 700, delay: marbleIndex * 72, easing: "cubic-bezier(.2,.86,.26,1)" });
  });
  setTimeout(() => {
    coverDrop.remove();
    if (cap) cap.style.opacity = "1";
  }, 760);
  setTimeout(() => {
    glow.remove();
    seal.remove();
    burst.remove();
    sparks.forEach(spark => spark.remove());
  }, 980);
}

function settleTubeMarbles(index, movedCount = 1) {
  const marbles = [...app.querySelectorAll(`.game-tube[data-index="${index}"] .marble`)];
  if (!marbles.length) return;

  const impacted = marbles.slice(-movedCount).reverse();
  impacted.forEach((marbleNode, order) => {
    marbleNode.animate([
      { transform: "translateY(-5%) scale(1.03, .97)" },
      { transform: "translateY(2.5%) scale(.98, 1.02)", offset: 0.5 },
      { transform: "translateY(0) scale(1, 1)", offset: 1 }
    ], {
      duration: 240,
      delay: order * 40,
      easing: "cubic-bezier(.22,.86,.28,1)"
    });
  });

  marbles.slice(0, -movedCount).slice(-2).reverse().forEach((marbleNode, order) => {
    marbleNode.animate([
      { transform: "translateY(0)" },
      { transform: "translateY(3.5%)", offset: 0.42 },
      { transform: "translateY(-1.5%)", offset: 0.72 },
      { transform: "translateY(0)", offset: 1 }
    ], {
      duration: 260,
      delay: 50 + (order * 34),
      easing: "ease-out"
    });
  });
}

function finishMove(result, destination) {
  tubes = result.tubes;
  selected = null;
  moveAnimating = false;
  render();
  settleTubeMarbles(destination, result.moved);
  const completed = isTubeComplete(tubes[destination]);
  const completionDelay = completed ? 280 + ((result.moved - 1) * 30) : 0;
  const resolutionDelay = completed ? completionDelay + 760 : 320;
  if (completed) {
    // Hide the sealed lid until the cover-drop animation lands it.
    const capNode = app.querySelector(`.game-tube[data-index="${destination}"] .game-tube-complete-cap`);
    if (capNode) capNode.style.opacity = "0";
    setTimeout(() => celebrateCompletedTube(destination), completionDelay);
  }
  if (isSolved(tubes)) setTimeout(() => {
    // Stop the loop so the victory jingle plays clean; stays off until the
    // player starts a new level or returns home.
    musicSuppressed = true;
    pauseMusic();
    playSound("levelComplete", { volume: 0.88 });
    buzz(80);
    setTimeout(() => playSound("reward", { volume: 0.56, rate: 1.04 }), 190);
    profile = addCoins(profile, WIN_REWARD_COINS);
    profile.unlocked = Math.min(100, Math.max(profile.unlocked, profile.level + 1));
    addMissionProgress("levels", 1);
    addMissionProgress("coins", WIN_REWARD_COINS);
    recordWeeklyWin();
    track("level_complete", { level: profile.level, seconds: levelStartAt ? Math.round((Date.now() - levelStartAt) / 1000) : undefined, booster_free: !levelBoosterUsed });
    completeBonusClaimed = false;
    save();
    modal = "complete";
    render();
    setTimeout(() => {
      if (modal === "complete") animateWinCoins(WIN_REWARD_COINS, ".winpop-pile");
    }, 700);
  }, resolutionDelay);
  else if (!hasAnyMoves(tubes)) setTimeout(() => {
    playSound("lose", { volume: 0.82 });
    buzz([60, 40, 60]);
    track("level_failed", { level: profile.level });
    if (!hasUnlimitedLives()) profile = loseLife(profile);
    save();
    modal = "failed";
    render();
  }, resolutionDelay);
}

async function animateTransfer(from, to, result) {
  const scene = app.querySelector(".gameplay");
  const source = app.querySelector(`.game-tube[data-index="${from}"]`);
  const target = app.querySelector(`.game-tube[data-index="${to}"]`);
  const sourceMarbles = source?.querySelectorAll(".marble");
  const targetStack = target?.querySelector(".game-tube-marbles");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!scene || !source || !target || !sourceMarbles?.length || !targetStack || reduceMotion) {
    finishMove(result, to);
    return;
  }

  const sceneRect = scene.getBoundingClientRect();
  const targetRect = targetStack.getBoundingClientRect();
  const sourceRect = source.getBoundingClientRect();
  const destinationRect = target.getBoundingClientRect();
  const moving = [...sourceMarbles].slice(-result.moved).reverse();
  const targetCount = tubes[to].length;
  const direction = targetRect.left < sourceRect.left ? -1 : 1;
  const moveDuration = 400 + ((result.moved - 1) * 55);
  const flightStagger = 55;
  const previousSourceOrigin = source.style.transformOrigin;
  const previousTargetOrigin = target.style.transformOrigin;
  const previousSourceZ = source.style.zIndex;
  const previousTargetZ = target.style.zIndex;
  source.style.transformOrigin = direction > 0 ? "18% 88%" : "82% 88%";
  target.style.transformOrigin = direction > 0 ? "76% 88%" : "24% 88%";
  source.style.zIndex = "6";
  target.style.zIndex = "5";
  playSound("marbleMove", { volume: Math.min(0.7, 0.5 + (result.moved * 0.06)), rate: 0.96 + (result.moved * 0.04) });
  const flights = moving.map((marbleNode, arrivalSlot) => {
    const start = marbleNode.getBoundingClientRect();
    const size = start.width;
    const exitLeft = sourceRect.left + ((sourceRect.width - size) / 2) + (direction * sourceRect.width * 0.13);
    const exitTop = sourceRect.top - (size * 0.92);
    const entryLeft = destinationRect.left + (destinationRect.width - size) / 2;
    const entryTop = destinationRect.top - (size * 0.98);
    const endLeft = targetRect.left + (targetRect.width - size) / 2;
    const endTop = targetRect.bottom - ((targetCount + arrivalSlot + 1) * size);
    const apexLeft = ((exitLeft + entryLeft) / 2) + (direction * Math.max(8, size * 0.08));
    const apexTop = Math.min(exitTop, entryTop) - Math.max(40, size * 1.35);
    const reboundTop = endTop - Math.max(5, size * 0.12);
    const point = (left, top) => `translate3d(${left - start.left}px, ${top - start.top}px, 0)`;
    const clone = marbleNode.cloneNode(true);

    marbleNode.style.visibility = "hidden";
    clone.classList.add("flying-marble");
    Object.assign(clone.style, {
      left: `${start.left - sceneRect.left}px`,
      top: `${start.top - sceneRect.top}px`,
      width: `${size}px`,
      height: `${size}px`,
      animation: "none"
    });
    scene.append(clone);

    const flightDelay = arrivalSlot * flightStagger;
    const animation = clone.animate([
      { transform: "translate3d(0, 0, 0) scale(1) rotate(0deg)", easing: "cubic-bezier(.3,.65,.4,1)", offset: 0 },
      { transform: `${point(exitLeft, exitTop)} scale(1.05, .96) rotate(${direction * 8}deg)`, easing: "cubic-bezier(.34,.55,.45,1)", offset: 0.2 },
      { transform: `${point(apexLeft, apexTop)} scale(1.1) rotate(${direction * 16}deg)`, easing: "cubic-bezier(.5,.04,.76,.42)", offset: 0.46 },
      { transform: `${point(entryLeft, entryTop)} scale(.99, 1.06) rotate(${direction * 6}deg)`, easing: "cubic-bezier(.55,.06,.72,.44)", offset: 0.66 },
      { transform: `${point(endLeft, endTop)} scale(1.16, .84) rotate(0deg)`, easing: "cubic-bezier(.2,.9,.32,1)", offset: 0.82 },
      { transform: `${point(endLeft, reboundTop)} scale(.96, 1.05) rotate(0deg)`, easing: "ease-out", offset: 0.92 },
      { transform: `${point(endLeft, endTop)} scale(1) rotate(0deg)`, offset: 1 }
    ], {
      duration: moveDuration,
      delay: flightDelay,
      fill: "forwards"
    });
    setTimeout(() => {
      playSound("marbleMove", { volume: 0.24, rate: 1.32 + (arrivalSlot * 0.05) });
    }, flightDelay + (moveDuration * 0.82));
    return { clone, animation };
  });

  const tubeDuration = moveDuration + ((result.moved - 1) * flightStagger) + 70;
  source.animate([
    { transform: "translateY(-7%) translateX(0) rotate(0deg) scale(1)", easing: "cubic-bezier(.3,.7,.35,1)", offset: 0 },
    { transform: `translateY(-15%) translateX(${direction * 2.4}%) rotate(${direction * 9}deg) scale(1.02)`, easing: "cubic-bezier(.35,.6,.4,1)", offset: 0.18 },
    { transform: `translateY(-19%) translateX(${direction * 4}%) rotate(${direction * 13}deg) scale(1.03)`, easing: "cubic-bezier(.4,.2,.4,1)", offset: 0.62 },
    { transform: `translateY(-9%) translateX(${direction * 1.2}%) rotate(${direction * 3}deg) scale(1.005)`, easing: "ease-out", offset: 0.86 },
    { transform: "translateY(0) translateX(0) rotate(0deg) scale(1)", offset: 1 }
  ], { duration: tubeDuration, easing: "linear" });
  target.animate([
    { transform: "translateY(0) translateX(0) rotate(0deg) scale(1)", offset: 0 },
    { transform: "translateY(0) translateX(0) rotate(0deg) scale(1)", easing: "cubic-bezier(.3,.7,.4,1)", offset: 0.56 },
    { transform: `translateY(4%) translateX(${direction * 1.2}%) rotate(${direction * 3}deg) scale(1.025)`, easing: "ease-out", offset: 0.8 },
    { transform: `translateY(-1.6%) translateX(${direction * .3}%) rotate(${direction * -1}deg) scale(1.01)`, easing: "ease-out", offset: 0.92 },
    { transform: "translateY(0) translateX(0) rotate(0deg) scale(1)", offset: 1 }
  ], { duration: tubeDuration, easing: "linear" });
  targetStack.animate([
    { transform: "translateY(0)", offset: 0 },
    { transform: "translateY(0)", offset: 0.7 },
    { transform: "translateY(1.6%)", offset: 0.84 },
    { transform: "translateY(0)", offset: 1 }
  ], { duration: tubeDuration, easing: "ease-out" });

  await Promise.all(flights.map(({ animation }) => animation.finished.catch(() => undefined)));
  flights.forEach(({ clone }) => clone.remove());
  source.style.transformOrigin = previousSourceOrigin;
  target.style.transformOrigin = previousTargetOrigin;
  source.style.zIndex = previousSourceZ;
  target.style.zIndex = previousTargetZ;
  finishMove(result, to);
}

function chooseTube(index) {
  if (moveAnimating) return;
  if (selected === null) {
    if (!tubes[index].length || isTubeComplete(tubes[index])) return;
    playSound("tubeSelect", { volume: 0.54, rate: 1.02 });
    selected = index; render(); return;
  }
  if (selected === index) { playSound("tubeSelect", { volume: 0.42, rate: 0.94 }); selected = null; render(); return; }
  if (!canMove(tubes, selected, index)) {
    if (tubes[index].length && !isTubeComplete(tubes[index])) {
      playSound("tubeSelect", { volume: 0.5, rate: 0.98 });
      selected = index;
      render();
      return;
    }
    playSound("invalid", { volume: 0.55 });
    buzz(60);
    showToast("That marble cannot go there");
    return;
  }
  history.push(structuredClone(tubes));
  const from = selected;
  const result = move(tubes, from, index);
  moveAnimating = true;
  animateTransfer(from, index, result);
}

let suppressTubeClickUntil = 0;

async function copyPlayerId() {
  const config = getKemeSupportConfig();
  try {
    await navigator.clipboard.writeText(config.gameUid);
    playSound("uiTap", { volume: 0.55, rate: 1.05 });
    showToast("Player ID copied");
  } catch {
    const area = document.createElement("textarea");
    area.value = config.gameUid;
    document.body.append(area);
    area.select();
    try {
      document.execCommand("copy");
      playSound("uiTap", { volume: 0.55, rate: 1.05 });
      showToast("Player ID copied");
    } catch {
      showToast("Unable to copy the Player ID");
    }
    area.remove();
  }
}

function shuffle() {
  if (!boosterUnlocked("shuffle")) { playSound("invalid", { volume: 0.5 }); return showToast(`Shuffle unlocks at level ${boosterUnlockLevel("shuffle")}`); }
  // Build a guaranteed-solvable rearrangement of the SAME marbles (same per-tube
  // counts) BEFORE consuming the booster, so a failed shuffle never charges.
  const shuffled = shuffleTubes(tubes);
  if (!shuffled) { playSound("invalid", { volume: 0.55 }); buzz(50); return showToast("Can't shuffle this board"); }
  if (!spendBooster("shuffle")) return;
  history.push(structuredClone(tubes));
  tubes = shuffled;
  playSound("booster", { volume: 0.72, rate: 1.04 });
  levelBoosterUsed = true;
  save(); render();
}

function resolveTubeIndex(event, fallbackTarget) {
  const fallbackIndex = fallbackTarget ? Number(fallbackTarget.dataset.index) : null;
  const nodes = [...app.querySelectorAll(".game-tube")];
  if (!nodes.length || typeof event.clientX !== "number") return fallbackIndex;
  const rects = nodes.map(node => {
    const rect = node.getBoundingClientRect();
    return { index: Number(node.dataset.index), left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  });
  return nearestTubeIndex({ x: event.clientX, y: event.clientY }, rects) ?? fallbackIndex;
}

app.addEventListener("pointerdown", event => {
  syncBackgroundMusic();
  const tubeTarget = event.target.closest('[data-action="tube"]');
  if (tubeTarget && !tubeTarget.disabled) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    suppressTubeClickUntil = performance.now() + 450;
    chooseTube(resolveTubeIndex(event, tubeTarget));
    return;
  }
  const target = event.target.closest('[data-action="play"]');
  if (!target || target.disabled) return;
  target.classList.add("play-pressed");
});

app.addEventListener("pointerup", event => {
  const target = event.target.closest('[data-action="play"]');
  if (!target || target.disabled) return;
  target.classList.remove("play-pressed");
});

app.addEventListener("pointercancel", event => {
  const target = event.target.closest('[data-action="play"]');
  if (!target) return;
  target.classList.remove("play-pressed");
});

app.addEventListener("click", event => {
  const target = event.target.closest("[data-action]"); if (!target) return;
  const action = target.dataset.action;
  if (moveAnimating && ["tube", "undo", "shuffle", "add-tube"].includes(action)) return;
  if (["home", "store", "leaderboard", "settings", "menu", "menu-doc", "lives", "rewards", "missions", "pause", "close-modal", "support", "support-refresh", "support-native", "support-submit", "locked-rewards", "locked-missions", "failed-home", "complete-home"].includes(action)) {
    playSound("uiTap", { volume: 0.58 });
  }
  if (action === "home") {
    // Quitting an in-progress level counts as a loss — deduct a life (unless the
    // player has unlimited lives). Wins/losses use complete-home / failed-home.
    if (view === "game" && !isSolved(tubes) && !hasUnlimitedLives()) {
      profile = loseLife(profile);
      track("level_quit", { level: profile.level });
      save();
    }
    setView("home");
  }
  else if (action === "play") {
    if (target.disabled) return;
    playSound("levelStart", { volume: 0.74 });
    target.disabled = true; target.classList.add("play-pressed");
    setTimeout(beginLevel, 170);
  }
  else if (action === "tube") {
    if (performance.now() < suppressTubeClickUntil) return;
    chooseTube(event.detail > 0 ? resolveTubeIndex(event, target) : Number(target.dataset.index));
  }
  else if (action === "store") setView("store");
  else if (action === "leaderboard") {
    const lb = ensureLeaderboardState();
    lbTab = "weekly";
    lbVisibleCount = 25;
    setView("leaderboard");
    refreshLeaderboardData(lb);
    const board = buildWeeklyBoard({ seasonKey: lb.season, leagueId: lb.league, playerEntry: leaderboardPlayerEntry(lb), realEntries: lbRealEntries(lb), playerId: getKemeSupportConfig().gameUid, now: Date.now() });
    lb.lastRank = board.player.rank;
    save();
    if (lb.seasonIntro) { modal = "lb-season"; render(); }
    else if (lb.pendingReward) { modal = "lb-reward"; render(); }
  }
  else if (action === "lb-tab") {
    playSound("uiTap", { volume: 0.5 });
    lbTab = target.dataset.tab;
    lbVisibleCount = 25;
    render();
  }
  else if (action === "lb-more") {
    playSound("uiTap", { volume: 0.45 });
    lbVisibleCount += 25;
    render();
  }
  else if (action === "lb-info") { playSound("uiTap", { volume: 0.5 }); modal = "lb-info"; render(); }
  else if (action === "onboarding-ok") {
    playSound("uiTap", { volume: 0.55 });
    profile.onboarded = true;
    modal = null;
    save(); render();
  }
  else if (action === "booster-intro-ok") {
    playSound("reward", { volume: 0.6, rate: 1.1 });
    profile.boosterSeen = profile.boosterSeen || {};
    if (boosterIntroKey) {
      profile.boosterSeen[boosterIntroKey] = true;
      // Unlock grant: the player ends up with EXACTLY BOOSTER_UNLOCK_GRANT (2) of
      // the new booster — set, not add, so a stale/old count never inflates it.
      profile.boosters[boosterIntroKey] = BOOSTER_UNLOCK_GRANT;
      showToast(`+${BOOSTER_UNLOCK_GRANT} ${BOOSTER_META[boosterIntroKey].name} boosters added`);
    }
    boosterIntroKey = null;
    modal = null;
    save(); render();
  }
  else if (action === "lb-season-ok") {
    playSound("uiTap", { volume: 0.55 });
    const lb = ensureLeaderboardState();
    lb.seasonIntro = false;
    modal = lb.pendingReward ? "lb-reward" : null;
    save(); render();
  }
  else if (action === "lb-claim") {
    const lb = ensureLeaderboardState();
    const pending = lb.pendingReward;
    if (pending?.reward) {
      playSound("reward", { volume: 0.8 });
      buzz(60);
      if (pending.reward.coins) profile = addCoins(profile, pending.reward.coins);
      if (pending.reward.gems) lb.gems = (lb.gems || 0) + pending.reward.gems;
      if (pending.reward.skin && !lb.cosmetics.skins.includes(pending.reward.skin)) lb.cosmetics.skins.push(pending.reward.skin);
      if (pending.reward.badge && !lb.cosmetics.badges.includes(pending.reward.badge)) lb.cosmetics.badges.push(pending.reward.badge);
      showToast(pending.reward.coins ? `${pending.reward.coins.toLocaleString()} coins claimed` : "Rewards claimed");
    } else {
      playSound("uiTap", { volume: 0.55 });
    }
    lb.pendingReward = null;
    modal = null;
    save(); render();
  }
  else if (action === "locked-rewards") showToast("Daily Rewards unlock at level 5");
  else if (action === "locked-missions") showToast("Daily Missions unlock at level 7");
  else if (action === "support") { modal = "support"; render(); refreshSupportData(); refreshNativeSupportState(); }
  else if (action === "menu") { menuNameEditing = false; modal = "menu"; render(); }
  else if (action === "lives") { profile = refreshLives(profile); save(); modal = "lives"; render(); }
  else if (action === "watch-ad-life") {
    profile = refreshLives(profile);
    if (profile.lives >= MAX_LIVES) { playSound("invalid", { volume: 0.5 }); save(); render(); return showToast("Lives are already full"); }
    playSound("uiTap", { volume: 0.56 });
    playAd("life");
  }
  else if (action === "complete-ad-bonus") {
    if (completeBonusClaimed) { playSound("invalid", { volume: 0.5 }); return showToast("Bonus already claimed"); }
    playSound("uiTap", { volume: 0.56 });
    playAd("win-bonus");
  }
  else if (action === "refill-lives") {
    profile = refreshLives(profile);
    if (profile.lives >= MAX_LIVES) { playSound("invalid", { volume: 0.5 }); save(); render(); return showToast("Lives are already full"); }
    if (profile.coins < LIVES_REFILL_PRICE) { playSound("invalid", { volume: 0.55 }); return showToast("Not enough coins"); }
    playSound("reward", { volume: 0.8, rate: 1.02 });
    buzz(50);
    profile = addCoins(profile, -LIVES_REFILL_PRICE);
    profile.lives = MAX_LIVES;
    profile.lastLifeAt = null;
    save(); render();
    showToast("Lives refilled to 5");
  }
  else if (action === "menu-doc") { modal = `doc-${target.dataset.doc}`; render(); }
  else if (action === "legal-online") {
    playSound("uiTap", { volume: 0.5 });
    window.open(target.dataset.url, "_blank");
  }
  else if (action === "menu-avatar") {
    playSound("uiTap", { volume: 0.5, rate: 1.06 });
    profile.avatar = ((profile.avatar || 0) + 1) % AVATARS.length;
    save(); render();
  }
  else if (action === "menu-edit-name") {
    if (performance.now() < suppressNameEditUntil) return;
    playSound("uiTap", { volume: 0.5 });
    if (menuNameEditing) {
      const field = app.querySelector(".menu-name-input");
      if (field) profile.playerName = field.value.trim().slice(0, 18) || defaultPlayerName();
      menuNameEditing = false;
      save();
    } else {
      menuNameEditing = true;
    }
    render();
    if (menuNameEditing) {
      const field = app.querySelector(".menu-name-input");
      field?.focus();
      field?.select();
    }
  }
  else if (action === "copy-player-id") copyPlayerId();
  else if (action === "toggle-vibration") {
    playSound("uiTap", { volume: 0.54 });
    profile.vibration = !profile.vibration;
    if (profile.vibration) buzz(45);
    save(); render();
  }
  else if (["settings", "rewards", "missions", "pause"].includes(action)) { modal = action; render(); }
  else if (action === "close-modal") { modal = null; render(); }
  else if (action === "toggle-music") {
    playSound("uiTap", { volume: 0.54 });
    profile.music = !profile.music;
    save();
    render();
    syncBackgroundMusic();
  }
  else if (action === "toggle-sound") {
    if (profile.sound) {
      playSound("uiTap", { volume: 0.54 });
      profile.sound = false;
      stopSfx();
    } else {
      profile.sound = true;
      playSound("uiTap", { volume: 0.54 });
    }
    save(); render();
  }
  else if (action === "support-refresh") refreshSupportData({ keepSuccess: true });
  else if (action === "support-native") launchNativeSupport();
  else if (action === "support-submit") submitSupportTicket();
  else if (action === "noads") { playSound("uiTap", { volume: 0.56 }); modal = "noads"; render(); }
  else if (action === "claim-daily") {
    const st = dailyLoginStatus();
    if (!st.canClaim) { playSound("invalid", { volume: 0.55 }); return showToast("Come back tomorrow for the next reward"); }
    const r = DAILY_LOGIN_REWARDS[st.claimDay - 1];
    playSound("reward", { volume: 0.82 });
    buzz(60);
    profile = addCoins(profile, r.coins);
    if (r.booster) grantBooster(r.booster, r.amount);
    profile.dailyLogin = { streak: st.claimDay, lastClaimDate: st.today };
    addMissionProgress("coins", r.coins);
    save(); render();
    track("daily_login_claim", { day: st.claimDay, coins: r.coins });
    showToast(r.booster ? `Day ${st.claimDay}: +${r.coins.toLocaleString()} coins & +${r.amount} ${BOOSTER_META[r.booster].name}` : `Day ${st.claimDay}: +${r.coins.toLocaleString()} coins`);
  }
  else if (action === "claim-mission") {
    const m = ensureMissionsToday();
    const def = DAILY_MISSIONS.find(d => d.key === target.dataset.key);
    if (!def || m.claimed[def.key]) return;
    if (!missionDone(def, m)) { playSound("invalid", { volume: 0.5 }); return showToast("Mission not complete yet"); }
    playSound("reward", { volume: 0.8 });
    buzz(50);
    profile = addCoins(profile, def.reward);
    m.claimed[def.key] = true;
    save(); render();
    track("mission_claim", { mission: def.key, reward: def.reward });
    showToast(`+${def.reward} coins`);
  }
  else if (action === "claim-mission-bonus") {
    const m = ensureMissionsToday();
    if (!missionsAllClaimed(m) || m.bonusClaimed) { playSound("invalid", { volume: 0.5 }); return; }
    playSound("reward", { volume: 0.85, rate: 1.04 });
    buzz(80);
    profile = addCoins(profile, MISSIONS_ALL_BONUS_COINS);
    profile.unlimitedLivesUntil = Date.now() + MISSIONS_UNLIMITED_LIVES_MS;
    profile.lives = MAX_LIVES;
    m.bonusClaimed = true;
    save(); render();
    track("mission_bonus_claim", {});
    showToast(`+${MISSIONS_ALL_BONUS_COINS.toLocaleString()} coins & unlimited lives for 2h!`);
  }
  else if (action === "buy-product") {
    const productId = target.dataset.product;
    if (!productId) return;
    playSound("uiTap", { volume: 0.55 });
    billing.buy(productId);
  }
  else if (action === "restore-purchases") {
    playSound("uiTap", { volume: 0.55 });
    showToast("Restoring purchases…");
    billing.restore();
  }
  else if (action === "booster-locked") {
    playSound("invalid", { volume: 0.5 });
    buzz(45);
    const key = target.dataset.key;
    showToast(`${BOOSTER_META[key].name} unlocks at level ${boosterUnlockLevel(key)}`);
  }
  else if (action === "undo") {
    if (!boosterUnlocked("undo")) { playSound("invalid", { volume: 0.5 }); return showToast(`Undo unlocks at level ${boosterUnlockLevel("undo")}`); }
    if (!history.length) { playSound("invalid", { volume: 0.55 }); return showToast("Nothing to undo"); }
    if (!spendBooster("undo")) return;
    playSound("booster", { volume: 0.72, rate: 0.96 });
    levelBoosterUsed = true;
    tubes = history.pop(); save(); render();
  }
  else if (action === "shuffle") shuffle();
  else if (action === "add-tube") {
    if (!boosterUnlocked("tube")) { playSound("invalid", { volume: 0.5 }); return showToast(`Extra Tube unlocks at level ${boosterUnlockLevel("tube")}`); }
    if (!spendBooster("tube")) return;
    playSound("booster", { volume: 0.74, rate: 1.08 });
    levelBoosterUsed = true;
    tubes.push([]); save(); render();
  }
  else if (action === "buy-booster") {
    const item = STORE_BOOSTERS.find(entry => entry.key === target.dataset.key);
    if (!item) return;
    if (profile.coins < item.price) { playSound("invalid", { volume: 0.55 }); return showToast("Not enough coins"); }
    playSound("reward", { volume: 0.72, rate: 1.05 });
    profile = addCoins(profile, -item.price);
    profile.boosters[item.key]++;
    save(); render();
    showToast(`+1 ${item.name.charAt(0)}${item.name.slice(1).toLowerCase()} booster`);
  }
  else if (action === "buy-iap") {
    playSound("uiTap", { volume: 0.56 });
    showToast("Purchases are coming soon");
  }
  else if (action === "failed-home") setView("home");
  else if (action === "retry") { playSound("levelStart", { volume: 0.74, rate: 1.02 }); beginLevel(); }
  else if (action === "next") { playSound("levelStart", { volume: 0.76, rate: 1.03 }); profile.level = Math.min(100, profile.level + 1); save(); beginLevel(); }
  else if (action === "complete-home") { profile.level = Math.min(100, Math.max(profile.level + 1, profile.unlocked)); save(); setView("home"); }
});

function updateSupportDraft(event) {
  const field = event.target.closest("[data-support-field]");
  if (!field) return;
  supportDraft[field.dataset.supportField] = field.value;
}

app.addEventListener("input", updateSupportDraft);
app.addEventListener("change", updateSupportDraft);
app.addEventListener("change", event => {
  const field = event.target.closest("[data-menu-name]");
  if (!field || !menuNameEditing) return;
  profile.playerName = field.value.trim().slice(0, 18) || defaultPlayerName();
  menuNameEditing = false;
  suppressNameEditUntil = performance.now() + 350;
  save();
  render();
});
app.addEventListener("keydown", event => {
  if (event.key === "Enter" && event.target.matches?.(".menu-name-input")) event.target.blur();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pauseMusic();
    return;
  }
  syncBackgroundMusic();
});

ensureLeaderboardState();
save();
initAnalytics(getKemeSupportConfig().gameUid);
initBilling();
render();
syncBackgroundMusic();

// If this install is fresh but a cloud save exists for the device's gameUid,
// restore it while the splash is still showing (never after play has begun).
(async () => {
  if (profile.onboarded || (profile.unlocked || 1) > 1) return;
  const cloud = await fetchCloudProfile(getKemeSupportConfig().gameUid);
  if (!cloud || view !== "loading") return;
  if ((cloud.unlocked || 1) > 1 || cloud.onboarded) {
    profile = refreshLives({ ...initial, ...cloud, boosters: { ...initial.boosters, ...(cloud.boosters || {}) } });
    save();
    render();
  }
})();
setTimeout(() => {
  if (view !== "loading") return;
  // Only the very FIRST launch drops straight into level 1 gameplay (which shows
  // the onboarding tutorial). Every later launch lands on the home screen.
  // "First launch" = never launched before AND no progress yet — so a player who
  // already advanced past level 1 (or restored a cloud save) always goes home,
  // even if the onboarding button was never tapped.
  const firstLaunch =
    !profile.launched &&
    !profile.onboarded &&
    (profile.unlocked || 1) <= 1 &&
    (profile.level || 1) <= 1;
  if (firstLaunch) {
    profile.launched = true;
    save();
    beginLevel(); // level 1 → onboarding tutorial
  } else {
    profile.launched = true;
    profile.onboarded = true;
    save();
    setView("home");
  }
}, 3000);

import { applyIdentity, saveIdentity, restoreIdentity, avatarImage, renderPlayerMenu } from "../public/assets/player-profile.js";
import { weeklyPoints, winPoints, renderPointsResult, renderPointsGuide } from '../public/assets/leaderboard-points.js';
import { renderStore } from '../public/assets/design-system.js';
import { TOTAL_LEVELS, difficultyFor } from './challenges.js';
import { installTimedChallengeRuntime } from '../public/assets/timed-challenge.js';
import { LEVELS } from "./levels.js";
import { canMove, hasAnyMoves, isTubeComplete, move, isSolved } from "./game-engine.js";
import { addCoins, loseLife, refreshLives, MAX_LIVES } from "./economy.js";
import { pauseMusic, playSfx, preloadMusic, preloadSfx, stopSfx, syncMusic } from "./audio.js";
import { showInterstitialAd, showRewardedCoinsAd, showRewardedLivesAd } from "./ads.js";
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

const app = document.querySelector("#app");
const STORAGE = "marble-sort-state-v1";
const STATE_VERSION = 2;
const legacyHardLevels = new Set([30,35,39,44,48,53,57,62,66,71,75,80,84,89,93,98]);
function levelReward() { return legacyHardLevels.has(profile.level) || profile.level > 100 && (difficultyFor(profile.level) === "hard" || profile.level % 5 === 0) ? 80 : 40; }

const REWARDED_LIVES_AMOUNT = 2;
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
const initial = { version: STATE_VERSION, level: 1, unlocked: 1, coins: DEFAULT_COINS, lives: 5, lastLifeAt: null, lastRewardDate: null, music: true, sound: true, boosters: { undo: 5, shuffle: 3, tube: 2 }, tutorials: { level1: false } };

function loadProfile() {
  const raw = JSON.parse(localStorage.getItem(STORAGE) || "{}");
  const next = {
    ...initial,
    ...raw,
    boosters: {
      ...initial.boosters,
      ...(raw.boosters || {}),
    },
    tutorials: {
      ...initial.tutorials,
      ...(raw.tutorials || {}),
    },
  };

  if (!raw.version) {
    next.version = STATE_VERSION;
    if (raw.coins === 2450 || typeof raw.coins !== "number") {
      next.coins = DEFAULT_COINS;
    }
  }

  return refreshLives(next);
}

let profile = applyIdentity(loadProfile());
let editingPlayerName = false;
let view = "loading";
let lastLevelScore = null, usedScoreBooster = false;
function scoreState() {
  const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - (d.getDay()+6)%7);
  const start = new Date(d.getFullYear(),0,1), week = Math.ceil(((d-start)/86400000 + start.getDay()+1)/7);
  const season = `${d.getFullYear()}-W${String(week).padStart(2,'0')}`;
  profile.lb ||= { season, league:'bronze', weekly:{}, totals:{stars:Math.max(0,profile.unlocked-1)*3,levels:Math.max(0,profile.unlocked-1)}, tries:{} };
  if (profile.lb.season !== season) { profile.lb.season=season; profile.lb.weekly={}; }
  return profile.lb;
}
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

const timedChallenge = installTimedChallengeRuntime({
  root: app, inGame: () => view === 'game', modal: () => modal,
  animating: () => moveAnimating, solved: () => isSolved(tubes), hasMoves: () => hasAnyMoves(tubes),
  setModal: value => { modal = value; }, render,
  rewardedContinue: showRewardedCoinsAd,
  pointsSummary: () => renderPointsResult(null,weeklyPoints(scoreState().weekly)),
  onContinue: () => playSound('reward', { volume: 0.8 }),
  failureMessage: () => profile.unlimitedLivesUntil > Date.now() ? 'Unlimited lives are active. Retry with a fresh timer.' : 'You lost 1 life. Retry with a fresh timer.',
  timeout: () => { if (!(profile.unlimitedLivesUntil > Date.now())) profile = loseLife(profile); save(); playSound('lose', { volume: 0.82 }); },
});

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

function syncBackgroundMusic() {
  syncMusic(Boolean(profile.music), { volume: 0.3 });
}

function save() {
  profile.version = STATE_VERSION;
  localStorage.setItem(STORAGE, JSON.stringify(profile));
}
function setView(next) { view = next; modal = null; selected = null; moveAnimating = false; render(); syncBackgroundMusic(); }
function showToast(message) { toast = message; render(); clearTimeout(transitionTimer); transitionTimer = setTimeout(() => { toast = ""; render(); }, 1700); }
function levelData() { return LEVELS[Math.min(profile.level, TOTAL_LEVELS) - 1]; }
function beginLevel() {
  profile = refreshLives(profile);
  completeBonusClaimed = false;
  if (profile.lives <= 0) {
    save(); render(); playSound("invalid", { volume: 0.56 }); showToast("No lives left. A new life arrives every 30 minutes."); return;
  }
  const score = scoreState(); score.tries[profile.level] = (score.tries[profile.level] || 0) + 1; usedScoreBooster = false; lastLevelScore = null;
  tubes = structuredClone(levelData().tubes); history = []; selected = null; save(); setView("game");
  timedChallenge.start(levelData()); render();
}

function button(label, cls, action, attrs = "") {
  return `<button class="${cls}" data-action="${action}" ${attrs}>${label}</button>`;
}

async function showOptionalAd(showAd) {
  try {
    return await timedChallenge.withAd(showAd);
  } catch {
    return false;
  }
}

function goToNextLevel() {
  playSound("levelStart", { volume: 0.76, rate: 1.03 });
  profile.level = Math.min(TOTAL_LEVELS, profile.level + 1);
  save();
  beginLevel();
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
    ${button(back ? "‹" : "⚙", "icon-button", back ? "home" : "settings", `aria-label="${back ? "Back" : "Settings"}"`)}
    <div class="pill"><span>❤</span><span>${profile.lives}/5</span></div>
    <div class="pill"><span class="coin-icon" aria-hidden="true"></span><span>${profile.coins.toLocaleString()}</span></div>
  </header>`;
}

function loadingView() {
  return `<section class="screen loading"><div class="loading-progress" aria-hidden="true"></div>${button("", "loading-skip", "home", 'aria-label="Skip loading"')}</section>`;
}

function homeView() {
  const rewardsUnlocked = profile.level >= 5;
  const missionsUnlocked = profile.level >= 7;
  const featureState = missionsUnlocked ? "features-unlocked" : rewardsUnlocked ? "rewards-unlocked" : "features-locked";
  return `<section class="screen home ${featureState}">
    <div class="home-level-number" aria-label="Current level ${profile.level}"><span class="home-level-number-text">${profile.level}</span></div>
    <div class="home-life-value" aria-label="${profile.lives} of 5 lives"><span class="home-pill-text">${profile.lives}/5</span></div>
    <div class="home-coin-value"><span class="home-pill-text">${profile.coins.toLocaleString()}</span></div>
    ${button("Menu", "hotspot home-menu", "menu")}
    ${button("Settings", "hotspot home-settings", "settings")}
    ${button("Coins", "hotspot home-coins", "store", 'aria-label="Open coin store"')}
    ${button("Rewards", "hotspot home-rewards", rewardsUnlocked ? "rewards" : "locked-rewards", `aria-label="${rewardsUnlocked ? "Open Daily Rewards" : "Daily Rewards unlock at level 5"}"`)}
    ${button("Missions", "hotspot home-missions", missionsUnlocked ? "missions" : "locked-missions", `aria-label="${missionsUnlocked ? "Open Daily Missions" : "Daily Missions unlock at level 7"}"`)}
    ${button('<img class="home-play-art" src="/assets/home-play-button.png" alt="" />', "hotspot home-play", "play", 'aria-label="Play level"')}
    ${button("Home", "hotspot home-current", "home")}
    ${button("Store", "hotspot home-store", "store")}
    ${button("Leaderboard", "hotspot home-leaderboard", "leaderboard")}
  </section>`;
}

function marble(color) {
  const src = MARBLE_ASSETS[color] || MARBLE_ASSETS.blue;
  return `<span class="marble ${color}" aria-label="${color} marble"><img class="marble-art" src="${src}" alt="" /></span>`;
}

function levelOneTutorialActive() {
  return view === "game" && profile.level === 1 && (profile.unlocked || 1) <= 1 && !profile.tutorials?.level1 && tubes.length >= 2 && !isSolved(tubes);
}

function levelOneTutorialStep() {
  return levelOneTutorialActive() ? selected === 1 ? 2 : 1 : 0;
}

function gameView() {
  const columnCount = tubes.length <= 3 ? tubes.length : tubes.length === 5 ? 5 : tubes.length <= 8 ? 4 : tubes.length <= 10 ? 5 : 6;
  const tutorialStep = levelOneTutorialStep();
  const renderedTubes = tubes.map((tube, i) => {
    const complete = isTubeComplete(tube);
    const valid = selected !== null && canMove(tubes, selected, i);
    const tutorialTarget = (tutorialStep === 1 && i === 1) || (tutorialStep === 2 && i === 0);
    return `<button class="game-tube ${complete ? "complete" : ""} ${selected === i ? "selected" : ""} ${valid ? "valid-target" : ""} ${tutorialTarget ? "tutorial-target" : ""}" style="${tubeLayoutStyle(i, columnCount, tubes.length)}" data-action="tube" data-index="${i}" aria-label="Tube ${i + 1}, ${complete ? "completed and sealed" : `${tube.length} marbles`}"><span class="game-tube-marbles">${tube.map(marble).join("")}</span>${complete ? `<span class="game-tube-complete-cap" aria-hidden="true"></span>` : ""}${tutorialTarget ? `<img class="tutorial-hand tutorial-hand-step-${tutorialStep}" src="/assets/tutorial-hand.png" alt="" aria-hidden="true" />` : ""}</button>`;
  }).join("");
  return `<section class="screen gameplay">
    <header class="gameplay-hud">
      <div class="gameplay-coins" aria-label="${profile.coins.toLocaleString()} coins">
        <img class="gameplay-coin-bar" src="/assets/coin-bar.png" alt="" />
        <img class="gameplay-coin" src="/assets/coin.png" alt="" />
        <span><span class="gameplay-coin-value">${profile.coins.toLocaleString()}</span></span>
      </div>
      ${button('<img src="/assets/settings.png" alt="" />', "gameplay-settings", "settings", 'aria-label="Settings"')}
    </header>
    <div class="gameplay-level" aria-label="Current level ${profile.level}">
      <img src="/assets/game-level-holder.png" alt="" />
      <span class="gameplay-level-value"><span class="gameplay-level-text">LEVEL ${profile.level}</span></span>
    </div>
    <div class="gameplay-tube-board" style="--tube-columns:${columnCount}">${renderedTubes}</div>
    <nav class="gameplay-boosters" aria-label="Boosters">
      ${button(`<img src="/assets/booster-undo.png" alt="" /><small>${profile.boosters.undo}</small>`, "gameplay-booster", "undo", 'aria-label="Undo"')}
      ${button(`<img src="/assets/booster-shuffle.png" alt="" /><small>${profile.boosters.shuffle}</small>`, "gameplay-booster", "shuffle", 'aria-label="Shuffle"')}
      ${button(`<img src="/assets/booster-add-tube.png" alt="" /><small>${profile.boosters.tube}</small>`, "gameplay-booster", "add-tube", 'aria-label="Add tube"')}
    </nav>
  </section>`;
}

function storeView() {
  const products = {};
  [5000,20000,50000].forEach((coins,i) => { products[['starter_bundle','pro_bundle','legend_bundle'][i]] = { grant: { coins, boostersEach:[10,25,50][i], unlimitedLivesMs:[2,12,24][i]*3600000, noAds:'lifetime' } }; });
  [2500,6500,15000,35000,75000,160000].forEach((coins,i) => { products[`coin_pack_${i+1}`] = { grant: { coins } }; });
  return renderStore({ coins:profile.coins, products, available:false });
}

function leaderboardView() {
  const names = ["Lina", "Fahad", "Maya", "Omar", "Noor", "You"];
  return `<section class="screen lb-screen"><button class="ds-back" data-action="home" aria-label="Back to home">‹</button><header class="lb-header"><div class="lb-banner"><h1>LEADERBOARD</h1></div></header>${renderPointsGuide()}<div class="lb-panel"><p>Your weekly points: <strong>${weeklyPoints(scoreState().weekly)}</strong></p><div class="lb-list">${names.map((name, i) => `<div class="lb-row ${name === 'You' ? 'lb-row-you' : ''}"><strong class="lb-rank">${i + 1}</strong><span class="lb-avatar">${name === "You" ? avatarImage(profile.avatar) : '<img src="/assets/ball-blue.svg" alt="" />'}</span><span class="lb-name"><strong>${name}</strong><small>Level ${Math.max(profile.level + 12 - i * 3, 1)}</small></span></div>`).join("")}</div></div></section>`;
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
  if (!canSubmitSupport()) return;

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
  return `<div class="modal-backdrop complete-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-label="Level complete rewards"><h2>LEVEL COMPLETE!</h2>${renderPointsResult(lastLevelScore,weeklyPoints(scoreState().weekly))}<p>COINS EARNED</p><div class="earned-coins"><span class="coin-icon"></span><strong>${levelReward()}</strong></div>${button(completeBonusClaimed ? 'BONUS CLAIMED' : `WATCH AD +${levelReward()} COINS`,'action secondary','complete-bonus',completeBonusClaimed?'disabled':'')}<div class="modal-actions">${button('HOME','action secondary','complete-home')}${button('NEXT ›','action','next')}</div></div></div>`;
}

function modalView() {
  if (modal === "menu") return renderPlayerMenu({profile,name:profile.playerName || `Player${getKemeSupportConfig().gameUid.slice(-4).toUpperCase()}`,editing:editingPlayerName,id:getKemeSupportConfig().gameUid,version:'0.1.0 (26)',escape:escapeHtml,icon:name=>`<svg class="ui-icon" viewBox="0 0 24 24"><path fill="currentColor" d="${name==='pencil'?'M3 17v4h4L20 8l-4-4Z':name==='copy'?'M3 2h12v3H6v14H3zM8 7h13v15H8z':'M3 12a9 9 0 0 1 18 0v8h-6v-8h4a7 7 0 0 0-14 0h4v8H3z'}"/></svg>`,terms:'https://kemegames.com/legal/marble-sort/terms',privacy:'https://kemegames.com/legal/marble-sort/privacy-policy'});

  if (modal === "timed-intro" || modal === "timed-failed") return timedChallenge.modalMarkup();
  if (!modal) return "";
  if (modal === "complete") return completeModalMarkup();
  if (modal === "settings") return `<div class="modal-backdrop"><div class="modal"><h2>SETTINGS</h2><p>Music ${profile.music ? "On" : "Off"}</p>${button(profile.music ? "TURN OFF" : "TURN ON", "action secondary", "toggle-music")}<p>Sound ${profile.sound ? "On" : "Off"}</p>${button(profile.sound ? "TURN OFF" : "TURN ON", "action secondary", "toggle-sound")}<p>Need help with support, billing, or account issues?</p>${button("CUSTOMER SUPPORT", "action secondary", "support")}<div class="modal-actions">${view === "game" ? button("HOME", "action secondary", "home") : ""}${button("CLOSE", "action", "close-modal")}</div></div></div>`;
  if (modal === "deletion") return `<div class="modal-backdrop"><div class="modal"><h2>Account deletion</h2><p>Contact player support to request deletion of your account and game data.</p>${button("CONTACT SUPPORT","action","support")}${button("BACK","action secondary","menu")}</div></div>`;
  if (modal === "pause") return `<div class="modal-backdrop"><div class="modal"><h2>PAUSED</h2><div class="modal-actions">${button("HOME", "action secondary", "home")}${button("RESUME", "action", "close-modal")}</div></div></div>`;
  if (modal === "rewards" || modal === "missions") {
    const rewards = modal === "rewards";
    return `<div class="modal-backdrop"><div class="modal"><h2>${rewards ? "DAILY REWARDS" : "DAILY MISSIONS"}</h2><img class="modal-art" src="/assets/${rewards ? "rewards" : "missions"}.png" alt=""/><p>${rewards ? "Come back every day for more coins." : "Complete 3 levels and use one booster."}</p><div class="modal-actions">${button(rewards ? `CLAIM ${DAILY_REWARD_COINS}` : "GOT IT", "action", rewards ? "claim" : "close-modal")}</div></div></div>`;
  }
  if (modal === "failed") return `<div class="modal-backdrop"><div class="modal"><h2>NO MOVES LEFT!</h2>${renderPointsResult(null,weeklyPoints(scoreState().weekly))}<div style="font-size:68px">💔</div><p>You lost 1 life. Try the level again or go back home.</p><div class="modal-actions">${button("HOME", "action secondary", "failed-home")}${button(`WATCH AD +${REWARDED_LIVES_AMOUNT} LIVES`, "action secondary", "rewarded-lives")}${button("RETRY", "action", "retry")}</div></div></div>`;
  if (modal === "complete") return `<div class="modal-backdrop"><div class="modal"><h2>LEVEL COMPLETE!</h2>${renderPointsResult(lastLevelScore,weeklyPoints(scoreState().weekly))}<div style="font-size:70px">⭐⭐⭐</div><p>COINS EARNED</p><div class="earned-coins"><span class="coin-icon"></span><strong>${levelReward()}</strong></div><div class="modal-actions">${button("HOME", "action secondary", "complete-home")}${button("NEXT ›", "action", "next")}</div></div></div>`;
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
    const gameOptions = supportState.games.map(game => `<option value="${escapeHtml(game.id)}" ${supportDraft.gameId === game.id ? "selected" : ""}>${escapeHtml(game.name)}</option>`).join("");
    const ticketsMarkup = supportState.tickets.length
      ? supportState.tickets.map(ticket => `<article class="support-ticket"><div><strong>${escapeHtml(ticket.subject)}</strong><span>${escapeHtml(ticket.status.toUpperCase())}</span></div><small>${escapeHtml(formatSupportDate(ticket.updatedAt || ticket.createdAt))}</small></article>`).join("")
      : `<p class="support-empty">No Keme tickets yet for this player.</p>`;

    return `<div class="modal-backdrop"><div class="modal support-modal"><h2>CUSTOMER SUPPORT</h2><p class="support-lead">Send player support requests into Keme from the game settings.</p><div class="support-status ${statusClass}">${escapeHtml(statusText)}</div><div class="support-meta-grid"><div class="support-meta"><span>Player Game ID</span><strong>${escapeHtml(config.gameUid)}</strong></div><div class="support-meta"><span>Environment</span><strong>${escapeHtml(config.environment.toUpperCase())}</strong></div>${config.portalBaseUrl ? `<div class="support-meta support-meta-wide"><span>Keme API</span><strong>${escapeHtml(config.portalBaseUrl)}</strong></div>` : `<div class="support-meta support-meta-wide"><span>Setup</span><strong>Add portalBaseUrl to /keme-support-config.js</strong></div>`}</div>${supportState.nativeError ? `<p class="support-native-note">${escapeHtml(supportState.nativeError)}</p>` : ""}${supportState.success ? `<p class="support-success">${escapeHtml(supportState.success)}</p>` : ""}<label class="support-field"><span>Game</span><select data-support-field="gameId" ${supportState.games.length ? "" : "disabled"}>${gameOptions || `<option value="">No active games available</option>`}</select></label><label class="support-field"><span>Category</span><select data-support-field="category"><option value="billing" ${supportDraft.category === "billing" ? "selected" : ""}>Billing</option><option value="account" ${supportDraft.category === "account" ? "selected" : ""}>Account</option><option value="gameplay" ${supportDraft.category === "gameplay" ? "selected" : ""}>Gameplay</option><option value="bug" ${supportDraft.category === "bug" ? "selected" : ""}>Bug</option><option value="other" ${supportDraft.category === "other" ? "selected" : ""}>Other</option></select></label><label class="support-field"><span>Priority</span><select data-support-field="priority"><option value="P1" ${supportDraft.priority === "P1" ? "selected" : ""}>P1 Critical</option><option value="P2" ${supportDraft.priority === "P2" ? "selected" : ""}>P2 High</option><option value="P3" ${supportDraft.priority === "P3" ? "selected" : ""}>P3 Normal</option><option value="P4" ${supportDraft.priority === "P4" ? "selected" : ""}>P4 Low</option></select></label><label class="support-field"><span>Subject</span><input data-support-field="subject" maxlength="200" value="${escapeHtml(supportDraft.subject)}" placeholder="Purchase failed after payment" /></label><label class="support-field"><span>Description</span><textarea data-support-field="description" rows="5" maxlength="5000" placeholder="Describe the issue, what happened, and what the player expected.">${escapeHtml(supportDraft.description)}</textarea></label><section class="support-history"><div class="support-history-header"><h3>Recent Tickets</h3>${supportState.loading ? `<small>Loading...</small>` : ""}</div>${ticketsMarkup}</section><div class="modal-actions support-actions">${supportState.nativeAvailable && supportState.nativeConfigured ? button("OPEN NATIVE", "action secondary", "support-native") : ""}${button("REFRESH", "action secondary", "support-refresh", supportState.loading ? "disabled" : "")}${button(supportState.submitting ? "SENDING..." : "SEND TICKET", "action", "support-submit", canSubmitSupport() ? "" : "disabled")}</div><div class="modal-actions support-actions">${button("CLOSE", "action secondary", "close-modal")}</div></div></div>`;
  }
  return "";
}

function render() {
  const content = view === "loading" ? loadingView() : view === "home" ? homeView() : view === "game" ? gameView() : view === "store" ? storeView() : leaderboardView();
  app.innerHTML = `<div class="game-shell">${content}${modalView()}${toast ? `<div class="toast">${toast}</div>` : ""}</div>`;
  timedChallenge.onRender();
}

function celebrateCompletedTube(index) {
  const tube = app.querySelector(`.game-tube[data-index="${index}"]`);
  if (!tube) return;
  playSound("tubeComplete", { volume: 0.76, rate: 1.03 });
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
    { opacity: 0, transform: "translate(-50%, -145%) scale(.68) rotate(-10deg)" },
    { opacity: 1, transform: "translate(-50%, -48%) scale(1.03) rotate(5deg)", offset: 0.48 },
    { opacity: 1, transform: "translate(-50%, -8%) scale(1.08, .94) rotate(-2deg)", offset: 0.76 },
    { opacity: .96, transform: "translate(-50%, -16%) scale(.99, 1.03) rotate(1deg)", offset: 0.9 },
    { opacity: 0, transform: "translate(-50%, -20%) scale(.98) rotate(0deg)", offset: 1 }
  ], { duration: 760, easing: "cubic-bezier(.14,.92,.22,1.08)" });
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
    { opacity: 0, transform: "translateY(-28%) scale(.92, .84)", filter: "brightness(1.5)" },
    { opacity: .9, transform: "translateY(6%) scale(1.04, 1.02)", filter: "brightness(1.25)", offset: 0.7 },
    { opacity: 1, transform: "translateY(-2%) scale(.99, 1.01)", filter: "brightness(1.08)", offset: 0.88 },
    { opacity: 1, transform: "translateY(0) scale(1)", filter: "brightness(1)", offset: 1 }
  ], { duration: 820, easing: "cubic-bezier(.18,.9,.26,1)" });
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
  setTimeout(() => coverDrop.remove(), 820);
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
      { transform: "translateY(-16%) scale(1.02, .98)" },
      { transform: "translateY(7%) scale(.96, 1.04)", offset: 0.46 },
      { transform: "translateY(-4%) scale(1.01, .99)", offset: 0.72 },
      { transform: "translateY(0) scale(1, 1)", offset: 1 }
    ], {
      duration: 380,
      delay: order * 55,
      easing: "cubic-bezier(.22,.86,.28,1)"
    });
  });

  marbles.slice(0, -movedCount).slice(-2).reverse().forEach((marbleNode, order) => {
    marbleNode.animate([
      { transform: "translateY(0)" },
      { transform: "translateY(5%)", offset: 0.42 },
      { transform: "translateY(-2%)", offset: 0.72 },
      { transform: "translateY(0)", offset: 1 }
    ], {
      duration: 300,
      delay: 70 + (order * 38),
      easing: "ease-out"
    });
  });
}

function finishMove(result, destination) {
  const attempt = timedChallenge.attempt;
  tubes = result.tubes;
  selected = null;
  moveAnimating = false;
  render();
  settleTubeMarbles(destination, result.moved);
  const completed = isTubeComplete(tubes[destination]);
  const completionDelay = completed ? 430 + ((result.moved - 1) * 40) : 0;
  const resolutionDelay = completed ? completionDelay + 820 : 450;
  if (completed) setTimeout(() => celebrateCompletedTube(destination), completionDelay);
  if (isSolved(tubes)) setTimeout(() => {
    if (attempt !== timedChallenge.attempt || view !== "game") return;
    playSound("levelComplete", { volume: 0.88 });
    setTimeout(() => playSound("reward", { volume: 0.56, rate: 1.04 }), 190);
    profile = addCoins(profile, levelReward());
    profile.unlocked = Math.min(TOTAL_LEVELS, Math.max(profile.unlocked, profile.level + 1));
    if (profile.level === 1) profile.tutorials = { ...profile.tutorials, level1: true };
    completeBonusClaimed = false;
    const score=scoreState(); lastLevelScore=winPoints({firstTry:score.tries[profile.level]<=1,noBooster:!usedScoreBooster});
    score.weekly.levels=(score.weekly.levels||0)+1; score.weekly.stars=(score.weekly.stars||0)+3;
    score.weekly.firstTry=(score.weekly.firstTry||0)+(score.tries[profile.level]<=1?1:0);
    score.weekly.noBooster=(score.weekly.noBooster||0)+(usedScoreBooster?0:1);
    score.totals.stars+=3; score.totals.levels+=1;
    save();
    modal = "complete";
    render();
  }, resolutionDelay);
  else if (!hasAnyMoves(tubes)) setTimeout(() => {
    if (attempt !== timedChallenge.attempt || view !== "game") return;
    playSound("lose", { volume: 0.82 });
    profile = loseLife(profile);
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
  const moveDuration = 440 + Math.min(75, (result.moved - 1) * 25);
  const previousSourceOrigin = source.style.transformOrigin;
  const previousTargetOrigin = target.style.transformOrigin;
  const previousSourceZIndex = source.style.zIndex;
  const previousTargetZIndex = target.style.zIndex;
  source.style.transformOrigin = direction > 0 ? "18% 88%" : "82% 88%";
  target.style.transformOrigin = direction > 0 ? "76% 88%" : "24% 88%";
  source.style.zIndex = "6";
  target.style.zIndex = "5";
  playSound("marbleMove", { volume: Math.min(0.7, 0.5 + (result.moved * 0.06)), rate: 0.96 + (result.moved * 0.04) });
  const starts = moving.map((marbleNode) => marbleNode.getBoundingClientRect());
  const size = starts[0].width;
  const groupLeft = Math.min(...starts.map(({ left }) => left));
  const groupTop = Math.min(...starts.map(({ top }) => top));
  const groupRight = Math.max(...starts.map(({ right }) => right));
  const groupBottom = Math.max(...starts.map(({ bottom }) => bottom));
  const groupWidth = groupRight - groupLeft;
  const groupHeight = groupBottom - groupTop;
  const exitLeft = sourceRect.left + (sourceRect.width - groupWidth) / 2 + (direction * sourceRect.width * 0.13);
  const exitTop = sourceRect.top - (groupHeight * 0.82);
  const entryLeft = destinationRect.left + (destinationRect.width - groupWidth) / 2;
  const entryTop = destinationRect.top - (groupHeight * 0.76);
  const endLeft = targetRect.left + (targetRect.width - groupWidth) / 2;
  const endTop = targetRect.bottom - ((targetCount + result.moved) * size);
  const apexLeft = ((exitLeft + entryLeft) / 2) + (direction * Math.max(8, size * 0.08));
  const apexTop = Math.min(exitTop, entryTop) - Math.max(40, size * 1.35);
  const settleTop = endTop - Math.max(5, size * 0.12);
  const point = (left, top) => `translate3d(${left - groupLeft}px, ${top - groupTop}px, 0)`;
  const flightGroup = document.createElement("div");
  const fragment = document.createDocumentFragment();

  flightGroup.className = "flying-marble-group";
  flightGroup.setAttribute("aria-hidden", "true");
  Object.assign(flightGroup.style, {
    left: `${groupLeft - sceneRect.left}px`,
    top: `${groupTop - sceneRect.top}px`,
    width: `${groupWidth}px`,
    height: `${groupHeight}px`
  });
  moving.forEach((marbleNode, index) => {
    const start = starts[index];
    const clone = marbleNode.cloneNode(true);
    marbleNode.style.visibility = "hidden";
    clone.classList.add("flying-marble");
    Object.assign(clone.style, {
      left: `${start.left - groupLeft}px`,
      top: `${start.top - groupTop}px`,
      width: `${start.width}px`,
      height: `${start.height}px`,
      animation: "none"
    });
    fragment.append(clone);
  });
  flightGroup.append(fragment);
  scene.append(flightGroup);

  const flight = flightGroup.animate([
    { transform: "translate3d(0, 0, 0) scale(1) rotate(0deg)", easing: "cubic-bezier(.3,.65,.4,1)", offset: 0 },
    { transform: `${point(exitLeft, exitTop)} scale(1.04, .97) rotate(${direction * 7}deg)`, easing: "cubic-bezier(.34,.55,.45,1)", offset: 0.2 },
    { transform: `${point(apexLeft, apexTop)} scale(1.07) rotate(${direction * 13}deg)`, easing: "cubic-bezier(.5,.04,.76,.42)", offset: 0.48 },
    { transform: `${point(entryLeft, entryTop)} scale(.99, 1.04) rotate(${direction * 4}deg)`, easing: "cubic-bezier(.55,.06,.72,.44)", offset: 0.68 },
    { transform: `${point(endLeft, endTop)} scale(1.1, .9) rotate(0deg)`, easing: "cubic-bezier(.2,.9,.32,1)", offset: 0.84 },
    { transform: `${point(endLeft, settleTop)} scale(.97, 1.04) rotate(0deg)`, easing: "ease-out", offset: 0.93 },
    { transform: `${point(endLeft, endTop)} scale(1) rotate(0deg)`, offset: 1 }
  ], { duration: moveDuration, fill: "forwards" });
  setTimeout(() => playSound("marbleMove", { volume: 0.28, rate: 1.34 }), moveDuration * 0.82);

  source.animate([
    { transform: "translateY(-7%) translateX(0) rotate(0deg) scale(1)", offset: 0 },
    { transform: `translateY(-16%) translateX(${direction * 2.5}%) rotate(${direction * 8}deg) scale(1.02)`, offset: 0.24 },
    { transform: `translateY(-22%) translateX(${direction * 4.5}%) rotate(${direction * 13}deg) scale(1.04)`, offset: 0.56 },
    { transform: `translateY(-12%) translateX(${direction * 1.6}%) rotate(${direction * 4}deg) scale(1.01)`, offset: 0.84 },
    { transform: "translateY(0) translateX(0) rotate(0deg) scale(1)", offset: 1 }
  ], { duration: moveDuration + 70, easing: "cubic-bezier(.22,.8,.28,1)" });
  target.animate([
    { transform: "translateY(0) translateX(0) rotate(0deg) scale(1)", offset: 0 },
    { transform: "translateY(0) translateX(0) rotate(0deg) scale(1)", offset: 0.58 },
    { transform: `translateY(5%) translateX(${direction * 1.4}%) rotate(${direction * 3.5}deg) scale(1.03)`, offset: 0.84 },
    { transform: `translateY(-2%) translateX(${direction * .4}%) rotate(${direction * -1.2}deg) scale(1.015)`, offset: 0.94 },
    { transform: "translateY(0) translateX(0) rotate(0deg) scale(1)", offset: 1 }
  ], { duration: moveDuration + 70, easing: "cubic-bezier(.2,.82,.24,1)" });
  targetStack.animate([
    { transform: "translateY(0)", offset: 0 },
    { transform: "translateY(0)", offset: 0.72 },
    { transform: "translateY(1.8%)", offset: 0.86 },
    { transform: "translateY(0)", offset: 1 }
  ], { duration: moveDuration + 50, easing: "ease-out" });

  await flight.finished.catch(() => undefined);
  flightGroup.remove();
  moving.forEach((marbleNode) => { marbleNode.style.visibility = ""; });
  source.style.transformOrigin = previousSourceOrigin;
  target.style.transformOrigin = previousTargetOrigin;
  source.style.zIndex = previousSourceZIndex;
  target.style.zIndex = previousTargetZIndex;
  finishMove(result, to);
}

function chooseTube(index) {
  if (moveAnimating) return;
  const tutorialStep = levelOneTutorialStep();
  if ((tutorialStep === 1 && index !== 1) || (tutorialStep === 2 && index !== 0)) {
    playSound("invalid", { volume: 0.45 });
    return;
  }
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
    showToast("That marble cannot go there");
    return;
  }
  history.push(structuredClone(tubes));
  const from = selected;
  const result = move(tubes, from, index);
  moveAnimating = true;
  timedChallenge.sync();
  animateTransfer(from, index, result);
}

let suppressTubeClickUntil = 0;

function shuffle() {
  if (!profile.boosters.shuffle) { playSound("invalid", { volume: 0.55 }); return showToast("No shuffle boosters left"); }
  const marbles = tubes.flat();
  for (let i = marbles.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [marbles[i], marbles[j]] = [marbles[j], marbles[i]]; }
  history.push(structuredClone(tubes));
  tubes = tubes.map((_, i) => i < Math.ceil(marbles.length / 4) ? marbles.splice(0, 4) : []);
  playSound("booster", { volume: 0.72, rate: 1.04 });
  usedScoreBooster = true; profile.boosters.shuffle--; save(); render();
}

app.addEventListener("pointerdown", event => {
  syncBackgroundMusic();
  const tubeTarget = event.target.closest('[data-action="tube"]');
  if (tubeTarget && !tubeTarget.disabled) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    suppressTubeClickUntil = performance.now() + 450;
    chooseTube(Number(tubeTarget.dataset.index));
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

app.addEventListener("click", async event => {
  const target = event.target.closest("[data-action]"); if (!target) return;
  const action = target.dataset.action;
  if (moveAnimating && ["tube", "undo", "shuffle", "add-tube"].includes(action)) return;
  if (["home", "store", "leaderboard", "settings", "rewards", "missions", "pause", "close-modal", "support", "support-refresh", "support-native", "support-submit", "locked-rewards", "locked-missions", "failed-home", "complete-home", "complete-reward", "complete-bonus", "rewarded-lives", "next"].includes(action)) {
    playSound("uiTap", { volume: 0.58 });
  }
  if (action === "home") setView("home");
  else if (action === "play") {
    if (target.disabled) return;
    playSound("levelStart", { volume: 0.74 });
    target.disabled = true; target.classList.add("play-pressed");
    setTimeout(beginLevel, 170);
  }
  else if (action === "tube") {
    if (performance.now() < suppressTubeClickUntil) return;
    chooseTube(Number(target.dataset.index));
  }
  else if (action === "store") setView("store");
  else if (action === "leaderboard") setView("leaderboard");
  else if (action === "locked-rewards") showToast("Daily Rewards unlock at level 5");
  else if (action === "locked-missions") showToast("Daily Missions unlock at level 7");
  else if (action === "support") { modal = "support"; render(); refreshSupportData(); refreshNativeSupportState(); }
  else if (action === "menu-avatar-choice") { profile.avatar=Number(target.dataset.avatar); saveIdentity(profile); save(); render(); }
  else if (action === "menu-edit-name") { if(editingPlayerName){profile.playerName=app.querySelector('.menu-name-input').value.trim().slice(0,18);saveIdentity(profile);save();} editingPlayerName=!editingPlayerName;render(); if(editingPlayerName)app.querySelector('.menu-name-input').focus(); }
  else if (action === "copy-player-id") { try { await navigator.clipboard.writeText(getKemeSupportConfig().gameUid);showToast('Player ID copied'); } catch { showToast('Unable to copy Player ID'); } }
  else if (action === "legal-online") window.open(target.dataset.url,'_blank','noopener');
  else if (action === "menu-doc") { modal='deletion';render(); }
  else if (["menu", "settings", "rewards", "missions", "pause"].includes(action)) { modal = action; render(); }
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
  else if (action === "claim") {
    const today = new Date().toISOString().slice(0, 10);
    if (profile.lastRewardDate === today) { playSound("invalid", { volume: 0.55 }); modal = null; showToast("Today's reward is already claimed"); return; }
    playSound("reward", { volume: 0.8 });
    profile = addCoins(profile, DAILY_REWARD_COINS); profile.lastRewardDate = today; save(); modal = null; showToast(`${DAILY_REWARD_COINS} coins claimed`);
  }
  else if (action === "complete-reward") {
    playSound("reward", { volume: 0.62, rate: 1.02 });
    showToast(`${levelReward()} coins added`);
  }
  else if (action === "complete-bonus") {
    if (completeBonusClaimed) { playSound("invalid", { volume: 0.5 }); showToast("Bonus already claimed"); return; }
    target.disabled = true;
    showToast("Loading reward ad...");
    const earned = await showOptionalAd(showRewardedCoinsAd);
    if (!earned) {
      target.disabled = false;
      playSound("invalid", { volume: 0.5 });
      showToast("Ad unavailable. Try again soon.");
      return;
    }
    playSound("reward", { volume: 0.82, rate: 1.06 });
    profile = addCoins(profile, levelReward());
    completeBonusClaimed = true;
    save();
    render();
    showToast(`${levelReward()} bonus coins added`);
  }
  else if (action === "rewarded-lives") {
    target.disabled = true;
    showToast("Loading reward ad...");
    const earned = await showOptionalAd(showRewardedLivesAd);
    if (!earned) {
      target.disabled = false;
      playSound("invalid", { volume: 0.5 });
      showToast("Ad unavailable. Try again soon.");
      return;
    }
    playSound("reward", { volume: 0.82, rate: 1.06 });
    profile = refreshLives(profile);
    profile.lives = Math.min(MAX_LIVES, profile.lives + REWARDED_LIVES_AMOUNT);
    if (profile.lives >= MAX_LIVES) profile.lastLifeAt = null;
    save();
    render();
    showToast(`${REWARDED_LIVES_AMOUNT} lives added`);
  }
  else if (action === "undo") {
    if (!history.length || !profile.boosters.undo) { playSound("invalid", { volume: 0.55 }); return showToast("Nothing to undo"); }
    playSound("booster", { volume: 0.72, rate: 0.96 });
    usedScoreBooster = true; tubes = history.pop(); profile.boosters.undo--; save(); render();
  }
  else if (action === "shuffle") shuffle();
  else if (action === "add-tube") {
    if (!profile.boosters.tube) { playSound("invalid", { volume: 0.55 }); return showToast("No add-tube boosters left"); }
    playSound("booster", { volume: 0.74, rate: 1.08 });
    usedScoreBooster = true; tubes.push([]); profile.boosters.tube--; save(); render();
  }
  else if (action === "failed-home") setView("home");
  else if (action === "retry") { playSound("levelStart", { volume: 0.74, rate: 1.02 }); beginLevel(); }
  else if (action === "next") {
    target.disabled = true;
    await showOptionalAd(showInterstitialAd);
    goToNextLevel();
  }
  else if (action === "complete-home") { profile.level = Math.min(TOTAL_LEVELS, Math.max(profile.level + 1, profile.unlocked)); save(); setView("home"); }
});

function updateSupportDraft(event) {
  const field = event.target.closest("[data-support-field]");
  if (!field) return;
  supportDraft[field.dataset.supportField] = field.value;
}

app.addEventListener("input", updateSupportDraft);
app.addEventListener("change", updateSupportDraft);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pauseMusic();
    return;
  }
  syncBackgroundMusic();
});

render();
syncBackgroundMusic();
setTimeout(() => { if (view === "loading") setView("home"); }, 3000);

restoreIdentity(profile).then(()=>{applyIdentity(profile);save();render();});

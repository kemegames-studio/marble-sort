import { LEVELS } from "./levels.js";
import { canMove, move, isSolved } from "./game-engine.js";
import { addCoins, refreshLives, spendLife } from "./economy.js";

const app = document.querySelector("#app");
const STORAGE = "marble-sort-state-v1";
const initial = { level: 1, unlocked: 1, coins: 2450, lives: 5, lastLifeAt: null, lastRewardDate: null, music: true, sound: true, boosters: { undo: 5, shuffle: 3, tube: 2 } };
let profile = { ...initial, ...JSON.parse(localStorage.getItem(STORAGE) || "{}") };
profile = refreshLives(profile);
let view = "loading";
let tubes = [];
let selected = null;
let history = [];
let modal = null;
let toast = "";
let transitionTimer;
let moveAnimating = false;

function save() { localStorage.setItem(STORAGE, JSON.stringify(profile)); }
function setView(next) { view = next; modal = null; selected = null; moveAnimating = false; render(); }
function showToast(message) { toast = message; render(); clearTimeout(transitionTimer); transitionTimer = setTimeout(() => { toast = ""; render(); }, 1700); }
function levelData() { return LEVELS[Math.min(profile.level, 100) - 1]; }
function beginLevel() {
  const attempt = spendLife(profile);
  profile = attempt.profile;
  if (!attempt.spent) { save(); showToast("No lives left. A new life arrives every 30 minutes."); return; }
  tubes = structuredClone(levelData().tubes); history = []; selected = null; save(); setView("game");
}

function button(label, cls, action, attrs = "") {
  return `<button class="${cls}" data-action="${action}" ${attrs}>${label}</button>`;
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
    <div class="dynamic-level" aria-label="Current level ${profile.level}">${profile.level}</div>
    <div class="home-life-value" aria-label="${profile.lives} of 5 lives">${profile.lives}/5</div>
    <div class="home-coin-value">${profile.coins.toLocaleString()}</div>
    ${button("Menu", "hotspot home-menu", "settings")}
    ${button("Settings", "hotspot home-settings", "settings")}
    ${button("Coins", "hotspot home-coins", "store", 'aria-label="Open coin store"')}
    ${button("Rewards", "hotspot home-rewards", rewardsUnlocked ? "rewards" : "locked-rewards", `aria-label="${rewardsUnlocked ? "Open Daily Rewards" : "Daily Rewards unlock at level 5"}"`)}
    ${button("Missions", "hotspot home-missions", missionsUnlocked ? "missions" : "locked-missions", `aria-label="${missionsUnlocked ? "Open Daily Missions" : "Daily Missions unlock at level 7"}"`)}
    ${button("PLAY", "hotspot home-play", "play")}
    ${button("Home", "hotspot home-current", "home")}
    ${button("Store", "hotspot home-store", "store")}
    ${button("Leaderboard", "hotspot home-leaderboard", "leaderboard")}
  </section>`;
}

function marble(color) { return `<div class="marble ${color}" aria-label="${color} marble"></div>`; }
function gameView() {
  const columnCount = tubes.length > 10 ? 6 : tubes.length > 8 ? 5 : Math.min(4, tubes.length);
  const renderedTubes = tubes.map((tube, i) => {
    const valid = selected !== null && canMove(tubes, selected, i);
    return `<button class="game-tube ${selected === i ? "selected" : ""} ${valid ? "valid-target" : ""}" data-action="tube" data-index="${i}" aria-label="Tube ${i + 1}, ${tube.length} marbles"><span class="game-tube-marbles">${tube.map(marble).join("")}</span></button>`;
  }).join("");
  return `<section class="screen gameplay">
    <header class="gameplay-hud">
      <div class="gameplay-coins" aria-label="${profile.coins.toLocaleString()} coins">
        <img class="gameplay-coin-bar" src="/assets/coin-bar.png" alt="" />
        <img class="gameplay-coin" src="/assets/coin.png" alt="" />
        <span>${profile.coins.toLocaleString()}</span>
      </div>
      ${button('<img src="/assets/settings.png" alt="" />', "gameplay-settings", "settings", 'aria-label="Settings"')}
    </header>
    <div class="gameplay-level" aria-label="Current level ${profile.level}">
      <img src="/assets/game-level-holder.png" alt="" />
      <span>Level ${profile.level}</span>
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
  return `<section class="screen panel-screen" style="padding:0">${button("‹", "icon-button store-back", "home", 'aria-label="Back"')}<img class="store-image" src="/assets/store.png" alt="Marble Sort store" /></section>`;
}

function leaderboardView() {
  const names = ["Lina", "Fahad", "Maya", "Omar", "Noor", "You"];
  return `<section class="screen panel-screen">${hud(true)}<div class="panel-header"><h1>LEADERBOARD</h1></div><div class="card leader-list">${names.map((name, i) => `<div class="leader-row"><strong>#${i + 1}</strong><span class="avatar">${name[0]}</span><span>${name} · ${Math.max(profile.level + 12 - i * 3, 1)}</span></div>`).join("")}</div></section>`;
}

function modalView() {
  if (!modal) return "";
  if (modal === "settings") return `<div class="modal-backdrop"><div class="modal"><h2>SETTINGS</h2><p>Music ${profile.music ? "On" : "Off"}</p>${button(profile.music ? "TURN OFF" : "TURN ON", "action secondary", "toggle-music")}<p>Sound ${profile.sound ? "On" : "Off"}</p>${button(profile.sound ? "TURN OFF" : "TURN ON", "action secondary", "toggle-sound")}<div class="modal-actions">${view === "game" ? button("HOME", "action secondary", "home") : ""}${button("CLOSE", "action", "close-modal")}</div></div></div>`;
  if (modal === "pause") return `<div class="modal-backdrop"><div class="modal"><h2>PAUSED</h2><div class="modal-actions">${button("HOME", "action secondary", "home")}${button("RESUME", "action", "close-modal")}</div></div></div>`;
  if (modal === "rewards" || modal === "missions") {
    const rewards = modal === "rewards";
    return `<div class="modal-backdrop"><div class="modal"><h2>${rewards ? "DAILY REWARDS" : "DAILY MISSIONS"}</h2><img class="modal-art" src="/assets/${rewards ? "rewards" : "missions"}.png" alt=""/><p>${rewards ? "Come back every day for more coins." : "Complete 3 levels and use one booster."}</p><div class="modal-actions">${button(rewards ? "CLAIM 250" : "GOT IT", "action", rewards ? "claim" : "close-modal")}</div></div></div>`;
  }
  if (modal === "complete") return `<div class="modal-backdrop"><div class="modal"><h2>LEVEL COMPLETE!</h2><div style="font-size:70px">⭐⭐⭐</div><p>COINS EARNED</p><div class="earned-coins"><span class="coin-icon"></span><strong>250</strong></div><div class="modal-actions">${button("HOME", "action secondary", "complete-home")}${button("NEXT ›", "action", "next")}</div></div></div>`;
  return "";
}

function render() {
  const content = view === "loading" ? loadingView() : view === "home" ? homeView() : view === "game" ? gameView() : view === "store" ? storeView() : leaderboardView();
  app.innerHTML = `<div class="game-shell">${content}${modalView()}${toast ? `<div class="toast">${toast}</div>` : ""}</div>`;
}

function celebrateCompletedTube(index) {
  const tube = app.querySelector(`.game-tube[data-index="${index}"]`);
  if (!tube) return;
  const burst = document.createElement("span");
  burst.className = "tube-complete-burst";
  tube.append(burst);
  tube.animate([
    { transform: "translateY(0) scale(1)", filter: "brightness(1) drop-shadow(0 0 0 transparent)" },
    { transform: "translateY(-5%) scale(1.08)", filter: "brightness(1.3) drop-shadow(0 0 18px #fff56a)", offset: 0.4 },
    { transform: "translateY(0) scale(1)", filter: "brightness(1) drop-shadow(0 0 8px #7dff62)", offset: 1 }
  ], { duration: 760, easing: "cubic-bezier(.2,.9,.3,1)" });
  [...tube.querySelectorAll(".marble")].forEach((marbleNode, marbleIndex) => {
    marbleNode.animate([
      { transform: "scale(1)" },
      { transform: "scale(1.18)", offset: 0.45 },
      { transform: "scale(1)" }
    ], { duration: 520, delay: marbleIndex * 65, easing: "ease-in-out" });
  });
  setTimeout(() => burst.remove(), 850);
}

function finishMove(result, destination) {
  tubes = result.tubes;
  selected = null;
  moveAnimating = false;
  render();
  const completed = tubes[destination]?.length === 4 && tubes[destination].every(color => color === tubes[destination][0]);
  if (completed) celebrateCompletedTube(destination);
  if (isSolved(tubes)) setTimeout(() => {
    profile = addCoins(profile, 250);
    profile.unlocked = Math.min(100, Math.max(profile.unlocked, profile.level + 1));
    save();
    modal = "complete";
    render();
  }, 450);
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
  const flights = moving.map((marbleNode, arrivalSlot) => {
    const start = marbleNode.getBoundingClientRect();
    const size = start.width;
    const exitLeft = sourceRect.left + (sourceRect.width - size) / 2;
    const exitTop = sourceRect.top - (size * 0.82);
    const entryLeft = destinationRect.left + (destinationRect.width - size) / 2;
    const entryTop = destinationRect.top - (size * 0.82);
    const endLeft = targetRect.left + (targetRect.width - size) / 2;
    const endTop = targetRect.bottom - ((targetCount + arrivalSlot + 1) * size);
    const apexLeft = (exitLeft + entryLeft) / 2;
    const apexTop = Math.min(exitTop, entryTop) - Math.max(34, size * 1.2);
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

    const animation = clone.animate([
      { transform: "translate3d(0, 0, 0) scale(1) rotate(0deg)", offset: 0 },
      { transform: `${point(exitLeft, exitTop)} scale(1.06) rotate(${direction * 5}deg)`, offset: 0.24 },
      { transform: `${point(apexLeft, apexTop)} scale(1.12) rotate(${direction * 13}deg)`, offset: 0.5 },
      { transform: `${point(entryLeft, entryTop)} scale(1.05) rotate(0deg)`, offset: 0.76 },
      { transform: `${point(endLeft, endTop)} scale(1) rotate(0deg)`, offset: 1 }
    ], {
      duration: 640,
      delay: arrivalSlot * 105,
      easing: "cubic-bezier(.2,.78,.24,1)",
      fill: "forwards"
    });
    return { clone, animation };
  });

  source.animate([
    { transform: "translateY(-7%) rotate(0deg)" },
    { transform: `translateY(-13%) rotate(${direction * 10}deg)`, offset: 0.42 },
    { transform: "translateY(-7%) rotate(0deg)" }
  ], { duration: 560 + ((result.moved - 1) * 105), easing: "ease-in-out" });
  target.animate([
    { transform: "translateY(0) scale(1)" },
    { transform: "translateY(3%) scale(1.035)", offset: 0.78 },
    { transform: "translateY(0) scale(1)" }
  ], { duration: 600, easing: "cubic-bezier(.2,.8,.3,1)" });

  await Promise.all(flights.map(({ animation }) => animation.finished.catch(() => undefined)));
  flights.forEach(({ clone }) => clone.remove());
  finishMove(result, to);
}

function chooseTube(index) {
  if (moveAnimating) return;
  if (selected === null) {
    if (!tubes[index].length) return;
    selected = index; render(); return;
  }
  if (selected === index) { selected = null; render(); return; }
  if (!canMove(tubes, selected, index)) { selected = tubes[index].length ? index : null; showToast("That marble cannot go there"); return; }
  history.push(structuredClone(tubes));
  const from = selected;
  const result = move(tubes, from, index);
  moveAnimating = true;
  animateTransfer(from, index, result);
}

function shuffle() {
  if (!profile.boosters.shuffle) return showToast("No shuffle boosters left");
  const marbles = tubes.flat();
  for (let i = marbles.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [marbles[i], marbles[j]] = [marbles[j], marbles[i]]; }
  history.push(structuredClone(tubes));
  tubes = tubes.map((_, i) => i < Math.ceil(marbles.length / 4) ? marbles.splice(0, 4) : []);
  profile.boosters.shuffle--; save(); render();
}

app.addEventListener("click", event => {
  const target = event.target.closest("[data-action]"); if (!target) return;
  const action = target.dataset.action;
  if (moveAnimating && ["tube", "undo", "shuffle", "add-tube"].includes(action)) return;
  if (action === "home") setView("home");
  else if (action === "play") {
    if (target.disabled) return;
    target.disabled = true; target.classList.add("play-pressed");
    setTimeout(beginLevel, 190);
  }
  else if (action === "tube") chooseTube(Number(target.dataset.index));
  else if (action === "store") setView("store");
  else if (action === "leaderboard") setView("leaderboard");
  else if (action === "locked-rewards") showToast("Daily Rewards unlock at level 5");
  else if (action === "locked-missions") showToast("Daily Missions unlock at level 7");
  else if (["settings", "rewards", "missions", "pause"].includes(action)) { modal = action; render(); }
  else if (action === "close-modal") { modal = null; render(); }
  else if (action === "toggle-music") { profile.music = !profile.music; save(); render(); }
  else if (action === "toggle-sound") { profile.sound = !profile.sound; save(); render(); }
  else if (action === "claim") {
    const today = new Date().toISOString().slice(0, 10);
    if (profile.lastRewardDate === today) { modal = null; showToast("Today's reward is already claimed"); return; }
    profile = addCoins(profile, 250); profile.lastRewardDate = today; save(); modal = null; showToast("250 coins claimed");
  }
  else if (action === "undo") { if (!history.length || !profile.boosters.undo) return showToast("Nothing to undo"); tubes = history.pop(); profile.boosters.undo--; save(); render(); }
  else if (action === "shuffle") shuffle();
  else if (action === "add-tube") { if (!profile.boosters.tube) return showToast("No add-tube boosters left"); tubes.push([]); profile.boosters.tube--; save(); render(); }
  else if (action === "next") { profile.level = Math.min(100, profile.level + 1); save(); beginLevel(); }
  else if (action === "complete-home") { profile.level = Math.min(100, Math.max(profile.level + 1, profile.unlocked)); save(); setView("home"); }
});

render();
setTimeout(() => { if (view === "loading") setView("home"); }, 2400);

import { LEVELS } from "./levels.js";
import { canMove, move, isSolved } from "./game-engine.js";

const app = document.querySelector("#app");
const STORAGE = "marble-sort-state-v1";
const initial = { level: 1, unlocked: 1, coins: 2450, lives: 5, music: true, sound: true, boosters: { undo: 5, shuffle: 3, tube: 2 } };
let profile = { ...initial, ...JSON.parse(localStorage.getItem(STORAGE) || "{}") };
let view = "loading";
let tubes = [];
let selected = null;
let history = [];
let modal = null;
let toast = "";
let transitionTimer;

function save() { localStorage.setItem(STORAGE, JSON.stringify(profile)); }
function setView(next) { view = next; modal = null; selected = null; render(); }
function showToast(message) { toast = message; render(); clearTimeout(transitionTimer); transitionTimer = setTimeout(() => { toast = ""; render(); }, 1700); }
function levelData() { return LEVELS[Math.min(profile.level, 100) - 1]; }
function beginLevel() { tubes = structuredClone(levelData().tubes); history = []; selected = null; setView("game"); }

function button(label, cls, action, attrs = "") {
  return `<button class="${cls}" data-action="${action}" ${attrs}>${label}</button>`;
}

function hud(back = false) {
  return `<header class="hud">
    ${button(back ? "‹" : "⚙", "icon-button", back ? "home" : "settings", `aria-label="${back ? "Back" : "Settings"}"`)}
    <div class="pill"><span>❤</span><span>${profile.lives}/5</span></div>
    <div class="pill"><span class="coin-mini">♛</span><span>${profile.coins.toLocaleString()}</span></div>
  </header>`;
}

function loadingView() {
  return `<section class="screen loading">${button("Skip", "loading-skip", "home", 'aria-label="Skip loading"')}</section>`;
}

function homeView() {
  return `<section class="screen home">
    <div class="dynamic-level" aria-label="Current level ${profile.level}">${profile.level}</div>
    ${button("Settings", "hotspot home-settings", "settings")}
    ${button("Rewards", "hotspot home-rewards", "rewards")}
    ${button("Missions", "hotspot home-missions", "missions")}
    ${button("Play", "hotspot home-play", "play")}
    ${button("Store", "hotspot home-store", "store")}
    ${button("Leaderboard", "hotspot home-leaderboard", "leaderboard")}
  </section>`;
}

function marble(color) { return `<div class="marble ${color}" aria-label="${color} marble"></div>`; }
function gameView() {
  const renderedTubes = tubes.map((tube, i) => {
    const valid = selected !== null && canMove(tubes, selected, i);
    return `<button class="tube ${selected === i ? "selected" : ""} ${valid ? "valid-target" : ""}" data-action="tube" data-index="${i}" aria-label="Tube ${i + 1}, ${tube.length} marbles">${tube.map(marble).join("")}</button>`;
  }).join("");
  return `<section class="screen gameplay">
    ${hud(true)}
    <div class="level-title">LEVEL ${profile.level}</div>
    <div class="tube-board">${renderedTubes}</div>
    <nav class="boosters" aria-label="Boosters">
      ${button(`↶<small>${profile.boosters.undo}</small>`, "booster", "undo", 'aria-label="Undo"')}
      ${button(`⤨<small>${profile.boosters.shuffle}</small>`, "booster", "shuffle", 'aria-label="Shuffle"')}
      ${button(`+<small>${profile.boosters.tube}</small>`, "booster", "add-tube", 'aria-label="Add tube"')}
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
  if (modal === "settings") return `<div class="modal-backdrop"><div class="modal"><h2>SETTINGS</h2><p>Music ${profile.music ? "On" : "Off"}</p>${button(profile.music ? "TURN OFF" : "TURN ON", "action secondary", "toggle-music")}<p>Sound ${profile.sound ? "On" : "Off"}</p>${button(profile.sound ? "TURN OFF" : "TURN ON", "action secondary", "toggle-sound")}<div class="modal-actions">${button("CLOSE", "action", "close-modal")}</div></div></div>`;
  if (modal === "pause") return `<div class="modal-backdrop"><div class="modal"><h2>PAUSED</h2><div class="modal-actions">${button("HOME", "action secondary", "home")}${button("RESUME", "action", "close-modal")}</div></div></div>`;
  if (modal === "rewards" || modal === "missions") {
    const rewards = modal === "rewards";
    return `<div class="modal-backdrop"><div class="modal"><h2>${rewards ? "DAILY REWARDS" : "DAILY MISSIONS"}</h2><img class="modal-art" src="/assets/${rewards ? "rewards" : "missions"}.png" alt=""/><p>${rewards ? "Come back every day for more coins." : "Complete 3 levels and use one booster."}</p><div class="modal-actions">${button(rewards ? "CLAIM 250" : "GOT IT", "action", rewards ? "claim" : "close-modal")}</div></div></div>`;
  }
  if (modal === "complete") return `<div class="modal-backdrop"><div class="modal"><h2>LEVEL COMPLETE!</h2><div style="font-size:70px">⭐⭐⭐</div><p>COINS EARNED</p><div style="font-size:44px;font-weight:1000;color:#f5a800">♛ 250</div><div class="modal-actions">${button("HOME", "action secondary", "complete-home")}${button("NEXT ›", "action", "next")}</div></div></div>`;
  return "";
}

function render() {
  const content = view === "loading" ? loadingView() : view === "home" ? homeView() : view === "game" ? gameView() : view === "store" ? storeView() : leaderboardView();
  app.innerHTML = `<div class="game-shell">${content}${modalView()}${toast ? `<div class="toast">${toast}</div>` : ""}</div>`;
}

function chooseTube(index) {
  if (selected === null) {
    if (!tubes[index].length) return;
    selected = index; render(); return;
  }
  if (selected === index) { selected = null; render(); return; }
  if (!canMove(tubes, selected, index)) { selected = tubes[index].length ? index : null; showToast("That marble cannot go there"); return; }
  history.push(structuredClone(tubes));
  const result = move(tubes, selected, index);
  tubes = result.tubes; selected = null; render();
  if (isSolved(tubes)) setTimeout(() => { profile.coins += 250; profile.unlocked = Math.min(100, Math.max(profile.unlocked, profile.level + 1)); save(); modal = "complete"; render(); }, 450);
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
  if (action === "home") setView("home");
  else if (action === "play") beginLevel();
  else if (action === "tube") chooseTube(Number(target.dataset.index));
  else if (action === "store") setView("store");
  else if (action === "leaderboard") setView("leaderboard");
  else if (["settings", "rewards", "missions", "pause"].includes(action)) { modal = action; render(); }
  else if (action === "close-modal") { modal = null; render(); }
  else if (action === "toggle-music") { profile.music = !profile.music; save(); render(); }
  else if (action === "toggle-sound") { profile.sound = !profile.sound; save(); render(); }
  else if (action === "claim") { profile.coins += 250; save(); modal = null; showToast("250 coins claimed"); }
  else if (action === "undo") { if (!history.length || !profile.boosters.undo) return showToast("Nothing to undo"); tubes = history.pop(); profile.boosters.undo--; save(); render(); }
  else if (action === "shuffle") shuffle();
  else if (action === "add-tube") { if (!profile.boosters.tube) return showToast("No add-tube boosters left"); tubes.push([]); profile.boosters.tube--; save(); render(); }
  else if (action === "next") { profile.level = Math.min(100, profile.level + 1); save(); beginLevel(); }
  else if (action === "complete-home") { profile.level = Math.min(100, Math.max(profile.level + 1, profile.unlocked)); save(); setView("home"); }
});

render();
setTimeout(() => { if (view === "loading") setView("home"); }, 2400);

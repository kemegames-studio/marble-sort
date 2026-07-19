const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const root = __dirname;
const publicDir = path.join(root, "android/app/src/main/assets/public");
const outputDir = path.join(root, "qa-v26-regression");
const port = 5194;
const chromePort = 9336;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".wav": "audio/wav" };

fs.mkdirSync(outputDir, { recursive: true });

const server = http.createServer((request, response) => {
  let pathname = new URL(request.url, "http://local").pathname;
  if (pathname === "/") pathname = "/index.html";
  const file = path.resolve(publicDir, `.${decodeURIComponent(pathname)}`);
  if (!file.startsWith(publicDir) || !fs.existsSync(file)) {
    response.writeHead(404);
    response.end("not found");
    return;
  }
  response.writeHead(200, { "content-type": mime[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(file).pipe(response);
});

async function ensureChrome() {
  try { await fetch(`http://127.0.0.1:${chromePort}/json/version`); return; } catch {}
  const candidates = [
    `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env["ProgramFiles(x86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ];
  const executable = candidates.find(fs.existsSync);
  if (!executable) throw new Error("Chrome or Edge was not found");
  spawn(executable, [
    "--headless=new",
    `--remote-debugging-port=${chromePort}`,
    `--user-data-dir=${path.join(root, ".qa-chrome-v16")}`,
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ], { detached: true, stdio: "ignore" }).unref();
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { await fetch(`http://127.0.0.1:${chromePort}/json/version`); return; } catch {}
    await sleep(200);
  }
  throw new Error("Browser debug endpoint did not start");
}

async function createPage() {
  const response = await fetch(`http://127.0.0.1:${chromePort}/json/new?about:blank`, { method: "PUT" });
  const target = await response.json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const events = [];
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === "Runtime.exceptionThrown") events.push({ type: "exception", value: message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text });
    if (message.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(message.params.type)) events.push({ type: message.params.type, value: (message.params.args || []).map((arg) => arg.value || arg.description || "").join(" ") });
    if (message.id && pending.has(message.id)) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      message.error ? entry.reject(new Error(JSON.stringify(message.error))) : entry.resolve(message.result || {});
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  return { send, events, close: () => socket.close() };
}

async function evaluate(page, expression) {
  const result = await page.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

async function waitFor(page, expression, label = expression) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await evaluate(page, `Boolean(${expression})`).catch(() => false)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function click(page, selector) {
  const point = await evaluate(page, `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return null; const rect = element.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`);
  if (!point) throw new Error(`Missing click target: ${selector}`);
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
}

async function screenshot(page, name) {
  const image = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  fs.writeFileSync(path.join(outputDir, `${name}.png`), Buffer.from(image.data, "base64"));
}

async function hasPressedEffect(page, selector) {
  const point = await evaluate(page, `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return null; const rect = element.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`);
  if (!point) return false;
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await sleep(80);
  const active = await evaluate(page, `(() => { const style = getComputedStyle(document.querySelector(${JSON.stringify(selector)})); return style.transform !== "none" || style.filter !== "none" || style.backgroundColor !== "rgba(0, 0, 0, 0)"; })()`);
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 1, y: 1, button: "left", clickCount: 1 });
  return active;
}

function profile(overrides = {}) {
  return {
    version: 2,
    level: 10,
    unlocked: 10,
    coins: 2500,
    lives: 4,
    launched: true,
    onboarded: true,
    music: false,
    sound: false,
    vibration: false,
    boosters: { undo: 2, shuffle: 2, tube: 2 },
    boosterSeen: { undo: true, shuffle: true, tube: true },
    tutorials: { level1: true },
    dailyLogin: { streak: 0, lastClaimDate: "2026-07-10" },
    missions: { date: new Date().toISOString().slice(0, 10), progress: { coins: 300, levels: 4, undo: 3, shuffle: 3, tube: 2 }, claimed: {}, bonusClaimed: false },
    ...overrides,
  };
}

async function load(page, state, width = 393, height = 852) {
  await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: true });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem("marble-sort-state-v1", ${JSON.stringify(JSON.stringify(state))});` });
  await page.send("Page.navigate", { url: `http://127.0.0.1:${port}/index.html?qa=${Math.random()}` });
  await waitFor(page, "document.querySelector('.game-shell')", "game shell");
}

async function audit(page, label, rootSelector = ".game-shell") {
  const result = await evaluate(page, `(() => {
    const root = document.querySelector(${JSON.stringify(rootSelector)});
    const text = root ? root.innerText : "";
    const mojibake = /[\u00c2\u00c3\u00e2\u00f0]|Ã¯Â¿Â½/.test(text);
    const viewport = { width: innerWidth, height: innerHeight };
    const allowVerticalOverflow = root?.matches(".st-screen, .menu-popup-v2");
    const offenders = [...document.querySelectorAll("button, [role=dialog], .liveops-modal, .menu-popup-v2")]
      .filter((element) => {
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && (rect.left < -2 || rect.right > innerWidth + 2 || (!allowVerticalOverflow && (rect.top < -40 || rect.bottom > innerHeight + 40)));
      })
      .slice(0, 12)
      .map((element) => ({ cls: element.className, text: element.innerText?.slice(0, 40), rect: (() => { const r = element.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; })() }));
    const smallButtons = [...document.querySelectorAll("button")]
      .filter((element) => { const r = element.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.width < 40 || r.height < 40) && getComputedStyle(element).visibility !== "hidden"; })
      .slice(0, 12)
      .map((element) => ({ cls: element.className, size: (() => { const r = element.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })() }));
    return { label: ${JSON.stringify(label)}, viewport, mojibake, offenders, smallButtons };
  })()`);
  return result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

server.listen(port, "127.0.0.1", async () => {
  let page;
  const bundleSource = fs.readFileSync(path.join(publicDir, "assets/index-xlleoick.js"), "utf8");
  const report = {
    screens: [],
    interactions: {},
    performance: {},
    hardLevelRules: {
      schedulePresent: bundleSource.includes("HardLevels=[30,35,39,44,48,53,57,62,66,71,75,80,84,89,93,98]"),
      rewardIsDouble: bundleSource.includes("function GetLevelReward(e){return IsHardLevel(e)?Ve*2:Ve}"),
      playAndNextUseWarning: bundleSource.includes("setTimeout(StartLevelWithHardWarning,170)") && bundleSource.includes("y(),StartLevelWithHardWarning()"),
      completionUsesDynamicReward: bundleSource.includes('o=F(o,HardReward)') && bundleSource.includes('Re("coins",HardReward)'),
      adUsesDynamicReward: bundleSource.includes('o=F(o,HardBonus)') && bundleSource.includes('Mn(HardBonus,".winpop-ad")'),
    },
  };
  try {
    await ensureChrome();
    page = await createPage();
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Performance.enable");
    await page.send("Emulation.setLocaleOverride", { locale: "ar-SA" });

    const loadStarted = Date.now();
    await load(page, profile());
    await waitFor(page, "document.querySelector('[data-action=\"rewards\"]')", "home");
    report.performance.homeReadyMs = Date.now() - loadStarted;
    report.screens.push(await audit(page, "home"));
    await screenshot(page, "01-home");

    await click(page, '[data-action="menu"]');
    await waitFor(page, "document.querySelector('.menu-popup-v2')", "menu");
    report.screens.push(await audit(page, "menu"));
    await screenshot(page, "02-menu");
    report.interactions.menuCharacterAvatars = await evaluate(page, "(() => { const labels = [...document.querySelectorAll('.menu-avatar-choice')].map((button) => button.getAttribute('aria-label') || ''); return labels.length === 8 && labels.includes('Choose Smile avatar') && labels.includes('Choose Arcade avatar'); })()");
    report.interactions.menuSupportIsPrimary = await evaluate(page, "document.querySelector('.menu-support').getBoundingClientRect().top < document.querySelector('.menu-links-panel').getBoundingClientRect().top");
    report.interactions.menuUsesInfoIcons = await evaluate(page, "document.querySelectorAll('.menu-info-glyph').length === 3 && ![...document.querySelectorAll('.menu-link')].some((button) => button.textContent.includes('?'))");
    report.interactions.menuIdMiddleTruncated = await evaluate(page, "/^KMG-.+\\.\\.\\..{4}$/.test(document.querySelector('.menu-id').textContent.trim())");
    report.interactions.menuSecondaryTapTargets = await evaluate(page, "[...document.querySelectorAll('.menu-edit,.menu-copy')].every((button) => { const rect = button.getBoundingClientRect(); return rect.width >= 44 && rect.height >= 44; })");
    report.interactions.menuVersionMatchesBuild = await evaluate(page, "document.querySelector('.menu-version').textContent.trim() === '0.1.0 (26)'");
    await click(page, '.menu-avatar-choice[data-avatar="5"]');
    report.interactions.avatarFirstTap = await evaluate(page, "document.querySelector('.menu-avatar-choice[data-avatar=\"5\"]').classList.contains('is-selected')");
    await click(page, '.menu-popup-v2 [data-action="close-modal"]');

    await click(page, '[data-action="settings"]');
    await waitFor(page, "document.querySelector('.settings-popup')", "settings");
    report.screens.push(await audit(page, "settings"));
    await screenshot(page, "03-settings");
    await click(page, '.settings-popup [data-action="close-modal"]');

    await click(page, '[data-action="lives"]');
    await waitFor(page, "document.querySelector('.lv-art-wrap')", "lives");
    report.interactions.livesCloseIsCircular = await evaluate(page, "(() => { const button = document.querySelector('.lv-hot-close'); const rect = button.getBoundingClientRect(); return Math.abs(rect.width - rect.height) < 1.5 && getComputedStyle(button).borderRadius !== '0px'; })()");
    report.interactions.livesCloseAlignedToTitle = await evaluate(page, "(() => { const close = document.querySelector('.lv-hot-close').getBoundingClientRect(); const title = document.querySelector('.lv-title-row').getBoundingClientRect(); return Math.abs((close.top + close.height / 2) - (title.top + title.height / 2)) <= 10; })()");
    report.interactions.livesHasScreenMargins = await evaluate(page, "(() => { const rect = document.querySelector('.lv-art-wrap').getBoundingClientRect(); return rect.left >= 28 && innerWidth - rect.right >= 28; })()");
    report.interactions.livesCountdownProminent = await evaluate(page, "(() => { const timer = document.querySelector('.lv-timer'); if (!timer) return true; const style = getComputedStyle(timer); return timer.querySelector('.lives-countdown') && style.backgroundImage !== 'none' && timer.getBoundingClientRect().height >= 30; })()");
    report.interactions.livesCtaPressedEffect = await hasPressedEffect(page, ".lv-hot-ad");
    report.screens.push(await audit(page, "lives"));
    await screenshot(page, "04-lives");
    await click(page, '.lv-hot-close');

    await click(page, '[data-action="rewards"]');
    await waitFor(page, "document.querySelector('.dl-modal .dl-claim-btn')", "daily login");
    report.interactions.dailyLoginBadgeAttached = await evaluate(page, "document.querySelector('.dl-modal .liveops-art-title img')?.getAttribute('src') === '/assets/daily-login-title-attached.png'");
    report.screens.push(await audit(page, "daily-login"));
    report.interactions.dailyClaimVisible = await evaluate(page, "!!document.querySelector('.dl-claim-btn')");
    await screenshot(page, "05-daily-login");
    await click(page, '.dl-modal .liveops-close');

    await click(page, '[data-action="missions"]');
    await waitFor(page, "document.querySelector('.dm-modal .dm-claim')", "daily missions");
    report.screens.push(await audit(page, "daily-missions"));
    await screenshot(page, "06-daily-missions");
    await click(page, '.dm-row .dm-claim');
    report.interactions.missionClaimFirstTap = await evaluate(page, "JSON.parse(localStorage.getItem('marble-sort-state-v1')).missions.claimed.coins === true");
    report.interactions.missionClaimUsesCheck = await evaluate(page, "(() => { const check = document.querySelector('.dm-row-done .dm-check'); return Boolean(check && check.getAttribute('aria-label') === 'Completed' && !/DONE/i.test(check.textContent)); })()");
    await screenshot(page, "06b-daily-missions-claimed");
    await click(page, '.dm-modal .liveops-close');

    await click(page, '[data-action="noads"]');
    await waitFor(page, "document.querySelector('.na-modal')", "no-ads");
    await waitFor(page, "document.querySelector('.na-modal-art')?.complete && document.querySelector('.na-modal-art')?.naturalWidth > 0", "no-ads artwork");
    report.screens.push(await audit(page, "no-ads"));
    report.interactions.noAdsOffers = await evaluate(page, "document.querySelectorAll('.na-offer[data-action=\"buy-product\"]').length");
    await screenshot(page, "07-no-ads");
    await click(page, '.na-modal-close');

    await click(page, '[data-action="store"]');
    await waitFor(page, "document.querySelector('.st-screen')", "store");
    await waitFor(page, "[...document.querySelectorAll('.store-bundle-card img,.store-coin-panel-art')].every(image => image.complete && image.naturalWidth > 0)", "premium store artwork");
    report.interactions.storeBundleCount = await evaluate(page, "document.querySelectorAll('.store-bundle-card[data-action=\"buy-product\"]').length");
    report.interactions.storeCoinPackCount = await evaluate(page, "document.querySelectorAll('.store-coin-hot[data-action=\"buy-product\"]').length");
    report.interactions.storeBoostersRemoved = await evaluate(page, "!document.querySelector('.st-items') && !/BOOSTERS/.test(document.querySelector('.st-screen').innerText)");
    report.interactions.storeCoinBarUsesHomeArt = await evaluate(page, "document.querySelector('.store-home-coin-bar img')?.getAttribute('src') === '/assets/home-screen-clean-features.png'");
    report.interactions.storeCoinBarCentered = await evaluate(page, "(() => { const rect = document.querySelector('.store-home-coin-bar').getBoundingClientRect(); return Math.abs((rect.left + rect.width / 2) - innerWidth / 2) < 1.5; })()");
    report.interactions.bundlePurchasePressedEffect = await hasPressedEffect(page, ".store-bundle-card");
    report.interactions.coinPurchasePressedEffect = await hasPressedEffect(page, ".store-coin-hot");
    report.screens.push(await audit(page, "store", ".st-screen"));
    await screenshot(page, "08-store-top");
    await evaluate(page, "document.querySelector('.st-screen').scrollTop = document.querySelector('.st-screen').scrollHeight");
    await sleep(150);
    await screenshot(page, "09-store-bottom");

    await load(page, profile({ level: 20, unlocked: 20, coins: 0, boosters: { undo: 0, shuffle: 0, tube: 0 } }));
    await waitFor(page, "document.querySelector('[data-action=\"play\"]')", "home for gameplay");
    await click(page, '[data-action="play"]');
    await waitFor(page, "document.querySelector('.gameplay')", "gameplay");
    report.interactions.gameplayCoinsUseLatinDigits = await evaluate(page, "/^[0-9,]+$/.test(document.querySelector('.gameplay-coin-value')?.textContent.trim() || '')");
    report.screens.push(await audit(page, "gameplay-level-20"));
    await screenshot(page, "10-gameplay");
    await click(page, '[data-action="shuffle"]');
    await waitFor(page, "document.querySelector('.booster-ad-modal')", "booster ad popup");
    report.screens.push(await audit(page, "booster-ad"));
    await screenshot(page, "11-booster-ad");
    await click(page, '.booster-ad-close');
    await click(page, '[data-action="settings"]');
    await waitFor(page, "document.querySelector('.settings-popup')", "game settings");
    await click(page, '.settings-popup [data-action="home"]');
    await waitFor(page, "document.querySelector('.leave-level-modal')", "leave warning");
    report.screens.push(await audit(page, "leave-level"));
    await screenshot(page, "12-leave-level");
    await click(page, '[data-action="close-modal"]');
    await waitFor(page, "document.querySelector('.gameplay') && !document.querySelector('.leave-level-modal')", "gameplay after staying");
    report.interactions.leaveStayFirstTap = await evaluate(page, "document.querySelector('.leave-level-modal') === null");
    await click(page, '[data-action="settings"]');
    await waitFor(page, "document.querySelector('.settings-popup')", "game settings after staying");
    await click(page, '.settings-popup [data-action="home"]');
    await waitFor(page, "document.querySelector('.leave-level-modal')", "leave warning after staying");
    await click(page, '[data-action="confirm-leave-level"]');
    await waitFor(page, "document.querySelector('.home')", "home after leaving");
    report.interactions.leaveFirstTap = (await evaluate(page, "JSON.parse(localStorage.getItem('marble-sort-state-v1')).lives")) === 3;

    await load(page, profile({ level: 1, unlocked: 2, tutorials: { level1: true } }));
    await waitFor(page, "document.querySelector('[data-action=\"play\"]')", "home for grouped pour test");
    await click(page, '[data-action="play"]');
    await waitFor(page, "document.querySelectorAll('.game-tube').length === 2", "level 1 grouped pour board");
    await evaluate(page, `(() => {
      window.__groupedPour = { groups: 0, marbles: 0, maxConcurrent: 0, active: 0, startedAt: 0, endedAt: 0, longTasks: [] };
      new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (!(node instanceof Element) || !node.matches('.flying-marble-group')) continue;
            const metrics = window.__groupedPour;
            metrics.groups += 1;
            metrics.marbles = node.querySelectorAll('.flying-marble').length;
            metrics.active += 1;
            metrics.maxConcurrent = Math.max(metrics.maxConcurrent, metrics.active);
            metrics.startedAt ||= performance.now();
          }
          for (const node of record.removedNodes) {
            if (!(node instanceof Element) || !node.matches('.flying-marble-group')) continue;
            const metrics = window.__groupedPour;
            metrics.active = Math.max(0, metrics.active - 1);
            metrics.endedAt = performance.now();
          }
        }
      }).observe(document.body, { childList: true, subtree: true });
      try {
        new PerformanceObserver((list) => {
          window.__groupedPour.longTasks.push(...list.getEntries().map((entry) => Math.round(entry.duration)));
        }).observe({ type: 'longtask', buffered: true });
      } catch {}
    })()`);
    await click(page, '.game-tube[data-index="1"]');
    await waitFor(page, "document.querySelector('.game-tube[data-index=\"1\"].selected')", "selected grouped-pour source");
    await click(page, '.game-tube[data-index="0"]');
    await waitFor(page, "window.__groupedPour.groups === 1", "single grouped marble flight");
    await screenshot(page, "12b-grouped-marble-pour");
    await waitFor(page, "window.__groupedPour.endedAt > 0", "grouped marble flight completion");
    await waitFor(page, "document.querySelector('.winpop')", "level completion after grouped pour");
    report.performance.groupedPour = await evaluate(page, `(() => {
      const metrics = window.__groupedPour;
      return { ...metrics, durationMs: Math.round(metrics.endedAt - metrics.startedAt), maxLongTaskMs: Math.max(0, ...metrics.longTasks) };
    })()`);
    report.interactions.multiMarbleUsesSingleFlight = report.performance.groupedPour.groups === 1
      && report.performance.groupedPour.marbles === 3
      && report.performance.groupedPour.maxConcurrent === 1;
    report.interactions.groupedPourDurationBounded = report.performance.groupedPour.durationMs > 300
      && report.performance.groupedPour.durationMs < 900;
    report.interactions.groupedPourCompletesLevel = await evaluate(page, "document.querySelector('.winpop') !== null && JSON.parse(localStorage.getItem('marble-sort-state-v1')).coins === 2540");

    await load(page, profile({ level: 30, unlocked: 30, sound: true }));
    await waitFor(page, "document.querySelector('[data-action=\"play\"]')", "home for hard level");
    const hardStart = Date.now();
    await click(page, '[data-action="play"]');
    await waitFor(page, "document.querySelector('.hard-level-warning img')", "hard-level warning");
    await waitFor(page, "document.querySelector('.hard-level-warning img')?.complete && document.querySelector('.hard-level-warning img')?.naturalWidth > 0", "loaded hard-level warning artwork");
    report.interactions.hardWarningShownFromPlay = true;
    report.interactions.hardWarningHasNoActions = await evaluate(page, "document.querySelectorAll('.hard-level-warning button').length === 0");
    await screenshot(page, "13-hard-level-warning");
    await waitFor(page, "document.querySelector('.gameplay') && !document.querySelector('.hard-level-warning')", "hard level gameplay after warning");
    report.performance.hardWarningFlowMs = Date.now() - hardStart;
    report.interactions.hardWarningDurationValid = report.performance.hardWarningFlowMs >= 1900 && report.performance.hardWarningFlowMs <= 3000;

    await load(page, profile({ level: 31, unlocked: 31 }));
    await waitFor(page, "document.querySelector('[data-action=\"play\"]')", "home for normal level");
    await click(page, '[data-action="play"]');
    await waitFor(page, "document.querySelector('.gameplay')", "normal gameplay without warning");
    report.interactions.normalLevelSkipsWarning = await evaluate(page, "!document.querySelector('.hard-level-warning')");

    await load(page, profile({ level: 2, unlocked: 2 }));
    await waitFor(page, "document.querySelector('[data-action=\"play\"]')", "home for locked boosters");
    await click(page, '[data-action="play"]');
    await waitFor(page, "document.querySelector('.booster-lock-art')", "attached booster lock");
    await waitFor(page, "document.querySelector('.booster-lock-art')?.complete && document.querySelector('.booster-lock-art')?.naturalWidth > 0", "loaded attached booster lock");
    report.interactions.attachedLockVisible = await evaluate(page, "(() => { const image = document.querySelector('.booster-lock-art'); const badge = image?.closest('.gameplay-booster')?.querySelector('.booster-lock-lv'); return Boolean(image?.complete && image.naturalWidth > 0 && badge?.textContent.trim().startsWith('LV')); })()");
    await screenshot(page, "14-locked-boosters");

    await load(page, profile(), 320, 568);
    await waitFor(page, "document.querySelector('[data-action=\"rewards\"]')", "small home");
    await click(page, '[data-action="lives"]');
    await waitFor(page, "document.querySelector('.lv-art-wrap')", "small lives");
    report.screens.push(await audit(page, "lives-small", ".lv-art-wrap"));
    await screenshot(page, "15-lives-small");
    await click(page, '.lv-hot-close');
    await click(page, '[data-action="rewards"]');
    await waitFor(page, "document.querySelector('.dl-modal')", "small daily login");
    report.screens.push(await audit(page, "daily-login-small"));
    await screenshot(page, "15-daily-login-small");
    await click(page, '.dl-modal .liveops-close');
    await click(page, '[data-action="menu"]');
    await waitFor(page, "document.querySelector('.menu-popup-v2')", "small menu");
    report.screens.push(await audit(page, "menu-small", ".menu-popup-v2"));
    await screenshot(page, "16-menu-small");
    await evaluate(page, "document.querySelector('.menu-body-v2').scrollTop = document.querySelector('.menu-body-v2').scrollHeight");
    await sleep(120);
    report.interactions.menuBottomReachable = await evaluate(page, "(() => { const r = document.querySelector('.menu-support').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })()");
    await screenshot(page, "17-menu-small-bottom");

    await load(page, profile(), 320, 568);
    await waitFor(page, "document.querySelector('[data-action=\"store\"]')", "small home for store");
    await click(page, '[data-action="store"]');
    await waitFor(page, "document.querySelector('.store-coin-panel')", "small premium store");
    report.screens.push(await audit(page, "store-small", ".st-screen"));
    await screenshot(page, "18-store-small");

    const metrics = await page.send("Performance.getMetrics");
    const metricMap = Object.fromEntries((metrics.metrics || []).map((item) => [item.name, item.value]));
    report.performance.jsHeapUsedMb = Number(((metricMap.JSHeapUsedSize || 0) / 1048576).toFixed(2));
    report.performance.domNodes = metricMap.Nodes || 0;
    report.consoleEvents = page.events;
    report.unexpectedConsoleEvents = page.events.filter((event) => event.type === "exception" || event.type === "error" || !event.value.includes("Billing unavailable on platform"));

    for (const screen of report.screens) {
      assert(!screen.mojibake, `${screen.label} contains corrupted text`);
      assert(screen.offenders.length === 0, `${screen.label} has elements outside the viewport: ${JSON.stringify(screen.offenders)}`);
    }
    assert(report.interactions.avatarFirstTap, "Avatar selection did not work on the first tap");
    assert(report.interactions.menuCharacterAvatars, "Menu avatar choices still use numeric placeholders");
    assert(report.interactions.menuSupportIsPrimary, "Support is not visually prioritized above policy links");
    assert(report.interactions.menuUsesInfoIcons, "Policy links do not use consistent information icons");
    assert(report.interactions.menuIdMiddleTruncated, "Player ID does not use middle truncation");
    assert(report.interactions.menuSecondaryTapTargets, "Menu edit or copy action has a tap target smaller than 44px");
    assert(report.interactions.menuVersionMatchesBuild, "Visible menu version does not match Android build 25");
    assert(report.interactions.dailyClaimVisible, "Daily Login claim button is missing");
    assert(report.interactions.missionClaimFirstTap, "Mission claim did not work on the first tap");
    assert(report.interactions.missionClaimUsesCheck, "Claimed mission still uses DONE text instead of a completion check");
    assert(report.interactions.dailyLoginBadgeAttached, "Supplied Daily Login title badge is missing");
    assert(report.interactions.livesCloseIsCircular, "Lives popup close button is not circular");
    assert(report.interactions.livesCloseAlignedToTitle, "Lives popup close button is not vertically aligned with the title");
    assert(report.interactions.livesHasScreenMargins, "Lives popup does not retain enough horizontal screen margin");
    assert(report.interactions.livesCountdownProminent, "Lives countdown is not visually connected to the lives display");
    assert(report.interactions.livesCtaPressedEffect, "Lives rewarded-ad CTA is missing pressed feedback");
    assert(report.interactions.leaveStayFirstTap, "Stay did not work on the first tap");
    assert(report.interactions.leaveFirstTap, "Leave confirmation did not work on the first tap");
    assert(report.interactions.multiMarbleUsesSingleFlight, `Multi-marble pour did not use one grouped flight: ${JSON.stringify(report.performance.groupedPour)}`);
    assert(report.interactions.groupedPourDurationBounded, `Grouped pour duration was outside the expected range: ${JSON.stringify(report.performance.groupedPour)}`);
    assert(report.interactions.groupedPourCompletesLevel, "Grouped marble landing did not complete the level and apply its reward");
    assert(report.interactions.gameplayCoinsUseLatinDigits, "Gameplay coin bar did not keep Latin digits under an Arabic locale");
    assert(report.interactions.attachedLockVisible, "Attached lock artwork or its unlock-level badge is missing");
    assert(report.interactions.hardWarningShownFromPlay, "Hard-level warning did not appear from Play");
    assert(report.interactions.hardWarningHasNoActions, "Hard-level warning should auto-dismiss without action buttons");
    assert(report.interactions.hardWarningDurationValid, `Hard-level warning flow duration was ${report.performance.hardWarningFlowMs}ms`);
    assert(report.interactions.normalLevelSkipsWarning, "A normal level incorrectly showed the hard-level warning");
    assert(Object.values(report.hardLevelRules).every(Boolean), `Hard-level reward rules are incomplete: ${JSON.stringify(report.hardLevelRules)}`);
    assert(report.interactions.noAdsOffers === 2, "No-Ads purchase actions are missing");
    assert(report.interactions.storeBundleCount === 3, "Premium Store does not contain exactly three bundle purchases");
    assert(report.interactions.storeCoinPackCount === 6, "Premium Store does not contain exactly six coin purchases");
    assert(report.interactions.storeBoostersRemoved, "Booster purchases are still visible in the Store");
    assert(report.interactions.storeCoinBarUsesHomeArt && report.interactions.storeCoinBarCentered, "Store coin bar does not match and center the Home coin bar");
    assert(report.interactions.bundlePurchasePressedEffect && report.interactions.coinPurchasePressedEffect, "Store purchase controls are missing pressed feedback");
    assert(report.interactions.menuBottomReachable, "Small-screen menu cannot reach the Support button");
    assert(report.unexpectedConsoleEvents.length === 0, `Unexpected console errors were recorded: ${JSON.stringify(report.unexpectedConsoleEvents)}`);

    fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    if (page) {
      try { await screenshot(page, "failure"); } catch {}
    }
    fs.writeFileSync(path.join(outputDir, "failure.txt"), String(error.stack || error));
    console.error(error);
    process.exitCode = 1;
  } finally {
    page?.close();
    server.close();
  }
});

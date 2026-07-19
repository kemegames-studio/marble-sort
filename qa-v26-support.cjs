const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const root = __dirname;
const publicDir = path.join(root, "android/app/src/main/assets/public");
const outputDir = path.join(root, "qa-v26-ui");
const port = 5196;
const chromePort = 9338;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
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
    `--user-data-dir=${path.join(root, ".qa-chrome-v26")}`,
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
    if (message.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(message.params.type)) events.push({ type: message.params.type, value: (message.params.args || []).map(arg => arg.value || arg.description || "").join(" ") });
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const profile = {
  version: 2,
  level: 30,
  unlocked: 30,
  coins: 710,
  lives: 3,
  launched: true,
  onboarded: true,
  music: false,
  sound: false,
  vibration: false,
  playerName: "Player87B1",
  boosters: { undo: 2, shuffle: 2, tube: 2 },
  boosterSeen: { undo: true, shuffle: true, tube: true },
  tutorials: { level1: true },
};

const mockSource = `(() => {
  const originalFetch = window.fetch.bind(window);
  const now = new Date().toISOString();
  const tickets = [
    { id: "ticket-open", ticketNumber: "TKT-10045", subject: "I didn't receive my coins", description: "I purchased a coin pack but did not receive the coins.", status: "open", createdAt: "2026-07-18T07:30:00.000Z", updatedAt: "2026-07-18T07:30:00.000Z", messages: [{ id: "m1", body: "I purchased a coin pack but did not receive the coins.", authorType: "player", createdAt: "2026-07-18T07:30:00.000Z" }] },
    { id: "ticket-replied", ticketNumber: "TKT-10032", subject: "Game keeps freezing", description: "The game freezes after level 245.", status: "pending", createdAt: "2026-07-16T13:15:00.000Z", updatedAt: "2026-07-17T08:00:00.000Z", assignedAgent: { name: "Keme Support" }, messages: [{ id: "m2", body: "The game freezes after level 245.", authorType: "player", createdAt: "2026-07-16T13:15:00.000Z" }, { id: "m3", body: "Thanks for reporting this. We are checking the level data now.", authorType: "agent", createdAt: "2026-07-17T08:00:00.000Z" }] },
    { id: "ticket-closed", ticketNumber: "TKT-10021", subject: "Daily reward not working", description: "I watched the ad but did not get my daily reward.", status: "closed", createdAt: "2026-07-14T06:20:00.000Z", updatedAt: "2026-07-15T09:00:00.000Z", assignedAgent: { name: "Keme Support" }, messages: [{ id: "m4", body: "I watched the ad but did not get my daily reward.", authorType: "player", createdAt: "2026-07-14T06:20:00.000Z" }, { id: "m5", body: "We restored the reward to your account.", authorType: "agent", createdAt: "2026-07-15T09:00:00.000Z" }] },
  ];
  window.__supportMock = { tickets, replyBodies: [], createBodies: [] };
  const ok = data => Promise.resolve(new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "Content-Type": "application/json" } }));
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    if (url.hostname !== "api.kemegames.com") return originalFetch(input, options);
    const route = url.pathname;
    if (route.endsWith("/portal/auth/login")) return ok({ token: "mock-token", player: { id: "player-1" } });
    if (route.endsWith("/portal/tickets/games")) return ok([{ id: "game-marble-sort", name: "Marble Sort" }]);
    if (route.endsWith("/portal/tickets") && (options.method || "GET") === "GET") return ok({ data: tickets, total: tickets.length, page: 1, limit: 10 });
    if (route.endsWith("/portal/tickets") && options.method === "POST") {
      const ticket = { id: "ticket-new", ticketNumber: "TKT-10100", subject: options.body.get("subject"), description: options.body.get("description"), status: "open", createdAt: now, updatedAt: now, messages: [{ id: "new-message", body: options.body.get("description"), authorType: "player", createdAt: now }] };
      window.__supportMock.createBodies.push({ subject: ticket.subject, description: ticket.description });
      tickets.unshift(ticket);
      return ok(ticket);
    }
    const messageMatch = route.match(/\\/portal\\/tickets\\/([^/]+)\\/messages$/);
    if (messageMatch && options.method === "POST") {
      const ticket = tickets.find(item => item.id === decodeURIComponent(messageMatch[1]));
      const body = options.body.get("body");
      window.__supportMock.replyBodies.push(body);
      ticket.messages.push({ id: "reply-" + ticket.messages.length, body, authorType: "player", createdAt: now });
      ticket.updatedAt = now;
      return ok(ticket.messages.at(-1));
    }
    const detailMatch = route.match(/\\/portal\\/tickets\\/([^/]+)$/);
    if (detailMatch) return ok(tickets.find(item => item.id === decodeURIComponent(detailMatch[1])));
    return Promise.resolve(new Response(JSON.stringify({ success: false, message: "Unknown mocked route" }), { status: 404, headers: { "Content-Type": "application/json" } }));
  };
})();`;

async function load(page, width, height) {
  await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: true });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem("marble-sort-state-v1", ${JSON.stringify(JSON.stringify(profile))});` });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: mockSource });
  await page.send("Page.navigate", { url: `http://127.0.0.1:${port}/index.html?qa=${Math.random()}` });
  await waitFor(page, "document.querySelector('.game-shell')", "game shell");
  await waitFor(page, "document.querySelector('[data-action=\"menu\"]')", "home menu");
}

async function openSupport(page) {
  await click(page, '[data-action="menu"]');
  await waitFor(page, "document.querySelector('.menu-support')", "menu support");
  await click(page, ".menu-support");
  await waitFor(page, "document.querySelectorAll('.cs26-ticket').length === 3", "support ticket history");
}

server.listen(port, "127.0.0.1", async () => {
  let page;
  const report = { interactions: {}, layouts: {}, consoleEvents: [] };
  try {
    await ensureChrome();
    page = await createPage();
    await page.send("Page.enable");
    await page.send("Runtime.enable");

    await load(page, 393, 852);
    await openSupport(page);
    report.layouts.standard = await evaluate(page, `(() => { const modal = document.querySelector('.cs26-modal').getBoundingClientRect(); return { left: modal.left, right: innerWidth - modal.right, top: modal.top, bottom: innerHeight - modal.bottom, scrollable: document.querySelector('.cs26-content').scrollHeight >= document.querySelector('.cs26-content').clientHeight }; })()`);
    report.interactions.historyLoaded = await evaluate(page, "document.querySelectorAll('.cs26-ticket').length === 3 && document.body.innerText.includes('TKT-10045')");
    report.interactions.statusesVisible = await evaluate(page, "['Open','Replied','Closed'].every(label => document.body.innerText.includes(label))");
    report.interactions.emailFallback = await evaluate(page, "document.querySelector('.cs26-email').href === 'mailto:support@kemegames.com'");
    report.interactions.touchTargets = await evaluate(page, "[...document.querySelectorAll('#keme-support-v26 button')].filter(button => !button.disabled).every(button => { const rect = button.getBoundingClientRect(); return rect.width >= 40 && rect.height >= 34; })");
    await screenshot(page, "01-support-history");

    await click(page, '.cs26-ticket[data-ticket-id="ticket-replied"]');
    await waitFor(page, "document.querySelector('.cs26-reply-form')", "reply form");
    report.interactions.oldRepliesVisible = await evaluate(page, "document.querySelector('.cs26-thread').innerText.includes('Thanks for reporting this')");
    await evaluate(page, `(() => { const field = document.querySelector('[data-support-reply]'); field.value = 'The issue still happens on my device.'; field.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    report.interactions.replyEnabledWhileTyping = await evaluate(page, "!document.querySelector('.cs26-reply-submit').disabled");
    await click(page, ".cs26-reply-submit");
    await waitFor(page, "window.__supportMock.replyBodies.length === 1 && document.querySelector('.cs26-thread').innerText.includes('The issue still happens on my device.')", "sent reply");
    report.interactions.replySent = true;
    await screenshot(page, "02-support-conversation");

    await click(page, '.cs26-detail-nav [data-support-action="show-tickets"]');
    await click(page, '.cs26-ticket[data-ticket-id="ticket-closed"]');
    await waitFor(page, "document.querySelector('.cs26-closed-note')", "closed conversation");
    report.interactions.closedReadOnly = await evaluate(page, "!document.querySelector('.cs26-reply-form') && document.querySelector('.cs26-thread').innerText.includes('We restored the reward')");
    await screenshot(page, "03-support-closed");

    await click(page, '.cs26-detail-nav [data-support-action="show-tickets"]');
    await click(page, '[data-support-action="show-new"]');
    await waitFor(page, "document.querySelector('[data-support-form=\"new-ticket\"]')", "new ticket form");
    await evaluate(page, `(() => {
      const subject = document.querySelector('[data-support-field="subject"]');
      const description = document.querySelector('[data-support-field="description"]');
      subject.value = 'Missing rewarded life'; subject.dispatchEvent(new Event('input', { bubbles: true }));
      description.value = 'I watched the full rewarded ad but my life count did not increase.'; description.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    report.interactions.createEnabledWhileTyping = await evaluate(page, "!document.querySelector('.cs26-new-submit').disabled");
    await screenshot(page, "04-support-new-ticket");
    await click(page, ".cs26-new-submit");
    await waitFor(page, "window.__supportMock.createBodies.length === 1 && document.body.innerText.includes('TKT-10100')", "created ticket detail");
    report.interactions.ticketCreated = true;
    report.interactions.createdPayloadCorrect = await evaluate(page, "window.__supportMock.createBodies[0].subject === 'Missing rewarded life'");

    await click(page, ".cs26-close");
    report.interactions.closeWorks = await evaluate(page, "!document.querySelector('#keme-support-v26')");

    await load(page, 320, 568);
    await openSupport(page);
    report.layouts.compact = await evaluate(page, `(() => { const modal = document.querySelector('.cs26-modal').getBoundingClientRect(); const header = document.querySelector('.cs26-header').getBoundingClientRect(); const close = document.querySelector('.cs26-close').getBoundingClientRect(); return { modal: [modal.left, modal.top, modal.right, modal.bottom], header: [header.left, header.top, header.right, header.bottom], close: [close.left, close.top, close.right, close.bottom], viewport: [innerWidth, innerHeight], noHorizontalClip: modal.left >= 0 && modal.right <= innerWidth && close.right <= innerWidth + 1, listScrollable: document.querySelector('.cs26-content').scrollHeight > document.querySelector('.cs26-content').clientHeight }; })()`);
    await screenshot(page, "05-support-compact");

    report.consoleEvents = page.events.filter(event => !String(event.value).includes("favicon") && !String(event.value).includes("Billing unavailable on platform"));
    assert(report.interactions.historyLoaded, "Real ticket history did not render");
    assert(report.interactions.statusesVisible, "Ticket statuses are incomplete");
    assert(report.interactions.oldRepliesVisible, "Old support replies are not visible");
    assert(report.interactions.replyEnabledWhileTyping && report.interactions.replySent, "Ticket reply flow failed");
    assert(report.interactions.closedReadOnly, "Closed ticket is not read-only");
    assert(report.interactions.createEnabledWhileTyping && report.interactions.ticketCreated && report.interactions.createdPayloadCorrect, "New ticket flow failed");
    assert(report.interactions.emailFallback && report.interactions.closeWorks, "Support fallback or close action failed");
    assert(report.interactions.touchTargets, "Support controls contain undersized touch targets");
    assert(report.layouts.standard.left >= 8 && report.layouts.standard.right >= 8, "Standard support modal is too close to the screen edge");
    assert(report.layouts.compact.noHorizontalClip, `Compact support modal clips horizontally: ${JSON.stringify(report.layouts.compact)}`);
    assert(report.consoleEvents.length === 0, `Unexpected console events: ${JSON.stringify(report.consoleEvents)}`);

    fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    if (page) { try { await screenshot(page, "failure"); } catch {} }
    fs.writeFileSync(path.join(outputDir, "failure.txt"), String(error.stack || error));
    console.error(error);
    process.exitCode = 1;
  } finally {
    page?.close();
    server.close();
  }
});

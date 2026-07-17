const fs = require('fs');
const path = require('path');
const http = require('http');

const publicDir = path.resolve('marble-sort/android/app/src/main/assets/public');
const outDir = path.resolve('marble-sort');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const state = {
  version: 2,
  level: 3,
  unlocked: 30,
  coins: 580,
  lives: 3,
  launched: true,
  onboarded: true,
  playerName: 'Player87B1',
  avatar: 1,
  music: false,
  sound: false,
  vibration: false,
  boosters: { undo: 3, shuffle: 3, tube: 3 },
  boosterSeen: { undo: true, shuffle: true, tube: true },
  noAds: { active: false, until: null },
};

const server = http.createServer((req, res) => {
  let p = new URL(req.url, 'http://x').pathname;
  if (p === '/') p = '/index.html';
  const f = path.resolve(publicDir, `.${decodeURIComponent(p)}`);
  if (!f.startsWith(publicDir) || !fs.existsSync(f)) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});

async function ensureChrome() {
  try {
    await fetch('http://127.0.0.1:9333/json/version');
    return;
  } catch {}
  const { spawn } = require('child_process');
  const cands = [
    `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ];
  const exe = cands.find(fs.existsSync);
  if (!exe) throw Error('No Chrome/Edge found');
  spawn(exe, ['--headless=new', '--remote-debugging-port=9333', '--disable-gpu', '--no-first-run', '--no-default-browser-check', 'about:blank'], { detached: true, stdio: 'ignore' }).unref();
  await sleep(1500);
}

async function page() {
  const r = await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' });
  const t = await r.json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(Error(JSON.stringify(m.error))) : res(m.result || {});
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    pending.set(++id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
  return { send, close: () => ws.close() };
}

async function evalJS(pg, expression) {
  const r = await pg.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}

async function wait(pg, expr) {
  for (let i = 0; i < 80; i++) {
    if (await evalJS(pg, `Boolean(${expr})`).catch(() => false)) return;
    await sleep(100);
  }
  throw Error(`timeout ${expr}`);
}

async function snap(pg, name) {
  await sleep(450);
  const data = await pg.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(outDir, `qa-v9-${name}.png`), Buffer.from(data.data, 'base64'));
}

server.listen(5185, '127.0.0.1', async () => {
  try {
    await ensureChrome();
    const pg = await page();
    await pg.send('Page.enable');
    await pg.send('Runtime.enable');
    await pg.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 2, mobile: true });
    await pg.send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('marble-sort-state-v1', ${JSON.stringify(JSON.stringify(state))});` });
    await pg.send('Page.navigate', { url: 'http://127.0.0.1:5185/index.html' });
    await wait(pg, `document.querySelector('.home')`);
    await snap(pg, 'home');
    await evalJS(pg, `document.querySelector('[data-action="store"]').click()`);
    await wait(pg, `document.querySelector('.st-screen')`);
    await snap(pg, 'store');
    await evalJS(pg, `document.querySelector('[data-action="home"]').click()`);
    await wait(pg, `document.querySelector('.home')`);
    await evalJS(pg, `document.querySelector('[data-action="menu"]').click()`);
    await wait(pg, `document.querySelector('.menu-popup-v2')`);
    await snap(pg, 'menu');
    const report = await evalJS(pg, `(() => {
      const vw = innerWidth;
      const overflow = [...document.querySelectorAll('.menu-popup-v2 *,.st-screen *')].filter(e => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && (r.left < -1 || r.right > vw + 1);
      }).slice(0, 20).map(e => ({ cls: e.className, left: e.getBoundingClientRect().left, right: e.getBoundingClientRect().right }));
      return { overflow };
    })()`);
    console.log(JSON.stringify(report, null, 2));
    pg.close();
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});

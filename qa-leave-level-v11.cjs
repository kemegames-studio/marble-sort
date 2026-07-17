const fs = require('fs');
const path = require('path');
const http = require('http');

const publicDir = path.resolve('marble-sort/android/app/src/main/assets/public');
const out = path.resolve('marble-sort/qa-v11-leave-level.png');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
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

server.listen(5187, '127.0.0.1', async () => {
  try {
    await ensureChrome();
    const pg = await page();
    await pg.send('Page.enable');
    await pg.send('Runtime.enable');
    await pg.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 2, mobile: true });
    const state = { version: 2, level: 30, unlocked: 30, coins: 580, lives: 5, launched: true, onboarded: true, music: false, sound: false, vibration: false, boosters: { undo: 1, shuffle: 1, tube: 1 }, boosterSeen: { undo: true, shuffle: true, tube: true } };
    await pg.send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('marble-sort-state-v1', ${JSON.stringify(JSON.stringify(state))});` });
    await pg.send('Page.navigate', { url: 'http://127.0.0.1:5187/index.html' });
    await wait(pg, `document.querySelector('.home')`);
    await evalJS(pg, `document.querySelector('[data-action="play"]').click()`);
    await wait(pg, `document.querySelector('.gameplay')`);
    await evalJS(pg, `document.querySelector('[data-action="settings"]').click()`);
    await wait(pg, `document.querySelector('[data-action="home"]')`);
    await evalJS(pg, `document.querySelector('[data-action="home"]').click()`);
    await wait(pg, `document.querySelector('.leave-level-modal')`);
    await sleep(300);
    const shot = await pg.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
    await evalJS(pg, `document.querySelector('[data-action="close-modal"]').click()`);
    await wait(pg, `document.querySelector('.gameplay') && !document.querySelector('.leave-level-modal')`);
    const stayLives = await evalJS(pg, `JSON.parse(localStorage.getItem('marble-sort-state-v1')).lives`);
    await evalJS(pg, `document.querySelector('[data-action="settings"]').click()`);
    await wait(pg, `document.querySelector('[data-action="home"]')`);
    await evalJS(pg, `document.querySelector('[data-action="home"]').click()`);
    await wait(pg, `document.querySelector('.leave-level-modal')`);
    await evalJS(pg, `document.querySelector('[data-action="confirm-leave-level"]').click()`);
    await wait(pg, `document.querySelector('.home')`);
    const leaveLives = await evalJS(pg, `JSON.parse(localStorage.getItem('marble-sort-state-v1')).lives`);
    console.log(JSON.stringify({ stayLives, leaveLives }, null, 2));
    if (stayLives !== 5 || leaveLives !== 4) throw Error(`Unexpected lives: stay=${stayLives} leave=${leaveLives}`);
    pg.close();
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});

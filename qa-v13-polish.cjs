const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const publicDir = path.resolve('marble-sort/android/app/src/main/assets/public');
const outDir = path.resolve('marble-sort');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  let p = new URL(req.url, 'http://x').pathname;
  if (p === '/') p = '/index.html';
  const f = path.resolve(publicDir, `.${decodeURIComponent(p)}`);
  if (!f.startsWith(publicDir) || !fs.existsSync(f)) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});

async function ensureChrome() {
  try { await fetch('http://127.0.0.1:9334/json/version'); return; } catch {}
  const cands = [
    `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ];
  const exe = cands.find(fs.existsSync);
  if (!exe) throw Error('No Chrome/Edge found');
  const userDataDir = path.resolve('marble-sort/.qa-chrome-v13');
  spawn(exe, ['--headless=new', '--remote-debugging-port=9334', `--user-data-dir=${userDataDir}`, '--disable-gpu', '--no-first-run', '--no-default-browser-check', 'about:blank'], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 40; i++) {
    try { await fetch('http://127.0.0.1:9334/json/version'); return; } catch {}
    await sleep(250);
  }
  throw Error('Chrome debug endpoint did not start on port 9334');
}
async function page() {
  const r = await fetch('http://127.0.0.1:9334/json/new?about:blank', { method: 'PUT' });
  const t = await r.json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') console.error('BROWSER EXCEPTION', JSON.stringify(m.params.exceptionDetails));
    if (m.method === 'Runtime.consoleAPICalled') console.error('BROWSER CONSOLE', JSON.stringify(m.params.args?.map((a) => a.value || a.description)));
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(Error(JSON.stringify(m.error))) : res(m.result || {});
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => { pending.set(++id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
  return { send, close: () => ws.close() };
}
async function evalJS(pg, expression) {
  const r = await pg.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
async function wait(pg, expr, label = expr) {
  for (let i = 0; i < 120; i++) {
    if (await evalJS(pg, `Boolean(${expr})`).catch(() => false)) return;
    await sleep(100);
  }
  throw Error(`timeout ${label}`);
}
async function screenshot(pg, name) {
  const shot = await pg.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(outDir, name), Buffer.from(shot.data, 'base64'));
}
async function clickCenter(pg, selector) {
  const box = await evalJS(pg, `(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e) return null; const r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`);
  if (!box) throw Error(`missing ${selector}`);
  await pg.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await pg.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
}
function state(overrides = {}) {
  return {
    version: 2, level: 1, unlocked: 1, coins: 500, lives: 5, launched: true, onboarded: true,
    music: false, sound: false, vibration: false,
    boosters: { undo: 0, shuffle: 0, tube: 0 }, boosterSeen: {}, tutorials: { level1: false },
    missions: { date: '2026-07-12', progress: { coins: 999, levels: 4, undo: 3, shuffle: 3, tube: 2 }, claimed: {}, bonusClaimed: false },
    dailyLogin: { streak: 0, lastClaimDate: '2026-07-10' },
    ...overrides,
  };
}
async function load(pg, st) {
  await pg.send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('marble-sort-state-v1', ${JSON.stringify(JSON.stringify(st))});` });
  await pg.send('Page.navigate', { url: 'http://127.0.0.1:5190/index.html?qa=' + Math.random() });
}
function assert(cond, msg) { if (!cond) throw Error(msg); }

server.listen(5190, '127.0.0.1', async () => {
  const report = {};
  let pg;
  try {
    await ensureChrome();
    pg = await page();
    await pg.send('Page.enable'); await pg.send('Runtime.enable'); await pg.send('Log.enable');
    await pg.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 2, mobile: true });

    await load(pg, state());
    await wait(pg, `document.querySelector('.home')`, 'home');
    await clickCenter(pg, '[data-action="play"]');
    await wait(pg, `document.querySelector('.tutorial-hand-step-1')`, 'tutorial hand 1');
    await sleep(250);
    report.hand1 = await evalJS(pg, `(() => { const h=document.querySelector('.tutorial-hand-step-1').getBoundingClientRect(); const t=document.querySelector('.game-tube[data-index="0"]').getBoundingClientRect(); return {handCenterX:h.left+h.width/2,tubeLeft:t.left,tubeRight:t.right,handTop:h.top,tubeTop:t.top,tubeBottom:t.bottom}; })()`);
    assert(report.hand1.handCenterX >= report.hand1.tubeLeft - 8 && report.hand1.handCenterX <= report.hand1.tubeRight + 8, 'tutorial hand step 1 not aligned with first tube');
    await screenshot(pg, 'qa-v13-tutorial-hand1.png');
    await clickCenter(pg, '.game-tube[data-index="0"]');
    await wait(pg, `document.querySelector('.tutorial-hand-step-2')`, 'tutorial hand 2');
    report.hand2 = await evalJS(pg, `(() => { const h=document.querySelector('.tutorial-hand-step-2').getBoundingClientRect(); const t=document.querySelector('.game-tube[data-index="1"]').getBoundingClientRect(); return {handCenterX:h.left+h.width/2,tubeLeft:t.left,tubeRight:t.right,handTop:h.top,tubeTop:t.top,tubeBottom:t.bottom}; })()`);
    assert(report.hand2.handCenterX >= report.hand2.tubeLeft - 8 && report.hand2.handCenterX <= report.hand2.tubeRight + 8, 'tutorial hand step 2 not aligned with destination tube');

    await load(pg, state({ level: 10, unlocked: 10, coins: 2200, tutorials: { level1: true } }));
    await wait(pg, `document.querySelector('.home')`, 'home for modals');
    await clickCenter(pg, '[data-action="rewards"]');
    await wait(pg, `document.querySelector('.daily-login-art-wrap img[src="/assets/daily-login-popup.png"]')`, 'daily login art');
    report.dailyLoginClose = await evalJS(pg, `!!document.querySelector('.daily-login-art-wrap .liveops-art-close') && !!document.querySelector('.dl-art-claim')`);
    assert(report.dailyLoginClose, 'daily login art or claim hitbox missing');
    await screenshot(pg, 'qa-v13-daily-login-popup.png');
    await clickCenter(pg, '.daily-login-art-wrap .liveops-art-close');
    await wait(pg, `!document.querySelector('.daily-login-art-wrap')`, 'close daily login');

    await clickCenter(pg, '[data-action="missions"]');
    await wait(pg, `document.querySelector('.daily-missions-art-wrap img[src="/assets/daily-missions-popup.png"]')`, 'daily missions art');
    report.missionButtons = await evalJS(pg, `document.querySelectorAll('.dm-art-claim').length`);
    assert(report.missionButtons >= 5, 'mission claim hitboxes missing');
    await screenshot(pg, 'qa-v13-daily-missions-popup.png');
    await clickCenter(pg, '.daily-missions-art-wrap .liveops-art-close');
    await wait(pg, `!document.querySelector('.daily-missions-art-wrap')`, 'close daily missions');

    await clickCenter(pg, '[data-action="store"]');
    await wait(pg, `document.querySelector('.st-screen')`, 'store');
    await sleep(200);
    const storeText = await evalJS(pg, `document.body.innerText`);
    assert(!/[\u00c2\u00c3\u00e2\u00f0]/.test(storeText), 'store visible text contains mojibake');
    report.coinGrid = await evalJS(pg, `(() => Array.from(document.querySelectorAll('.st-coin-card')).slice(0,6).map(e=>{const r=e.getBoundingClientRect();return {left:Math.round(r.left),top:Math.round(r.top),width:Math.round(r.width),height:Math.round(r.height)}}))()`);
    await screenshot(pg, 'qa-v13-store.png');

    await load(pg, state({ level: 2, unlocked: 2, tutorials: { level1: true }, lives: 5 }));
    await wait(pg, `document.querySelector('.home')`, 'home for leave');
    await clickCenter(pg, '[data-action="play"]');
    await wait(pg, `document.querySelector('.gameplay')`, 'gameplay for leave');
    await clickCenter(pg, '[data-action="settings"]');
    await wait(pg, `document.querySelector('.settings-popup')`, 'settings in level');
    await clickCenter(pg, '.settings-popup [data-action="home"]');
    await wait(pg, `document.querySelector('.leave-level-modal')`, 'leave popup');
    await screenshot(pg, 'qa-v13-leave-popup.png');
    await clickCenter(pg, '[data-action="confirm-leave-level"]');
    await wait(pg, `document.querySelector('.home')`, 'home after confirm leave');
    const saved = await evalJS(pg, `JSON.parse(localStorage.getItem('marble-sort-state-v1'))`);
    report.leaveLives = saved.lives;
    assert(saved.lives === 4, 'leave confirm did not deduct one life on first click');

    const visibleText = await evalJS(pg, `document.body.innerText`);
    assert(!/[^\x00-\x7F]/.test(visibleText), 'visible text still contains non-ASCII symbols');
    console.log(JSON.stringify(report, null, 2));
  } catch (e) {
    if (pg) {
      try {
        console.error('BODY SNAPSHOT', await evalJS(pg, `document.body ? document.body.innerText.slice(0,500) : 'no body'`));
        await screenshot(pg, 'qa-v13-failure.png');
      } catch {}
    }
    console.error(e);
    process.exitCode = 1;
  } finally {
    pg?.close();
    server.close();
  }
});

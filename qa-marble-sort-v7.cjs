const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL } = require('url');
const publicDir = path.resolve('marble-sort/android/app/src/main/assets/public');
const outDir = path.resolve('marble-sort/qa-marble-sort-v7');
fs.mkdirSync(outDir, { recursive: true });
const mime = { '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.svg':'image/svg+xml', '.json':'application/json', '.mp3':'audio/mpeg', '.wav':'audio/wav' };
const server = http.createServer((req,res)=>{
  const u = new URL(req.url, 'http://127.0.0.1');
  let file = decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname);
  let full = path.resolve(publicDir, '.' + file);
  if (!full.startsWith(publicDir) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(full).toLowerCase()] || 'application/octet-stream', 'cache-control':'no-store' });
  fs.createReadStream(full).pipe(res);
});
const listen = port => new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(port)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const cdpBase = 'http://127.0.0.1:9333';

async function newPage() {
  let res = await fetch(`${cdpBase}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' });
  if (!res.ok) res = await fetch(`${cdpBase}/json/new?${encodeURIComponent('about:blank')}`);
  const target = await res.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0; const pending = new Map(); const events = [];
  ws.onmessage = ev => { const msg = JSON.parse(ev.data); if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result || {}); } else if (msg.method) events.push(msg); };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const msg = { id: ++id, method, params }; pending.set(msg.id, { resolve, reject }); ws.send(JSON.stringify(msg)); });
  return { send, events, close: () => ws.close() };
}
async function evalJS(page, expression, awaitPromise = false) { const result = await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result?.value; }
async function waitFor(page, expression, timeout = 8000) { const start = Date.now(); while (Date.now() - start < timeout) { const ok = await evalJS(page, `Boolean(${expression})`).catch(() => false); if (ok) return true; await sleep(100); } throw new Error(`Timeout waiting for ${expression}`); }
async function click(page, selector) { const ok = await evalJS(page, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`); if (!ok) throw new Error(`Missing clickable ${selector}`); await sleep(280); }
async function shot(page, name) { const data = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data.data, 'base64')); }
const checks=[]; const issues=[]; const check=(name,pass,detail='')=>{ checks.push({name,pass:!!pass,detail}); if(!pass) issues.push({name,detail}); };

(async()=>{
  const port = await listen(5181);
  const appUrl = `http://127.0.0.1:${port}/index.html`;
  const page = await newPage();
  await page.send('Page.enable'); await page.send('Runtime.enable'); await page.send('Network.enable'); await page.send('Log.enable');
  await page.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 2, mobile: true });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('marble-sort-state-v1', JSON.stringify({version:2,level:30,unlocked:30,coins:3010,lives:5,launched:true,onboarded:true,playerName:'QAPlayer',avatar:1,music:false,sound:false,vibration:false,boosters:{undo:3,shuffle:3,tube:3},boosterSeen:{undo:true,shuffle:true,tube:true},dailyLogin:{streak:0,lastClaimDate:null},missions:{date:null,progress:{coins:0,levels:0,undo:0,shuffle:0,tube:0},claimed:{},bonusClaimed:false},noAds:{active:false,until:null},unlimitedLivesUntil:null}));` });
  const navStart = Date.now(); await page.send('Page.navigate', { url: appUrl }); await waitFor(page, `document.querySelector('.home')`, 9000); const homeReady = Date.now()-navStart; await shot(page,'01-home');
  const homeIconRects = await evalJS(page, `(() => [...document.querySelectorAll('.home-float')].map(el => { const r = el.getBoundingClientRect(); return { cls: el.className, x:r.x, y:r.y, w:r.width, h:r.height }; }))()`);
  check('Home has 3 floating icon buttons', homeIconRects.length===3, JSON.stringify(homeIconRects));
  check('Home floating icons share size', homeIconRects.every(r=>Math.abs(r.w-homeIconRects[0].w)<1&&Math.abs(r.h-homeIconRects[0].h)<1), JSON.stringify(homeIconRects));
  check('Daily Missions left, Rewards right, No-Ads under Rewards', homeIconRects.find(r=>r.cls.includes('home-missions')).x < homeIconRects.find(r=>r.cls.includes('home-rewards')).x && homeIconRects.find(r=>r.cls.includes('home-noads-fab')).y > homeIconRects.find(r=>r.cls.includes('home-rewards')).y, JSON.stringify(homeIconRects));

  await click(page,'.home-menu'); await waitFor(page, `document.querySelector('.menu-popup-v2')`); await shot(page,'02-menu');
  const menuStats = await evalJS(page, `(() => ({ choices:document.querySelectorAll('.menu-avatar-choice').length, links:document.querySelectorAll('.menu-link').length, hasName:!!document.querySelector('.menu-name-row'), hasSupport:!!document.querySelector('.menu-support'), hasId:!!document.querySelector('.menu-id'), rect:(()=>{const r=document.querySelector('.menu-popup-v2').getBoundingClientRect(); return {top:r.top,bottom:r.bottom,height:r.height,viewport:innerHeight}})() }))()`);
  check('Menu has 8 avatar choices', menuStats.choices===8, JSON.stringify(menuStats));
  check('Menu keeps legal/deletion links', menuStats.links===3, JSON.stringify(menuStats));
  check('Menu keeps name, ID, support components', menuStats.hasName&&menuStats.hasSupport&&menuStats.hasId, JSON.stringify(menuStats));
  check('Menu fits mobile viewport', menuStats.rect.top>=-40 && menuStats.rect.bottom<=menuStats.rect.viewport+10, JSON.stringify(menuStats.rect));
  await click(page,'.menu-avatar-choice[data-avatar="5"]'); const avatarSaved=await evalJS(page,`JSON.parse(localStorage.getItem('marble-sort-state-v1')).avatar`); check('Avatar selection saves chosen avatar', avatarSaved===5, `avatar=${avatarSaved}`);
  await click(page,'.menu-edit'); await waitFor(page, `document.querySelector('.menu-name-input')`); await evalJS(page, `(() => { const i=document.querySelector('.menu-name-input'); i.value='Tester7'; i.dispatchEvent(new Event('input',{bubbles:true})); })()`); await click(page,'.menu-edit'); const savedName=await evalJS(page,`JSON.parse(localStorage.getItem('marble-sort-state-v1')).playerName`); check('Name edit saves value', savedName==='Tester7', `playerName=${savedName}`);
  await click(page,'.popup-close'); await waitFor(page, `document.querySelector('.home') && !document.querySelector('.menu-popup-v2')`);

  await click(page,'.home-lives'); await waitFor(page, `document.querySelector('.lv-art-wrap')`); await shot(page,'03-lives'); const livesInfo=await evalJS(page,`(() => ({ count:document.querySelector('.lv-count')?.textContent.trim(), ad:!!document.querySelector('.lv-hot-ad'), close:!!document.querySelector('.lv-hot-close') }))()`); check('Lives popup shows one dynamic lives number and ad hit area', livesInfo.count==='5'&&livesInfo.ad&&livesInfo.close, JSON.stringify(livesInfo)); await click(page,'.lv-hot-close'); await waitFor(page, `document.querySelector('.home') && !document.querySelector('.lv-art-wrap')`);
  await click(page,'.home-rewards'); await waitFor(page, `document.querySelector('.liveops-modal')`); await shot(page,'04-rewards'); const rewardsInfo=await evalJS(page,`(() => ({ days:document.querySelectorAll('.dl-day').length, claim:!!document.querySelector('[data-action="claim-daily"]') }))()`); check('Daily Rewards opens and renders reward days', rewardsInfo.days>=7&&rewardsInfo.claim, JSON.stringify(rewardsInfo)); await click(page,'.liveops-close'); await waitFor(page, `document.querySelector('.home') && !document.querySelector('.liveops-modal')`);
  await click(page,'.home-missions'); await waitFor(page, `document.querySelector('.liveops-modal')`); await shot(page,'05-missions'); const missionInfo=await evalJS(page,`(() => ({ rows:document.querySelectorAll('.dm-row').length, bonus:!!document.querySelector('.dm-bonus') }))()`); check('Daily Missions opens and renders mission rows', missionInfo.rows>=5&&missionInfo.bonus, JSON.stringify(missionInfo)); await click(page,'.liveops-close'); await waitFor(page, `document.querySelector('.home') && !document.querySelector('.liveops-modal')`);
  await click(page,'.home-store'); await waitFor(page, `document.querySelector('.st-screen')`); await shot(page,'06-store'); const storeInfo=await evalJS(page,`(() => ({ bundles:document.querySelectorAll('.st-bundle').length, products:document.querySelectorAll('[data-action="buy-product"], [data-action="buy-booster"]').length }))()`); check('Store opens and has products/bundles', storeInfo.bundles>=1&&storeInfo.products>=3, JSON.stringify(storeInfo)); await evalJS(page,`document.querySelector('[data-action="home"]')?.click()`); await waitFor(page, `document.querySelector('.home')`);
  await click(page,'.home-leaderboard'); await waitFor(page, `document.body.textContent.includes('LEADERBOARD')`); await shot(page,'07-leaderboard'); const lbInfo=await evalJS(page,`(() => ({ rows:document.querySelectorAll('.lb-row,.leader-row').length, tabs:document.querySelectorAll('[data-action="lb-tab"]').length, text:document.body.textContent.includes('LEADERBOARD') }))()`); check('Leaderboard opens', lbInfo.text, JSON.stringify(lbInfo)); await evalJS(page,`document.querySelector('[data-action="home"]')?.click()`); await waitFor(page, `document.querySelector('.home')`);
  await click(page,'.home-play'); await waitFor(page, `document.querySelector('.gameplay')`, 5000); await shot(page,'08-gameplay'); const gameInfo=await evalJS(page,`(() => ({ tubes:document.querySelectorAll('.game-tube').length, boosters:document.querySelectorAll('.gameplay-booster').length, coinHud:!!document.querySelector('.gameplay-coin-value'), settings:!!document.querySelector('.gameplay-settings') }))()`); check('Gameplay opens with tubes, HUD, boosters', gameInfo.tubes>=5&&gameInfo.boosters>=3&&gameInfo.coinHud&&gameInfo.settings, JSON.stringify(gameInfo)); const selectResult=await evalJS(page,`(() => { const tubes=[...document.querySelectorAll('.game-tube')]; const first=tubes.find(t=>t.querySelectorAll('.marble').length>0); if(!first) return false; first.click(); return first.classList.contains('selected'); })()`); check('Tube click selects a tube', selectResult===true, `selected=${selectResult}`);
  const perf=await evalJS(page,`new Promise(resolve => { const start=performance.now(); let frames=0; function raf(){frames++; if(frames>=60) resolve({sixtyFramesMs:performance.now()-start,frames}); else requestAnimationFrame(raf)} requestAnimationFrame(raf); }).then(frame=>({frame, nav:performance.getEntriesByType('navigation')[0]?{duration:performance.getEntriesByType('navigation')[0].duration,domContentLoaded:performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd}:null, resources:performance.getEntriesByType('resource').map(r=>({name:r.name.split('/').pop(),duration:r.duration,transferSize:r.transferSize||0})).sort((a,b)=>b.duration-a.duration).slice(0,10), domNodes:document.querySelectorAll('*').length, heap:performance.memory?performance.memory.usedJSHeapSize:null}))`,true);
  check('Home-to-ready time under 5s on local package', homeReady<5000, `${homeReady}ms`); check('60 animation frames complete in reasonable time', perf.frame.sixtyFramesMs<1800, `${perf.frame.sixtyFramesMs.toFixed(1)}ms`); check('DOM size is reasonable during gameplay', perf.domNodes<1000, `nodes=${perf.domNodes}`);
  const report={generatedAt:new Date().toISOString(), appUrl, screenshotsDir:outDir, checks, issues, performance:{homeReadyMs:homeReady,...perf}, browserEvents:page.events.filter(e=>['Runtime.exceptionThrown','Log.entryAdded'].includes(e.method)).slice(0,20)};
  fs.writeFileSync(path.join(outDir,'qa-report.json'), JSON.stringify(report,null,2)); console.log(JSON.stringify(report,null,2)); page.close(); server.close();
})().catch(err=>{ console.error(err.stack||err); server.close(); process.exit(1); });

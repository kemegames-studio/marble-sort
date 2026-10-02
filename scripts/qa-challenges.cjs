const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname,'..');
const payload = path.resolve(root,process.env.CHALLENGE_PAYLOAD || 'android/app/src/main/assets/public');
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.wav':'audio/wav'};
const server = http.createServer((req,res)=>{
  const name = new URL(req.url,'http://local').pathname;
  const file = path.join(payload,name === '/' ? 'index.html' : name);
  if (!file.startsWith(payload) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
let browser;
async function click(page, action) { await page.locator(`[data-action="${action}"]`).first().click(); }
async function seed(page, level, overrides = {}) {
  await page.addInitScript(({level,overrides})=>localStorage.setItem('marble-sort-state-v1',JSON.stringify({version:2,level,unlocked:level,coins:500,lives:5,lastLifeAt:null,onboarded:true,launched:true,music:false,sound:false,boosterSeen:{undo:true,shuffle:true,tube:true},boosters:{undo:5,shuffle:5,tube:5},tutorials:{level1:true},...overrides})),{level,overrides});
}
async function state(page) { return page.evaluate(()=>JSON.parse(localStorage.getItem('marble-sort-state-v1'))); }
async function newPage(level,size={width:390,height:844},overrides={}) {
  const page = await browser.newPage({viewport:size,reducedMotion:'reduce'});
  await page.route('**/*',route=>new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await seed(page,level,overrides);
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('[data-action="play"]').waitFor();
  return {page,errors};
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,executablePath:process.env.CHALLENGE_CHROMIUM || undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
  const {EXTRA_LEVELS}=await import('../src/extra-levels.js');
  if (!process.env.CHALLENGE_PAYLOAD) {
    const {page,errors}=await newPage(15,undefined,{boosterSeen:{undo:true,tube:true}});
    await click(page,'play');
    await page.getByRole('dialog',{name:'Timed challenge'}).waitFor();
    await click(page,'start-timed');
    await page.getByRole('dialog',{name:'New booster unlocked'}).waitFor();
    const timer=await page.locator('.challenge-timer').textContent();
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('.challenge-timer').textContent(),timer);
    await click(page,'booster-intro-ok');
    await page.waitForTimeout(1200);
    assert.notEqual(await page.locator('.challenge-timer').textContent(),timer);
    assert.deepEqual(errors,[]); await page.close();

    const adTest=await newPage(105,undefined,{coins:0,boosters:{undo:5,shuffle:5,tube:0},unlimitedLivesUntil:Date.now()+3600000});
    await adTest.page.evaluate(()=>{
      window.Capacitor={Plugins:{MarbleAds:{showRewardedExtraTube:()=>new Promise(resolve=>{window.finishChallengeAd=resolve;})}}};
    });
    await click(adTest.page,'play'); await click(adTest.page,'start-timed');
    await click(adTest.page,'add-tube'); await click(adTest.page,'watch-ad-booster');
    await adTest.page.waitForFunction(()=>typeof window.finishChallengeAd==='function');
    await click(adTest.page,'close-modal');
    const adPaused=await adTest.page.locator('.challenge-timer').textContent();
    await adTest.page.waitForTimeout(1200);
    assert.equal(await adTest.page.locator('.challenge-timer').textContent(),adPaused);
    await adTest.page.evaluate(()=>window.finishChallengeAd());
    await adTest.page.waitForTimeout(1200);
    assert.equal((await state(adTest.page)).boosters.tube,1);
    assert.notEqual(await adTest.page.locator('.challenge-timer').textContent(),adPaused);
    await adTest.page.evaluate(()=>{const original=performance.now.bind(performance);performance.now=()=>original()+400000;});
    await adTest.page.getByRole('dialog',{name:'Time is up'}).waitFor();
    assert.equal((await state(adTest.page)).lives,5,'Unlimited lives must protect against timeout');
    assert.deepEqual(adTest.errors,[]); await adTest.page.close();
  }
  for(const level of (process.env.CHALLENGE_QUICK ? [300] : [5,105,200,300])) {
    const {page,errors}=await newPage(level,level===300?{width:320,height:568}:undefined);
    await click(page,'play');
    await page.getByRole('dialog',{name:'Timed challenge'}).waitFor();
    await page.waitForTimeout(350);
    const before=await page.locator('.challenge-timer').textContent();
    await click(page,'start-timed');
    await page.waitForTimeout(1200);
    assert.notEqual(await page.locator('.challenge-timer').textContent(),before);
    await click(page,'settings');
    const paused=await page.locator('.challenge-timer').textContent();
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('.challenge-timer').textContent(),paused);
    await click(page,'close-modal');
    await page.evaluate(()=>{
      Object.defineProperty(document,'hidden',{configurable:true,value:true});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const backgrounded=await page.locator('.challenge-timer').textContent();
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('.challenge-timer').textContent(),backgrounded);
    await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
    // Accelerate only this clock; no unrelated backend or native calls.
    await page.evaluate(()=>{ const original=performance.now.bind(performance); performance.now=()=>original()+400000; });
    await page.getByRole('dialog',{name:'Time is up'}).waitFor();
    assert.equal((await state(page)).lives,4);
    await page.waitForTimeout(400); assert.equal((await state(page)).lives,4);
    await click(page,'retry');
    await page.getByRole('dialog',{name:'Timed challenge'}).waitFor();
    assert.equal((await state(page)).lives,4);
    await click(page,'start-timed');
    assert.equal(await page.locator('.game-tube').count(),level>100?EXTRA_LEVELS.find(l=>l.id===level).tubes.length:7);
    const timer=await page.locator('.challenge-timer').boundingBox();
    const coins=await page.locator('.gameplay-coins').boundingBox();
    const settings=await page.locator('.gameplay-settings').boundingBox();
    assert.ok(timer && coins && settings,'HUD elements are visible');
    assert.ok(Math.abs(timer.y+timer.height/2-coins.y-coins.height/2)<3,'Timer must align with coins');
    assert.ok(timer.x>=coins.x+coins.width-2 && timer.x+timer.width<=settings.x+2,'Timer must fit between coins and settings');
    await page.waitForTimeout(150);
    await page.screenshot({path:`/tmp/marble-${process.env.CHALLENGE_PAYLOAD ? 'source' : 'android'}-challenge-${level}.png`});
    assert.deepEqual(errors,[]);
    await page.close();
  }
  // Replay legal certificates through real input handlers; completion must beat the timer.
  for(const level of (process.env.CHALLENGE_QUICK ? [] : [101,105,300])) {
    const {page,errors}=await newPage(level);
    await click(page,'play');
    if(level%5===0) await click(page,'start-timed');
    const data=EXTRA_LEVELS.find(l=>l.id===level);
    await page.locator('.game-tube').first().waitFor();
    for(const [from,to] of data.solution) {
      await page.locator(`[data-index="${from}"]`).click();
      await page.locator(`[data-index="${to}"]`).click();
    }
    await page.locator('[data-action="next"]').waitFor();
    const expected=level%5===0?580:540;
    assert.equal((await state(page)).coins,expected);
    assert.equal((await state(page)).unlocked,Math.min(300,level+1));
    assert.equal((await state(page)).lives,5);
    await page.waitForTimeout(400); assert.equal((await state(page)).coins,expected);
    await click(page,'next');
    assert.equal((await state(page)).level,Math.min(300,level+1));
    assert.deepEqual(errors,[]); await page.close();
  }
  console.log('PASS: timed introductions, countdown, menu pause, timeout, one-life deduction, retry, compact layout, certified wins, rewards, 100+ progression and 300 cap.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});

const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const payload=path.resolve(root,process.env.CHALLENGE_PAYLOAD||'android/app/src/main/assets/public');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.wav':'audio/wav'};
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://local').pathname;const file=path.join(payload,name==='/'?'index.html':name);if(!file.startsWith(payload)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
let browser;
async function click(page,action){await page.locator(`[data-action="${action}"]`).first().click();}
async function profile(page){return page.evaluate(()=>JSON.parse(localStorage.getItem('marble-sort-state-v1')));}
async function board(page){return page.locator('.game-tube').evaluateAll(nodes=>nodes.map(n=>[...n.querySelectorAll('.marble')].map(m=>m.getAttribute('aria-label'))));}
async function expire(page,ms=200000){await page.evaluate(ms=>{window.challengeOffset+=ms;},ms);await page.getByRole('dialog',{name:'Time is up'}).waitFor();}
async function pageFor(size,unlimited=false){
 const page=await browser.newPage({viewport:size,reducedMotion:'reduce',deviceScaleFactor:2});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.addInitScript(unlimited=>{
  localStorage.setItem('marble-sort-state-v1',JSON.stringify({version:2,level:300,unlocked:300,coins:500,lives:5,lastLifeAt:null,onboarded:true,launched:true,music:false,sound:false,boosterSeen:{undo:true,shuffle:true,tube:true},boosters:{undo:5,shuffle:5,tube:5},tutorials:{level1:true},unlimitedLivesUntil:unlimited?Date.now()+3600000:null}));
  const original=performance.now.bind(performance);window.challengeOffset=0;performance.now=()=>original()+window.challengeOffset;
  window.adCalls=0;
  window.Capacitor={Plugins:{MarbleAds:{showRewardedCoins:()=>{window.adCalls++;return new Promise((resolve,reject)=>{window.rewardAd=resolve;window.rejectAd=()=>reject(new Error('Unrewarded dismissal'));});}}}};
 },unlimited);
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await click(page,'play');await click(page,'start-timed');
 return {page,errors};
}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true,executablePath:process.env.CHALLENGE_CHROMIUM||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const [tries,booster,expected] of [[0,false,210],[1,false,190],[0,true,195],[1,true,175]]){
  const page=await browser.newPage({viewport:{width:320,height:568},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.addInitScript(tries=>{
   const date=new Date();date.setHours(0,0,0,0);date.setDate(date.getDate()-(date.getDay()+6)%7);const year=date.getFullYear(),start=new Date(year,0,1);const week=Math.ceil(((date-start)/864e5+start.getDay()+1)/7);
   localStorage.setItem('marble-sort-state-v1',JSON.stringify({version:2,level:1,unlocked:300,coins:500,lives:5,onboarded:true,launched:true,music:false,sound:false,boosterSeen:{undo:true,shuffle:true,tube:true},boosters:{undo:5,shuffle:5,tube:5},tutorials:{level1:true},lb:{season:`${year}-W${String(week).padStart(2,'0')}`,league:'bronze',weekly:{levels:0,stars:0,firstTry:0,noBooster:0,daily:0,event:0},totals:{stars:0,levels:0},tries:{1:tries},lastRank:null,speedTime:null,speedDate:null}}));
  },tries);
  await page.goto(`http://127.0.0.1:${server.address().port}`);await click(page,'play');
  if(booster) await click(page,'add-tube');
  await page.locator('[data-index="0"]').click();await page.locator('[data-index="1"]').click();
  await page.locator('.points-result').waitFor({timeout:10000}).catch(async e=>{console.log('STATE',errors,await page.locator('#app').innerText());throw e});
  assert.equal(await page.locator('.points-result header strong').textContent(),`+${expected}`);
  const p=await profile(page);const {weeklyPoints}=await import('../public/assets/leaderboard-points.js');assert.equal(weeklyPoints(p.lb.weekly),expected);
  await page.waitForTimeout(200);assert.equal((await profile(page)).lb.weekly.levels,1);
  await page.locator('[data-action="next"]').scrollIntoViewIfNeeded();assert.ok(await page.locator('[data-action="next"]').isVisible());
  assert.deepEqual(errors,[]);await page.close();console.log(`PASS ${expected} actual points and displayed win breakdown`);
 }
 const {page}=await pageFor({width:320,height:568});await expire(page);await page.locator('.points-result').waitFor();assert.equal(await page.locator('.points-result header strong').textContent(),'+0');const prior=(await profile(page)).lb.weekly;await click(page,'failed-home');assert.deepEqual((await profile(page)).lb.weekly,prior);
 await click(page,'leaderboard');await page.locator('.points-guide summary').click();assert.ok(await page.getByText('Lose or run out of time',{exact:true}).isVisible());await page.close();console.log('PASS timed loss has zero points, preserves score, and leaderboard explains criteria');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.close()});

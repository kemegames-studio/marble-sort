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
 const {EXTRA_LEVELS}=await import('../src/extra-levels.js');
 for(const size of [{width:320,height:568},{width:390,height:844}]){
  const {page,errors}=await pageFor(size);
  const original=await board(page);
  const [from,to]=EXTRA_LEVELS.at(-1).solution[0];
  await page.locator(`[data-index="${from}"]`).click();await page.locator(`[data-index="${to}"]`).click();
  const partial=await board(page);assert.notDeepEqual(partial,original);
  await expire(page);
  assert.equal((await profile(page)).lives,5);
  const popup=await page.locator('.challenge-timeout').boundingBox();
  assert.ok(popup.y>=0&&popup.y+popup.height<=size.height,'Popup fits the viewport');
  assert.ok((await page.locator('[data-action="continue-timed"]').boundingBox()).height>=44);
  await page.waitForTimeout(200);
  await page.screenshot({path:path.join(root,`../Marble-Sort-Time-Up-${size.width}.png`)});
  await click(page,'continue-timed');
  await page.waitForFunction(()=>window.adCalls===1);
  assert.ok(await page.locator('[data-action="retry"]').isDisabled());
  await page.locator('[data-action="continue-timed"]').dispatchEvent('click');
  assert.equal(await page.evaluate(()=>window.adCalls),1,'Duplicate tap must not request another ad');
  await page.evaluate(()=>window.rejectAd());
  await page.getByText('Ad unavailable or not completed.',{exact:false}).waitFor();
  assert.deepEqual(await board(page),partial);assert.equal((await profile(page)).lives,5);
  await click(page,'continue-timed');await page.waitForFunction(()=>window.adCalls===2);
  await page.waitForTimeout(300);assert.ok(await page.getByRole('dialog',{name:'Time is up'}).isVisible());
  await page.evaluate(()=>window.rewardAd());
  await page.getByRole('dialog',{name:'Time is up'}).waitFor({state:'detached'});
  assert.equal(await page.locator('.challenge-timer').textContent(),'TIME 0:30');
  assert.deepEqual(await board(page),partial);assert.equal((await profile(page)).lives,5);assert.equal((await profile(page)).coins,500);
  await expire(page,31000);
  assert.equal((await profile(page)).lives,4);
  assert.equal(await page.locator('[data-action="continue-timed"]').count(),0);
  await page.waitForTimeout(300);assert.equal((await profile(page)).lives,4);
  await click(page,'retry');await page.getByRole('dialog',{name:'Timed challenge'}).waitFor();
  assert.equal((await profile(page)).lives,4);await click(page,'start-timed');assert.deepEqual(await board(page),original);
  await expire(page);assert.equal(await page.locator('[data-action="continue-timed"]').count(),1);
  await click(page,'failed-home');assert.equal((await profile(page)).lives,3);
  assert.deepEqual(errors,[]);await page.close();
 }
 const unlimited=await pageFor({width:320,height:568},true);
 await expire(unlimited.page);await click(unlimited.page,'failed-home');assert.equal((await profile(unlimited.page)).lives,5);await unlimited.page.close();
 console.log('PASS: responsive popup, confirmed rewards, failed/unrewarded ads, duplicate taps, preserved board, exactly 30 seconds, single continue, retry/home life accounting and unlimited lives.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});

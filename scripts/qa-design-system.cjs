const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),payload=path.join(root,'android/app/src/main/assets/public');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.wav':'audio/wav'};
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://local').pathname,file=path.join(payload,name==='/'?'index.html':name);if(!file.startsWith(payload)||!fs.existsSync(file)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
let browser;
async function click(page,action){await page.locator(`[data-action="${action}"]`).first().click();}
async function profile(page){return page.evaluate(()=>JSON.parse(localStorage.getItem('marble-sort-state-v1')));}
async function fits(page,selector,size){const el=page.locator(selector).first();const content=selector==='.popup'?el.locator('.popup-body'):el;if(selector!=='.lv-art-wrap')assert.ok(await content.evaluate(n=>n.scrollWidth<=n.clientWidth+2),`${selector} has no horizontal overflow`);const b=await el.boundingBox();assert.ok(b.x>=-1&&b.x+b.width<=size.width+1,`${selector} fits width`);}

(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({executablePath:process.env.CHALLENGE_CHROMIUM||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
for(const size of [{width:320,height:568},{width:390,height:844},{width:430,height:932},{width:768,height:1024}]){
 const page=await browser.newPage({viewport:size,reducedMotion:'reduce',deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.addInitScript(()=>localStorage.setItem('marble-sort-state-v1',JSON.stringify({version:2,level:300,unlocked:300,coins:500,lives:5,onboarded:true,launched:true,music:false,sound:false,boosters:{undo:5,shuffle:5,tube:5},boosterSeen:{undo:true,shuffle:true,tube:true},tutorials:{level1:true}})));
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('.home').waitFor();const before=await profile(page);
 await click(page,'store');await fits(page,'.ds-store',size);assert.equal(await page.locator('.ds-buy').count(),9);assert.equal(await page.locator('.ds-buy[data-product="coin_pack_6"]').textContent(),'$69.99');assert.equal(await page.locator('.ds-bundle').count(),3);
 for(const btn of await page.locator('.ds-buy').all()){await btn.scrollIntoViewIfNeeded();const b=await btn.boundingBox();assert.ok(b.height>=44&&b.x>=0&&b.x+b.width<=size.width);}
 await page.locator('.ds-buy[data-product="coin_pack_1"]').click();await page.waitForTimeout(150);assert.equal((await profile(page)).coins,before.coins,'Web purchase unavailable must not grant coins');await click(page,'restore-purchases');await click(page,'home');
 await click(page,'leaderboard');await fits(page,'.lb-screen',size);await fits(page,'.lb-panel',size);
 for(const tab of ['stars','speed','events','weekly']){await page.locator(`[data-action="lb-tab"][data-tab="${tab}"]`).click();assert.ok(await page.locator(`[data-tab="${tab}"]`).evaluate(n=>n.classList.contains('is-active')));await fits(page,'.lb-panel',size);}
 await click(page,'lb-info');await fits(page,'.popup',size);await click(page,'close-modal');await click(page,'home');
 for(const action of ['settings','rewards','missions','noads','menu','lives']){await click(page,action);await page.waitForTimeout(450);const selector=action==='settings'||action==='menu'?'.popup':action==='noads'?'.na-modal':action==='lives'?'.lv-art-wrap':'.liveops-modal';await fits(page,selector,size);if(action==='settings'){await click(page,'toggle-music');assert.equal((await profile(page)).music,true);await click(page,'toggle-music');}await click(page,'close-modal');}
 await click(page,'menu');await click(page,'support');await page.locator('.cs26-modal').waitFor();await page.waitForTimeout(450);await fits(page,'.cs26-modal',size);await page.locator('[data-support-action="close"]').click();
 assert.equal((await profile(page)).coins,before.coins);assert.equal((await profile(page)).lives,before.lives);assert.deepEqual(errors,[]);await page.close();console.log(`PASS design navigation, store, tabs, popups and state at ${size.width}x${size.height}`);
}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.close()});

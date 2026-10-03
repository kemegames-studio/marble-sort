const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),payload=path.join(root,'android/app/src/main/assets/public');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.wav':'audio/wav'};
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://local').pathname,file=path.join(payload,name==='/'?'index.html':name);if(!file.startsWith(payload)||!fs.existsSync(file)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
let browser;
async function click(page,action){await page.locator(`[data-action="${action}"]`).first().click();}
async function profile(page){return page.evaluate(()=>JSON.parse(localStorage.getItem('marble-sort-state-v1')));}
async function fits(page,selector,size){const el=page.locator(selector).first();const content=selector==='.popup'?el.locator('.popup-body'):el;if(selector!=='.lv-art-wrap')assert.ok(await content.evaluate(n=>n.scrollWidth<=n.clientWidth+2),`${selector} has no horizontal overflow`);const b=await el.boundingBox();assert.ok(b.x>=-1&&b.x+b.width<=size.width+1,`${selector} fits width`);}

async function closeFits(page,selector,size){
 const panel=page.locator(selector).first();const close=panel.locator('[data-action="close-modal"], [data-support-action="close"]').first();
 const p=await panel.boundingBox(),b=await close.boundingBox();assert.ok(b&&b.width>=44&&b.height>=44,'Close target is at least 44px');
 assert.ok(b.x>=p.x&&b.y>=p.y&&b.x+b.width<=p.x+p.width+1&&b.y+b.height<=p.y+p.height+1,`${selector} close stays inside panel`);
 assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=size.width&&b.y+b.height<=size.height,'Close stays in viewport');
 assert.ok(await close.evaluate(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),`${selector}: close is not covered by title artwork`);
}

(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({executablePath:process.env.CHALLENGE_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
const url=`http://127.0.0.1:${server.address().port}`;
const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
let page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
await page.goto(url);await page.evaluate(()=>{localStorage.setItem('marble-sort-state-v1',JSON.stringify({version:2,level:30,unlocked:30,lives:5,onboarded:true,launched:true,music:false,sound:false,avatar:2,playerName:'Existing player'}));localStorage.removeItem('marble-sort-player-identity-v1');});await page.reload();await page.locator('.home').waitFor();await click(page,'menu');
assert.equal(await page.locator('.profile-avatar-choice[aria-pressed="true"]').getAttribute('data-avatar'),'2','Legacy choice migrated');
for(let i=0;i<8;i++){await page.locator(`[data-action="menu-avatar-choice"][data-avatar="${i}"]`).click();assert.equal((await profile(page)).avatar,i);assert.equal(await page.locator('.profile-avatar-choice[aria-pressed="true"]').count(),1);}
await click(page,'menu-edit-name');await page.locator('.menu-name-input').fill('Marble Master');await click(page,'menu-edit-name');assert.equal((await profile(page)).playerName,'Marble Master');
await page.close();page=await context.newPage();await page.goto(url);await page.locator('.home').waitFor();await click(page,'menu');assert.equal(await page.locator('.profile-avatar-choice[aria-pressed="true"]').getAttribute('data-avatar'),'7');assert.equal(await page.locator('.profile-name strong').textContent(),'Marble Master');
for(const img of await page.locator('.profile-menu img').all())assert.ok(await img.evaluate(n=>n.complete&&n.naturalWidth>0),'Avatar artwork loads');
await page.screenshot({path:process.env.PROFILE_SCREENSHOT||'/tmp/marble-player-menu.png'});
// Stale progress/cloud data must not overwrite the independently saved identity.
await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('marble-sort-state-v1'));s.avatar=0;s.playerName='Stale';localStorage.setItem('marble-sort-state-v1',JSON.stringify(s));});await page.reload();await page.locator('.home').waitFor();assert.equal((await profile(page)).avatar,7);assert.equal((await profile(page)).playerName,'Marble Master');
// Exercise native restore and races using the exact shared module, with a bridge stub.
const native=await page.evaluate(async()=>{const m=await import('/assets/player-profile.js');let stored=JSON.stringify({avatar:4,playerName:'Native saved'});globalThis.Capacitor={isNativePlatform:()=>true,isPluginAvailable:()=>true,registerPlugin:()=>({get:async()=>({value:stored}),set:async({value})=>{stored=value;}})};localStorage.removeItem('marble-sort-player-identity-v1');let p={avatar:0};await m.restoreIdentity(p);const restored={...p};let finish;globalThis.Capacitor.registerPlugin=()=>({get:()=>new Promise(r=>finish=r),set:async()=>{}});const pending=m.restoreIdentity(p);p.avatar=6;m.saveIdentity(p);finish({value:JSON.stringify({avatar:1})});await pending;return {restored,race:p.avatar};});
assert.deepEqual(native.restored,{avatar:4,playerName:'Native saved'});assert.equal(native.race,6,'New selection wins delayed native read');assert.deepEqual(errors,[]);console.log('PASS legacy migration, all avatars, name, page reopen, stale snapshot, native restore and selection race');
await context.close();
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.close()});

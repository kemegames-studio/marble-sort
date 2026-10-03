"""Patch preserved Android runtime; do not replace it with the older source build."""
from pathlib import Path
import shutil
root=Path(__file__).resolve().parents[1]
assets=root/'android/app/src/main/assets/public/assets'
for name in ['player-profile.js','design-system.css',*[f'avatar-{i}.svg' for i in range(8)]]:
    shutil.copyfile(root/'public/assets'/name,assets/name)
p=assets/'index-xlleoick.js';s=p.read_text()
if 'import { applyIdentity' not in s:
    s='import { applyIdentity, saveIdentity, restoreIdentity, avatarImage, renderPlayerMenu } from "./player-profile.js";\n'+s
    s=s.replace('let o=Kr(),','let o=applyIdentity(Kr()),')
    s=s.replace('o.avatar=Number(a.dataset.avatar)||0,y(),d();','o.avatar=Number(a.dataset.avatar)||0,saveIdentity(o),y(),d();')
    s=s.replace('Z=!1,y()','Z=!1,saveIdentity(o),y()')
    s=s.replace('o=G({...ee,...e,boosters:{...ee.boosters,...e.boosters||{}}})','o=applyIdentity(G({...ee,...e,boosters:{...ee.boosters,...e.boosters||{}}}))')
    s=s.replace('Q();y();Zn(', 'restoreIdentity(o).then(()=>{applyIdentity(o);y();d()});Q();y();Zn(')
start=s.index('function Tt(){');end=s.index('function Ct(',start)
s=s[:start]+'''function Tt(){return renderPlayerMenu({profile:o,name:o.playerName||_e(),editing:Z,id:_().gameUid,version:Nr,escape:K,icon:Y,terms:Fe.terms,privacy:Fe.privacy})}'''+s[end:]
start=s.index('function Aa(');end=s.index('function wn(',start)
s=s[:start]+'''function Aa(e,a=""){return e.isPlayer||e.real?`<span class="lb-avatar ${e.isPlayer?"lb-avatar-you":"lb-avatar-real"} ${a}" aria-hidden="true">${avatarImage(e.isPlayer?o.avatar:e.avatar)}</span>`:`<span class="lb-avatar ${a}" aria-hidden="true"><img src="/assets/ball-${e.avatar}.svg" alt="" /></span>`}'''+s[end:]
p.write_text(s)

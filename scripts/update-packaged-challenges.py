"""Apply reviewed challenge hooks to the preserved v26 Android payload.

Does not run Capacitor sync or replace unrelated production gameplay features.
"""
from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
assets = root / 'android/app/src/main/assets/public/assets'
bundle = assets / 'index-xlleoick.js'
s = bundle.read_text(encoding='utf-8-sig')
def replace(old, new):
    global s
    if old not in s:
        raise RuntimeError(f'Expected v26 hook missing: {old[:80]}')
    s = s.replace(old, new)

if 'installTimedChallengeRuntime' not in s:
    s = 'import { EXTRA_LEVELS } from "./extra-levels.js";\nimport { TOTAL_LEVELS, difficultyFor } from "./challenge-rules.js";\nimport { installTimedChallengeRuntime } from "./timed-challenge.js";\n' + s
    replace('function Wr(){return Bn[Math.min(o.level,100)-1]}', 'function Wr(){return Bn[Math.min(o.level,TOTAL_LEVELS)-1]}')
    replace('Math.min(100,', 'Math.min(TOTAL_LEVELS,')
    replace('function IsHardLevel(e){return HardLevels.includes(Number(e))}', 'function IsHardLevel(e){return HardLevels.includes(Number(e)) || Number(e)>100 && (difficultyFor(Number(e))==="hard" || Number(e)%5===0)}')
    replace('function StartLevelWithHardWarning(){if(!IsHardLevel(o.level))', 'function StartLevelWithHardWarning(){if(o.level%5===0){ze();return}if(!IsHardLevel(o.level))')
    replace('!Fr()&&jr(o.level)', '(g==="timed-intro"||!Fr())&&jr(o.level)')
    replace('De=!0,Yt(n,e,r)', 'De=!0,timedChallenge.sync(),Yt(n,e,r)')
    replace('y(),ie("game"),q("level_start"', 'y(),ie("game"),timedChallenge.start(Wr()),d(),q("level_start"')
    # Preserve the real ad call; pause the timer through its entire native promise.
    replace('async function aa(e){', 'async function aa(e){return timedChallenge.withAd(()=>nativeChallengeAd(e))}async function nativeChallengeAd(e){')
    replace('function Vt(){if(!g)', 'function Vt(){if(g==="timed-intro"||g==="timed-failed")return timedChallenge.modalMarkup();if(!g)')
    replace('</div>`,Dt()}function zt', '</div>`,Dt(),timedChallenge.onRender()}function zt')
    replace('function Ja(e,a){', 'function Ja(e,a){const challengeAttempt=timedChallenge.attempt;')
    replace('Ce(E)?setTimeout(()=>{const HardReward', 'Ce(E)?setTimeout(()=>{if(challengeAttempt!==timedChallenge.attempt||z!=="game")return;const HardReward')
    replace('zn(E)||setTimeout(()=>{c("lose"', 'zn(E)||setTimeout(()=>{if(challengeAttempt!==timedChallenge.attempt||z!=="game")return;c("lose"')
    adapter = '''Bn.push(...EXTRA_LEVELS);
const timedChallenge=installTimedChallengeRuntime({
root:S,inGame:()=>z==="game",modal:()=>g,animating:()=>De,
solved:()=>Ce(E),hasMoves:()=>zn(E),setModal:value=>{g=value},render:d,onReady:()=>Fr(),
failureMessage:()=>$e()?"Retry with a fresh timer. Your unlimited lives are active.":"You lost 1 life. Retry with a fresh timer.",
timeout:()=>{$e()||(o=en(o));q("level_failed",{level:o.level,reason:"timeout"});c("lose",{volume:.82});y()}
});
'''
    replace('Q();y();Zn(_().gameUid);', adapter + 'Q();y();Zn(_().gameUid);')
    bundle.write_text(s, encoding='utf-8')

for name, source in [('challenge-rules.js', root/'src/challenges.js'), ('extra-levels.js', root/'src/extra-levels.js'), ('timed-challenge.js', root/'public/assets/timed-challenge.js'), ('timed-challenge.css', root/'public/assets/timed-challenge.css')]:
    shutil.copyfile(source, assets/name)
shutil.copyfile(root/'src/challenges.js', root/'public/assets/challenge-rules.js')
index = assets.parent/'index.html'
html = index.read_text()
if 'timed-challenge.css' not in html:
    html = html.replace('</head>', '<link rel="stylesheet" href="/assets/timed-challenge.css" />\n</head>')
index.write_text(html)
print('Preserved Android runtime updated with shared level and timer modules.')

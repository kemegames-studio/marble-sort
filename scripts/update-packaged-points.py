from pathlib import Path
import shutil
root=Path(__file__).resolve().parents[1]
assets=root/'android/app/src/main/assets/public/assets'
for name in ['leaderboard-points.js','design-system.css','timed-challenge.js']:
    shutil.copyfile(root/'public/assets'/name,assets/name)
p=assets/'index-xlleoick.js';s=p.read_text()
if 'import { weeklyPoints' not in s:
    s='import { weeklyPoints, winPoints, renderPointsResult, renderPointsGuide } from "./leaderboard-points.js";\nlet lastLevelScore=null;\n'+s
    start=s.index('function on(e){');end=s.index('function H(e)',start)
    s=s[:start]+'function on(e){return weeklyPoints(e)}'+s[end:]
    s=s.replace('function qr(){const e=Q(),', 'function qr(){lastLevelScore=winPoints({firstTry:(Q().tries[o.level]||0)<=1,noBooster:!we});const e=Q(),')
    s=s.replace('<div class="winpop-earned">','${renderPointsResult(lastLevelScore,on(Q().weekly))}<div class="winpop-earned">')
    s=s.replace('<span class="failpop-heart" aria-hidden="true"></span>','<span class="failpop-heart" aria-hidden="true"></span>${renderPointsResult(null,on(Q().weekly))}')
    s=s.replace('<nav class="lb-tabs"', '${renderPointsGuide()}<nav class="lb-tabs"')
    s=s.replace('failureMessage:()=>$e()?', 'pointsSummary:()=>renderPointsResult(null,on(Q().weekly)),failureMessage:()=>$e()?')
    s=s.replace('${e("No-booster win","+15")}', '${e("No-booster win","+15")}<p class="lbi-note">Every win gives 3 stars (+75 points). A win earns 175–210 points. A loss earns 0 and deducts nothing. First-attempt means winning before a retry. Coins do not affect your score.</p>')
    p.write_text(s)
print('Leaderboard scoring explanation applied without changing awards.')

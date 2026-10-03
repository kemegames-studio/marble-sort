export const POINTS = Object.freeze({ win:100, star:25, firstTry:20, noBooster:15, daily:100 });
export function weeklyPoints(w = {}) { return Math.max(0,Math.round((w.levels||0)*POINTS.win+(w.stars||0)*POINTS.star+(w.firstTry||0)*POINTS.firstTry+(w.noBooster||0)*POINTS.noBooster+(w.daily||0)*POINTS.daily+(w.event||0))); }
export function winPoints({ firstTry, noBooster }) {
  const rows=[['Level completed',POINTS.win],['3 stars earned',3*POINTS.star],['First-attempt win',firstTry?POINTS.firstTry:0],['No boosters used',noBooster?POINTS.noBooster:0]];
  return { rows, earned:rows.reduce((sum,row)=>sum+row[1],0) };
}
export function renderPointsResult(result,total) {
  return `<section class="points-result" aria-label="Leaderboard points earned"><header><span>LEADERBOARD POINTS</span><strong>+${result?.earned||0}</strong></header>${result?`<dl>${result.rows.map(([label,value])=>`<div><dt>${label}</dt><dd>+${value}</dd></div>`).join('')}</dl>`:'<p>No points earned. Your existing points stay safe.</p>'}<footer>Weekly total <strong>${Number(total).toLocaleString('en-US')} pts</strong></footer></section>`;
}
export function renderPointsGuide() {
  return `<details class="points-guide"><summary>How to earn leaderboard points</summary><dl><div><dt>Win a level</dt><dd>+100</dd></div><div><dt>3 stars on every win</dt><dd>+75</dd></div><div><dt>Win on the first attempt</dt><dd>+20</dd></div><div><dt>Win without boosters</dt><dd>+15</dd></div><div><dt>Lose or run out of time</dt><dd>0</dd></div></dl><p>A win earns 175–210 points. Losses never deduct points. Using a booster removes only the +15 bonus. A rewarded continuation grants time; points are earned when you finish the level.</p><p>Weekly ranking uses points and resets every Monday. Stars ranking uses lifetime stars. Speed ranking uses your fastest booster-free win this week. Coins and ad coin bonuses do not add leaderboard points.</p></details>`;
}

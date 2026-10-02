import { writeFileSync } from 'node:fs';
import { difficultyFor, timeLimitFor } from '../src/challenges.js';
import { move, isSolved, topRun } from '../src/game-engine.js';
const palette = ['red', 'blue', 'green', 'orange', 'cyan', 'purple', 'pink', 'gray', 'olive'];
function random(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
const key = tubes => JSON.stringify(tubes);
const complexity = tubes => tubes.reduce((sum, tube) => sum + tube.filter((c, i) => i === 0 || c !== tube[i - 1]).length, 0);
function generate(id) {
  const difficulty = difficultyFor(id), band = Math.min(2, Math.floor((id - 101) / 75));
  const colorCount = Math.min(9, 6 + band + (difficulty === 'hard' ? 2 : difficulty === 'normal' ? 1 : 0));
  const rng = random(id * 7919), colors = palette.slice(0, colorCount);
  let best = null;
  for (let trial = 0; trial < 150; trial++) {
    let tubes = [...colors.map(c => [c,c,c,c]), [], []];
    let path = [], states = [key(tubes)];
    for (let step = 0; step < 1000; step++) {
      const options = [];
      for (let from = 0; from < tubes.length; from++) {
        const source = tubes[from];
        if (!source.length) continue;
        const color = source.at(-1), run = topRun(source).length;
        for (let to = 0; to < tubes.length; to++) {
          const target = tubes[to];
          if (to === from || target.length === 4 || target.at(-1) === color) continue;
          for (let amount = 1; amount <= Math.min(run, 4-target.length); amount++) {
            if (source.length > amount && source[source.length-amount-1] !== color) continue;
            if (!target.length && amount === 4) continue;
            options.push({from, to, amount});
          }
        }
      }
      if (!options.length) break;
      const boundary = options.filter(v => v.amount === tubes[v.from].length || v.amount === 4-tubes[v.to].length);
      const pool = boundary.length && rng() < 0.85 ? boundary : options;
      const {from,to,amount} = pool[Math.floor(rng()*pool.length)];
      tubes = tubes.map(t=>[...t]);
      tubes[to].push(...tubes[from].splice(-amount));
      const state = key(tubes), seen = states.indexOf(state);
      if (seen >= 0) { path = path.slice(0,seen); states = states.slice(0,seen+1); }
      else { path.push([to,from]); states.push(state); }
      // Keep two empty tubes for approachable, familiar full-stack boards.
      if (tubes.filter(t=>!t.length).length !== 2 || isSolved(tubes) || path.length > 65) continue;
      const score = complexity(tubes);
      const minimum = colorCount * (difficulty === 'breather' ? 2 : difficulty === 'hard' ? 2.75 : 2.5);
      if (score < minimum) continue;
      if (!best || score > best.score) best = {score,tubes:structuredClone(tubes),solution:path.toReversed?.() || [...path].reverse()};
    }
  }
  if (!best) throw new Error(`No qualifying board for ${id}`);
  let solved = best.tubes;
  for (const [from,to] of best.solution) {
    const result = move(solved,from,to);
    if (!result.moved) throw new Error(`Invalid solution ${id}`);
    solved = result.tubes;
  }
  if (!isSolved(solved)) throw new Error(`Unsolved ${id}`);
  const level = {id,difficulty,tubes:best.tubes,solution:best.solution};
  level.timeLimitSeconds = timeLimitFor(level);
  return level;
}
const levels = Array.from({length:200},(_,i)=>generate(i+101));
writeFileSync(new URL('../src/extra-levels.js',import.meta.url), `// Deterministic boards with legal grouped-pour solution certificates.\nexport const EXTRA_LEVELS = [\n${levels.map(level => "  " + JSON.stringify(level)).join(",\n")}\n];\n`);
console.log(`Generated ${levels.length} certified levels; timer range ${Math.min(...levels.filter(l=>l.timeLimitSeconds).map(l=>l.timeLimitSeconds))}-${Math.max(...levels.map(l=>l.timeLimitSeconds))} seconds.`);

export const CAPACITY = 4;

export function topRun(tube) {
  if (!tube.length) return [];
  const color = tube[tube.length - 1];
  const run = [];
  for (let i = tube.length - 1; i >= 0 && tube[i] === color; i--) run.push(tube[i]);
  return run;
}

export function isTubeComplete(tube) {
  return Boolean(tube?.length === CAPACITY && tube.every(value => value === tube[0]));
}

export function canMove(tubes, from, to) {
  if (from === to || !tubes[from]?.length || !tubes[to]) return false;
  const source = tubes[from];
  const target = tubes[to];
  if (isTubeComplete(source)) return false;
  if (target.length >= CAPACITY) return false;
  return !target.length || target[target.length - 1] === source[source.length - 1];
}

export function move(tubes, from, to) {
  if (!canMove(tubes, from, to)) return { tubes, moved: 0 };
  const next = tubes.map(tube => [...tube]);
  const amount = Math.min(topRun(next[from]).length, CAPACITY - next[to].length);
  const moved = next[from].splice(next[from].length - amount, amount);
  next[to].push(...moved);
  return { tubes: next, moved: amount };
}

export function hasAnyMoves(tubes) {
  for (let from = 0; from < tubes.length; from += 1) {
    for (let to = 0; to < tubes.length; to += 1) {
      if (canMove(tubes, from, to)) return true;
    }
  }
  return false;
}

export function isSolved(tubes) {
  return tubes.every(tube => !tube.length || isTubeComplete(tube));
}

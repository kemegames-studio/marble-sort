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

function canonicalKey(tubes) {
  return tubes.map(tube => tube.join(",")).sort().join("|");
}

// Existence check: can this board be sorted with legal moves? Bounded DFS with a
// canonical-state visited set. Returns false if unsolvable OR the search exceeds
// nodeCap (treated as "not confidently solvable" so shuffle picks another layout).
export function isSolvable(tubes, nodeCap = 25000) {
  if (isSolved(tubes)) return true;
  const seen = new Set();
  const stack = [tubes.map(tube => [...tube])];
  let nodes = 0;
  while (stack.length) {
    const state = stack.pop();
    if (isSolved(state)) return true;
    if (++nodes > nodeCap) return false;
    const key = canonicalKey(state);
    if (seen.has(key)) continue;
    seen.add(key);
    for (let from = 0; from < state.length; from += 1) {
      if (!state[from].length || isTubeComplete(state[from])) continue;
      for (let to = 0; to < state.length; to += 1) {
        if (from !== to && canMove(state, from, to)) {
          stack.push(move(state, from, to).tubes);
        }
      }
    }
  }
  return false;
}

// Rearrange the SAME marbles into the SAME per-tube slot counts (no marble is
// added or removed, empty tubes stay empty), guaranteeing the result is still
// solvable and not already solved. Returns a new board, or null if no solvable
// arrangement was found within the attempt budget.
export function shuffleTubes(tubes, rng = Math.random, attempts = 60) {
  const marbles = tubes.flat();
  const counts = tubes.map(tube => tube.length);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const pool = [...marbles];
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const candidate = counts.map(n => pool.splice(0, n));
    if (isSolved(candidate)) continue;
    if (isSolvable(candidate)) return candidate;
  }
  return null;
}

// Tube buttons overlap horizontally in the board layout, so a raw DOM hit can
// land on the neighbor painted on top. Resolve a tap to the tube whose visual
// center is nearest within the tapped row instead.
export function nearestTubeIndex(point, rects) {
  let bestIndex = null;
  let bestDistance = Infinity;
  rects.forEach(rect => {
    if (point.y < rect.top || point.y > rect.bottom) return;
    const distance = Math.abs(point.x - ((rect.left + rect.right) / 2));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = rect.index;
    }
  });
  return bestIndex;
}

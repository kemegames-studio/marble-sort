export const MAX_LIVES = 5;
export const LIFE_REGEN_MS = 30 * 60 * 1000;

export function refreshLives(profile, now = Date.now()) {
  const next = { ...profile };
  if (next.lives >= MAX_LIVES) {
    next.lives = MAX_LIVES;
    next.lastLifeAt = null;
    return next;
  }
  if (!next.lastLifeAt) {
    next.lastLifeAt = now;
    return next;
  }
  const gained = Math.floor((now - next.lastLifeAt) / LIFE_REGEN_MS);
  if (gained <= 0) return next;
  next.lives = Math.min(MAX_LIVES, next.lives + gained);
  next.lastLifeAt = next.lives === MAX_LIVES ? null : next.lastLifeAt + gained * LIFE_REGEN_MS;
  return next;
}

export function spendLife(profile, now = Date.now()) {
  const next = refreshLives(profile, now);
  if (next.lives <= 0) return { profile: next, spent: false };
  next.lives -= 1;
  if (!next.lastLifeAt) next.lastLifeAt = now;
  return { profile: next, spent: true };
}

export function loseLife(profile, now = Date.now()) {
  const next = refreshLives(profile, now);
  if (next.lives <= 0) return next;
  next.lives -= 1;
  if (!next.lastLifeAt) next.lastLifeAt = now;
  return next;
}

export function addCoins(profile, amount) {
  return { ...profile, coins: Math.max(0, profile.coins + amount) };
}

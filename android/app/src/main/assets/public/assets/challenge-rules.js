export const TOTAL_LEVELS = 300;
export const DIFFICULTY_SEQUENCE = ['breather', 'normal', 'normal', 'hard', 'timed', 'breather', 'normal', 'hard', 'hard', 'timed'];
export function difficultyFor(id) { return DIFFICULTY_SEQUENCE[(id - 101 + 200) % 10]; }
export function timeLimitFor(level) {
  if (level.id % 5 !== 0) return 0;
  const colors = new Set(level.tubes.flat()).size;
  const base = colors <= 3 ? 90 : colors <= 5 ? 120 : colors <= 7 ? 150 : 180;
  // The certified route is an upper bound, not a minimum-move solution.
  const certificateBudget = level.solution ? Math.ceil((level.solution.length * 3 + 30) / 15) * 15 : 0;
  return Math.max(base, certificateBudget);
}
export function formatRemaining(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
export class ChallengeClock {
  constructor() { this.reset(0, 0); }
  reset(seconds, now) { this.remaining = seconds * 1000; this.last = now; this.running = false; this.expired = false; }
  update(now, running) {
    if (!this.expired && this.running) this.remaining = Math.max(0, this.remaining - Math.max(0, now - this.last));
    this.last = now;
    this.running = running && this.remaining > 0;
    this.expired ||= this.remaining === 0;
    return this.remaining;
  }
}

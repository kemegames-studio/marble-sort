# Marble Sort & Match

A mobile-first marble sorting game for Keme Games. The project is a standalone Vite web game designed to be wrapped with Capacitor for Android after the web milestone is approved.

## Run

```bash
npm install
npm run dev
```

## Current milestone

- Loading, home, store, missions, rewards, leaderboard and settings views
- Functional marble sorting gameplay with animated legal moves
- Undo, shuffle and add-tube boosters
- Coins, lives, current level and unlocked level persistence
- 300 levels: the original 100 layouts plus 200 unique puzzles with verified solutions
- Saved difficulty rhythm and a timed challenge every fifth level (90–180 seconds)

See `docs/300-levels-timed-challenges.md` for timing, progression, and validation. The packaged Android runtime contains newer features than `src/`; do not replace it with a Capacitor sync for a release.

See `docs/architecture.md` for implementation decisions and known data gaps.

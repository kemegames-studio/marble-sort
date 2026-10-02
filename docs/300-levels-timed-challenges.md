# 300 levels and timed challenges

The first 100 board layouts are preserved. Levels 101–300 are deterministic new puzzles with two empty tubes, four marbles per color, and six to nine colors. Every new board includes a solution certificate validated with the game's actual grouped-pour rules, including the rule that completed tubes cannot be moved.

## Saved difficulty sequence

The following ten-level cycle repeats from level 101:

| Position | Type |
| --- | --- |
| 1 | Breather |
| 2–3 | Normal |
| 4 | Hard |
| 5 | Timed |
| 6 | Breather |
| 7 | Normal |
| 8–9 | Hard |
| 10 | Timed |

The baseline color count rises at levels 176 and 251. Normal boards add one color; hard boards add two, capped at nine colors and eleven tubes. Timed boards use the breather color count so time pressure does not stack with the hardest board size. Difficulty labels describe generation targets; they are not measured player success rates. Playtest and tune completion rates before a production release.

## Time limits

Every multiple of five from level 5 through 300 is timed: 60 timed levels in total, including 40 new ones.

| Unique colors | Starting limit |
| --- | --- |
| 1–3 | 90 seconds |
| 4–5 | 120 seconds |
| 6–7 | 150 seconds |
| 8–9 | 180 seconds |

New timed boards also receive at least `3 seconds × certified solution moves + 30 seconds`, rounded up to 15 seconds. All generated timed boards currently fit the 150- or 180-second starting limits. A certificate demonstrates solvability; its length is an upper bound, not an optimal solution or measured human completion time.

The challenge introduction shows the limit before play. The countdown starts on LET'S GO, turns red in the final 20 seconds, and pauses while an overlay, native ad, pour animation, or app background state blocks play. Pause accounting uses monotonic elapsed time rather than counting interval ticks. Solving the puzzle stops the clock before the completion animation. Timeout grants no reward, deducts one life once (except during unlimited lives), and offers Home or Retry. Retry recreates the original board with the full time allowance and displays the introduction again. There is no free time-extension mechanic.

Existing level reward values are retained. New normal/breather levels grant 40 coins; new hard/timed levels grant 80 coins, with the existing one-time rewarded-ad bonus matching the base reward in the packaged runtime. Progress and unlocks reach level 300 and never exceed it.

## Implementation and maintenance

- `src/extra-levels.js` contains the 200 boards, difficulty labels, limits, and solution certificates.
- `src/challenges.js` is the shared progression and timer policy.
- `public/assets/timed-challenge.js` adds the timer UI and lifecycle handling.
- `scripts/generate-levels.mjs` reproducibly regenerates the new boards.
- `scripts/update-packaged-challenges.py` copies shared modules and applies narrow hooks to the preserved Android v26 runtime. It is safe to rerun on this patched runtime.

Do not run Capacitor sync for a release: the recovered Android runtime still includes store, leaderboard, and other features absent from readable source. This change updates both playable implementations without replacing the production bundle. Android versionCode remains 26; release preparation must increment it and build/sign a new AAB separately.

Validation: `npm test`, `npm run build`, and `node scripts/qa-challenges.cjs` (requires Playwright and a Chromium executable; optionally set `CHALLENGE_CHROMIUM`). The browser harness blocks external requests and performs no live purchases or backend writes.

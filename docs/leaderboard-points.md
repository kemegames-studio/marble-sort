# Leaderboard points and result clarity

Weekly points use the existing production weights: 100 per win, 25 per star, 20 per first-attempt win, 15 per booster-free win, 100 per daily-challenge counter and configured event points. Every completed level currently awards three stars, so level wins earn 175–210 points. Losing, timing out or leaving does not subtract leaderboard points. Lives are handled separately.

Result panels show the awarded total, all four level criteria (including zero when a bonus is ineligible), and the current weekly total. Timed failures show zero points while preserving the existing rewarded continuation: points are granted only after a win. The win breakdown snapshots eligibility at completion, so rerenders and rewarded coin bonuses cannot change its point award.

The leaderboard has an expandable scoring guide. Weekly uses points, Stars uses lifetime stars, and Speed uses the best booster-free win time this week. The existing info popup keeps its other league/reward rules and adds explicit win/loss criteria. No XP currency has been introduced.

The shared scoring module is used by the preserved Android build and source preview. Android continues to save the existing leaderboard counters and submit through the existing sync function. The updater changes presentation and replaces the scoring expression with the equivalent shared function; it does not change point weights or grants. The source preview now maintains local counters for its result display.

Validation: build and Node tests; browser wins for 210, 195, 190 and 175 points match stored counters, timed losses preserve score, leaderboard guide visibility, and existing rewarded-time regression. No live leaderboard records are written during browser QA.

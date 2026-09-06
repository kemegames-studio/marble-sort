import test from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_SIZE,
  LEAGUES,
  buildSpeedBoard,
  buildStarsBoard,
  buildWeeklyBoard,
  computeWeeklyScore,
  formatSeasonCountdown,
  generateOpponents,
  getSeasonEnd,
  getSeasonKey,
  getWeekFraction,
  getWeekStart,
  leagueOutcome,
  opponentPointsAt,
  rewardForRank,
} from "../src/leaderboard.js";

const WEDNESDAY_NOON = new Date(2026, 6, 1, 12, 0, 0).getTime(); // Wed Jul 1 2026

test("week starts on Monday and the season ends the following Monday", () => {
  const start = new Date(getWeekStart(WEDNESDAY_NOON));
  assert.equal(start.getDay(), 1);
  assert.equal(start.getHours(), 0);
  const end = getSeasonEnd(WEDNESDAY_NOON);
  assert.equal(new Date(end).getDay(), 1);
  assert.ok(end > WEDNESDAY_NOON);
});

test("season key is stable within a week and changes across weeks", () => {
  const key = getSeasonKey(WEDNESDAY_NOON);
  assert.equal(key, getSeasonKey(WEDNESDAY_NOON + 2 * 86400000));
  assert.notEqual(key, getSeasonKey(WEDNESDAY_NOON + 7 * 86400000));
  assert.match(key, /^\d{4}-W\d{2}$/);
});

test("weekly score follows the published formula", () => {
  const score = computeWeeklyScore({ levels: 3, stars: 9, firstTry: 2, noBooster: 1, daily: 1, event: 30 });
  assert.equal(score, 3 * 100 + 9 * 25 + 2 * 20 + 1 * 15 + 100 + 30);
});

test("opponents are deterministic for a season and league", () => {
  const a = generateOpponents("2026-W27", "gold", 25);
  const b = generateOpponents("2026-W27", "gold", 25);
  assert.deepEqual(a.map(x => x.playerName), b.map(x => x.playerName));
  assert.deepEqual(a.map(x => x.skill), b.map(x => x.skill));
  const c = generateOpponents("2026-W28", "gold", 25);
  assert.notDeepEqual(a.map(x => x.skill), c.map(x => x.skill));
});

test("opponent points grow monotonically through the week", () => {
  const [opponent] = generateOpponents("2026-W27", "silver", 1);
  const early = opponentPointsAt(opponent, 0.1);
  const mid = opponentPointsAt(opponent, 0.5);
  const late = opponentPointsAt(opponent, 1);
  assert.ok(early <= mid && mid <= late);
  assert.ok(late > 0);
});

test("weekly board ranks by points and includes the player", () => {
  const { entries, player } = buildWeeklyBoard({
    seasonKey: "2026-W27",
    leagueId: "bronze",
    playerEntry: { playerName: "You", avatar: 0, weeklyPoints: 999999, stars: 30, totalLevels: 10, lastRank: 4 },
    now: WEDNESDAY_NOON,
  });
  assert.equal(entries.length, BOARD_SIZE);
  assert.equal(player.rank, 1);
  assert.equal(player.movement, 3);
  for (let i = 1; i < entries.length; i++) {
    assert.ok(entries[i - 1].weeklyPoints >= entries[i].weeklyPoints);
  }
});

test("stars board ranks by stars", () => {
  const { entries } = buildStarsBoard({
    seasonKey: "2026-W27",
    leagueId: "gold",
    playerEntry: { playerName: "You", avatar: 0, stars: 5, totalLevels: 2 },
  });
  for (let i = 1; i < entries.length; i++) {
    assert.ok(entries[i - 1].stars >= entries[i].stars);
  }
});

test("speed board ranks ascending and omits the player without a valid run", () => {
  const withRun = buildSpeedBoard({
    seasonKey: "2026-W27",
    leagueId: "gold",
    playerEntry: { playerName: "You", avatar: 0, speedTime: 1, speedDate: WEDNESDAY_NOON },
    now: WEDNESDAY_NOON,
  });
  assert.equal(withRun.player.rank, 1);
  const withoutRun = buildSpeedBoard({
    seasonKey: "2026-W27",
    leagueId: "gold",
    playerEntry: { playerName: "You", avatar: 0, speedTime: null },
    now: WEDNESDAY_NOON,
  });
  assert.equal(withoutRun.player, null);
  for (let i = 1; i < withoutRun.entries.length; i++) {
    assert.ok(withoutRun.entries[i - 1].speedTime <= withoutRun.entries[i].speedTime);
  }
});

test("reward tiers match the spec", () => {
  assert.equal(rewardForRank(1).skin, "Aurora Marble");
  assert.equal(rewardForRank(1).badge, "Champion");
  assert.equal(rewardForRank(2).coins, 1200);
  assert.equal(rewardForRank(7).coins, 600);
  assert.equal(rewardForRank(50).coins, 250);
  assert.equal(rewardForRank(101, 2000).coins, 100); // top 10% of 2000
  assert.equal(rewardForRank(500, 2000), null);
});

test("league promotion and relegation use 20% cuts", () => {
  assert.deepEqual(leagueOutcome(10, 100, "bronze"), { outcome: "promoted", league: "silver" });
  assert.deepEqual(leagueOutcome(95, 100, "silver"), { outcome: "relegated", league: "bronze" });
  assert.deepEqual(leagueOutcome(50, 100, "gold"), { outcome: "stayed", league: "gold" });
  assert.equal(leagueOutcome(1, 100, "legend").outcome, "stayed"); // no league above Legend
  assert.equal(leagueOutcome(100, 100, "bronze").outcome, "stayed"); // no league below Bronze
});

test("real Firestore entries merge into the weekly board and rank correctly", () => {
  const realEntries = [
    { id: "real-uid-1", playerName: "RealChamp", avatar: 2, weeklyPoints: 999999, stars: 60, totalLevels: 20 },
    { id: "me", playerName: "ShouldBeExcluded", avatar: 0, weeklyPoints: 5, stars: 0, totalLevels: 0 },
  ];
  const { entries, player } = buildWeeklyBoard({
    seasonKey: "2026-W27",
    leagueId: "bronze",
    playerEntry: { playerName: "You", avatar: 0, weeklyPoints: 100, stars: 3, totalLevels: 1, lastRank: null },
    realEntries,
    playerId: "me",
    now: WEDNESDAY_NOON,
  });
  assert.equal(entries.length, BOARD_SIZE); // real entries replace fillers, size stays fixed
  assert.equal(entries[0].playerName, "RealChamp");
  assert.equal(entries[0].real, true);
  assert.ok(!entries.some(e => e.playerName === "ShouldBeExcluded")); // own uid deduped
  assert.ok(player.rank > 1);
});

test("countdown formats like the mockup", () => {
  assert.equal(formatSeasonCountdown((4 * 86400000) + (12 * 3600000) + (36 * 60000)), "4d 12h 36m");
  assert.equal(formatSeasonCountdown(90 * 60000), "1h 30m");
  assert.equal(formatSeasonCountdown(5 * 60000), "5m");
});

test("league list covers all six tiers", () => {
  assert.deepEqual(LEAGUES.map(l => l.id), ["bronze", "silver", "gold", "diamond", "master", "legend"]);
});

test("week fraction is 0 at Monday start and approaches 1 on Sunday night", () => {
  const start = getWeekStart(WEDNESDAY_NOON);
  assert.equal(getWeekFraction(start), 0);
  assert.ok(getWeekFraction(start + WEEK_SUNDAY_NIGHT) > 0.95);
});

const WEEK_SUNDAY_NIGHT = (6 * 86400000) + (20 * 3600000);

// Leaderboard data layer: leagues, weekly seasons, deterministic simulated
// opponents, boards, movement, rewards and promotion/relegation.
// Pure module (no DOM) so every rule is unit-testable. All opponents are
// derived deterministically from (seasonKey, league) so the same week always
// shows the same competition, and scores progress as the week advances —
// the seams here map 1:1 onto a future real backend (see docs).

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const LEAGUES = [
  { id: "bronze", name: "Bronze", badge: "🥉", tier: 0, promotionThreshold: 0.2, demotionThreshold: 0.2 },
  { id: "silver", name: "Silver", badge: "🥈", tier: 1, promotionThreshold: 0.2, demotionThreshold: 0.2 },
  { id: "gold", name: "Gold", badge: "🥇", tier: 2, promotionThreshold: 0.2, demotionThreshold: 0.2 },
  { id: "diamond", name: "Diamond", badge: "💎", tier: 3, promotionThreshold: 0.2, demotionThreshold: 0.2 },
  { id: "master", name: "Master", badge: "👑", tier: 4, promotionThreshold: 0.2, demotionThreshold: 0.2 },
  { id: "legend", name: "Legend", badge: "🔥", tier: 5, promotionThreshold: 0.2, demotionThreshold: 0.2 },
];

export const WEEKLY_REWARDS = [
  { rankRange: [1, 1], coins: 2500, gems: 120, skin: "Aurora Marble", badge: "Champion" },
  { rankRange: [2, 3], coins: 1200, gems: 60, skin: "Nebula Marble", badge: null },
  { rankRange: [4, 10], coins: 600, gems: 30, skin: null, badge: null },
  { rankRange: [11, 100], coins: 250, gems: 0, skin: null, badge: null },
];
export const TOP_PERCENT_REWARD = { percent: 0.1, coins: 100, gems: 0, skin: null, badge: null };

export const BOARD_SIZE = 100;

const AVATAR_COLORS = ["red", "blue", "green", "cyan", "plum", "yellow"];

const NAME_POOL = [
  "MarbleMaster", "SortKing", "ColorGenius", "BubbleBrain", "MarbleQueen",
  "SortWizard", "PuzzlePro", "GemHunter", "TubeTitan", "SortStorm",
  "PuzzlePilot", "MarbleMage", "RainbowRuler", "SwiftSorter", "ComboCat",
  "LunaSort", "PixelPasha", "VortexVik", "EpicEmma", "TurboTess",
  "NoorPlays", "FahadWins", "MayaMoves", "OmarOrbit", "LinaLoops",
  "ZenZara", "DashDina", "KingKoo", "StarSarah", "BoltBadr",
  "JadeJoud", "MirageMo", "EchoEnzo", "FlickFay", "GlowGala",
  "HopHadi", "IrisIman", "JollyJad", "KiwiKen", "LoopLara",
];

export function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Monday 00:00 local time that starts the week containing `now`.
export function getWeekStart(now = Date.now()) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay(); // 0 Sun .. 6 Sat
  const sinceMonday = (day + 6) % 7;
  date.setDate(date.getDate() - sinceMonday);
  return date.getTime();
}

export function getSeasonEnd(now = Date.now()) {
  return getWeekStart(now) + WEEK_MS;
}

export function getSeasonKey(now = Date.now()) {
  const start = new Date(getWeekStart(now));
  const year = start.getFullYear();
  const oneJan = new Date(year, 0, 1);
  const week = Math.ceil((((start - oneJan) / 86400000) + oneJan.getDay() + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function getWeekFraction(now = Date.now()) {
  const start = getWeekStart(now);
  return Math.min(1, Math.max(0, (now - start) / WEEK_MS));
}

export function formatSeasonCountdown(ms) {
  const total = Math.max(0, ms);
  const days = Math.floor(total / 86400000);
  const hours = Math.floor((total % 86400000) / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function computeWeeklyScore(weekly) {
  return Math.max(0, Math.round(
    (weekly.levels || 0) * 100 +
    (weekly.stars || 0) * 25 +
    (weekly.firstTry || 0) * 20 +
    (weekly.noBooster || 0) * 15 +
    (weekly.daily || 0) * 100 +
    (weekly.event || 0)
  ));
}

export function getLeague(leagueId) {
  return LEAGUES.find(league => league.id === leagueId) || LEAGUES[0];
}

// Mean end-of-week score per league tier; bots spread around it.
const LEAGUE_MEANS = [2600, 5200, 9000, 14000, 21000, 30000];

export function generateOpponents(seasonKey, leagueId, count = BOARD_SIZE - 1) {
  const league = getLeague(leagueId);
  const rng = mulberry32(hashString(`${seasonKey}:${league.id}`));
  const opponents = [];
  const usedNames = new Set();
  for (let i = 0; i < count; i++) {
    let playerName = NAME_POOL[Math.floor(rng() * NAME_POOL.length)];
    if (usedNames.has(playerName)) playerName = `${playerName}${Math.floor(rng() * 90) + 10}`;
    usedNames.add(playerName);
    const skill = LEAGUE_MEANS[league.tier] * (0.35 + 1.65 * Math.pow(rng(), 1.6));
    // Every bot ramps differently across the week (early grinders vs late sprinters).
    const ramp = 0.55 + (rng() * 0.9);
    const starsRate = 0.55 + (rng() * 0.45);
    opponents.push({
      id: `${seasonKey}-${league.id}-${i}`,
      playerName,
      avatar: AVATAR_COLORS[Math.floor(rng() * AVATAR_COLORS.length)],
      league: league.id,
      skill,
      ramp,
      stars: Math.round((60 + rng() * 900) * starsRate),
      totalLevels: 0,
      speedTime: Math.round((24 + rng() * 150) * 10) / 10,
      speedDayOffset: Math.floor(rng() * 7),
      eventPoints: 0,
      isPlayer: false,
    });
  }
  opponents.forEach(opponent => {
    opponent.totalLevels = Math.max(1, Math.round(opponent.stars / 3));
  });
  return opponents;
}

export function opponentPointsAt(opponent, weekFraction) {
  const progress = Math.pow(Math.min(1, Math.max(0, weekFraction)), opponent.ramp);
  return Math.max(0, Math.round((opponent.skill * progress) / 10) * 10);
}

function rankEntries(entries, scoreOf) {
  const sorted = [...entries].sort((a, b) => scoreOf(b) - scoreOf(a) || a.playerName.localeCompare(b.playerName));
  sorted.forEach((entry, index) => { entry.rank = index + 1; });
  return sorted;
}

// Real players fetched from Firestore replace an equal number of simulated
// fillers so the board stays at BOARD_SIZE. The local player's own entry is
// excluded (it's inserted separately as "You").
function normalizeRealEntries(realEntries, leagueId, excludeId) {
  return (realEntries || [])
    .filter(entry => entry.id !== excludeId)
    .map(entry => ({
      ...entry,
      league: leagueId,
      real: true,
      isPlayer: false,
    }));
}

// Weekly board with movement (rank now vs rank ~6h earlier in the week).
export function buildWeeklyBoard({ seasonKey, leagueId, playerEntry, realEntries = [], playerId = null, now = Date.now() }) {
  const real = normalizeRealEntries(realEntries, leagueId, playerId);
  const opponents = generateOpponents(seasonKey, leagueId).slice(0, Math.max(0, BOARD_SIZE - 1 - real.length));
  const fraction = getWeekFraction(now);
  const earlier = Math.max(0, fraction - (0.25 / 7));
  const entries = opponents.map(opponent => ({
    ...opponent,
    weeklyPoints: opponentPointsAt(opponent, fraction),
    previousPoints: opponentPointsAt(opponent, earlier),
  }));
  real.forEach(entry => entries.push({ ...entry, previousPoints: entry.weeklyPoints }));
  const player = {
    id: "player",
    playerName: playerEntry.playerName,
    avatar: playerEntry.avatar,
    league: leagueId,
    weeklyPoints: playerEntry.weeklyPoints,
    previousPoints: playerEntry.weeklyPoints,
    stars: playerEntry.stars,
    totalLevels: playerEntry.totalLevels,
    isPlayer: true,
  };
  entries.push(player);
  const previousRanks = new Map(
    rankEntries(entries.map(entry => ({ ...entry })), entry => entry.previousPoints)
      .map(entry => [entry.id, entry.rank])
  );
  const ranked = rankEntries(entries, entry => entry.weeklyPoints);
  ranked.forEach(entry => {
    const before = previousRanks.get(entry.id) ?? entry.rank;
    entry.movement = entry.isPlayer ? (playerEntry.lastRank ? playerEntry.lastRank - entry.rank : 0) : before - entry.rank;
  });
  return { entries: ranked, player: ranked.find(entry => entry.isPlayer) };
}

export function buildStarsBoard({ seasonKey, leagueId, playerEntry, realEntries = [], playerId = null }) {
  const real = normalizeRealEntries(realEntries, leagueId, playerId);
  const opponents = generateOpponents(seasonKey, leagueId).slice(0, Math.max(0, BOARD_SIZE - 1 - real.length));
  const entries = opponents.map(opponent => ({ ...opponent }));
  real.forEach(entry => entries.push({ ...entry }));
  entries.push({
    id: "player",
    playerName: playerEntry.playerName,
    avatar: playerEntry.avatar,
    league: leagueId,
    stars: playerEntry.stars,
    totalLevels: playerEntry.totalLevels,
    isPlayer: true,
  });
  const ranked = rankEntries(entries, entry => entry.stars);
  return { entries: ranked, player: ranked.find(entry => entry.isPlayer) };
}

// Speed board: best daily-challenge times this week (lower is better).
export function buildSpeedBoard({ seasonKey, leagueId, playerEntry, realEntries = [], playerId = null, now = Date.now() }) {
  const real = normalizeRealEntries(realEntries, leagueId, playerId).filter(entry => entry.speedTime);
  const opponents = generateOpponents(seasonKey, leagueId)
    .filter((_, index) => index % 3 !== 0); // not everyone runs the challenge
  const weekStart = getWeekStart(now);
  const entries = opponents.map(opponent => ({
    ...opponent,
    speedDate: weekStart + Math.min(opponent.speedDayOffset, Math.floor((now - weekStart) / 86400000)) * 86400000,
  }));
  real.forEach(entry => entries.push({ ...entry, speedDate: entry.speedDate || weekStart }));
  if (playerEntry.speedTime) {
    entries.push({
      id: "player",
      playerName: playerEntry.playerName,
      avatar: playerEntry.avatar,
      league: leagueId,
      speedTime: playerEntry.speedTime,
      speedDate: playerEntry.speedDate,
      isPlayer: true,
    });
  }
  const sorted = [...entries].sort((a, b) => a.speedTime - b.speedTime);
  sorted.forEach((entry, index) => { entry.rank = index + 1; });
  return { entries: sorted, player: sorted.find(entry => entry.isPlayer) || null };
}

export function rewardForRank(rank, totalPlayers = BOARD_SIZE) {
  if (!rank) return null;
  const tier = WEEKLY_REWARDS.find(reward => rank >= reward.rankRange[0] && rank <= reward.rankRange[1]);
  if (tier) return { ...tier };
  if (rank <= Math.ceil(totalPlayers * TOP_PERCENT_REWARD.percent)) {
    return { rankRange: [rank, rank], ...TOP_PERCENT_REWARD };
  }
  return null;
}

export function leagueOutcome(rank, totalPlayers, leagueId) {
  const league = getLeague(leagueId);
  const promoteCut = Math.ceil(totalPlayers * league.promotionThreshold);
  const demoteCut = totalPlayers - Math.floor(totalPlayers * league.demotionThreshold);
  if (rank <= promoteCut && league.tier < LEAGUES.length - 1) {
    return { outcome: "promoted", league: LEAGUES[league.tier + 1].id };
  }
  if (rank > demoteCut && league.tier > 0) {
    return { outcome: "relegated", league: LEAGUES[league.tier - 1].id };
  }
  return { outcome: "stayed", league: league.id };
}

export function formatSpeedTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1).padStart(4, "0");
  return mins > 0 ? `${mins}:${secs}` : `${seconds.toFixed(1)}s`;
}

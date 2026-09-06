// Player-data cloud sync — Firestore REST, no SDK dependency.
// Each device's persistent gameUid (see keme-support.js) keys one document at
// players/{gameUid} in the "Marble Sort" Firebase project (marble-sort-kemegames).
// Writes are debounced and best-effort: offline or failed syncs never affect play.

const FIREBASE_PROJECT_ID = "marble-sort-kemegames";
const DOCS_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

const PUSH_DEBOUNCE_MS = 4000;
let pushTimer = null;
let lastPushedJson = "";

function playerDocUrl(gameUid) {
  return `${DOCS_BASE}/players/${encodeURIComponent(gameUid)}`;
}

export async function pushCloudProfile(gameUid, profile) {
  if (!gameUid || typeof fetch !== "function") return false;
  const json = JSON.stringify(profile);
  if (json === lastPushedJson) return true; // nothing changed since last sync
  const fields = {
    profile: { stringValue: json },
    playerName: { stringValue: String(profile.playerName || "").slice(0, 24) },
    level: { integerValue: String(profile.level || 1) },
    coins: { integerValue: String(profile.coins || 0) },
    updatedAt: { timestampValue: new Date().toISOString() },
  };
  try {
    const response = await fetch(playerDocUrl(gameUid), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });
    if (response.ok) lastPushedJson = json;
    return response.ok;
  } catch {
    return false; // offline — the next save retries
  }
}

export function scheduleCloudPush(gameUid, getProfile) {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    pushCloudProfile(gameUid, getProfile());
  }, PUSH_DEBOUNCE_MS);
}

export async function fetchCloudProfile(gameUid) {
  if (!gameUid || typeof fetch !== "function") return null;
  try {
    const response = await fetch(playerDocUrl(gameUid));
    if (!response.ok) return null; // 404 = no cloud save yet
    const doc = await response.json();
    const json = doc?.fields?.profile?.stringValue;
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

// ---- Live weekly leaderboard: leaderboards/{season}/{league}/{gameUid} ----

export async function pushLeaderboardEntry(gameUid, season, league, entry) {
  if (!gameUid || typeof fetch !== "function") return false;
  const fields = {
    playerName: { stringValue: String(entry.playerName || "").slice(0, 24) },
    avatar: { integerValue: String(entry.avatar || 0) },
    weeklyPoints: { integerValue: String(Math.max(0, entry.weeklyPoints || 0)) },
    stars: { integerValue: String(entry.stars || 0) },
    totalLevels: { integerValue: String(entry.totalLevels || 0) },
    speedTime: entry.speedTime ? { doubleValue: entry.speedTime } : { nullValue: null },
    speedDate: entry.speedDate ? { timestampValue: new Date(entry.speedDate).toISOString() } : { nullValue: null },
    updatedAt: { timestampValue: new Date().toISOString() },
  };
  try {
    const url = `${DOCS_BASE}/leaderboards/${encodeURIComponent(season)}/${encodeURIComponent(league)}/${encodeURIComponent(gameUid)}`;
    const response = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function fetchLeaderboardEntries(season, league, limit = 100) {
  if (typeof fetch !== "function") return [];
  try {
    const response = await fetch(`${DOCS_BASE}/leaderboards/${encodeURIComponent(season)}:runQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: league }],
          orderBy: [{ field: { fieldPath: "weeklyPoints" }, direction: "DESCENDING" }],
          limit,
        },
      }),
    });
    if (!response.ok) return [];
    const rows = await response.json();
    return rows
      .filter(row => row.document)
      .map(row => {
        const f = row.document.fields || {};
        return {
          id: row.document.name.split("/").pop(),
          playerName: f.playerName?.stringValue || "Player",
          avatar: Number(f.avatar?.integerValue || 0),
          weeklyPoints: Number(f.weeklyPoints?.integerValue || 0),
          stars: Number(f.stars?.integerValue || 0),
          totalLevels: Number(f.totalLevels?.integerValue || 0),
          speedTime: f.speedTime?.doubleValue ? Number(f.speedTime.doubleValue) : null,
          speedDate: f.speedDate?.timestampValue ? Date.parse(f.speedDate.timestampValue) : null,
          real: true,
        };
      });
  } catch {
    return [];
  }
}

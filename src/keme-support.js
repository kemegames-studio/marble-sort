const SUPPORT_UID_STORAGE = "marble-sort-keme-game-uid-v1";

function getStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function createFallbackUid() {
  return `marble-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getOrCreateGameUid() {
  const storage = getStorage();
  const existing = storage?.getItem(SUPPORT_UID_STORAGE)?.trim();
  if (existing) return existing;

  const created = typeof globalThis.crypto?.randomUUID === "function"
    ? `marble-${globalThis.crypto.randomUUID()}`
    : createFallbackUid();

  storage?.setItem(SUPPORT_UID_STORAGE, created);
  return created;
}

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePortalBaseUrl(value) {
  const trimmed = trimString(value).replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.endsWith("/api/v1") ? trimmed : `${trimmed}/api/v1`;
}

export function getKemeSupportConfig() {
  const raw = globalThis.__MARBLE_SORT_KEME__ ?? {};
  return {
    portalBaseUrl: normalizePortalBaseUrl(raw.portalBaseUrl ?? raw.baseUrl ?? ""),
    preferredGameId: trimString(raw.preferredGameId),
    gameUid: trimString(raw.gameUid) || getOrCreateGameUid(),
    sdkKey: trimString(raw.sdkKey),
    organizationId: trimString(raw.organizationId),
    environment: trimString(raw.environment) === "sandbox" ? "sandbox" : "production",
  };
}

async function parseResponse(response, fallbackMessage) {
  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.success) {
    const message = Array.isArray(payload?.message)
      ? payload.message.join(", ")
      : payload?.message || fallbackMessage;
    throw new Error(message);
  }

  return payload.data;
}

export async function loginPortal(config) {
  const usernameSuffix = config.gameUid.replace(/[^a-zA-Z0-9]/g, "").slice(-12) || "guest";
  const response = await fetch(`${config.portalBaseUrl}/portal/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      gameUid: config.gameUid,
      username: `marble_${usernameSuffix}`,
    }),
  });

  return parseResponse(response, "Unable to sign in to Keme support.");
}

export async function loadPortalGames(config, token) {
  const response = await fetch(`${config.portalBaseUrl}/portal/tickets/games`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return parseResponse(response, "Unable to load Keme games.");
}

export async function loadPortalTickets(config, token) {
  const response = await fetch(`${config.portalBaseUrl}/portal/tickets?limit=5&page=1`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = await parseResponse(response, "Unable to load recent Keme tickets.");
  return payload?.data ?? [];
}

export async function createPortalTicket(config, token, draft) {
  const body = new FormData();
  body.append("subject", draft.subject.trim());
  body.append("description", draft.description.trim());
  body.append("gameId", draft.gameId);
  body.append("category", draft.category);
  body.append("priority", draft.priority);

  const response = await fetch(`${config.portalBaseUrl}/portal/tickets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body,
  });

  return parseResponse(response, "Unable to submit the Keme support ticket.");
}

export function hasNativeSupportBridge() {
  const plugin = globalThis.Capacitor?.Plugins?.KemeSupport;
  return Boolean(
    plugin && (typeof plugin.openSupportCenter === "function" || typeof plugin.openSupport === "function")
  );
}

export async function openNativeSupportCenter() {
  const plugin = globalThis.Capacitor?.Plugins?.KemeSupport;
  if (!plugin) return false;

  if (typeof plugin.openSupportCenter === "function") {
    await plugin.openSupportCenter();
    return true;
  }

  if (typeof plugin.openSupport === "function") {
    await plugin.openSupport();
    return true;
  }

  return false;
}

export async function identifyNativeSupportUser(identity) {
  const plugin = globalThis.Capacitor?.Plugins?.KemeSupport;
  if (!plugin || typeof plugin.identifyUser !== "function") {
    return {
      available: false,
      identifiedUserId: "",
      error: "",
    };
  }

  try {
    const result = await plugin.identifyUser(identity);
    return {
      available: true,
      identifiedUserId: result?.identifiedUserId || identity?.userId || "",
      error: "",
    };
  } catch (error) {
    return {
      available: true,
      identifiedUserId: "",
      error: error instanceof Error ? error.message : "Unable to identify the player in native Keme support",
    };
  }
}

export async function clearNativeSupportUser() {
  const plugin = globalThis.Capacitor?.Plugins?.KemeSupport;
  if (!plugin || typeof plugin.clearUser !== "function") {
    return false;
  }

  await plugin.clearUser();
  return true;
}

export async function getNativeSupportStatus() {
  const plugin = globalThis.Capacitor?.Plugins?.KemeSupport;
  if (!plugin || typeof plugin.getStatus !== "function") {
    return {
      available: false,
      configured: false,
      initialized: false,
      identifiedUserId: "",
      lastError: "",
    };
  }

  try {
    return await plugin.getStatus();
  } catch (error) {
    return {
      available: false,
      configured: false,
      initialized: false,
      identifiedUserId: "",
      lastError: error instanceof Error ? error.message : "Unable to inspect native Keme support",
    };
  }
}

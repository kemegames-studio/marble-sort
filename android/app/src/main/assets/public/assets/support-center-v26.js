const SUPPORT_ROOT_ID = "keme-support-v26";
const SUPPORT_UID_STORAGE = "marble-sort-keme-game-uid-v1";
const PROFILE_STORAGE = "marble-sort-state-v1";
const PAGE_SIZE = 10;

const state = {
  open: false,
  view: "tickets",
  token: "",
  player: null,
  gameId: "",
  tickets: [],
  page: 1,
  total: 0,
  loading: false,
  loadingMore: false,
  detailLoading: false,
  submitting: false,
  replying: false,
  selectedId: "",
  ticket: null,
  error: "",
  success: "",
  listScrollTop: 0,
  draft: { category: "gameplay", subject: "", description: "" },
  reply: "",
  entering: false,
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getConfig() {
  const raw = globalThis.__MARBLE_SORT_KEME__ ?? {};
  const base = String(raw.portalBaseUrl ?? raw.baseUrl ?? "").trim().replace(/\/+$/, "");
  return {
    portalBaseUrl: base ? (base.endsWith("/api/v1") ? base : `${base}/api/v1`) : "",
    preferredGameId: String(raw.preferredGameId ?? "").trim(),
  };
}

function getGameUid() {
  const existing = localStorage.getItem(SUPPORT_UID_STORAGE)?.trim();
  if (existing) return existing;
  const created = typeof crypto.randomUUID === "function"
    ? `marble-${crypto.randomUUID()}`
    : `marble-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem(SUPPORT_UID_STORAGE, created);
  return created;
}

function getPlayerName() {
  try {
    const profile = JSON.parse(localStorage.getItem(PROFILE_STORAGE) || "{}");
    if (profile.playerName?.trim()) return profile.playerName.trim();
  } catch {}
  return `Player${getGameUid().replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase()}`;
}

async function api(path, options = {}) {
  const config = getConfig();
  if (!config.portalBaseUrl) throw new Error("Customer support is not configured yet.");
  const headers = { ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(`${config.portalBaseUrl}${path}`, { ...options, headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
    throw new Error(message || `Support request failed (${response.status}).`);
  }
  return payload?.data ?? payload;
}

function shortTicketId(ticket) {
  if (ticket.ticketNumber) return String(ticket.ticketNumber).startsWith("TKT-")
    ? ticket.ticketNumber
    : `TKT-${ticket.ticketNumber}`;
  const compact = String(ticket.id ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return `TKT-${compact.slice(-6) || "NEW"}`;
}

function statusInfo(status) {
  const normalized = String(status || "open").toLowerCase();
  if (["closed", "resolved"].includes(normalized)) return { label: "Closed", className: "closed", replyable: false };
  if (["pending", "replied", "waiting_on_player", "pending_customer"].includes(normalized)) {
    return { label: "Replied", className: "replied", replyable: true };
  }
  return { label: "Open", className: "open", replyable: true };
}

function formatDate(value, withTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return new Intl.DateTimeFormat("en-US", withTime
    ? { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function ticketPreview(ticket) {
  const latest = Array.isArray(ticket.messages) ? ticket.messages[0]?.body : "";
  return String(latest || ticket.description || "Open this ticket to view the conversation.").trim();
}

function preserveScroll() {
  if (state.view !== "tickets") return;
  const content = document.querySelector(`#${SUPPORT_ROOT_ID} .cs26-content`);
  if (content) state.listScrollTop = content.scrollTop;
}

function render() {
  if (!state.open) {
    document.getElementById(SUPPORT_ROOT_ID)?.remove();
    return;
  }
  preserveScroll();
  let root = document.getElementById(SUPPORT_ROOT_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = SUPPORT_ROOT_ID;
    document.body.append(root);
  }
  root.innerHTML = supportMarkup();
  requestAnimationFrame(() => {
    const content = root.querySelector(".cs26-content");
    if (content && state.view === "tickets") content.scrollTop = state.listScrollTop;
    if (state.view === "detail") content?.scrollTo({ top: content.scrollHeight });
  });
}

function shell(content) {
  return `<div class="cs26-backdrop ${state.entering ? "is-entering" : ""}">
    <section class="cs26-modal" role="dialog" aria-modal="true" aria-label="Customer Support">
      <header class="cs26-header">
        <span class="cs26-life-ring" aria-hidden="true"></span>
        <h2>Customer Support</h2>
        <button class="cs26-close" data-support-action="close" aria-label="Close customer support"></button>
      </header>
      ${content}
      <a class="cs26-email" href="mailto:support@kemegames.com" data-support-action="email">
        <span aria-hidden="true">@</span> support@kemegames.com
      </a>
    </section>
  </div>`;
}

function tabs() {
  return `<nav class="cs26-tabs" aria-label="Support views">
    <button class="cs26-tab ${state.view === "tickets" ? "is-active" : ""}" data-support-action="show-tickets">
      <span class="cs26-tab-icon" aria-hidden="true">=</span> My Tickets
    </button>
    <button class="cs26-tab ${state.view === "new" ? "is-active" : ""}" data-support-action="show-new">
      <span class="cs26-tab-icon" aria-hidden="true">+</span> New Ticket
    </button>
  </nav>`;
}

function notice() {
  if (state.error) {
    return `<div class="cs26-notice is-error" role="alert"><span>${escapeHtml(state.error)}</span><button data-support-action="retry">Retry</button></div>`;
  }
  if (state.success) return `<div class="cs26-notice is-success">${escapeHtml(state.success)}</div>`;
  return "";
}

function ticketCard(ticket) {
  const status = statusInfo(ticket.status);
  return `<button class="cs26-ticket" data-support-action="open-ticket" data-ticket-id="${escapeHtml(ticket.id)}" aria-label="Open ticket ${escapeHtml(shortTicketId(ticket))}: ${escapeHtml(ticket.subject)}">
    <span class="cs26-ticket-avatar cs26-ticket-avatar-${status.className}" aria-hidden="true"><i></i><i></i><i></i></span>
    <span class="cs26-ticket-copy">
      <span class="cs26-ticket-top"><strong>#${escapeHtml(shortTicketId(ticket))}</strong><b class="cs26-status is-${status.className}">${status.label}</b></span>
      <span class="cs26-ticket-subject">${escapeHtml(ticket.subject)}</span>
      <span class="cs26-ticket-preview">${escapeHtml(ticketPreview(ticket))}</span>
      <time>${escapeHtml(formatDate(ticket.updatedAt || ticket.createdAt, true))}</time>
    </span>
    <span class="cs26-chevron" aria-hidden="true">&gt;</span>
  </button>`;
}

function ticketsView() {
  const hasMore = state.tickets.length < state.total;
  const body = state.loading && !state.tickets.length
    ? `<div class="cs26-skeletons" aria-label="Loading tickets">${Array.from({ length: 3 }, () => '<span class="cs26-skeleton"></span>').join("")}</div>`
    : state.tickets.length
      ? `<div class="cs26-ticket-list">${state.tickets.map(ticketCard).join("")}</div>`
      : `<div class="cs26-empty"><span class="cs26-empty-icon">?</span><strong>No tickets yet</strong><p>Create a ticket and our support team will help you here.</p><button class="cs26-primary cs26-primary-compact" data-support-action="show-new">Create New Ticket</button></div>`;
  return shell(`<div class="cs26-intro"><strong>We're here to help!</strong><span>Check your existing tickets or create a new one.</span></div>
    ${tabs()}
    <main class="cs26-content cs26-content-tickets">
      ${notice()}
      <div class="cs26-list-toolbar"><span>${state.total || state.tickets.length} ticket${(state.total || state.tickets.length) === 1 ? "" : "s"}</span><button data-support-action="refresh" ${state.loading ? "disabled" : ""}>${state.loading ? "Refreshing..." : "Refresh"}</button></div>
      ${body}
      ${hasMore ? `<button class="cs26-load-more" data-support-action="load-more" ${state.loadingMore ? "disabled" : ""}>${state.loadingMore ? "Loading..." : "Load More"}</button>` : ""}
      <div class="cs26-response-note"><span aria-hidden="true">i</span> We usually reply within 24 hours.</div>
    </main>
    <button class="cs26-primary cs26-create" data-support-action="show-new"><span aria-hidden="true">+</span> Create New Ticket</button>`);
}

function messageMarkup(message, ticket) {
  const agent = message.authorType === "agent" || message.authorType === "support";
  const name = agent ? (ticket.assignedAgent?.name || "Keme Support") : getPlayerName();
  return `<article class="cs26-message ${agent ? "is-agent" : "is-player"}">
    <div class="cs26-message-meta"><strong>${escapeHtml(name)}</strong><time>${escapeHtml(formatDate(message.createdAt, true))}</time></div>
    <p>${escapeHtml(message.body)}</p>
  </article>`;
}

function detailView() {
  if (state.detailLoading) {
    return shell(`<div class="cs26-detail-nav"><button data-support-action="show-tickets" aria-label="Back to tickets">&lt;</button><strong>Ticket</strong></div>
      <main class="cs26-content"><div class="cs26-thread-loading"><span></span><p>Loading conversation...</p></div></main>`);
  }
  if (!state.ticket) {
    return shell(`<div class="cs26-detail-nav"><button data-support-action="show-tickets" aria-label="Back to tickets">&lt;</button><strong>Ticket</strong></div>
      <main class="cs26-content"><div class="cs26-empty"><span class="cs26-empty-icon">!</span><strong>Conversation unavailable</strong><p>${escapeHtml(state.error || "We could not load this ticket.")}</p><button class="cs26-primary cs26-primary-compact" data-support-action="retry">Try Again</button></div></main>`);
  }
  const ticket = state.ticket;
  const status = statusInfo(ticket.status);
  const messages = Array.isArray(ticket.messages) && ticket.messages.length
    ? ticket.messages
    : [{ id: "original", body: ticket.description, authorType: "player", createdAt: ticket.createdAt }];
  return shell(`<div class="cs26-detail-nav"><button data-support-action="show-tickets" aria-label="Back to tickets">&lt;</button><div><small>#${escapeHtml(shortTicketId(ticket))}</small><strong>${escapeHtml(ticket.subject)}</strong></div><b class="cs26-status is-${status.className}">${status.label}</b></div>
    <main class="cs26-content cs26-thread">
      ${notice()}
      <div class="cs26-thread-date">Started ${escapeHtml(formatDate(ticket.createdAt, true))}</div>
      ${messages.map(message => messageMarkup(message, ticket)).join("")}
      ${status.replyable ? `<form class="cs26-reply-form" data-support-form="reply">
        <label for="cs26-reply">Reply to support</label>
        <textarea id="cs26-reply" data-support-reply maxlength="5000" rows="3" placeholder="Write your reply...">${escapeHtml(state.reply)}</textarea>
        <button class="cs26-primary cs26-reply-submit" type="submit" ${state.replying || !state.reply.trim() ? "disabled" : ""}>${state.replying ? "Sending..." : "Send Reply"}</button>
      </form>` : `<div class="cs26-closed-note"><strong>Conversation closed</strong><span>You can review all previous replies above.</span></div>`}
    </main>`);
}

function newTicketView() {
  const valid = state.draft.subject.trim().length >= 5 && state.draft.description.trim().length >= 10 && state.gameId;
  return shell(`<div class="cs26-intro"><strong>How can we help?</strong><span>Tell us what happened and we'll get back to you.</span></div>
    ${tabs()}
    <main class="cs26-content cs26-new-ticket">
      ${notice()}
      <form data-support-form="new-ticket">
        <label>Category<select data-support-field="category">
          <option value="gameplay" ${state.draft.category === "gameplay" ? "selected" : ""}>Gameplay</option>
          <option value="billing" ${state.draft.category === "billing" ? "selected" : ""}>Purchase or billing</option>
          <option value="account" ${state.draft.category === "account" ? "selected" : ""}>Account</option>
          <option value="bug" ${state.draft.category === "bug" ? "selected" : ""}>Bug or crash</option>
          <option value="other" ${state.draft.category === "other" ? "selected" : ""}>Other</option>
        </select></label>
        <label>Subject<input data-support-field="subject" maxlength="200" value="${escapeHtml(state.draft.subject)}" placeholder="What do you need help with?" /></label>
        <label>Description<textarea data-support-field="description" maxlength="5000" rows="6" placeholder="Describe the issue, what happened, and what you expected.">${escapeHtml(state.draft.description)}</textarea></label>
        <small class="cs26-form-hint">Include the level number and any purchase details that may help us investigate.</small>
        <button class="cs26-primary cs26-new-submit" type="submit" ${!valid || state.submitting ? "disabled" : ""}>${state.submitting ? "Creating Ticket..." : "Create Ticket"}</button>
      </form>
    </main>`);
}

function supportMarkup() {
  if (state.view === "detail") return detailView();
  if (state.view === "new") return newTicketView();
  return ticketsView();
}

async function authenticate() {
  if (state.token) return;
  const gameUid = getGameUid();
  const suffix = gameUid.replace(/[^a-zA-Z0-9]/g, "").slice(-12) || "guest";
  const login = await api("/portal/auth/login", {
    method: "POST",
    body: JSON.stringify({ gameUid, username: `marble_${suffix}` }),
  });
  state.token = login.token;
  state.player = login.player;
  const games = await api("/portal/tickets/games");
  const preferred = getConfig().preferredGameId;
  state.gameId = games.find(game => game.id === preferred)?.id || games[0]?.id || "";
  if (!state.gameId) throw new Error("Marble Sort is not available for support routing yet.");
}

async function loadTickets({ append = false } = {}) {
  const page = append ? state.page + 1 : 1;
  state[append ? "loadingMore" : "loading"] = true;
  state.error = "";
  render();
  try {
    await authenticate();
    const payload = await api(`/portal/tickets?page=${page}&limit=${PAGE_SIZE}`);
    const tickets = Array.isArray(payload) ? payload : payload?.data || [];
    state.tickets = append ? [...state.tickets, ...tickets] : tickets;
    state.page = Number(payload?.page || page);
    state.total = Number(payload?.total ?? state.tickets.length);
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Unable to load support tickets.";
  } finally {
    state.loading = false;
    state.loadingMore = false;
    render();
  }
}

async function openTicket(id) {
  state.view = "detail";
  state.selectedId = id;
  state.ticket = null;
  state.reply = "";
  state.detailLoading = true;
  state.error = "";
  render();
  try {
    await authenticate();
    state.ticket = await api(`/portal/tickets/${encodeURIComponent(id)}`);
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Unable to load this conversation.";
  } finally {
    state.detailLoading = false;
    render();
  }
}

async function createTicket() {
  const subject = state.draft.subject.trim();
  const description = state.draft.description.trim();
  if (subject.length < 5 || description.length < 10 || !state.gameId || state.submitting) return;
  state.submitting = true;
  state.error = "";
  render();
  try {
    await authenticate();
    const form = new FormData();
    form.append("subject", subject);
    form.append("description", description);
    form.append("gameId", state.gameId);
    form.append("category", state.draft.category);
    form.append("priority", "P3");
    const ticket = await api("/portal/tickets", { method: "POST", body: form });
    state.draft = { category: "gameplay", subject: "", description: "" };
    state.success = "Ticket created successfully.";
    await loadTickets();
    await openTicket(ticket.id);
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Unable to create your ticket.";
  } finally {
    state.submitting = false;
    render();
  }
}

async function sendReply() {
  const body = state.reply.trim();
  if (!body || !state.selectedId || state.replying || !statusInfo(state.ticket?.status).replyable) return;
  state.replying = true;
  state.error = "";
  render();
  try {
    const form = new FormData();
    form.append("body", body);
    await api(`/portal/tickets/${encodeURIComponent(state.selectedId)}/messages`, { method: "POST", body: form });
    state.reply = "";
    state.success = "Reply sent to support.";
    state.ticket = await api(`/portal/tickets/${encodeURIComponent(state.selectedId)}`);
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Unable to send your reply.";
  } finally {
    state.replying = false;
    render();
  }
}

function openSupport() {
  state.open = true;
  state.entering = true;
  state.view = "tickets";
  state.error = "";
  state.success = "";
  render();
  requestAnimationFrame(() => { state.entering = false; });
  loadTickets();
}

function closeSupport() {
  state.open = false;
  render();
}

function updateFormButtons() {
  const root = document.getElementById(SUPPORT_ROOT_ID);
  const newSubmit = root?.querySelector(".cs26-new-submit");
  if (newSubmit) {
    const valid = state.draft.subject.trim().length >= 5
      && state.draft.description.trim().length >= 10
      && Boolean(state.gameId);
    newSubmit.disabled = !valid || state.submitting;
  }
  const replySubmit = root?.querySelector(".cs26-reply-submit");
  if (replySubmit) replySubmit.disabled = !state.reply.trim() || state.replying;
}

document.addEventListener("click", event => {
  const originalSupport = event.target.closest?.('[data-action="support"]');
  const actionTarget = event.target.closest?.("[data-support-action]");
  if (!originalSupport && !actionTarget) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  if (originalSupport) {
    openSupport();
    return;
  }
  const action = actionTarget.dataset.supportAction;
  actionTarget.classList.add("is-pressed");
  setTimeout(() => actionTarget.classList.remove("is-pressed"), 130);
  if (action === "close") closeSupport();
  else if (action === "show-tickets") { state.view = "tickets"; state.error = ""; state.success = ""; render(); }
  else if (action === "show-new") { state.view = "new"; state.error = ""; state.success = ""; render(); if (!state.token) authenticate().then(render).catch(error => { state.error = error.message; render(); }); }
  else if (action === "open-ticket") openTicket(actionTarget.dataset.ticketId);
  else if (action === "refresh" || action === "retry") state.view === "detail" && state.selectedId ? openTicket(state.selectedId) : loadTickets();
  else if (action === "load-more") loadTickets({ append: true });
  else if (action === "email") window.location.href = actionTarget.href;
}, true);

document.addEventListener("input", event => {
  if (!event.target.closest?.(`#${SUPPORT_ROOT_ID}`)) return;
  const field = event.target.dataset.supportField;
  if (field) state.draft[field] = event.target.value;
  if (event.target.matches("[data-support-reply]")) state.reply = event.target.value;
  updateFormButtons();
}, true);

document.addEventListener("change", event => {
  if (!event.target.closest?.(`#${SUPPORT_ROOT_ID}`)) return;
  const field = event.target.dataset.supportField;
  if (field) state.draft[field] = event.target.value;
  updateFormButtons();
}, true);

document.addEventListener("submit", event => {
  const form = event.target.closest?.("[data-support-form]");
  if (!form) return;
  event.preventDefault();
  event.stopPropagation();
  if (form.dataset.supportForm === "new-ticket") createTicket();
  else if (form.dataset.supportForm === "reply") sendReply();
}, true);

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && state.open) closeSupport();
});

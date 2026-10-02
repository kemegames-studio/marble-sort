import { ChallengeClock, timeLimitFor, formatRemaining } from './challenge-rules.js';

// Shared by readable source and the preserved Android runtime.
export function installTimedChallengeRuntime(adapter) {
  const clock = new ChallengeClock();
  let enabled = false, ended = true, ads = 0, attempt = 0;
  const now = () => performance.now();
  function terminal() { return adapter.solved() || !adapter.hasMoves(); }
  function update() {
    if (!enabled || ended) return;
    if (terminal()) { ended = true; clock.update(now(), false); return; }
    const active = adapter.inGame() && !adapter.modal() && !adapter.animating() && !document.hidden && ads === 0;
    clock.update(now(), active);
    if (clock.expired) {
      ended = true;
      adapter.timeout();
      adapter.setModal('timed-failed');
      adapter.render();
      return;
    }
    const badge = adapter.root.querySelector('.challenge-timer');
    if (badge) {
      const label = `TIME ${formatRemaining(clock.remaining)}`;
      if (badge.textContent === label) return;
      badge.textContent = label;
      badge.classList.toggle('urgent', clock.remaining <= 20000);
      badge.setAttribute('aria-label', `Time remaining ${formatRemaining(clock.remaining)}`);
    }
  }
  const runtime = {
    start(level) {
      attempt++;
      const seconds = timeLimitFor(level);
      enabled = seconds > 0; ended = !enabled;
      clock.reset(seconds, now());
      if (enabled) adapter.setModal('timed-intro');
    },
    get attempt() { return attempt; },
    sync: update,
    onRender() {
      update();
      const scene = adapter.root.querySelector('.gameplay');
      if (enabled && scene && !scene.querySelector('.challenge-timer')) {
        const badge = document.createElement('div');
        badge.className = 'challenge-timer'; badge.setAttribute('role', 'timer');
        badge.textContent = `TIME ${formatRemaining(clock.remaining)}`;
        const hud = scene.querySelector('.gameplay-hud');
        if (hud) hud.insertBefore(badge, hud.querySelector('.gameplay-settings'));
        else scene.append(badge);
      }
    },
    async withAd(action) {
      ads++; update();
      try { return await action(); } finally { ads--; update(); }
    },
    modalMarkup() {
      const failed = adapter.modal() === 'timed-failed';
      return `<div class="modal-backdrop"><div class="challenge-popup" role="dialog" aria-modal="true" aria-label="${failed ? 'Time is up' : 'Timed challenge'}">
        <h2>${failed ? "TIME'S UP!" : 'TIMED CHALLENGE'}</h2>
        <p>${failed ? adapter.failureMessage() : `Sort all the marbles in <strong>${formatRemaining(clock.remaining)}</strong>.`}</p>
        ${failed ? '' : '<p class="challenge-note">The clock pauses during menus, ads, and pour animations.</p>'}
        <div class="challenge-actions">${failed ? '<button data-action="failed-home">HOME</button><button data-action="retry">RETRY</button>' : '<button data-action="start-timed">LET\'S GO!</button>'}</div>
      </div></div>`;
    },
  };
  const input = event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    update();
    const action = button.dataset.action;
    if (adapter.modal() === 'timed-intro' || adapter.modal() === 'timed-failed') {
      const permitted = adapter.modal() === 'timed-intro' ? ['start-timed'] : ['retry', 'failed-home'];
      if (!permitted.includes(action)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    }
    if (action === 'start-timed') {
      event.preventDefault(); event.stopImmediatePropagation();
      // Handle click only so a synthetic click cannot hit the underlying board.
      if (event.type === 'click') { adapter.setModal(null); adapter.onReady?.(); adapter.render(); update(); }
    }
  };
  adapter.root.addEventListener('pointerdown', input, true);
  adapter.root.addEventListener('click', input, true);
  document.addEventListener('visibilitychange', update);
  setInterval(update, 100);
  return runtime;
}

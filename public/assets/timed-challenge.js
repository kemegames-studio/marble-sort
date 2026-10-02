import { ChallengeClock, timeLimitFor, formatRemaining } from './challenge-rules.js';

// Shared by readable source and the preserved Android runtime.
export function installTimedChallengeRuntime(adapter) {
  const clock = new ChallengeClock();
  let enabled = false, ended = true, ads = 0, attempt = 0, continued = false, busy = false, failureCharged = false, adError = '';
  function chargeFailure() { if (!failureCharged) { failureCharged = true; adapter.timeout(); } }
  const now = () => performance.now();
  function terminal() { return adapter.solved() || !adapter.hasMoves(); }
  function update() {
    if (!enabled || ended) return;
    if (terminal()) { ended = true; clock.update(now(), false); return; }
    const active = adapter.inGame() && !adapter.modal() && !adapter.animating() && !document.hidden && ads === 0;
    clock.update(now(), active);
    if (clock.expired) {
      ended = true;
      if (continued) chargeFailure();
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
      attempt++; continued = false; busy = false; failureCharged = false; adError = '';
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
      if (!failed) return `<div class="modal-backdrop"><div class="challenge-popup" role="dialog" aria-modal="true" aria-label="Timed challenge">
        <h2>TIMED CHALLENGE</h2><p>Sort all the marbles in <strong>${formatRemaining(clock.remaining)}</strong>.</p>
        <p class="challenge-note">The clock pauses during menus, ads, and pour animations.</p>
        <div class="challenge-actions"><button data-action="start-timed">LET'S GO!</button></div>
      </div></div>`;
      return `<div class="modal-backdrop challenge-backdrop"><div class="challenge-popup challenge-timeout" role="dialog" aria-modal="true" aria-label="Time is up" aria-describedby="challenge-timeout-description">
        <div class="challenge-clock-art" aria-hidden="true"><span></span></div>
        <h2 id="challenge-timeout-title">TIME'S UP!</h2>
        <p id="challenge-timeout-description">${continued ? adapter.failureMessage() : 'Keep your board and get another chance.'}</p>
        ${continued ? '<div class="challenge-used">Extra-time continue used this attempt</div>' : `<div class="challenge-extra"><strong>+30</strong><span>EXTRA SECONDS</span></div>
        <button class="challenge-watch" data-action="continue-timed" ${busy ? 'disabled' : ''}><span class="challenge-ad-icon" aria-hidden="true">▶</span><span>${busy ? 'LOADING AD…' : 'WATCH AD & CONTINUE'}</span></button>
        <p class="challenge-note">Once per attempt · Your board stays the same</p>`}
        <p class="challenge-ad-error" role="status">${adError}</p>
        <div class="challenge-actions challenge-secondary"><button data-action="retry" ${busy ? 'disabled' : ''}>RETRY</button><button data-action="failed-home" ${busy ? 'disabled' : ''}>HOME</button></div>
        ${continued ? '' : '<p class="challenge-life-note">Retrying or leaving costs 1 life. Unlimited lives are protected.</p>'}
      </div></div>`;
    },
    async continueWithAd() {
      if (busy || continued || adapter.modal() !== 'timed-failed') return;
      const requestedAttempt = attempt;
      busy = true; adError = ''; adapter.render();
      let rewarded = false;
      try { rewarded = await runtime.withAd(() => adapter.rewardedContinue?.()); } catch { rewarded = false; }
      if (requestedAttempt !== attempt || !adapter.inGame() || adapter.modal() !== 'timed-failed') return;
      busy = false;
      if (!rewarded) {
        adError = 'Ad unavailable or not completed. No extra time was added. Please try again.';
        adapter.render(); return;
      }
      continued = true; ended = false;
      clock.reset(30, now());
      adapter.onContinue?.(); adapter.setModal(null); adapter.render(); update();
    },
  };
  const input = event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    update();
    const action = button.dataset.action;
    if (adapter.modal() === 'timed-intro' || adapter.modal() === 'timed-failed') {
      const permitted = adapter.modal() === 'timed-intro' ? ['start-timed'] : ['retry', 'failed-home', 'continue-timed'];
      if (busy && adapter.modal() === 'timed-failed') { event.preventDefault(); event.stopImmediatePropagation(); return; }
      if (!permitted.includes(action)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    }
    if (adapter.modal() === 'timed-failed' && action === 'continue-timed') {
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.type === 'click') runtime.continueWithAd();
      return;
    }
    if (adapter.modal() === 'timed-failed' && ['retry', 'failed-home'].includes(action) && event.type === 'click') chargeFailure();
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

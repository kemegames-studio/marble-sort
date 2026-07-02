const SFX_SOURCES = Object.freeze({
  uiTap: "/assets/sfx/ui-tap.wav",
  tubeSelect: "/assets/sfx/tube-select.wav",
  invalid: "/assets/sfx/invalid.wav",
  marbleMove: "/assets/sfx/marble-move.wav",
  booster: "/assets/sfx/booster.wav",
  reward: "/assets/sfx/reward.wav",
  tubeComplete: "/assets/sfx/tube-complete.wav",
  levelComplete: "/assets/sfx/level-complete.wav",
  lose: "/assets/sfx/lose.wav",
  levelStart: "/assets/sfx/level-start.wav",
});

const MUSIC_SOURCE = "/assets/music/background-loop.wav";
const baseAudio = new Map();
const activeAudio = new Set();
let musicAudio = null;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getBaseAudio(key) {
  if (!baseAudio.has(key)) {
    const audio = new Audio(SFX_SOURCES[key]);
    audio.preload = "auto";
    audio.load();
    baseAudio.set(key, audio);
  }
  return baseAudio.get(key);
}

function getMusicAudio() {
  if (!musicAudio) {
    musicAudio = new Audio(MUSIC_SOURCE);
    musicAudio.loop = true;
    musicAudio.preload = "auto";
    musicAudio.playsInline = true;
    musicAudio.volume = 0.32;
    musicAudio.load();
  }
  return musicAudio;
}

export function preloadSfx() {
  Object.keys(SFX_SOURCES).forEach(getBaseAudio);
}

export function preloadMusic() {
  getMusicAudio();
}

export function playSfx(enabled, key, { volume = 0.72, rate = 1 } = {}) {
  if (!enabled || !SFX_SOURCES[key]) return null;
  const base = getBaseAudio(key);
  const audio = base.cloneNode();
  audio.volume = clamp(volume, 0, 1);
  audio.playbackRate = rate;
  audio.preservesPitch = false;
  activeAudio.add(audio);

  const cleanup = () => {
    activeAudio.delete(audio);
    try {
      audio.pause();
      audio.src = "";
    } catch {
      // Ignore cleanup failures from browsers that already released the element.
    }
  };

  audio.addEventListener("ended", cleanup, { once: true });
  audio.addEventListener("error", cleanup, { once: true });

  const promise = audio.play();
  promise?.catch(cleanup);
  return audio;
}

export function syncMusic(enabled, { volume = 0.32, restart = false } = {}) {
  const audio = getMusicAudio();
  audio.volume = clamp(volume, 0, 1);

  if (!enabled) {
    audio.pause();
    return audio;
  }

  if (restart) {
    audio.currentTime = 0;
  }

  if (!audio.paused && !restart) {
    return audio;
  }

  const promise = audio.play();
  promise?.catch(() => {
    // Autoplay can be blocked until the first user gesture.
  });
  return audio;
}

export function pauseMusic({ reset = false } = {}) {
  const audio = getMusicAudio();
  audio.pause();
  if (reset) {
    audio.currentTime = 0;
  }
  return audio;
}

export function stopSfx() {
  activeAudio.forEach(audio => {
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.src = "";
    } catch {
      // Ignore cleanup failures from released elements.
    }
  });
  activeAudio.clear();
}

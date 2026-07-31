'use strict';

/**
 * Core SFX helper (Howler, self-hosted). Soft-fails if Howler or files are missing.
 */
(function attachSnakeSfx(root) {
  const STORAGE_KEY = 'snakeSfxMuted';
  const SOUND_IDS = Object.freeze([
    'eat',
    'boost',
    'death',
    'kill',
    'round_start',
    'orb_rain',
  ]);

  /** @type {Record<string, unknown>} */
  const sounds = {};
  let unlocked = false;
  let muted = false;
  let ready = false;

  try {
    muted = root.localStorage.getItem(STORAGE_KEY) === '1';
  } catch (_error) {
    muted = false;
  }

  function isHowlerAvailable() {
    return typeof root.Howl === 'function';
  }

  function loadSounds() {
    if (!isHowlerAvailable()) {
      ready = false;
      return;
    }
    for (const id of SOUND_IDS) {
      sounds[id] = new root.Howl({
        src: [`/sounds/${id}.wav`],
        volume: id === 'eat' ? 0.45 : 0.7,
        preload: true,
      });
    }
    ready = true;
    if (typeof root.Howler !== 'undefined' && root.Howler.volume) {
      root.Howler.volume(muted ? 0 : 1);
    }
  }

  function unlock() {
    if (unlocked) {
      return;
    }
    unlocked = true;
    if (!ready) {
      loadSounds();
    }
    if (typeof root.Howler !== 'undefined' && root.Howler.ctx && root.Howler.ctx.state === 'suspended') {
      root.Howler.ctx.resume().catch(() => {});
    }
  }

  function play(id) {
    if (!ready || muted || !unlocked) {
      return;
    }
    const sound = sounds[id];
    if (!sound || typeof sound.play !== 'function') {
      return;
    }
    try {
      sound.play();
    } catch (_error) {
      // Ignore autoplay / decode errors — gameplay must continue.
    }
  }

  function setMuted(nextMuted) {
    muted = Boolean(nextMuted);
    try {
      root.localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
    } catch (_error) {
      // ignore quota / private mode
    }
    if (typeof root.Howler !== 'undefined' && root.Howler.volume) {
      root.Howler.volume(muted ? 0 : 1);
    }
  }

  function toggleMuted() {
    setMuted(!muted);
    return muted;
  }

  function isMuted() {
    return muted;
  }

  function bindUnlockOnce() {
    const unlockOnce = () => {
      unlock();
      root.removeEventListener('pointerdown', unlockOnce);
      root.removeEventListener('keydown', unlockOnce);
    };
    root.addEventListener('pointerdown', unlockOnce, { passive: true });
    root.addEventListener('keydown', unlockOnce);
  }

  loadSounds();
  bindUnlockOnce();

  root.SnakeSfx = Object.freeze({
    play,
    unlock,
    setMuted,
    toggleMuted,
    isMuted,
    isReady: () => ready,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);

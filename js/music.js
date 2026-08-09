/**
 * js/music.js
 * Robust, idempotent ambient music controller.
 * - Works with or without a visible toggle on a page
 * - Exposes initMusicController() for PJAX or manual re-init
 * - Persists preference in sessionStorage (per-tab)
 * - Respects autoplay rules: waits for user gesture if play is blocked
 * - Smooth fade in / fade out
 *
 * Requirements:
 * - An <audio id="ambient-audio"> element should exist on every page (outside any PJAX-replaced <main>)
 * - Optional: a checkbox toggle with id="music-toggle" on pages where you want the control visible
 *
 * Usage:
 * - Include <script src="js/music.js" defer></script> after the audio element.
 * - If using PJAX, ensure pjax calls window.initMusicController() after replacing content.
 */

(function () {
  'use strict';

  const TOGGLE_ID = 'music-toggle';
  const AUDIO_ID = 'ambient-audio';
  const STORAGE_KEY = 'msp_home_piano_enabled';
  const DEFAULT_VOLUME = 0.70;
  const FADE_DURATION_MS = 420;
  const FADE_STEPS = 12;

  // Helpers
  function clamp(v, a = 0, b = 1) { return Math.max(a, Math.min(b, v)); }

  function fadeIn(audioEl, duration = FADE_DURATION_MS) {
    return new Promise((resolve) => {
      if (!audioEl) return resolve();
      const steps = FADE_STEPS;
      const stepTime = Math.max(16, Math.floor(duration / steps));
      let step = 0;
      const target = clamp(DEFAULT_VOLUME, 0, 1);
      try { audioEl.volume = 0; } catch (e) {}
      const id = setInterval(() => {
        step++;
        try { audioEl.volume = clamp(target * (step / steps), 0, target); } catch (e) {}
        if (step >= steps) {
          clearInterval(id);
          try { audioEl.volume = target; } catch (e) {}
          resolve();
        }
      }, stepTime);
    });
  }

  function fadeOutAndStop(audioEl, duration = FADE_DURATION_MS) {
    return new Promise((resolve) => {
      if (!audioEl || audioEl.paused) return resolve();
      const startVol = (typeof audioEl.volume === 'number') ? audioEl.volume : DEFAULT_VOLUME;
      const steps = FADE_STEPS;
      const stepTime = Math.max(16, Math.floor(duration / steps));
      let step = 0;
      const id = setInterval(() => {
        step++;
        try { audioEl.volume = Math.max(0, startVol * (1 - step / steps)); } catch (e) {}
        if (step >= steps) {
          clearInterval(id);
          try { audioEl.pause(); audioEl.currentTime = 0; } catch (e) {}
          try { audioEl.volume = startVol; } catch (e) {}
          resolve();
        }
      }, stepTime);
    });
  }

  async function tryPlayNow(audioEl) {
    try {
      await audioEl.play();
      await fadeIn(audioEl);
      return true;
    } catch (e) {
      return false;
    }
  }

  function waitForUserGestureThenPlayOnce(audioEl) {
    const onGesture = async () => {
      document.removeEventListener('click', onGesture, true);
      document.removeEventListener('keydown', onGesture, true);
      document.removeEventListener('touchstart', onGesture, true);
      try {
        await audioEl.play();
        await fadeIn(audioEl);
      } catch (e) {
        // nothing else to do
      }
    };
    document.addEventListener('click', onGesture, true);
    document.addEventListener('keydown', onGesture, true);
    document.addEventListener('touchstart', onGesture, true);
  }

  function persist(enabled) {
    try {
      if (enabled) sessionStorage.setItem(STORAGE_KEY, '1');
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) { /* ignore */ }
  }

  function restoreToggleUI(toggleEl) {
    try {
      const pref = sessionStorage.getItem(STORAGE_KEY);
      const enabled = pref === '1';
      toggleEl.checked = enabled;
      toggleEl.setAttribute('aria-checked', String(enabled));
    } catch (e) {
      toggleEl.checked = false;
      toggleEl.setAttribute('aria-checked', 'false');
    }
  }

  // Defensive: stop other audio elements on the page when starting this audio
  function stopOtherAudio(audioEl) {
    try {
      document.querySelectorAll('audio').forEach(a => {
        if (a !== audioEl) {
          try { a.pause(); a.currentTime = 0; } catch (e) {}
        }
      });
    } catch (e) {}
  }

  // Core initializer (idempotent)
  function initMusicController() {
    const audio = document.getElementById(AUDIO_ID);
    const toggle = document.getElementById(TOGGLE_ID);

    // If audio missing, nothing to do
    if (!audio) {
      console.warn('msp: ambient audio element not found (#' + AUDIO_ID + ').');
      return;
    }

    // Ensure audio defaults
    try { audio.loop = true; audio.preload = 'metadata'; audio.volume = clamp(DEFAULT_VOLUME, 0, 1); } catch (e) {}

    // If toggle exists, bind it idempotently
    let boundToggle = null;
    if (toggle) {
      // Replace node to remove previous listeners (idempotent)
      try {
        const fresh = toggle.cloneNode(true);
        toggle.parentNode && toggle.parentNode.replaceChild(fresh, toggle);
        boundToggle = fresh;
      } catch (e) {
        boundToggle = toggle; // fallback
      }

      // Restore UI state
      restoreToggleUI(boundToggle);

      // Toggle handler
      boundToggle.addEventListener('change', async (ev) => {
        const enabled = !!ev.target.checked;
        boundToggle.setAttribute('aria-checked', String(enabled));
        try {
          if (enabled) {
            persist(true);
            stopOtherAudio(audio);
            try {
              await audio.play();
              await fadeIn(audio);
            } catch (err) {
              // blocked — wait for gesture
              waitForUserGestureThenPlayOnce(audio);
            }
          } else {
            persist(false);
            await fadeOutAndStop(audio);
          }
        } catch (err) {
          console.warn('msp: toggle handler error', err);
        }
      });
    }

    // On init: if preference enabled, attempt to resume playback
    try {
      const pref = sessionStorage.getItem(STORAGE_KEY);
      const enabled = pref === '1';
      if (enabled) {
        // If toggle exists, ensure its UI matches
        if (boundToggle) {
          boundToggle.checked = true;
          boundToggle.setAttribute('aria-checked', 'true');
        }
        // Try to play now; if blocked, wait for gesture
        tryPlayNow(audio).then(ok => { if (!ok) waitForUserGestureThenPlayOnce(audio); });
      } else {
        // If pref not enabled, ensure toggle UI reflects that
        if (boundToggle) {
          boundToggle.checked = false;
          boundToggle.setAttribute('aria-checked', 'false');
        }
      }
    } catch (e) {
      // ignore
    }
  }

  // Run on initial load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMusicController);
  } else {
    initMusicController();
  }

  // Expose for PJAX or manual re-init
  window.initMusicController = initMusicController;

})();

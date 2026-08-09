/**
 * calm.js
 *
 * Calm Corner interactions:
 * - Loads quotes from /data/quotes.json
 * - Shows a random quote without repetition until all quotes are shown
 * - Controls a breathing circle animation with timing: inhale 4s, hold 2s, exhale 6s (12s cycle)
 * - Smooth fade transitions for quotes (CSS-driven classes)
 * - Accessible controls and keyboard support
 * - No global variables; modern ES6; well commented
 *
 * Expected DOM:
 * - #calm-quote            -> element where quote text is rendered (aria-live="polite")
 * - #calm-quote-author     -> element for quote author
 * - #new-quote             -> button to request a new quote
 * - #breathing-circle      -> element that visually breathes (CSS .breath class used)
 *
 * Notes:
 * - CSS should include gentle fade utilities (e.g., .anim-fade-in) and a .breath animation.
 * - Respects prefers-reduced-motion: if user prefers reduced motion, breathing animation is disabled.
 */

(() => {
  'use strict';

  /* -------------------------
     Selectors
     ------------------------- */
  const SELECTORS = {
    QUOTE_TEXT: '#calm-quote',
    QUOTE_AUTHOR: '#calm-quote-author',
    NEW_QUOTE_BTN: '#new-quote',
    BREATH_CIRCLE: '#breathing-circle'
  };

  /* -------------------------
     Timing configuration (seconds)
     - inhale: 4s
     - hold:   2s
     - exhale: 6s
     - total cycle: 12s
     ------------------------- */
  const TIMING = {
    INHALE: 4,
    HOLD: 2,
    EXHALE: 6
  };
  const CYCLE_SECONDS = TIMING.INHALE + TIMING.HOLD + TIMING.EXHALE;

  /* -------------------------
     Module-scoped state (not global)
     ------------------------- */
  let quotes = [];           // loaded quotes array [{ text, author? }, ...]
  let queue = [];            // shuffled indices queue to avoid repetition
  let currentIndex = -1;     // index into queue (position)
  let breathIntervalId = null;
  let reducedMotion = false;

  /* -------------------------
     Utility helpers
     ------------------------- */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);

  /**
   * Gentle shuffle (Fisher-Yates)
   * @param {Array} arr
   * @returns {Array}
   */
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  /**
   * Build a fresh queue of indices, shuffled, ensuring the first item is not
   * the same as the last shown quote (to avoid immediate repetition).
   * @param {number} lastIndex
   */
  function buildQueue(lastIndex = -1) {
    const indices = quotes.map((_, i) => i);
    const shuffled = shuffle(indices);
    if (shuffled.length > 1 && lastIndex >= 0 && shuffled[0] === lastIndex) {
      // swap with next
      [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
    }
    queue = shuffled;
    currentIndex = -1;
  }

  /**
   * Pop next index from queue; rebuild when exhausted
   * @returns {number} index into quotes
   */
  function nextQuoteIndex() {
    if (!queue.length) {
      // rebuild using last shown index to avoid immediate repeat
      buildQueue(currentIndex >= 0 ? queue[currentIndex] : -1);
    }
    currentIndex = (currentIndex + 1) % queue.length;
    const idx = queue[currentIndex];
    // If we've reached the end, rebuild for next cycle (preserve last shown)
    if (currentIndex === queue.length - 1) {
      // store last shown to avoid immediate repeat on rebuild
      const lastShown = idx;
      buildQueue(lastShown);
    }
    return idx;
  }

  /**
   * Fade-in helper: adds fade class and removes it after animationend.
   * Uses .anim-fade-in from animations.css if present; otherwise uses inline opacity.
   * @param {Element} el
   */
  function fadeIn(el) {
    if (!el) return;
    // Prefer CSS utility class if available
    const fadeClass = 'anim-fade-in';
    const supportsClass = typeof el.classList !== 'undefined';
    if (supportsClass) {
      el.classList.remove(fadeClass);
      // Force reflow to restart animation
      // eslint-disable-next-line no-unused-expressions
      el.offsetWidth;
      el.classList.add(fadeClass);
      const onEnd = () => {
        el.removeEventListener('animationend', onEnd);
        // keep final state; do not remove class to preserve appearance
      };
      el.addEventListener('animationend', onEnd);
    } else {
      // Fallback: inline opacity transition
      el.style.transition = 'opacity 420ms cubic-bezier(0.25,0.46,0.45,0.94)';
      el.style.opacity = '0';
      requestAnimationFrame(() => {
        el.style.opacity = '1';
      });
    }
  }

  /**
   * Render a quote into the DOM with smooth fade
   * @param {{text:string, author?:string}} q
   */
  function renderQuote(q) {
    const quoteEl = $(SELECTORS.QUOTE_TEXT);
    const authorEl = $(SELECTORS.QUOTE_AUTHOR);
    if (!quoteEl) return;

    // Use aria-live polite on the quote container (set in HTML)
    // Clear then set with fade
    quoteEl.textContent = '';
    if (authorEl) authorEl.textContent = '';

    // Insert text nodes to preserve any line breaks
    const paragraphs = String(q.text || '').split(/\n+/).filter(Boolean);
    if (paragraphs.length === 0) paragraphs.push('A quiet thought.');

    paragraphs.forEach((p, i) => {
      const pEl = document.createElement('p');
      pEl.textContent = p;
      quoteEl.appendChild(pEl);
    });

    if (q.author && authorEl) {
      authorEl.textContent = `— ${q.author}`;
    }

    // Smooth fade
    fadeIn(quoteEl);
    if (authorEl) fadeIn(authorEl);
  }

  /* -------------------------
     Breathing animation control
     ------------------------- */

  /**
   * Apply breathing animation timings to the breathing circle.
   * Uses CSS variables to allow CSS to animate smoothly.
   * If prefers-reduced-motion is true, do nothing.
   */
  function setupBreathingAnimation() {
    const circle = $(SELECTORS.BREATH_CIRCLE);
    if (!circle) return;

    // Respect reduced motion preference
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      circle.classList.remove('breath');
      circle.style.transition = 'none';
      circle.style.transform = 'none';
      return;
    }

    // Set CSS variables for durations (in seconds)
    circle.style.setProperty('--inhale', `${TIMING.INHALE}s`);
    circle.style.setProperty('--hold', `${TIMING.HOLD}s`);
    circle.style.setProperty('--exhale', `${TIMING.EXHALE}s`);
    circle.style.setProperty('--cycle', `${CYCLE_SECONDS}s`);

    // Add a class that triggers a CSS keyframe which uses the variables above.
    // The CSS should define keyframes that expand/contract based on these variables.
    circle.classList.add('breath');

    // For browsers without CSS variable support, fallback to JS-driven scaling loop
    const supportsCSSVars = window.CSS && window.CSS.supports && window.CSS.supports('--a', '0');
    if (!supportsCSSVars) {
      startJSBreathLoop(circle);
    }
  }

  /**
   * JS fallback breathing loop (only used if CSS variables unsupported)
   * Animates transform scale with setTimeouts following inhale/hold/exhale timings.
   * @param {Element} circle
   */
  function startJSBreathLoop(circle) {
    if (!circle) return;
    // Clear any existing loop
    if (breathIntervalId) {
      clearInterval(breathIntervalId);
      breathIntervalId = null;
    }

    // Single cycle function
    const cycle = () => {
      // Inhale: scale up
      circle.style.transition = `transform ${TIMING.INHALE}s ease-in-out`;
      circle.style.transform = 'scale(1.08)';
      setTimeout(() => {
        // Hold: keep scale
        circle.style.transition = `transform ${TIMING.HOLD}s linear`;
        circle.style.transform = 'scale(1.08)';
        setTimeout(() => {
          // Exhale: scale down
          circle.style.transition = `transform ${TIMING.EXHALE}s ease-in-out`;
          circle.style.transform = 'scale(0.96)';
        }, TIMING.HOLD * 1000);
      }, TIMING.INHALE * 1000);
    };

    // Start immediately and repeat every cycle
    cycle();
    breathIntervalId = setInterval(cycle, CYCLE_SECONDS * 1000);
  }

  /**
   * Stop JS breathing loop (cleanup)
   */
  function stopJSBreathLoop() {
    if (breathIntervalId) {
      clearInterval(breathIntervalId);
      breathIntervalId = null;
    }
  }

  /* -------------------------
     Quotes loading & control
     ------------------------- */

  /**
   * Load quotes.json and initialize queue
   */
  async function loadQuotes() {
    try {
      const res = await fetch('/data/quotes.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`Failed to load quotes (${res.status})`);
      const data = await res.json();

      // Accept array of strings or array of objects { text, author? }
      if (Array.isArray(data)) {
        quotes = data.map(item => {
          if (typeof item === 'string') return { text: item };
          if (typeof item === 'object' && item !== null) {
            return { text: String(item.text || ''), author: item.author ? String(item.author) : '' };
          }
          return { text: String(item) };
        }).filter(q => q.text && q.text.trim().length > 0);
      } else {
        quotes = [{ text: 'Breathe. You are here.' }];
      }

      if (quotes.length === 0) {
        quotes = [{ text: 'Breathe. You are here.' }];
      }

      // Build initial queue
      buildQueue(-1);

      // Show first quote immediately
      showNextQuote();
    } catch (err) {
      // Graceful fallback
      quotes = [{ text: 'Breathe. You are here.' }];
      buildQueue(-1);
      showNextQuote();
      // Log for debugging
      // console.error('Calm: failed to load quotes', err);
    }
  }

  /**
   * Show next quote (no repetition until all shown)
   */
  function showNextQuote() {
    if (!quotes.length) return;
    // Determine next index from queue
    const idx = nextQuoteIndex();
    const q = quotes[idx] || { text: 'A quiet thought.' };
    renderQuote(q);
  }

  /* -------------------------
     Event wiring & accessibility
     ------------------------- */

  function wireEvents() {
    const newQuoteBtn = $(SELECTORS.NEW_QUOTE_BTN);
    const circle = $(SELECTORS.BREATH_CIRCLE);

    if (newQuoteBtn) {
      newQuoteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showNextQuote();
        // Provide a small visual feedback
        newQuoteBtn.classList.add('ripple-container');
        setTimeout(() => newQuoteBtn.classList.remove('ripple-container'), 420);
      });

      // Keyboard support: Enter/Space handled by native button behavior
      newQuoteBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          // native click will fire; no extra handling required
        }
      });
    }

    // Start breathing animation on first user interaction (click or key)
    const startBreathOnInteraction = (ev) => {
      // Only start once
      if (reducedMotion) return;
      setupBreathingAnimation();
      // Remove listeners after first interaction
      window.removeEventListener('pointerdown', startBreathOnInteraction);
      window.removeEventListener('keydown', startBreathOnInteraction);
    };

    window.addEventListener('pointerdown', startBreathOnInteraction, { once: true });
    window.addEventListener('keydown', startBreathOnInteraction, { once: true });

    // If prefers-reduced-motion, ensure breathing is disabled
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      reducedMotion = true;
      if (circle) {
        circle.classList.remove('breath');
        circle.setAttribute('aria-hidden', 'true');
      }
    } else {
      // If user never interacts, still set up a gentle idle state (no animation)
      // but do not auto-start animations that might be considered autoplay.
      // We set CSS variables so when user interacts the animation is ready.
      if (circle) {
        circle.style.setProperty('--inhale', `${TIMING.INHALE}s`);
        circle.style.setProperty('--hold', `${TIMING.HOLD}s`);
        circle.style.setProperty('--exhale', `${TIMING.EXHALE}s`);
        circle.style.setProperty('--cycle', `${CYCLE_SECONDS}s`);
      }
    }
  }

  /* -------------------------
     Initialize module
     ------------------------- */
  function init() {
    // Wire events early so controls are responsive
    wireEvents();

    // Load quotes
    loadQuotes();

    // Respect reduced motion immediately
    reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      // Provide a subtle static state for the breathing circle
      const circle = $(SELECTORS.BREATH_CIRCLE);
      if (circle) {
        circle.classList.remove('breath');
        circle.style.transform = 'scale(1)';
      }
    }
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

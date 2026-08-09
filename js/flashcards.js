/**
 * js/flashcards.js
 *
 * Robust flashcards module for Meet's Safe Place
 * - Loads /data/flashcards.json
 * - Randomizes without immediate repetition
 * - Flip animation (CSS-driven)
 * - Keyboard support and accessible ARIA updates
 * - Defensive DOM checks and clear console warnings
 *
 * Usage: <script type="module" src="js/flashcards.js" defer></script>
 */

(() => {
  'use strict';

  // Config
  const DATA_URL = '/data/flashcards.json';
  const SELECTORS = {
    wrapper: '#flashcard',
    inner: '#flashcard-inner',
    frontText: '#front-text',
    backText: '#back-text',
    prevBtn: '#prev-btn',
    nextBtn: '#next-btn',
    progressFill: '#progress-fill',
    progressLabel: '#progress-label',
    hint: '#hint'
  };

  // Module state
  let cards = [];
  let order = [];
  let pos = 0;
  let historyStack = [];
  let isFlipped = false;
  let lastShownIndex = null;

  // Small helpers
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function createOrder(len) {
    const indices = Array.from({ length: len }, (_, i) => i);
    const shuffled = shuffle(indices);
    if (len > 1 && lastShownIndex !== null && shuffled[0] === lastShownIndex) {
      const alt = shuffled.findIndex(v => v !== lastShownIndex);
      if (alt > 0) [shuffled[0], shuffled[alt]] = [shuffled[alt], shuffled[0]];
    }
    return shuffled;
  }

  function updateProgress(p, total) {
    const fill = $(SELECTORS.progressFill);
    const label = $(SELECTORS.progressLabel);
    if (!fill || !label) return;
    const percent = total === 0 ? 0 : Math.round(((p + 1) / total) * 100);
    fill.style.width = `${percent}%`;
    fill.setAttribute('aria-valuenow', String(percent));
    label.textContent = `Card ${p + 1} of ${total}`;
  }

  function setCardText(front, back) {
    const f = $(SELECTORS.frontText);
    const b = $(SELECTORS.backText);
    if (!f || !b) return;
    // gentle fade
    f.style.opacity = '0';
    b.style.opacity = '0';
    setTimeout(() => {
      f.textContent = front;
      b.textContent = back;
      f.style.transition = 'opacity 360ms var(--ease-soft)';
      b.style.transition = 'opacity 360ms var(--ease-soft)';
      f.style.opacity = '1';
      b.style.opacity = '1';
    }, 120);
  }

  function flipCard() {
    const wrapper = $(SELECTORS.wrapper);
    if (!wrapper) return;
    isFlipped = !isFlipped;
    wrapper.classList.toggle('is-flipped', isFlipped);
    wrapper.setAttribute('aria-pressed', String(isFlipped));
  }

  function showCurrent({ pushHistory = true } = {}) {
    if (!order.length || !cards.length) return;
    pos = clamp(pos, 0, order.length - 1);
    const idx = order[pos];
    const message = cards[idx] || 'A quiet thought.';
    lastShownIndex = idx;
    if (pushHistory) {
      historyStack.push(pos);
      if (historyStack.length > order.length * 2) historyStack.shift();
    }
    if (isFlipped) flipCard();
    setCardText('Tap to reveal', message);
    updateProgress(pos, order.length);
    const wrapper = $(SELECTORS.wrapper);
    if (wrapper) wrapper.setAttribute('aria-label', `Flashcard ${pos + 1} of ${order.length}`);
  }

  function nextCard() {
    if (!order.length) return;
    if (pos >= order.length - 1) {
      order = createOrder(cards.length);
      pos = 0;
      historyStack = [];
      showCurrent({ pushHistory: true });
    } else {
      pos += 1;
      showCurrent({ pushHistory: true });
    }
  }

  function prevCard() {
    if (!order.length) return;
    if (historyStack.length > 1) {
      historyStack.pop();
      const prevPos = historyStack.pop();
      if (typeof prevPos === 'number') {
        pos = prevPos;
        showCurrent({ pushHistory: true });
        return;
      }
    }
    if (pos > 0) {
      pos -= 1;
      showCurrent({ pushHistory: true });
    }
  }

  // Event handlers
  function onNext(e) { e && e.preventDefault(); nextCard(); }
  function onPrev(e) { e && e.preventDefault(); prevCard(); }
  function onCardClick() { flipCard(); }
  function onCardKey(e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flipCard(); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); nextCard(); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); prevCard(); return; }
    if (e.key === 'Escape' && isFlipped) { e.preventDefault(); flipCard(); }
  }

  // Wire DOM events
  function wireUp() {
    const nextBtn = $(SELECTORS.nextBtn);
    const prevBtn = $(SELECTORS.prevBtn);
    const wrapper = $(SELECTORS.wrapper);
    const hint = $(SELECTORS.hint);

    if (nextBtn) nextBtn.addEventListener('click', onNext);
    if (prevBtn) prevBtn.addEventListener('click', onPrev);

    if (wrapper) {
      wrapper.addEventListener('click', onCardClick);
      wrapper.addEventListener('keydown', onCardKey);
      wrapper.setAttribute('tabindex', '0');
      wrapper.setAttribute('role', 'button');
      wrapper.setAttribute('aria-pressed', 'false');
      wrapper.setAttribute('aria-label', 'Flashcard. Press Enter to flip. Use arrow keys to navigate.');
    }

    document.addEventListener('keydown', (e) => {
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
      if (e.key === 'ArrowRight') nextCard();
      else if (e.key === 'ArrowLeft') prevCard();
      else if ((e.key === 'Enter' || e.key === ' ') && (!active || active === document.body)) { e.preventDefault(); flipCard(); }
    });

    if (hint) {
      const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      hint.textContent = isTouch ? 'Tap to flip. Use buttons to navigate.' : 'Use ← → to navigate, Enter to flip.';
    }
  }

  // Load data and initialize
  async function loadAndInit() {
    // Defensive DOM check
    const required = [SELECTORS.wrapper, SELECTORS.frontText, SELECTORS.backText, SELECTORS.prevBtn, SELECTORS.nextBtn, SELECTORS.progressFill, SELECTORS.progressLabel];
    const missing = required.filter(s => !document.querySelector(s));
    if (missing.length) {
      console.warn('Flashcards: missing DOM elements', missing);
      // Still attempt to wire up what exists so errors are visible
      wireUp();
      return;
    }

    try {
      const res = await fetch(DATA_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`Failed to load flashcards (${res.status})`);
      const data = await res.json();
      if (Array.isArray(data)) cards = data.map(String).filter(Boolean);
      else if (data && typeof data === 'object') cards = Object.values(data).map(String).filter(Boolean);
      if (!cards.length) cards = ['You are enough.'];
      order = createOrder(cards.length);
      pos = 0;
      historyStack = [];
      wireUp();
      showCurrent({ pushHistory: true });
    } catch (err) {
      console.error('Flashcards initialization error:', err);
      // Fallback single card
      cards = ['You are enough.'];
      order = [0];
      pos = 0;
      wireUp();
      showCurrent({ pushHistory: true });
    }
  }

  // Start when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAndInit);
  } else {
    loadAndInit();
  }
})();

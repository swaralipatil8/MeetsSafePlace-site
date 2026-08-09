/**
 * app.js
 *
 * Global utilities and page-wide behaviors for "Meet's Safe Place"
 * - Navigation highlighting (based on scroll + hash)
 * - Smooth scrolling (prefers-reduced-motion aware)
 * - Fade-in on scroll using IntersectionObserver
 * - Page transition helper (soft enter/exit)
 * - Theme initialization (light / soft-accent) persisted in sessionStorage
 * - Accessibility improvements (skip link focus, reduced-motion respect)
 * - Shared helper functions and small DOM utilities
 *
 * Architecture:
 * - Module-scoped (IIFE) to avoid globals
 * - Small, focused functions; no duplicated code
 * - Uses modern ES6 features (const/let, arrow functions, template strings)
 *
 * Usage: <script src="js/app.js" defer></script>
 */

(() => {
  'use strict';

  /* ============================
     Configuration & constants
     ============================ */
  const SELECTORS = {
    NAV_LINKS: '.nav-links a',
    NAV_CONTAINER: '.navbar',
    PAGE_WRAPPER: 'body',
    FADE_IN: '.anim-fade-up, .anim-fade-in, .anim-fade-left, .anim-fade-right, .anim-zoom',
    FADE_TARGET: '[data-fade]', // elements that want fade-in on scroll
    SKIP_LINK: 'a[href^="#"]:not([data-skip])',
    PAGE_TRANSITION_ATTR: 'data-page-transition'
  };

  const STORAGE = {
    THEME_KEY: 'msp_theme_v1'
  };

  const MOTION = {
    REDUCED: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  };

  /* ============================
     Small DOM helpers
     ============================ */

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from((ctx || document).querySelectorAll(sel));

  const on = (el, evt, selOrHandler, handler) => {
    // on(element, 'click', handler) or on(document, 'click', '.btn', handler)
    if (typeof selOrHandler === 'function') {
      el.addEventListener(evt, selOrHandler);
    } else {
      el.addEventListener(evt, (e) => {
        const target = e.target.closest(selOrHandler);
        if (target && el.contains(target)) handler.call(target, e);
      });
    }
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ============================
     Smooth scrolling
     ============================ */

  function smoothScrollTo(targetY, options = {}) {
    // Respect reduced motion preference
    if (MOTION.REDUCED) {
      window.scrollTo({ top: targetY, behavior: 'auto' });
      return Promise.resolve();
    }

    const startY = window.scrollY || window.pageYOffset;
    const distance = targetY - startY;
    const duration = options.duration || 520;
    const easing = options.easing || ((t) => 1 - Math.pow(1 - t, 3)); // easeOutCubic

    let startTime = null;

    return new Promise((resolve) => {
      function step(ts) {
        if (!startTime) startTime = ts;
        const elapsed = ts - startTime;
        const t = clamp(elapsed / duration, 0, 1);
        const eased = easing(t);
        window.scrollTo(0, Math.round(startY + distance * eased));
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          resolve();
        }
      }
      requestAnimationFrame(step);
    });
  }

  function scrollToHash(hash) {
    if (!hash) return;
    const id = hash.replace(/^#/, '');
    const el = document.getElementById(id);
    if (!el) return;
    // Compute offset to account for sticky header
    const header = $(SELECTORS.NAV_CONTAINER);
    const headerHeight = header ? header.getBoundingClientRect().height : 0;
    const rect = el.getBoundingClientRect();
    const targetY = window.scrollY + rect.top - Math.round(headerHeight + 12);
    smoothScrollTo(targetY);
  }

  /* ============================
     Navigation highlighting
     ============================ */

  function initNavHighlight() {
    const links = $$(SELECTORS.NAV_LINKS);
    if (!links.length) return;

    // Build mapping of section id -> link
    const sections = links
      .map((a) => {
        const href = a.getAttribute('href') || '';
        if (!href.startsWith('#')) return null;
        const id = href.slice(1);
        const el = document.getElementById(id);
        return el ? { id, el, link: a } : null;
      })
      .filter(Boolean);

    // If no sections, highlight based on pathname only
    if (!sections.length) {
      // highlight current page link by href match
      const path = location.pathname.split('/').pop() || 'index.html';
      links.forEach((a) => {
        const href = a.getAttribute('href') || '';
        if (href.includes(path)) a.classList.add('is-active');
        else a.classList.remove('is-active');
      });
      return;
    }

    // IntersectionObserver to highlight section in view
    const observerOptions = {
      root: null,
      rootMargin: '0px 0px -40% 0px', // trigger when section crosses 60% viewport
      threshold: 0
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const id = entry.target.id;
        const mapping = sections.find(s => s.id === id);
        if (!mapping) return;
        if (entry.isIntersecting) {
          // Remove active from all and set on this
          links.forEach(l => l.classList.remove('is-active'));
          mapping.link.classList.add('is-active');
          // Update URL hash without scrolling
          history.replaceState(null, '', `#${id}`);
        }
      });
    }, observerOptions);

    sections.forEach(s => observer.observe(s.el));

    // Also handle click on nav links to smooth scroll
    links.forEach((a) => {
      a.addEventListener('click', (e) => {
        const href = a.getAttribute('href') || '';
        if (href.startsWith('#')) {
          e.preventDefault();
          const id = href.slice(1);
          scrollToHash(`#${id}`);
          // set focus for accessibility
          const target = document.getElementById(id);
          if (target) {
            target.setAttribute('tabindex', '-1');
            target.focus({ preventScroll: true });
            // remove tabindex after focus to keep DOM clean
            window.setTimeout(() => target.removeAttribute('tabindex'), 1000);
          }
        }
      });
    });
  }

  /* ============================
     Fade-in on scroll (IntersectionObserver)
     ============================ */

  function initFadeInOnScroll() {
    const targets = $$(SELECTORS.FADE_TARGET);
    if (!targets.length) return;

    // If user prefers reduced motion, reveal all immediately
    if (MOTION.REDUCED) {
      targets.forEach((el) => el.classList.add('anim-fade-in'));
      return;
    }

    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const el = entry.target;
          // Determine animation direction from data attributes
          const anim = el.dataset.fade || 'fade-up';
          switch (anim) {
            case 'fade-left':
              el.classList.add('anim-fade-left');
              break;
            case 'fade-right':
              el.classList.add('anim-fade-right');
              break;
            case 'zoom':
              el.classList.add('anim-zoom');
              break;
            default:
              el.classList.add('anim-fade-up');
          }
          obs.unobserve(el);
        }
      });
    }, { root: null, rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

    targets.forEach((t) => io.observe(t));
  }

  /* ============================
     Page transition helper
     ============================ */

  function pageTransitionInit() {
    // Add enter class on load
    const body = document.body;
    body.classList.add('page-enter');

    // When navigating away via internal links, add exit class and delay navigation
    on(document, 'click', 'a[href]:not([target="_blank"]):not([data-no-transition])', (e) => {
      const a = e.currentTarget;
      const href = a.getAttribute('href') || '';
      // Only intercept same-origin navigations and not hash-only
      if (href.startsWith('http') && new URL(href, location.href).origin !== location.origin) return;
      if (href.startsWith('#')) return; // handled by smooth scroll
      // Prevent default and animate
      e.preventDefault();
      const dest = href;
      body.classList.remove('page-enter');
      body.classList.add('page-exit');
      // Wait for animation duration (match animations.css --page-duration)
      const wait = 420;
      setTimeout(() => {
        location.href = dest;
      }, wait);
    });

    // On popstate (back/forward), ensure enter animation runs
    window.addEventListener('popstate', () => {
      body.classList.remove('page-exit');
      body.classList.add('page-enter');
    });
  }

  /* ============================
     Theme initialization
     ============================ */

  function applyTheme(theme) {
    const root = document.documentElement;
    root.dataset.theme = theme;
    // small visual token updates could be applied here
    sessionStorage.setItem(STORAGE.THEME_KEY, theme);
  }

  function initTheme() {
    const saved = sessionStorage.getItem(STORAGE.THEME_KEY);
    if (saved) {
      applyTheme(saved);
      return;
    }
    // Default: soft pastel theme; respect system dark if desired (optional)
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'soft-dark' : 'soft-light');
  }

  /* ============================
     Accessibility improvements
     ============================ */

  function initAccessibility() {
    // Skip link focus handling: ensure skip links reveal target
    on(document, 'click', 'a[href^="#skip"]', (e) => {
      const href = e.currentTarget.getAttribute('href');
      if (!href) return;
      const id = href.slice(1);
      const target = document.getElementById(id);
      if (target) {
        target.setAttribute('tabindex', '-1');
        target.focus();
        setTimeout(() => target.removeAttribute('tabindex'), 1000);
      }
    });

    // Ensure focus outlines are visible for keyboard users
    let hadKeyboardEvent = false;
    function handleFirstTab(e) {
      if (e.key === 'Tab') {
        document.documentElement.classList.add('user-is-tabbing');
        hadKeyboardEvent = true;
        window.removeEventListener('keydown', handleFirstTab);
      }
    }
    window.addEventListener('keydown', handleFirstTab);

    // Respect reduced motion: disable non-essential animations
    if (MOTION.REDUCED) {
      document.documentElement.classList.add('reduced-motion');
    }
  }

  /* ============================
     Utility: debounce & throttle
     ============================ */

  function debounce(fn, wait = 120) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function throttle(fn, limit = 100) {
    let inThrottle = false;
    return (...args) => {
      if (!inThrottle) {
        fn.apply(this, args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }

  /* ============================
     Initialization entrypoint
     ============================ */

  function init() {
    // Theme first so visuals are consistent
    initTheme();

    // Accessibility
    initAccessibility();

    // Page transitions
    pageTransitionInit();

    // Smooth scroll for hash on load
    if (location.hash) {
      // Delay slightly to allow layout to settle
      setTimeout(() => scrollToHash(location.hash), 120);
    }

    // Navigation highlight
    initNavHighlight();

    // Fade-in on scroll
    initFadeInOnScroll();

    // Small performance: re-run fade-in on resize (debounced)
    window.addEventListener('resize', debounce(() => {
      // Re-initialize fade-in targets if necessary
      initFadeInOnScroll();
    }, 250));

    // Expose a small API for other modules via data attribute on body
    document.body.dataset.mspReady = 'true';
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ============================
     Exported helpers (for other modules in same origin)
     - Attached to window.msp (lightweight, non-intrusive)
     ============================ */
  const api = {
    smoothScrollTo,
    scrollToHash,
    applyTheme,
    getTheme: () => document.documentElement.dataset.theme || null,
    prefersReducedMotion: () => MOTION.REDUCED
  };

  // Attach only if not already present to avoid collisions
  if (!window.msp) {
    Object.defineProperty(window, 'msp', {
      value: api,
      writable: false,
      configurable: false,
      enumerable: false
    });
  }

})();

/* js/pjax.js
   Opt-in PJAX that replaces <main id="main"> only.
   - Only intercepts links with data-pjax attribute (safe by default)
   - Preserves body classes and data-* attributes
   - Executes inline/external scripts found inside the fetched <main>
   - Calls window.initMusicController() (if present) and window.onContentLoaded()
   - Falls back to full navigation on error
*/

(function () {
  'use strict';

  const MAIN_SELECTOR = '#main';
  const PJAX_ATTR = 'data-pjax';
  const FETCH_TIMEOUT = 12000;

  // Helpers
  function isInternalLink(url) {
    try {
      const u = new URL(url, location.href);
      return u.origin === location.origin;
    } catch (e) {
      return false;
    }
  }

  function fetchWithTimeout(url, opts = {}, timeout = FETCH_TIMEOUT) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), timeout);
      fetch(url, opts).then((res) => {
        clearTimeout(timer);
        resolve(res);
      }).catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  // Parse fetched HTML and extract <main> and <title>
  function parseHTMLFragment(htmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');
    const newMain = doc.querySelector(MAIN_SELECTOR);
    const newTitle = doc.querySelector('title');
    return {
      mainHTML: newMain ? newMain.innerHTML : null,
      title: newTitle ? newTitle.textContent : null,
      mainNode: newMain || null,
      doc
    };
  }

  // Execute inline and external scripts found inside the fetched main node
  function runInlineScripts(container) {
    if (!container) return;
    const scripts = Array.from(container.querySelectorAll('script'));
    scripts.forEach((oldScript) => {
      const script = document.createElement('script');
      // copy attributes
      for (let i = 0; i < oldScript.attributes.length; i++) {
        const attr = oldScript.attributes[i];
        script.setAttribute(attr.name, attr.value);
      }
      if (oldScript.src) {
        // external script: append to body so it loads and executes
        script.src = oldScript.src;
        if (oldScript.async) script.async = true;
        if (oldScript.defer) script.defer = true;
        document.body.appendChild(script);
      } else {
        // inline script: copy text
        script.textContent = oldScript.textContent;
        document.body.appendChild(script);
      }
      // remove original to avoid duplication
      oldScript.parentNode && oldScript.parentNode.removeChild(oldScript);
    });
  }

  // Copy body classes and data-* attributes from fetched doc to current body
  function copyBodyAttributesFromDoc(doc) {
    try {
      const newBody = doc && doc.body;
      if (!newBody) return;
      // copy className
      document.body.className = newBody.className || '';
      // copy data-* attributes (preserve existing non-data attributes)
      Array.from(newBody.attributes).forEach(attr => {
        if (attr.name.startsWith('data-')) {
          document.body.setAttribute(attr.name, attr.value);
        }
      });
    } catch (e) {
      console.warn('pjax: copyBodyAttributes failed', e);
    }
  }

  // Replace main content and run scripts
  function replaceMainContent(newHTML, newMainNode, fetchedDoc) {
    const main = document.querySelector(MAIN_SELECTOR);
    if (!main) return;
    // jump to top
    try { window.scrollTo({ top: 0, behavior: 'instant' }); } catch (e) {}
    main.innerHTML = newHTML;
    // execute scripts that were inside the fetched main
    runInlineScripts(newMainNode);
    // copy body attributes (classes, data-*)
    copyBodyAttributesFromDoc(fetchedDoc);
  }

  function updateTitle(newTitle) {
    if (newTitle) document.title = newTitle;
  }

  function pushState(url, title) {
    try {
      history.pushState({ pjax: true }, title || document.title, url);
    } catch (e) { /* ignore */ }
  }

  // Handle back/forward
  window.addEventListener('popstate', (ev) => {
    const url = location.href;
    pjaxLoad(url, { replaceState: true }).catch(() => {
      location.reload();
    });
  });

  // Main loader
  async function pjaxLoad(url, options = {}) {
    const { replaceState = false } = options;
    const res = await fetchWithTimeout(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Network error');
    const text = await res.text();
    const parsed = parseHTMLFragment(text);
    if (!parsed.mainHTML) throw new Error('No main content found');
    // replace content
    replaceMainContent(parsed.mainHTML, parsed.mainNode, parsed.doc);
    // update title
    updateTitle(parsed.title);
    // update history
    if (replaceState) {
      try { history.replaceState({ pjax: true }, parsed.title || document.title, url); } catch (e) {}
    } else {
      pushState(url, parsed.title);
    }

    // Post-replace initialization (safe, non-invasive)
    try {
      // 1) Try to re-run music initializer if available (audio element should be outside main)
      if (typeof window.initMusicController === 'function') {
        try { window.initMusicController(); } catch (e) { console.warn('initMusicController error', e); }
      } else {
        // Fallback: if audio exists and session says enabled, attempt to resume gracefully
        try {
          const audio = document.getElementById('ambient-audio');
          const pref = sessionStorage.getItem('msp_home_piano_enabled');
          if (audio && pref === '1') {
            audio.play().catch(() => {
              const onGesture = async () => {
                document.removeEventListener('click', onGesture, true);
                document.removeEventListener('keydown', onGesture, true);
                document.removeEventListener('touchstart', onGesture, true);
                try { await audio.play(); } catch (e) { /* ignore */ }
              };
              document.addEventListener('click', onGesture, true);
              document.addEventListener('keydown', onGesture, true);
              document.addEventListener('touchstart', onGesture, true);
            });
          }
        } catch (e) { /* ignore */ }
      }

      // 2) Call general onContentLoaded hook for other initializers
      if (typeof window.onContentLoaded === 'function') {
        try { window.onContentLoaded(); } catch (e) { console.warn('onContentLoaded error', e); }
      }
    } catch (e) {
      console.warn('pjax: post-replace init error', e);
    }

    // smooth scroll to top
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {}
  }

  // Click interception (OPT-IN): only intercept links that have data-pjax attribute
  document.addEventListener('click', (ev) => {
    // only left-click without modifier keys
    if (ev.defaultPrevented) return;
    if (ev.button !== 0) return;
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;

    // find nearest anchor
    let el = ev.target;
    while (el && el.tagName !== 'A') el = el.parentElement;
    if (!el || el.tagName !== 'A') return;

    // Only handle links explicitly opted-in with data-pjax
    if (!el.hasAttribute(PJAX_ATTR)) return;

    const href = el.getAttribute('href');
    if (!href || href.startsWith('#')) return; // anchor or empty
    // external link or different origin -> allow default
    if (!isInternalLink(href)) return;

    // allow download links or links with target
    if (el.hasAttribute('download') || (el.target && el.target !== '_self')) return;

    // prevent default and do PJAX
    ev.preventDefault();
    const url = new URL(href, location.href).href;
    document.documentElement.classList.add('pjax-loading');
    pjaxLoad(url).catch((err) => {
      console.error('PJAX load failed', err);
      // fallback to full navigation
      location.href = url;
    }).finally(() => {
      document.documentElement.classList.remove('pjax-loading');
    });
  }, false);

  // Initial hook on first load
  document.addEventListener('DOMContentLoaded', () => {
    if (typeof window.onContentLoaded === 'function') {
      try { window.onContentLoaded(); } catch (e) { console.warn(e); }
    }
  });

  // Expose pjaxLoad for manual use
  window.pjaxLoad = pjaxLoad;

})();

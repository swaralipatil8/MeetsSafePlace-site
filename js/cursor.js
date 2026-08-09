/**
 * cursor.js
 *
 * Premium cursor effect for "Meet's Safe Place"
 * - Soft glow that follows the pointer with gentle easing
 * - Trailing particles rendered on a performant canvas
 * - Occasional small floating hearts for warmth
 * - Automatically disabled on touch devices and when user prefers reduced motion
 * - Optimized: single requestAnimationFrame loop, particle pooling, DPR-aware canvas
 * - No global variables; modular and self-contained
 *
 * Usage: <script src="js/cursor.js" defer></script>
 *
 * Notes:
 * - The script injects minimal CSS for the cursor element.
 * - It avoids interfering with form controls and respects accessibility.
 * - All event listeners are passive where appropriate.
 *
 * Author: Senior Frontend Engineer, UI/UX Designer, Creative Developer
 */

(() => {
  'use strict';

  /* -------------------------
     Feature gating: disable on touch or reduced-motion
     ------------------------- */
  const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
  const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (isTouchDevice || prefersReducedMotion) {
    // Do not initialize custom cursor on touch devices or when user prefers reduced motion.
    return;
  }

  /* -------------------------
     Inject minimal CSS for cursor and helper classes
     ------------------------- */
  const style = document.createElement('style');
  style.id = 'msp-cursor-styles';
  style.textContent = `
    /* Cursor element */
    .msp-cursor {
      position: fixed;
      left: 0;
      top: 0;
      width: 36px;
      height: 36px;
      margin-left: -18px;
      margin-top: -18px;
      pointer-events: none;
      border-radius: 50%;
      z-index: 99999;
      transform: translate3d(0,0,0);
      transition: background-color 220ms ease, transform 220ms ease;
      will-change: transform, opacity;
      mix-blend-mode: screen;
      display: block;
      opacity: 0.98;
      backdrop-filter: blur(2px);
    }

    /* Soft glow using pseudo-element via box-shadow */
    .msp-cursor::before {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: radial-gradient(circle at 40% 30%, rgba(255,255,255,0.85), rgba(255,255,255,0.12) 10%, transparent 40%);
      box-shadow:
        0 6px 18px rgba(191,104,150,0.08),
        0 0 40px rgba(191,104,150,0.08),
        0 0 80px rgba(231,216,255,0.04);
      pointer-events: none;
      transform: scale(1);
      transition: transform 260ms cubic-bezier(.2,.9,.3,1);
    }

    /* Slightly larger when hovering interactive elements */
    .msp-cursor--hover::before {
      transform: scale(1.18);
      box-shadow:
        0 10px 30px rgba(191,104,150,0.12),
        0 0 60px rgba(231,216,255,0.06);
    }

    /* Hidden when over inputs to avoid interfering with text caret */
    .msp-cursor--hidden { opacity: 0 !important; pointer-events: none; }

    /* Canvas overlay for particles */
    .msp-canvas {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 99998;
      mix-blend-mode: screen;
    }

    /* Heart particle style fallback (for accessibility) */
    .msp-heart {
      position: absolute;
      width: 18px;
      height: 18px;
      pointer-events: none;
      transform-origin: center;
      will-change: transform, opacity;
    }
  `;
  document.head.appendChild(style);

  /* -------------------------
     Create DOM elements: cursor + canvas
     ------------------------- */
  const cursor = document.createElement('div');
  cursor.className = 'msp-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cursor);

  const canvas = document.createElement('canvas');
  canvas.className = 'msp-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);

  /* -------------------------
     Canvas setup (DPR-aware)
     ------------------------- */
  const ctx = canvas.getContext('2d', { alpha: true });
  let dpr = Math.max(1, window.devicePixelRatio || 1);

  function resizeCanvas() {
    dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
    const h = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  // Initial size
  resizeCanvas();
  // Resize observer
  window.addEventListener('resize', resizeCanvas, { passive: true });

  /* -------------------------
     Cursor motion (lerp for smoothness)
     ------------------------- */
  let targetX = window.innerWidth / 2;
  let targetY = window.innerHeight / 2;
  let currentX = targetX;
  let currentY = targetY;
  const ease = 0.18; // lower = smoother/slower

  /* -------------------------
     Particle system (canvas)
     - Pooling for performance
     - Two particle types: soft circles (petals/lights) and hearts
     ------------------------- */
  const MAX_PARTICLES = 120;
  const particles = new Array(MAX_PARTICLES);
  let particleCount = 0;

  // Particle structure:
  // { x, y, vx, vy, life, ttl, size, hue, type, rotation, spin, alpha }
  for (let i = 0; i < MAX_PARTICLES; i++) particles[i] = null;

  function spawnParticle(x, y, opts = {}) {
    // Find free slot
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (!particles[i]) {
        const angle = (Math.random() * Math.PI * 2);
        const speed = (opts.speed || (Math.random() * 0.6 + 0.2));
        const vx = Math.cos(angle) * speed + (opts.vx || 0);
        const vy = Math.sin(angle) * speed + (opts.vy || -0.2);
        const ttl = opts.ttl || Math.floor(Math.random() * 60 + 40); // frames
        const size = opts.size || (Math.random() * 6 + 4);
        const hue = opts.hue || (Math.random() * 40 + 320); // pastel pink/purple range
        const type = opts.type || 'dot';
        const rotation = Math.random() * Math.PI * 2;
        const spin = (Math.random() - 0.5) * 0.06;
        particles[i] = {
          x, y, vx, vy, life: 0, ttl, size, hue, type, rotation, spin, alpha: 1
        };
        particleCount++;
        break;
      }
    }
  }

  function spawnHeart(x, y) {
    // spawn a heart-shaped particle (rendered on canvas)
    spawnParticle(x, y, {
      type: 'heart',
      size: Math.random() * 10 + 8,
      ttl: Math.floor(Math.random() * 60 + 60),
      vx: (Math.random() - 0.5) * 0.6,
      vy: -0.6,
      hue: 340 + Math.random() * 20
    });
  }

  /* -------------------------
     Particle update & draw
     ------------------------- */
  function updateParticles() {
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.clearRect(0, 0, w, h);

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = particles[i];
      if (!p) continue;

      // Physics
      p.vx *= 0.99;
      p.vy += 0.02; // gentle gravity to make particles drift down slowly
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.spin;
      p.life++;
      p.alpha = 1 - (p.life / p.ttl);

      // Draw
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha * 0.95);

      if (p.type === 'dot') {
        // soft pastel circle with radial gradient
        const grad = ctx.createRadialGradient(p.x - 0.5, p.y - 0.5, 0, p.x, p.y, p.size * 1.6);
        const color = `hsl(${p.hue}, 85%, 78%)`;
        grad.addColorStop(0, color);
        grad.addColorStop(0.6, `hsla(${p.hue}, 85%, 78%, 0.6)`);
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'heart') {
        // draw a small heart path centered at (p.x, p.y)
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        const s = p.size / 12;
        ctx.scale(s, s);
        ctx.beginPath();
        // heart path (relative)
        ctx.moveTo(0, -6);
        ctx.bezierCurveTo(6, -18, 24, -12, 24, 0);
        ctx.bezierCurveTo(24, 12, 12, 20, 0, 28);
        ctx.bezierCurveTo(-12, 20, -24, 12, -24, 0);
        ctx.bezierCurveTo(-24, -12, -6, -18, 0, -6);
        ctx.closePath();
        ctx.fillStyle = `hsl(${p.hue}, 85%, 70%)`;
        ctx.fill();
      }

      ctx.restore();

      // Recycle
      if (p.life >= p.ttl || p.y > h + 40 || p.x < -40 || p.x > w + 40) {
        particles[i] = null;
        particleCount--;
      }
    }
  }

  /* -------------------------
     Heart spawn cadence
     ------------------------- */
  let heartTimer = 0;
  const HEART_INTERVAL = 120; // frames (~2s at 60fps) average; randomized below

  /* -------------------------
     Pointer handling
     ------------------------- */
  let lastMoveTime = performance.now();
  let hiddenDueToInput = false;

  function onPointerMove(e) {
    // Update target position
    targetX = e.clientX;
    targetY = e.clientY;
    lastMoveTime = performance.now();

    // Spawn a few trailing particles for subtle trail
    // spawn density depends on movement speed
    const now = performance.now();
    const dt = Math.max(1, now - lastMoveTime);
    // spawn 1-2 particles per move event
    spawnParticle(targetX + (Math.random() - 0.5) * 6, targetY + (Math.random() - 0.5) * 6, {
      size: Math.random() * 5 + 3,
      ttl: Math.floor(Math.random() * 40 + 30),
      hue: 320 + Math.random() * 40,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6
    });

    // Occasionally spawn a heart with low probability
    if (Math.random() < 0.02) {
      spawnHeart(targetX + (Math.random() - 0.5) * 12, targetY + (Math.random() - 0.5) * 12);
    }

    // Hide custom cursor when over form controls to avoid interference
    const interactive = e.target && (e.target.closest && e.target.closest('input, textarea, select, button, a'));
    if (interactive) {
      if (!hiddenDueToInput) {
        cursor.classList.add('msp-cursor--hidden');
        hiddenDueToInput = true;
      }
    } else if (hiddenDueToInput) {
      cursor.classList.remove('msp-cursor--hidden');
      hiddenDueToInput = false;
    }
  }

  // Use pointermove for unified pointer handling (mouse + pen)
  window.addEventListener('pointermove', onPointerMove, { passive: true });

  // Show hover state when over interactive elements
  function onPointerOver(e) {
    const el = e.target;
    if (el && (el.closest && el.closest('a, button, input, textarea, select, label')) ) {
      cursor.classList.add('msp-cursor--hover');
    }
  }
  function onPointerOut(e) {
    const el = e.target;
    if (el && (el.closest && el.closest('a, button, input, textarea, select, label')) ) {
      cursor.classList.remove('msp-cursor--hover');
    }
  }
  window.addEventListener('pointerover', onPointerOver, { passive: true });
  window.addEventListener('pointerout', onPointerOut, { passive: true });

  /* -------------------------
     Animation loop
     ------------------------- */
  let raf = null;

  function animate() {
    // Lerp cursor position
    currentX += (targetX - currentX) * ease;
    currentY += (targetY - currentY) * ease;
    // Apply transform using translate3d for GPU acceleration
    cursor.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;

    // Occasionally spawn a soft floating petal near cursor for extra warmth
    if (Math.random() < 0.06) {
      spawnParticle(currentX + (Math.random() - 0.5) * 18, currentY + (Math.random() - 0.5) * 18, {
        size: Math.random() * 6 + 4,
        ttl: Math.floor(Math.random() * 80 + 60),
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.2,
        hue: 320 + Math.random() * 60
      });
    }

    // Heart cadence
    heartTimer++;
    if (heartTimer > HEART_INTERVAL + Math.floor(Math.random() * 60)) {
      // spawn a heart near cursor
      spawnHeart(currentX + (Math.random() - 0.5) * 24, currentY + (Math.random() - 0.5) * 24);
      heartTimer = 0;
    }

    // Update and draw particles
    updateParticles();

    raf = requestAnimationFrame(animate);
  }

  // Start animation loop
  raf = requestAnimationFrame(animate);

  /* -------------------------
     Visibility & cleanup
     ------------------------- */
  // Pause rendering when page is hidden to save CPU
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = null;
      }
    } else {
      if (!raf) raf = requestAnimationFrame(animate);
    }
  }, { passive: true });

  // Expose a small API on the cursor element for debugging or graceful teardown
  // (kept local; not global)
  cursor.msp = {
    destroy() {
      // Remove listeners and DOM nodes
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerover', onPointerOver);
      window.removeEventListener('pointerout', onPointerOut);
      window.removeEventListener('resize', resizeCanvas);
      document.removeEventListener('visibilitychange', () => {});
      if (raf) cancelAnimationFrame(raf);
      if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
      if (cursor && cursor.parentNode) cursor.parentNode.removeChild(cursor);
      const s = document.getElementById('msp-cursor-styles');
      if (s && s.parentNode) s.parentNode.removeChild(s);
    }
  };

  /* -------------------------
     Small accessibility nicety:
     - Hide custom cursor when keyboard navigation is used (Tab)
     - Show again on pointer interaction
     ------------------------- */
  function onFirstTab(e) {
    if (e.key === 'Tab') {
      cursor.classList.add('msp-cursor--hidden');
      window.removeEventListener('keydown', onFirstTab);
      // show again on pointerdown
      window.addEventListener('pointerdown', onPointerInteractionShow, { once: true, passive: true });
    }
  }
  function onPointerInteractionShow() {
    cursor.classList.remove('msp-cursor--hidden');
    // reattach keyboard listener
    window.addEventListener('keydown', onFirstTab, { passive: true });
  }
  window.addEventListener('keydown', onFirstTab, { passive: true });

  /* -------------------------
     End of module
     ------------------------- */
})();

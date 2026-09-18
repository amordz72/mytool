(() => {
  'use strict';

  const topbar = document.querySelector('.mt-topbar');
  if (!topbar) return;

  const TOP_LOCK_Y = 24;
  const HIDE_AFTER_Y = 72;
  const DELTA_THRESHOLD = 8;

  let lastY = Math.max(0, window.scrollY || 0);
  let ticking = false;

  function apply() {
    ticking = false;

    const currentY = Math.max(0, window.scrollY || 0);
    const delta = currentY - lastY;

    topbar.classList.toggle('is-scrolled', currentY > TOP_LOCK_Y);

    if (currentY <= TOP_LOCK_Y) {
      topbar.classList.remove('is-hidden');
      lastY = currentY;
      return;
    }

    if (Math.abs(delta) < DELTA_THRESHOLD) return;

    if (delta > 0 && currentY > HIDE_AFTER_Y) {
      topbar.classList.add('is-hidden');
    } else if (delta < 0) {
      topbar.classList.remove('is-hidden');
    }

    lastY = currentY;
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(apply);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('pageshow', () => {
    lastY = Math.max(0, window.scrollY || 0);
    topbar.classList.remove('is-hidden');
    topbar.classList.toggle('is-scrolled', lastY > TOP_LOCK_Y);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      lastY = Math.max(0, window.scrollY || 0);
      topbar.classList.remove('is-hidden');
    }
  });
})();
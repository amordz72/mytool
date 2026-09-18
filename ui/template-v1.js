(() => {
  'use strict';

  const topbar = document.querySelector('.mt-topbar');
  if (!topbar) return;

  const TOP_LOCK_Y = 32;
  const HIDE_AFTER_Y = 96;
  const HIDE_DISTANCE = 28;
  const SHOW_DISTANCE = 14;

  let lastY = Math.max(0, window.scrollY || 0);
  let direction = 0;
  let directionStartY = lastY;
  let ticking = false;

  function resetDirection(currentY) {
    direction = 0;
    directionStartY = currentY;
  }

  function apply() {
    ticking = false;

    const currentY = Math.max(0, window.scrollY || 0);
    const delta = currentY - lastY;

    topbar.classList.toggle('is-scrolled', currentY > TOP_LOCK_Y);

    if (currentY <= TOP_LOCK_Y) {
      topbar.classList.remove('is-hidden');
      resetDirection(currentY);
      lastY = currentY;
      return;
    }

    if (delta === 0) return;

    const nextDirection = delta > 0 ? 1 : -1;
    if (nextDirection !== direction) {
      direction = nextDirection;
      directionStartY = currentY;
    }

    const distance = Math.abs(currentY - directionStartY);

    if (direction > 0 && currentY > HIDE_AFTER_Y && distance >= HIDE_DISTANCE) {
      topbar.classList.add('is-hidden');
      directionStartY = currentY;
    } else if (direction < 0 && distance >= SHOW_DISTANCE) {
      topbar.classList.remove('is-hidden');
      directionStartY = currentY;
    }

    lastY = currentY;
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(apply);
  }

  function restoreVisibleState() {
    lastY = Math.max(0, window.scrollY || 0);
    resetDirection(lastY);
    topbar.classList.remove('is-hidden');
    topbar.classList.toggle('is-scrolled', lastY > TOP_LOCK_Y);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('pageshow', restoreVisibleState);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') restoreVisibleState();
  });
})();
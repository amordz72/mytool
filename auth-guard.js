(() => {
  'use strict';

  const ADMIN_EXPIRES_KEY = 'mytool_admin_expires_at';
  const EMERGENCY_EXPIRES_KEY = 'mytool_emergency_admin_expires_at';
  const WORKER_TOKEN_KEY = 'mytool_shop_worker_token';
  const WORKER_EXPIRES_KEY = 'mytool_shop_worker_expires_at';

  const now = Date.now();
  const adminActive = Number(localStorage.getItem(ADMIN_EXPIRES_KEY) || 0) > now;
  const emergencyActive = Number(localStorage.getItem(EMERGENCY_EXPIRES_KEY) || 0) > now;
  const workerActive = Boolean(localStorage.getItem(WORKER_TOKEN_KEY)) && Number(localStorage.getItem(WORKER_EXPIRES_KEY) || 0) > now;

  const access = document.currentScript?.dataset?.access || 'admin';
  const allowed = adminActive || emergencyActive || (access === 'worker' && workerActive);

  if (allowed) return;

  try {
    sessionStorage.setItem('mytool_blocked_path', location.pathname + location.search + location.hash);
  } catch (_e) {}

  location.replace(new URL('../', location.href).href);
})();

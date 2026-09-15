(() => {
  'use strict';

  const ADMIN_EXPIRES_KEY='mytool_admin_expires_at';
  const EMERGENCY_EXPIRES_KEY='mytool_emergency_admin_expires_at';
  const WORKER_TOKEN_KEY='mytool_shop_worker_token';
  const WORKER_EXPIRES_KEY='mytool_shop_worker_expires_at';
  const guardScript=document.currentScript;
  const rootUrl=new URL('./',guardScript?.src||location.href);

  const now=Date.now();
  const adminActive=Number(localStorage.getItem(ADMIN_EXPIRES_KEY)||0)>now;
  const emergencyActive=Number(localStorage.getItem(EMERGENCY_EXPIRES_KEY)||0)>now;
  const workerActive=Boolean(localStorage.getItem(WORKER_TOKEN_KEY))&&Number(localStorage.getItem(WORKER_EXPIRES_KEY)||0)>now;
  const authenticated=adminActive||emergencyActive||workerActive;

  const access=(guardScript?.dataset?.access||'admin').toLowerCase();
  const allowed=access==='public'
    ||(access==='authenticated'&&authenticated)
    ||(access==='worker'&&authenticated)
    ||(access==='admin'&&(adminActive||emergencyActive));

  if(!allowed){
    try{sessionStorage.setItem('mytool_blocked_path',location.pathname+location.search+location.hash)}catch(_e){}
    location.replace(rootUrl.href);
    return;
  }

  window.MyToolAccessContext=Object.freeze({access,adminActive,emergencyActive,workerActive,authenticated,rootUrl:rootUrl.href});
  if(guardScript?.dataset?.nav==='off')return;

  if(!document.querySelector('link[data-mytool-bottom-nav]')){
    const link=document.createElement('link');
    link.rel='stylesheet';link.href=new URL('mytool-bottom-nav.css',rootUrl).href;link.dataset.mytoolBottomNav='1';document.head.appendChild(link);
  }
  if(!document.querySelector('script[data-mytool-bottom-nav]')){
    const nav=document.createElement('script');
    nav.src=new URL('mytool-bottom-nav.js',rootUrl).href;nav.defer=true;nav.dataset.mytoolBottomNav='1';nav.dataset.root=rootUrl.href;document.head.appendChild(nav);
  }
})();
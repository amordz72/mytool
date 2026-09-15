(() => {
  'use strict';

  const ADMIN_EXPIRES_KEY='mytool_admin_expires_at';
  const EMERGENCY_EXPIRES_KEY='mytool_emergency_admin_expires_at';
  const WORKER_TOKEN_KEY='mytool_shop_worker_token';
  const WORKER_EXPIRES_KEY='mytool_shop_worker_expires_at';
  const TOOLS_TOKEN_KEY='mytool_tools_access_token';
  const TOOLS_EXPIRES_KEY='mytool_tools_access_expires_at';
  const ACCESS_API='https://mytool-access.dzamor72.workers.dev';
  const guardScript=document.currentScript;
  const rootUrl=new URL('./',guardScript?.src||location.href);
  const NAV_VERSION='20260915-access1';

  const now=Date.now();
  const adminActive=Number(localStorage.getItem(ADMIN_EXPIRES_KEY)||0)>now;
  const emergencyActive=Number(localStorage.getItem(EMERGENCY_EXPIRES_KEY)||0)>now;
  const workerActive=Boolean(localStorage.getItem(WORKER_TOKEN_KEY))&&Number(localStorage.getItem(WORKER_EXPIRES_KEY)||0)>now;
  let toolsToken='';
  let toolsExpiry=0;
  try{
    toolsToken=sessionStorage.getItem(TOOLS_TOKEN_KEY)||'';
    toolsExpiry=Number(sessionStorage.getItem(TOOLS_EXPIRES_KEY)||0);
  }catch(_e){}
  const toolsActive=Boolean(toolsToken)&&toolsExpiry>now;
  const authenticated=adminActive||emergencyActive||workerActive||toolsActive;

  const rootPath=rootUrl.pathname.endsWith('/')?rootUrl.pathname:rootUrl.pathname+'/';
  const relativePath=location.pathname.startsWith(rootPath)?location.pathname.slice(rootPath.length):'';
  const toolsAllowedPath=['cards/','programs/','qr/'].some(prefix=>relativePath===prefix.slice(0,-1)||relativePath.startsWith(prefix));

  const access=(guardScript?.dataset?.access||'admin').toLowerCase();
  const toolsMayEnter=toolsActive&&toolsAllowedPath;
  const allowed=access==='public'
    ||(access==='authenticated'&&authenticated)
    ||(access==='worker'&&(adminActive||emergencyActive||workerActive))
    ||(access==='tools'&&(adminActive||emergencyActive||toolsMayEnter))
    ||(access==='admin'&&(adminActive||emergencyActive||toolsMayEnter));

  if(!allowed){
    try{sessionStorage.setItem('mytool_blocked_path',location.pathname+location.search+location.hash)}catch(_e){}
    location.replace(rootUrl.href);
    return;
  }

  const toolsGate=toolsMayEnter&&!adminActive&&!emergencyActive;
  if(toolsGate){
    document.documentElement.style.visibility='hidden';
    fetch(ACCESS_API+'/v1/session',{
      headers:{Authorization:'Bearer '+toolsToken,Accept:'application/json'},
      cache:'no-store'
    }).then(async response=>{
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok||data.role!=='tools')throw new Error('TOOLS_SESSION_INVALID');
      document.documentElement.style.visibility='';
    }).catch(()=>{
      try{sessionStorage.removeItem(TOOLS_TOKEN_KEY);sessionStorage.removeItem(TOOLS_EXPIRES_KEY)}catch(_e){}
      try{sessionStorage.setItem('mytool_blocked_path',location.pathname+location.search+location.hash)}catch(_e){}
      location.replace(rootUrl.href);
    });
  }

  window.MyToolAccessContext=Object.freeze({access,adminActive,emergencyActive,workerActive,toolsActive,authenticated,rootUrl:rootUrl.href});
  if(guardScript?.dataset?.nav==='off')return;

  if(!document.querySelector('link[data-mytool-bottom-nav]')){
    const link=document.createElement('link');
    link.rel='stylesheet';link.href=new URL('mytool-bottom-nav.css?v='+NAV_VERSION,rootUrl).href;link.dataset.mytoolBottomNav='1';document.head.appendChild(link);
  }
  if(!document.querySelector('script[data-mytool-bottom-nav]')){
    const nav=document.createElement('script');
    nav.src=new URL('mytool-bottom-nav.js?v='+NAV_VERSION,rootUrl).href;nav.defer=true;nav.dataset.mytoolBottomNav='1';nav.dataset.root=rootUrl.href;document.head.appendChild(nav);
  }
})();
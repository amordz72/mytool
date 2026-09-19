(() => {
  'use strict';

  const ADMIN_EXPIRES_KEY='mytool_admin_expires_at';
  const EMERGENCY_EXPIRES_KEY='mytool_emergency_admin_expires_at';
  const WORKER_TOKEN_KEY='mytool_shop_worker_token';
  const WORKER_EXPIRES_KEY='mytool_shop_worker_expires_at';
  const WORKSPACE_ROLE_KEY='mytool_workspace_role';
  const WORKSPACE_CODE_KEY='mytool_workspace_code';
  const TOOLS_TOKEN_KEY='mytool_tools_access_token';
  const TOOLS_EXPIRES_KEY='mytool_tools_access_expires_at';
  const TOOLS_TYPE_KEY='mytool_tools_access_type';
  const ACCESS_API='https://mytool-access.dzamor72.workers.dev';
  const guardScript=document.currentScript;
  const rootUrl=new URL('./',guardScript?.src||location.href);
  const NAV_VERSION='20260917-continuity-2';

  function readTools(storage,now){
    try{
      const token=storage.getItem(TOOLS_TOKEN_KEY)||'';
      const expiry=Number(storage.getItem(TOOLS_EXPIRES_KEY)||0);
      const accessType=storage.getItem(TOOLS_TYPE_KEY)||'client';
      return {storage,token,expiry,accessType,active:Boolean(token)&&expiry>now};
    }catch(_e){return {storage:null,token:'',expiry:0,accessType:'client',active:false}}
  }

  function resolveAccessContext(){
    const now=Date.now();
    const ownerActive=Number(localStorage.getItem(ADMIN_EXPIRES_KEY)||0)>now;
    const emergencyActive=Number(localStorage.getItem(EMERGENCY_EXPIRES_KEY)||0)>now;
    const workerToken=localStorage.getItem(WORKER_TOKEN_KEY)||'';
    const workerExpiry=Number(localStorage.getItem(WORKER_EXPIRES_KEY)||0);
    const workerSessionActive=Boolean(workerToken)&&workerExpiry>now;
    const workspaceCode=localStorage.getItem(WORKSPACE_CODE_KEY)||'';
    const workspaceRole=localStorage.getItem(WORKSPACE_ROLE_KEY)||'';
    const workspaceActive=workerSessionActive&&Boolean(workspaceCode);
    const workspaceAdminActive=workspaceActive&&workspaceRole==='workspace_admin';
    const workspaceWorkerActive=workspaceActive&&!workspaceAdminActive;
    const workerActive=workerSessionActive&&!workspaceActive;

    const tabTools=readTools(sessionStorage,now);
    const savedTools=readTools(localStorage,now);
    const toolsState=tabTools.active?tabTools:(savedTools.active?savedTools:{storage:null,token:'',expiry:0,accessType:'client',active:false});
    const toolsActive=toolsState.active;
    const adminLike=ownerActive||emergencyActive||workspaceAdminActive;
    const workerLike=workerActive||workspaceWorkerActive;
    const authenticated=adminLike||workerLike||toolsActive;
    const role=ownerActive?'owner':emergencyActive?'emergency_admin':workspaceAdminActive?'workspace_admin':workspaceWorkerActive?'workspace_worker':workerActive?'worker':toolsActive?'tools':'anonymous';

    return Object.freeze({
      now,role,ownerActive,adminActive:adminLike,emergencyActive,workspaceAdminActive,workspaceWorkerActive,workspaceActive,workspaceRole,workspaceCode,
      workerActive,workerLike,workerSessionActive,toolsActive,toolsToken:toolsState.token,toolsExpiry:toolsState.expiry,
      toolsAccessType:toolsState.accessType,toolsStorage:toolsState.storage,adminLike,authenticated,rootUrl:rootUrl.href
    });
  }

  window.MyToolAccess=Object.freeze({resolve:resolveAccessContext});
  const context=resolveAccessContext();

  const rootPath=rootUrl.pathname.endsWith('/')?rootUrl.pathname:rootUrl.pathname+'/';
  const relativePath=location.pathname.startsWith(rootPath)?location.pathname.slice(rootPath.length):'';
  const toolsAllowedPath=['cards/','programs/','qr/'].some(prefix=>relativePath===prefix.slice(0,-1)||relativePath.startsWith(prefix));
  const declaredAccess=(guardScript?.dataset?.access||'admin').toLowerCase();
  const ownerOnlyPath=relativePath==='access-admin'||relativePath.startsWith('access-admin/');
  const access=ownerOnlyPath?'owner':declaredAccess;
  const toolsMayEnter=context.toolsActive&&toolsAllowedPath;
  const allowed=access==='public'
    ||(access==='authenticated'&&context.authenticated)
    ||(access==='worker'&&(context.adminLike||context.workerLike))
    ||(access==='tools'&&(context.adminLike||toolsMayEnter))
    ||(access==='admin'&&(context.adminLike||toolsMayEnter))
    ||(access==='owner'&&context.ownerActive);

  if(!allowed){
    try{sessionStorage.setItem('mytool_blocked_path',location.pathname+location.search+location.hash)}catch(_e){}
    location.replace(rootUrl.href);return;
  }

  function clearToolsSession(){
    [sessionStorage,localStorage].forEach(storage=>{try{storage.removeItem(TOOLS_TOKEN_KEY);storage.removeItem(TOOLS_EXPIRES_KEY);storage.removeItem(TOOLS_TYPE_KEY)}catch(_e){}});
  }

  const toolsGate=toolsMayEnter&&!context.adminLike;
  if(toolsGate){
    document.documentElement.style.visibility='hidden';
    fetch(ACCESS_API+'/v1/session',{headers:{Authorization:'Bearer '+context.toolsToken,Accept:'application/json'},cache:'no-store'}).then(async response=>{
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok||data.role!=='tools'){
        const error=new Error('TOOLS_SESSION_INVALID');
        error.confirmedInvalid=true;
        throw error;
      }
      document.documentElement.style.visibility='';
    }).catch(error=>{
      const personalFallback=context.toolsAccessType==='personal'&&context.toolsExpiry>Date.now()&&!error?.confirmedInvalid;
      if(personalFallback){
        // Keep the approved personal device usable during a transient connection failure.
        document.documentElement.style.visibility='';
        return;
      }
      clearToolsSession();
      try{sessionStorage.setItem('mytool_blocked_path',location.pathname+location.search+location.hash)}catch(_e){}
      location.replace(rootUrl.href);
    });
  }

  window.MyToolAccessContext=Object.freeze({...context,access,declaredAccess,toolsMayEnter});
  if(guardScript?.dataset?.nav==='off')return;

  if(!document.querySelector('link[data-mytool-bottom-nav]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('mytool-bottom-nav.css?v='+NAV_VERSION,rootUrl).href;link.dataset.mytoolBottomNav='1';document.head.appendChild(link);
  }
  if(!document.querySelector('script[data-mytool-bottom-nav]')){
    const nav=document.createElement('script');nav.src=new URL('mytool-bottom-nav.js?v='+NAV_VERSION,rootUrl).href;nav.defer=true;nav.dataset.mytoolBottomNav='1';nav.dataset.root=rootUrl.href;document.head.appendChild(nav);
  }
  if(!document.querySelector('script[data-mytool-bottom-nav-space]')){
    const space=document.createElement('script');space.src=new URL('mytool-bottom-nav-space.js?v='+NAV_VERSION,rootUrl).href;space.defer=true;space.dataset.mytoolBottomNavSpace='1';space.dataset.root=rootUrl.href;document.head.appendChild(space);
  }
})();
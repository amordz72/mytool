/* MyTool Shared App Shell
 * One source for header, navigation and mobile drawer.
 * Page files own only their business content and permissions data.
 */
(function(){
  'use strict';

  const SUPABASE_URL='https://wqyebqzbbpohbnznqdjj.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY='sb_publishable_gO4umNBMJ0AWRk19HtKd7A_9X4DibYj';
  async function requestLogout(){
    const token=localStorage.getItem('mytool_shop_worker_token')||'';
    try{
      if(token){
        await fetch(SUPABASE_URL+'/rest/v1/rpc/worker_logout',{method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({p_session_token:token})});
      }else{
        const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
        await createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY).auth.signOut();
      }
    }catch(_error){}
    ['mytool_shop_worker_token','mytool_shop_worker_expires_at','mytool_shop_worker_nickname'].forEach(key=>localStorage.removeItem(key));
    location.replace('../');
  }
  function bindLogout(target){target?.querySelectorAll('.shell-logout').forEach(button=>button.addEventListener('click',requestLogout))}
  function setDrawerOpen(open){document.documentElement.classList.toggle('shell-drawer-open',!!open);document.body?.classList.toggle('shell-drawer-open',!!open)}
  function bindDrawer(target){
    const drawer=target?.querySelector('#drawer'),overlay=target?.querySelector('#drawerOverlay'),open=target?.querySelector('#drawerOpen'),close=target?.querySelector('#drawerClose');
    if(!drawer||!overlay||!open||!close)return;
    const hide=()=>{drawer.classList.add('drawer-hidden');overlay.classList.add('drawer-hidden');setDrawerOpen(false)};
    open.onclick=()=>{drawer.classList.remove('drawer-hidden');overlay.classList.remove('drawer-hidden');setDrawerOpen(true)};
    close.onclick=hide;overlay.onclick=hide;
  }


  function routeItems(options,placement){
    if(!window.ShopRoutes)throw new Error('ShopRoutes must load before ShopShell');
    return window.ShopRoutes.list({role:options?.role||'admin',permissions:options?.permissions||{}},placement);
  }
  const active=(key,current)=>key===current?' active':'';
  function routeAnchor(route,current,variant){
    const label=variant==='top'?(route.shortLabel||route.label):route.label;
    const icon=variant==='drawer'?'<span class="ico">'+route.icon+'</span>':'';
    const classes=variant==='drawer'?'side-link drawer-link':'';
    return '<a class="'+classes+active(route.id,current)+'" href="'+route.path+'">'+icon+'<span>'+label+'</span></a>';
  }
  function routeLinks(options,placement,variant){
    const current=options?.active||'',items=routeItems(options,placement);
    if(variant!=='drawer')return items.map(route=>routeAnchor(route,current,variant)).join('');
    const order=['general','operations','inventory','money','admin'];
    return order.map(group=>{
      const children=items.filter(route=>route.group===group);if(!children.length)return '';
      const opened=children.some(route=>route.id===current)?' open':'';
      const label=window.ShopRoutes.groups[group]||group;
      return '<details class="shell-nav-group"'+opened+'><summary>'+label+'</summary><div class="shell-nav-group-links">'+children.map(route=>routeAnchor(route,current,'drawer')).join('')+'</div></details>';
    }).join('');
  }
  function canonicalHeader(options){
    const identityId=options?.identityId||'',role=options?.role||'admin';
    const badge=role==='worker'?'عامل':'إدارة';
    const identity=role==='worker'?'جاري التحقق من الجلسة…':'إدارة';
    const buttonId=options?.drawerButtonId?' id="'+options.drawerButtonId+'"':'';
    return '<header class="shop-topbar shell-canonical-header"><div class="topbar-title"><div class="topbar-logo">MT</div><div class="topbar-copy"><h1>MyTool — حساب المحل</h1><div class="muted shell-identity"'+(identityId?' id="'+identityId+'"':'')+'>'+identity+'</div></div><span class="pill shell-role-badge">'+badge+'</span><button'+buttonId+' class="btn secondary menu-toggle mobile-only" type="button" aria-label="فتح القائمة">☰</button></div><div class="topbar-actions desktop-only"><a class="btn secondary" href="../" style="text-decoration:none">MyTool</a><button class="btn secondary" type="button" data-shell-action="refresh">تحديث</button><button class="btn secondary" type="button" data-shell-action="logout">خروج</button></div></header>';
  }

  function emit(name){window.dispatchEvent(new CustomEvent('shop-shell:'+name))}
  function bindAdminShell(){
    const sidebar=document.querySelector('#sharedAdminSidebar .shared-admin-drawer');
    const overlay=document.querySelector('#sharedAdminSidebar .shared-admin-overlay');
    const close=()=>{sidebar?.classList.remove('open');overlay?.classList.remove('open');setDrawerOpen(false)};
    document.querySelector('#sharedAdminTop .menu-toggle')?.addEventListener('click',()=>{sidebar?.classList.add('open');overlay?.classList.add('open');setDrawerOpen(true)});
    overlay?.addEventListener('click',close);
    document.querySelectorAll('#sharedAdminSidebar a').forEach(a=>a.addEventListener('click',close));
    document.querySelectorAll('[data-shell-action="refresh"]').forEach(b=>b.addEventListener('click',()=>location.reload()));
    document.querySelectorAll('[data-shell-action="logout"]').forEach(b=>b.addEventListener('click',requestLogout));
  }

  function mountAdminSidebar(targetId,options){
    const target=document.getElementById(targetId);if(!target||target.dataset.mounted)return;
    target.dataset.mounted='1';
    const current=options?.active||'index';
    const links=routeLinks({...options,active:current},'drawer','drawer');
    target.innerHTML=`
      <div class="shared-admin-overlay"></div>
      <aside class="shared-admin-drawer">
        <div class="side-brand"><div class="brand-mark">MT</div><div><strong>MyTool</strong><small>إدارة المحل</small></div></div>
        <nav class="side-nav">${links}
          <button class="side-link" data-shell-action="refresh"><span class="ico">↻</span><span>تحديث البيانات</span></button>
        </nav>
        <div class="side-spacer"></div>
        <div class="side-footer">
          <div class="side-user">حساب الإدارة</div>
          <button class="side-link" data-shell-action="logout"><span class="ico">⇥</span><span>تسجيل الخروج</span></button>
        </div>
      </aside>`;
  }

  function mountAdminTop(targetId,options){
    const target=document.getElementById(targetId);if(!target||target.dataset.mounted)return;
    target.dataset.mounted='1';
    const current=options?.active||'index';
    const nav=routeLinks({...options,role:'admin',active:current},'top','top');
    target.innerHTML=canonicalHeader({role:'admin'})+'<nav class="unified-nav" aria-label="التنقل الرئيسي">'+nav+'</nav>';
  }

  function watchAdmin(options){
    const tryMount=()=>{
      const side=document.getElementById('sharedAdminSidebar'),top=document.getElementById('sharedAdminTop');
      if(!side||!top)return false;
      mountAdminSidebar('sharedAdminSidebar',options);mountAdminTop('sharedAdminTop',options);bindAdminShell();return true;
    };
    if(tryMount())return;
    const observer=new MutationObserver(()=>{if(tryMount())observer.disconnect()});
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }

  function mountStandalone(targetId,options){
    const target=document.getElementById(targetId);if(!target)return;
    const current=options?.active||'',role=options?.role||'admin';
    const links=routeLinks({...options,role,active:current},'drawer','drawer');
    const nav=routeLinks({...options,role,active:current},'top','top');
    target.innerHTML='<div id="drawerOverlay" class="drawer-overlay drawer-hidden"></div><aside id="drawer" class="drawer drawer-hidden"><div class="drawer-head"><strong>قائمة حساب المحل</strong><button id="drawerClose" class="drawer-close" type="button">×</button></div><nav id="drawerLinks" class="drawer-links">'+links+'</nav><button class="shell-logout drawer-logout" type="button">تسجيل الخروج</button></aside>'+canonicalHeader({role,identityId:'standaloneIdentity',drawerButtonId:'drawerOpen'})+'<nav class="shared-screen-nav unified-nav" aria-label="التنقل الرئيسي">'+nav+'</nav>';
    bindLogout(target);bindDrawer(target);
  }

  function mountOperationTop(targetId){
    const target=document.getElementById(targetId);if(!target)return;
    target.innerHTML='<div id="drawerOverlay" class="drawer-overlay drawer-hidden"></div><aside id="drawer" class="drawer drawer-hidden"><div class="drawer-head"><strong>قائمة حساب المحل</strong><button id="drawerClose" class="drawer-close" type="button">×</button></div><nav id="drawerLinks" class="drawer-links"></nav><button class="shell-logout drawer-logout" type="button">تسجيل الخروج</button></aside>'+canonicalHeader({role:'worker',identityId:'identityText',drawerButtonId:'drawerOpen'});
    bindLogout(target);bindDrawer(target);
  }

  function mountOperationNav(targetId){
    const target=document.getElementById(targetId);if(!target)return;
    target.innerHTML='<nav id="screenNav" class="screen-nav unified-nav"></nav>';
  }

  function mountDailyTop(targetId){
    const target=document.getElementById(targetId);if(!target)return;
    target.innerHTML='<div id="drawerOverlay" class="drawer-overlay drawer-hidden"></div><aside id="drawer" class="drawer drawer-hidden"><div class="drawer-head"><strong>قائمة حساب المحل</strong><button id="drawerClose" class="drawer-close" type="button">×</button></div><nav id="drawerLinks" class="drawer-links"></nav><button class="shell-logout drawer-logout" type="button">تسجيل الخروج</button></aside>'+canonicalHeader({role:'worker',identityId:'identity',drawerButtonId:'drawerOpen'});
    bindLogout(target);bindDrawer(target);
  }

  function mountRoleNavigation(context,current){
    const options={role:context?.role||'admin',permissions:context?.permissions||{},active:current||document.body.dataset.screen||'daily'};
    const screen=document.getElementById('screenNav');
    const drawer=document.getElementById('drawerLinks');
    const top=routeLinks(options,'top','top');
    const side=routeLinks(options,'drawer','drawer');
    if(screen)screen.innerHTML=top;
    if(drawer)drawer.innerHTML=side;
    document.querySelectorAll('.shell-role-badge').forEach(el=>el.textContent=options.role==='worker'?'عامل':'إدارة');
    if(options.role==='admin')document.querySelectorAll('.shell-identity').forEach(el=>el.textContent='إدارة');
    return {top:routeItems(options,'top').length,drawer:routeItems(options,'drawer').length};
  }

  window.ShopShell={watchAdmin,mountAdminSidebar,mountAdminTop,mountStandalone,mountOperationTop,mountOperationNav,mountDailyTop,mountRoleNavigation,requestLogout};
})();
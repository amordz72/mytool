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
  function bindDrawer(target){
    const drawer=target?.querySelector('#drawer'),overlay=target?.querySelector('#drawerOverlay'),open=target?.querySelector('#drawerOpen'),close=target?.querySelector('#drawerClose');
    if(!drawer||!overlay||!open||!close)return;
    const hide=()=>{drawer.classList.add('drawer-hidden');overlay.classList.add('drawer-hidden')};
    open.onclick=()=>{drawer.classList.remove('drawer-hidden');overlay.classList.remove('drawer-hidden')};
    close.onclick=hide;overlay.onclick=hide;
  }


  function routeItems(options,placement){
    if(!window.ShopRoutes)throw new Error('ShopRoutes must load before ShopShell');
    return window.ShopRoutes.list({role:options?.role||'admin',permissions:options?.permissions||{}},placement);
  }
  const active=(key,current)=>key===current?' active':'';
  function routeLinks(options,placement,variant){
    const current=options?.active||'';
    return routeItems(options,placement).map(route=>{
      const label=variant==='top'?(route.shortLabel||route.label):route.label;
      const icon=variant==='drawer'?'<span class="ico">'+route.icon+'</span>':'';
      return '<a class="'+(variant==='drawer'?'side-link':'')+active(route.id,current)+'" href="'+route.path+'">'+icon+'<span>'+label+'</span></a>';
    }).join('');
  }

  function emit(name){window.dispatchEvent(new CustomEvent('shop-shell:'+name))}
  function bindAdminShell(){
    const sidebar=document.querySelector('#sharedAdminSidebar .shared-admin-drawer');
    const overlay=document.querySelector('#sharedAdminSidebar .shared-admin-overlay');
    document.querySelector('#sharedAdminTop .menu-toggle')?.addEventListener('click',()=>{sidebar?.classList.add('open');overlay?.classList.add('open')});
    overlay?.addEventListener('click',()=>{sidebar?.classList.remove('open');overlay?.classList.remove('open')});
    document.querySelectorAll('#sharedAdminSidebar a').forEach(a=>a.addEventListener('click',()=>{sidebar?.classList.remove('open');overlay?.classList.remove('open')}));
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
          <a class="side-link" href="../"><span class="ico">↩</span><span>رئيسية MyTool</span></a>
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
    const current=options?.active||'index',title=options?.title||'حساب المحل';
    const nav=routeLinks({...options,active:current},'top','top');
    target.innerHTML=`
      <header class="shop-topbar">
        <div class="topbar-title">
          <div class="topbar-logo">MT</div>
          <div class="topbar-copy"><h1>${title}</h1><div class="muted">لوحة الإدارة</div></div>
          <span class="pill">إدارة</span>
          <button class="btn secondary menu-toggle mobile-only" type="button" aria-label="فتح القائمة">☰</button>
        </div>
        <div class="topbar-actions desktop-only">
          <a class="btn secondary" href="../" style="text-decoration:none">MyTool</a>
          <button class="btn secondary" type="button" data-shell-action="refresh">تحديث</button>
          <button class="btn secondary" type="button" data-shell-action="logout">خروج</button>
        </div>
      </header>
      <nav class="unified-nav" aria-label="التنقل الرئيسي">${nav}</nav>`;
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
    const current=options?.active||'',title=options?.title||'حساب المحل',subtitle=options?.subtitle||'لوحة الإدارة';
    const links=routeLinks({...options,active:current},'drawer','drawer');
    const nav=routeLinks({...options,active:current},'top','top');
    target.innerHTML=`
      <div class="shared-standalone">
        <div class="drawer-overlay drawer-hidden"></div>
        <aside class="drawer drawer-hidden"><div class="drawer-head"><strong>قائمة حساب المحل</strong><button class="drawer-close" type="button">×</button></div><nav class="drawer-links">${links}</nav><button class="shell-logout drawer-logout" type="button">تسجيل الخروج</button></aside>
        <header class="shared-standalone-top">
          <div class="shared-brand"><div class="shared-logo">MT</div><div><h1>${title}</h1><div class="shared-subtitle">${subtitle}</div></div></div>
          <button class="drawer-btn" type="button" aria-label="فتح القائمة">☰</button>
        </header>
        <nav class="shared-screen-nav" aria-label="التنقل الرئيسي">${nav}</nav>
      </div>`;
    const drawer=target.querySelector('.drawer'),overlay=target.querySelector('.drawer-overlay');
    const close=()=>{drawer.classList.add('drawer-hidden');overlay.classList.add('drawer-hidden')};
    target.querySelector('.drawer-btn').addEventListener('click',()=>{drawer.classList.remove('drawer-hidden');overlay.classList.remove('drawer-hidden')});
    target.querySelector('.drawer-close').addEventListener('click',close);overlay.addEventListener('click',close);bindLogout(target);
  }

  function mountOperationTop(targetId){
    const target=document.getElementById(targetId);if(!target)return;
    target.innerHTML=`
      <div id="drawerOverlay" class="drawer-overlay drawer-hidden"></div>
      <aside id="drawer" class="drawer drawer-hidden"><div class="drawer-head"><strong>قائمة حساب المحل</strong><button id="drawerClose" class="drawer-close" type="button">×</button></div><nav id="drawerLinks" class="drawer-links"></nav><button class="shell-logout drawer-logout" type="button">تسجيل الخروج</button></aside>
      <div class="topbar">
        <div class="brand"><div class="logo">MT</div><div><strong>MyTool — حساب المحل</strong><div class="muted" id="identityText">جاري التحقق من الجلسة…</div></div></div>
        <div class="top-actions"><a id="shopHomeLink" href="daily.html">الرئيسية</a><a id="myToolLink" class="hidden" href="../">MyTool</a></div>
        <button id="drawerOpen" class="drawer-btn" type="button" aria-label="فتح القائمة">☰</button>
      </div>`;
    bindLogout(target);bindDrawer(target);
  }

  function mountOperationNav(targetId){
    const target=document.getElementById(targetId);if(!target)return;
    target.innerHTML=`
      <div id="adminModeBar" class="mode-bar hidden"><strong>الوضع الحالي:</strong><span id="modeCurrentText" class="mode-choice active"></span><a class="mode-choice" href="settings.html" style="text-decoration:none">تغييره من الإعدادات</a></div>
      <nav id="screenNav" class="screen-nav"></nav>`;
  }

  function mountDailyTop(targetId){
    const target=document.getElementById(targetId);if(!target)return;
    target.innerHTML=`
      <div id="drawerOverlay" class="drawer-overlay drawer-hidden"></div>
      <aside id="drawer" class="drawer drawer-hidden"><div class="drawer-head"><strong>قائمة حساب المحل</strong><button id="drawerClose" class="drawer-close" type="button">×</button></div><nav id="drawerLinks" class="drawer-links"></nav><button class="shell-logout drawer-logout" type="button">تسجيل الخروج</button></aside>
      <div class="top"><div class="daily-brand"><div class="daily-logo" aria-hidden="true">MT</div><div><h1>الرئيسية</h1><div id="identity" class="identity">جاري التحقق…</div></div></div><button id="drawerOpen" class="drawer-btn" type="button" aria-label="فتح القائمة">☰</button></div>`;
    bindLogout(target);
  }

  function mountRoleNavigation(context,current){
    const options={role:context?.role||'admin',permissions:context?.permissions||{},active:current||document.body.dataset.screen||'daily'};
    const screen=document.getElementById('screenNav');
    const drawer=document.getElementById('drawerLinks');
    const top=routeLinks(options,'top','top');
    const side=routeLinks(options,'drawer','drawer');
    if(screen)screen.innerHTML=top;
    if(drawer)drawer.innerHTML=side;
    return {top:routeItems(options,'top').length,drawer:routeItems(options,'drawer').length};
  }

  window.ShopShell={watchAdmin,mountAdminSidebar,mountAdminTop,mountStandalone,mountOperationTop,mountOperationNav,mountDailyTop,mountRoleNavigation,requestLogout};
})();
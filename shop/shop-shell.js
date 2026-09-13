/* MyTool Shared App Shell
 * One source for header, navigation and mobile drawer.
 * Page files own only their business content and permissions data.
 */
(function(){
  'use strict';

  const adminItems=[
    ['index','index.html','⌂','لوحة التحكم'],
    ['sale','sale.html','＋','تسجيل بيع'],
    ['stock','stock.html','▦','المخزون'],
    ['products','products.html','◇','المنتجات'],
    ['physical','physical-inventory.html','✓','الجرد الفعلي'],
    ['opening','opening-stock.html','◉','الجرد الافتتاحي'],
    ['notes','../notes/','📝','صندوق الملاحظات'],
    ['users','users.html','♙','المستخدمون'],
    ['settings','settings.html','⚙','الإعدادات']
  ];
  const topItems=[
    ['index','index.html','الرئيسية'],
    ['sale','sale.html','بيع'],
    ['stock','stock.html','المخزون'],
    ['products','products.html','المنتجات'],
    ['users','users.html','المستخدمون'],
    ['settings','settings.html','الإعدادات']
  ];
  const active=(key,current)=>key===current?' active':'';

  function emit(name){window.dispatchEvent(new CustomEvent('shop-shell:'+name))}
  function bindAdminShell(){
    const sidebar=document.querySelector('#sharedAdminSidebar .sidebar');
    const overlay=document.querySelector('#sharedAdminSidebar .mobile-overlay');
    document.querySelector('#sharedAdminTop .menu-toggle')?.addEventListener('click',()=>sidebar?.classList.add('open'));
    overlay?.addEventListener('click',()=>sidebar?.classList.remove('open'));
    document.querySelectorAll('#sharedAdminSidebar a').forEach(a=>a.addEventListener('click',()=>sidebar?.classList.remove('open')));
    document.querySelectorAll('[data-shell-action="refresh"]').forEach(b=>b.addEventListener('click',()=>location.reload()));
    document.querySelectorAll('[data-shell-action="logout"]').forEach(b=>b.addEventListener('click',()=>emit('logout')));
  }

  function mountAdminSidebar(targetId,options){
    const target=document.getElementById(targetId);if(!target||target.dataset.mounted)return;
    target.dataset.mounted='1';
    const current=options?.active||'index';
    const links=adminItems.map(([key,href,icon,label])=>
      `<a class="side-link${active(key,current)}" href="${href}"><span class="ico">${icon}</span><span>${label}</span></a>`
    ).join('');
    target.innerHTML=`
      <div class="mobile-overlay"></div>
      <aside class="sidebar">
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
    const nav=topItems.map(([key,href,label])=>`<a class="${key===current?'active':''}" href="${href}">${label}</a>`).join('');
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

  function mountOperationTop(targetId){
    const target=document.getElementById(targetId);if(!target)return;
    target.innerHTML=`
      <div id="drawerOverlay" class="drawer-overlay drawer-hidden"></div>
      <aside id="drawer" class="drawer drawer-hidden"><div class="drawer-head"><strong>قائمة حساب المحل</strong><button id="drawerClose" class="drawer-close" type="button">×</button></div><nav id="drawerLinks" class="drawer-links"></nav></aside>
      <div class="topbar">
        <div class="brand"><div class="logo">MT</div><div><strong>MyTool — حساب المحل</strong><div class="muted" id="identityText">جاري التحقق من الجلسة…</div></div></div>
        <div class="top-actions"><a id="shopHomeLink" href="daily.html">الرئيسية</a><a id="myToolLink" class="hidden" href="../">MyTool</a></div>
        <button id="drawerOpen" class="drawer-btn" type="button" aria-label="فتح القائمة">☰</button>
      </div>`;
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
      <aside id="drawer" class="drawer drawer-hidden"><div class="drawer-head"><strong>قائمة حساب المحل</strong><button id="drawerClose" class="drawer-close" type="button">×</button></div><nav id="drawerLinks" class="drawer-links"></nav></aside>
      <div class="top"><div class="daily-brand"><div class="daily-logo" aria-hidden="true">MT</div><div><h1>الرئيسية</h1><div id="identity" class="identity">جاري التحقق…</div></div></div><button id="drawerOpen" class="drawer-btn" type="button" aria-label="فتح القائمة">☰</button></div>`;
  }

  window.ShopShell={watchAdmin,mountAdminSidebar,mountAdminTop,mountOperationTop,mountOperationNav,mountDailyTop};
})();
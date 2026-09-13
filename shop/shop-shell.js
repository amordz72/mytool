/* MyTool Shared App Shell
 * One source for header, navigation and mobile drawer.
 * Page files own only their business content and permissions data.
 */
(function(){
  'use strict';

  const adminItems=[
    ['index','index.html','⌂','لوحة التحكم',"true"],
    ['sale','sale.html','＋','تسجيل بيع',"can('sell')"],
    ['stock','stock.html','▦','المخزون',"can('view_stock')"],
    ['products','products.html','◇','المنتجات',"can('manage_products')"],
    ['physical','physical-inventory.html','✓','الجرد الفعلي',"userMode==='admin'"],
    ['opening','opening-stock.html','◉','الجرد الافتتاحي',"userMode==='admin'"],
    ['notes','../notes/','📝','صندوق الملاحظات',"userMode==='admin'"],
    ['users','users.html','♙','المستخدمون',"userMode==='admin'"],
    ['settings','settings.html','⚙','الإعدادات',"userMode==='admin'"]
  ];
  const topItems=[
    ['index','index.html','الرئيسية',"true"],
    ['sale','sale.html','بيع',"can('sell')"],
    ['stock','stock.html','المخزون',"userMode==='admin' || can('view_stock')"],
    ['products','products.html','المنتجات',"userMode==='admin'"],
    ['users','users.html','المستخدمون',"userMode==='admin'"],
    ['settings','settings.html','الإعدادات',"userMode==='admin'"]
  ];
  const active=(key,current)=>key===current?' active':'';
  const vif=condition=>condition==='true'?'':` v-if="${condition}"`;

  function mountAdminSidebar(targetId,options){
    const target=document.getElementById(targetId);if(!target)return;
    const current=options?.active||'index';
    const links=adminItems.map(([key,href,icon,label,condition])=>
      `<a${vif(condition)} class="side-link${active(key,current)}" href="${href}" @click="sidebarOpen=false"><span class="ico">${icon}</span><span>${label}</span></a>`
    ).join('');
    target.innerHTML=`
      <div v-if="sidebarOpen" class="mobile-overlay" @click="sidebarOpen=false"></div>
      <aside class="sidebar" :class="{open:sidebarOpen}">
        <div class="side-brand"><div class="brand-mark">MT</div><div><strong>MyTool</strong><small>إدارة المحل</small></div></div>
        <nav class="side-nav">${links}
          <button class="side-link" @click="loadAll();sidebarOpen=false" :disabled="busy"><span class="ico">↻</span><span>تحديث البيانات</span></button>
          <a class="side-link" href="../"><span class="ico">↩</span><span>رئيسية MyTool</span></a>
        </nav>
        <div class="side-spacer"></div>
        <div class="side-footer">
          <div class="side-user">{{ userMode==='admin' ? 'حساب الإدارة' : ('الخدام: '+workerNickname) }}</div>
          <button class="side-link" @click="logout"><span class="ico">⇥</span><span>تسجيل الخروج</span></button>
        </div>
      </aside>`;
  }

  function mountAdminTop(targetId,options){
    const target=document.getElementById(targetId);if(!target)return;
    const current=options?.active||'index',title=options?.title||'حساب المحل';
    const nav=topItems.map(([key,href,label,condition])=>
      `<a${vif(condition)} class="${key===current?'active':''}" href="${href}">${label}</a>`
    ).join('');
    target.innerHTML=`
      <header class="shop-topbar">
        <div class="topbar-title">
          <div class="topbar-logo">MT</div>
          <div class="topbar-copy"><h1>${title}</h1><div class="muted">{{ userMode==='admin' ? 'لوحة الإدارة' : ('مرحبًا '+workerNickname) }}</div></div>
          <span class="pill">{{ userMode==='admin' ? 'إدارة' : 'خدام' }}</span>
          <button class="btn secondary menu-toggle mobile-only" @click="sidebarOpen=true" aria-label="فتح القائمة">☰</button>
        </div>
        <div class="topbar-actions desktop-only">
          <a class="btn secondary" href="../" style="text-decoration:none">MyTool</a>
          <button class="btn secondary" @click="loadAll" :disabled="busy">تحديث</button>
          <button class="btn secondary" @click="logout">خروج</button>
        </div>
      </header>
      <nav class="unified-nav" aria-label="التنقل الرئيسي">${nav}</nav>`;
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

  window.ShopShell={mountAdminSidebar,mountAdminTop,mountOperationTop,mountOperationNav,mountDailyTop};
})();
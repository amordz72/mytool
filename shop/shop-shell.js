/* MyTool Shared App Shell
 * One source for header, navigation and mobile drawer.
 * Page files own only their business content and permissions data.
 */
(function(){
  'use strict';

  const shellScript=document.currentScript;
  const myToolRoot=new URL('../',shellScript?.src||location.href);
  function loadMyToolBottomNav(){
    if(!document.querySelector('link[data-mytool-bottom-nav]')){
      const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('mytool-bottom-nav.css?v=20260916-3',myToolRoot).href;link.dataset.mytoolBottomNav='1';document.head.appendChild(link);
    }
    if(!document.querySelector('script[data-mytool-bottom-nav]')){
      const nav=document.createElement('script');nav.src=new URL('mytool-bottom-nav.js?v=20260916-3',myToolRoot).href;nav.defer=true;nav.dataset.mytoolBottomNav='1';nav.dataset.root=myToolRoot.href;nav.dataset.app='shop';document.head.appendChild(nav);
    }
  }

  const SUPABASE_URL='https://wqyebqzbbpohbnznqdjj.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY='sb_publishable_gO4umNBMJ0AWRk19HtKd7A_9X4DibYj';
  window.ShopApiConfig=Object.freeze({url:SUPABASE_URL,key:SUPABASE_PUBLISHABLE_KEY});
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

  function routeItems(options,placement){if(!window.ShopRoutes)throw new Error('ShopRoutes must load before ShopShell');return window.ShopRoutes.list({role:options?.role||'admin',permissions:options?.permissions||{}},placement)}
  const active=(key,current)=>key===current?' active':'';
  function routeAnchor(route,current,variant){const label=variant==='top'?(route.shortLabel||route.label):route.label;const icon=variant==='drawer'?'<span class="ico">'+route.icon+'</span>':'';const classes=variant==='drawer'?'side-link drawer-link':'';return '<a class="'+classes+active(route.id,current)+'" href="'+route.path+'">'+icon+'<span>'+label+'</span></a>'}
  function routeLinks(options,placement,variant){const current=options?.active||'',items=routeItems(options,placement);if(variant!=='drawer')return items.map(route=>routeAnchor(route,current,variant)).join('');const order=['general','operations','inventory','money','admin'];return order.map(group=>{const children=items.filter(route=>route.group===group);if(!children.length)return '';const opened=children.some(route=>route.id===current)?' open':'';const label=window.ShopRoutes.groups[group]||group;return '<details class="shell-nav-group"'+opened+'><summary>'+label+'</summary><div class="shell-nav-group-links">'+children.map(route=>routeAnchor(route,current,'drawer')).join('')+'</div></details>'}).join('')}

  let latestBottomNavOptions=null,bottomNavReadyBound=false,workerFlexyStateRequest=0;
  async function refreshWorkerFlexyBottomNav(){
    const requestId=++workerFlexyStateRequest;
    const token=localStorage.getItem('mytool_shop_worker_token')||'';
    if(!token)return;
    try{
      const response=await fetch(SUPABASE_URL+'/rest/v1/rpc/worker_flexy_entry_state_v1',{
        method:'POST',
        headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},
        body:JSON.stringify({p_session_token:token}),
        cache:'no-store'
      });
      const data=await response.json().catch(()=>null);
      if(requestId!==workerFlexyStateRequest||!response.ok||!data)return;
      const anchor=document.querySelector('.mytool-bottom-nav [data-slot="1"] .mytool-bottom-nav-item');
      if(!anchor)return;
      const label=anchor.querySelector('.mytool-nav-label');
      if(data.internal_available){
        anchor.href='../flexy/';
        anchor.title='فليكسي';
        if(label)label.textContent='فليكسي';
      }else{
        anchor.href='flexy-access.html?mode=fallback';
        anchor.title='منصة بديلة — فليكسي الداخلي غير متاح';
        if(label)label.textContent='منصة بديلة';
      }
    }catch(_error){}
  }
  function syncBottomNavigation(options){
    latestBottomNavOptions=options||latestBottomNavOptions||{role:'admin',permissions:{},active:document.body?.dataset?.screen||'index'};
    const apply=()=>{
      if(!window.MyToolBottomNav||!window.ShopRoutes||!latestBottomNavOptions)return false;
      const context={role:latestBottomNavOptions.role||'admin',permissions:latestBottomNavOptions.permissions||{}},current=latestBottomNavOptions.active||document.body?.dataset?.screen||'index';
      let actions=[];
      if(context.role==='worker'){
        // Worker invariant: Flexy is always the far-right fixed action.
        actions.push({slot:1,href:'flexy-access.html',icon:'📱',label:'فليكسي',title:'فليكسي',home:current==='flexy-access'});
        const preferred=['sale','stock','inventory','daily','money','purchase','transfers']
          .map(id=>window.ShopRoutes.get(id))
          .filter(route=>route&&window.ShopRoutes.allowed(route,context));
        const sale=preferred.find(route=>route.id==='sale');
        const stock=preferred.find(route=>route.id==='stock');
        const remaining=preferred.filter(route=>route.id!=='sale'&&route.id!=='stock');
        const second=sale||remaining.shift()||stock||null;
        const fourth=stock&&stock!==second?stock:(remaining.shift()||null);
        if(second)actions.push({slot:2,href:second.path,icon:second.icon,label:second.shortLabel||second.label,title:second.label,home:second.id===current});
        if(fourth)actions.push({slot:4,href:fourth.path,icon:fourth.icon,label:fourth.shortLabel||fourth.label,title:fourth.label,home:fourth.id===current});
      }else{
        // Admin invariant: Flexy also stays fixed at the far-right, but opens the admin platform.
        actions.push({slot:1,href:'../flexy/accounts.html',icon:'📱',label:'فليكسي',title:'إدارة Flexy'});
        const preferred=['sale','stock','inventory','daily','money','purchase','transfers']
          .map(id=>window.ShopRoutes.get(id))
          .filter(route=>route&&window.ShopRoutes.allowed(route,context));
        const sale=preferred.find(route=>route.id==='sale');
        const stock=preferred.find(route=>route.id==='stock');
        const remaining=preferred.filter(route=>route.id!=='sale'&&route.id!=='stock');
        const second=sale||remaining.shift()||stock||null;
        const fourth=stock&&stock!==second?stock:(remaining.shift()||null);
        if(second)actions.push({slot:2,href:second.path,icon:second.icon,label:second.shortLabel||second.label,title:second.label,home:second.id===current});
        if(fourth)actions.push({slot:4,href:fourth.path,icon:fourth.icon,label:fourth.shortLabel||fourth.label,title:fourth.label,home:fourth.id===current});
      }
      actions.push({slot:5,icon:'⋯',label:'المزيد',title:'فتح قائمة المحل',onClick(){document.querySelector('#drawerOpen,.menu-toggle')?.click()}});
      window.MyToolBottomNav.setActions(actions);
      const homeItem=document.querySelector('.mytool-bottom-nav [data-slot="3"] .mytool-bottom-nav-item');if(homeItem)homeItem.classList.toggle('is-home',current==='index');
      if(context.role==='worker')refreshWorkerFlexyBottomNav();
      return true;
    };
    if(apply())return;
    if(bottomNavReadyBound)return;
    bottomNavReadyBound=true;
    window.addEventListener('mytool-bottom-nav-ready',()=>{bottomNavReadyBound=false;apply()},{once:true});
  }

  function canonicalHeader(options){const identityId=options?.identityId||'shellIdentity',role=options?.role||'pending';const badge=role==='worker'?'عامل':role==='admin'?'إدارة':'…';const identity=role==='worker'?'جاري التحقق من الجلسة…':role==='admin'?'حساب الإدارة':'جاري التحقق من الجلسة…';const buttonId=options?.drawerButtonId?' id="'+options.drawerButtonId+'"':'';return '<header class="shop-topbar shell-canonical-header"><div class="topbar-title"><div class="topbar-logo">MT</div><span class="shell-template-mark" title="القالب الموحد 1501" aria-label="علامة القالب الموحد"></span><div class="topbar-copy"><h1><span class="shell-app-name">MyTool</span><span class="shell-app-suffix"> — حساب المحل</span></h1><div class="muted shell-identity"'+(identityId?' id="'+identityId+'"':'')+'>'+identity+'</div></div><span class="pill shell-role-badge">'+badge+'</span><button'+buttonId+' class="btn secondary menu-toggle mobile-only" type="button" aria-label="فتح القائمة">☰</button></div><div class="topbar-actions desktop-only"><a class="btn secondary" href="../" style="text-decoration:none">MyTool</a><button class="btn secondary" type="button" data-shell-action="refresh">تحديث</button><button class="btn secondary" type="button" data-shell-action="logout">خروج</button></div></header>'}
  function canonicalTop(options){const current=options?.active||document.body.dataset.screen||'index';const role=options?.role||'pending';const nav=role==='pending'?'':routeLinks({...options,role,active:current},'top','top');return canonicalHeader({...options,role})+'<nav id="screenNav" class="shared-screen-nav screen-nav unified-nav" aria-label="التنقل الرئيسي">'+nav+'</nav>'}

  function bindAdminShell(){const sidebar=document.querySelector('#sharedAdminSidebar .shared-admin-drawer'),overlay=document.querySelector('#sharedAdminSidebar .shared-admin-overlay');const close=()=>{sidebar?.classList.remove('open');overlay?.classList.remove('open');setDrawerOpen(false)};document.querySelector('#sharedAdminTop .menu-toggle')?.addEventListener('click',()=>{sidebar?.classList.add('open');overlay?.classList.add('open');setDrawerOpen(true)});overlay?.addEventListener('click',close);document.querySelectorAll('#sharedAdminSidebar a').forEach(a=>a.addEventListener('click',close));document.querySelectorAll('[data-shell-action="refresh"]').forEach(b=>b.addEventListener('click',()=>location.reload()));document.querySelectorAll('[data-shell-action="logout"]').forEach(b=>b.addEventListener('click',requestLogout))}
  function mountAdminSidebar(targetId,options){const target=document.getElementById(targetId);if(!target||target.dataset.mounted)return;target.dataset.mounted='1';const current=options?.active||'index',links=routeLinks({...options,active:current},'drawer','drawer');target.innerHTML='<div class="shared-admin-overlay"></div><aside class="shared-admin-drawer"><div class="side-brand"><div class="brand-mark">MT</div><div><strong>MyTool</strong><small>إدارة المحل</small></div></div><nav class="side-nav">'+links+'<button class="side-link" data-shell-action="refresh"><span class="ico">↻</span><span>تحديث البيانات</span></button></nav><div class="side-spacer"></div><div class="side-footer"><div class="side-user">حساب الإدارة</div><button class="side-link" data-shell-action="logout"><span class="ico">⇥</span><span>تسجيل الخروج</span></button></div></aside>'}
  function mountAdminTop(targetId,options){const target=document.getElementById(targetId);if(!target||target.dataset.mounted)return;target.dataset.mounted='1';target.innerHTML=canonicalTop({...options,role:'admin',identityId:'identityText',drawerButtonId:'drawerOpen'});syncBottomNavigation({role:'admin',permissions:options?.permissions||{},active:options?.active||document.body?.dataset?.screen||'index'})}
  function watchAdmin(options){const tryMount=()=>{const side=document.getElementById('sharedAdminSidebar'),top=document.getElementById('sharedAdminTop');if(!side||!top)return false;mountAdminSidebar('sharedAdminSidebar',options);mountAdminTop('sharedAdminTop',options);bindAdminShell();return true};if(tryMount())return;const observer=new MutationObserver(()=>{if(tryMount())observer.disconnect()});observer.observe(document.documentElement,{childList:true,subtree:true})}
  function mountStandalone(targetId,options){const target=document.getElementById(targetId);if(!target)return;const current=options?.active||'',role=options?.role||'admin',links=routeLinks({...options,role,active:current},'drawer','drawer');target.innerHTML='<div id="drawerOverlay" class="drawer-overlay drawer-hidden"></div><aside id="drawer" class="drawer drawer-hidden"><div class="drawer-head"><strong>قائمة حساب المحل</strong><button id="drawerClose" class="drawer-close" type="button">×</button></div><nav id="drawerLinks" class="drawer-links">'+links+'</nav><button class="shell-logout drawer-logout" type="button">تسجيل الخروج</button></aside>'+canonicalTop({...options,role,active:current,identityId:'standaloneIdentity',drawerButtonId:'drawerOpen'});bindLogout(target);bindDrawer(target);syncBottomNavigation({role,permissions:options?.permissions||{},active:current||document.body?.dataset?.screen||'index'})}
  function mountOperationTop(targetId){const target=document.getElementById(targetId);if(!target)return;target.innerHTML='<div id="drawerOverlay" class="drawer-overlay drawer-hidden"></div><aside id="drawer" class="drawer drawer-hidden"><div class="drawer-head"><strong>قائمة حساب المحل</strong><button id="drawerClose" class="drawer-close" type="button">×</button></div><nav id="drawerLinks" class="drawer-links"></nav><button class="shell-logout drawer-logout" type="button">تسجيل الخروج</button></aside>'+canonicalTop({role:'pending',identityId:'identityText',drawerButtonId:'drawerOpen'});bindLogout(target);bindDrawer(target)}
  function mountOperationNav(targetId){const target=document.getElementById(targetId);if(!target)return;target.innerHTML='';target.hidden=true}
  function mountDailyTop(targetId){const target=document.getElementById(targetId);if(!target)return;target.innerHTML='<div id="drawerOverlay" class="drawer-overlay drawer-hidden"></div><aside id="drawer" class="drawer drawer-hidden"><div class="drawer-head"><strong>قائمة حساب المحل</strong><button id="drawerClose" class="drawer-close" type="button">×</button></div><nav id="drawerLinks" class="drawer-links"></nav><button class="shell-logout drawer-logout" type="button">تسجيل الخروج</button></aside>'+canonicalTop({role:'pending',identityId:'identity',drawerButtonId:'drawerOpen'});bindLogout(target);bindDrawer(target)}
  function mountRoleNavigation(context,current){const options={role:context?.role||'admin',permissions:context?.permissions||{},active:current||document.body.dataset.screen||'daily'},screen=document.getElementById('screenNav'),drawer=document.getElementById('drawerLinks'),top=routeLinks(options,'top','top'),side=routeLinks(options,'drawer','drawer');if(screen)screen.innerHTML=top;if(drawer)drawer.innerHTML=side;document.querySelectorAll('.shell-role-badge').forEach(el=>el.textContent=options.role==='worker'?'عامل':'إدارة');if(options.role==='admin')document.querySelectorAll('.shell-identity').forEach(el=>el.textContent='حساب الإدارة');syncBottomNavigation(options);return{top:routeItems(options,'top').length,drawer:routeItems(options,'drawer').length}}

  function loadScreenEnhancer(){const screen=document.body?.dataset?.screen||'';const quick='quick-pricing.js?v=20260913-1938';const map={purchase:[quick,'purchase-autofill.js?v=20260913-1700','price-guidance.js?v=20260913-1700','catalog-picker.js?v=20260916-1955'],sale:[quick,'sale-price-sync.js?v=20260913-1700','price-guidance.js?v=20260913-1700','catalog-picker.js?v=20260916-1955'],inventory:[quick,'inventory-pricing.js?v=20260913-1938','catalog-picker.js?v=20260916-1955'],products:['products-pagination.js?v=20260913-1700'],'opening-stock':['opening-stock-policy.js?v=20260913-1700'],'physical-inventory':['physical-inventory-design.js?v=20260916-1']};(map[screen]||[]).forEach((src,index)=>{if(document.querySelector('script[data-shop-enhancer="'+screen+'-'+index+'"]'))return;const script=document.createElement('script');script.src=src;script.defer=true;script.dataset.shopEnhancer=screen+'-'+index;document.head.appendChild(script)})}
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',loadScreenEnhancer,{once:true});
    document.addEventListener('DOMContentLoaded',loadMyToolBottomNav,{once:true});
  }else{
    loadScreenEnhancer();
    loadMyToolBottomNav();
  }
  window.ShopShell={watchAdmin,mountAdminSidebar,mountAdminTop,mountStandalone,mountOperationTop,mountOperationNav,mountDailyTop,mountRoleNavigation,requestLogout};
})();
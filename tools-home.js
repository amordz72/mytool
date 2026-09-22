(() => {
  'use strict';

  const script=document.currentScript;
  const rootUrl=new URL('./',script?.src||location.href);
  const RECENT_KEY='mytool_recent_tools_v1';
  const MAX_HISTORY=8;
  const RECENT_LIMIT=6;
  let shell=null,nav=null,rendering=false,renderQueued=false;

  function injectAssets(){
    const shellVersion='20260922-dual-sidebar-6';
    if(!document.querySelector('link[data-mytool-shell-nav]')){
      const shellCss=document.createElement('link');shellCss.rel='stylesheet';shellCss.href=new URL('mytool-shell-nav.css?v='+shellVersion,rootUrl).href;shellCss.dataset.mytoolShellNav='1';document.head.appendChild(shellCss);
    }
    if(!document.querySelector('script[data-mytool-shell-nav]')){
      const shellJs=document.createElement('script');shellJs.src=new URL('mytool-shell-nav.js?v='+shellVersion,rootUrl).href;shellJs.defer=true;shellJs.dataset.mytoolShellNav='1';shellJs.dataset.root=rootUrl.href;document.head.appendChild(shellJs);
    }
    if(!document.querySelector('link[data-mytool-tools-home-nav]')){
      const link=document.createElement('link');
      link.rel='stylesheet';
      link.href=new URL('mytool-bottom-nav.css?v=20260916-options-panel-1',rootUrl).href;
      link.dataset.mytoolToolsHomeNav='1';
      document.head.appendChild(link);
    }
    if(document.getElementById('mytoolToolsHomeStyle'))return;
    const style=document.createElement('style');
    style.id='mytoolToolsHomeStyle';
    style.textContent=`
      .mytool-tools-source-hidden{display:none!important}
      .tools-home-shell{margin-top:14px}
      .tools-home-tabs{position:sticky;top:8px;z-index:30;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:0 0 12px;padding:6px;background:rgba(255,255,255,.94);border:1px solid var(--line);border-radius:16px;box-shadow:0 8px 20px rgba(22,48,71,.08);backdrop-filter:blur(10px)}
      .tools-home-tab{border:0;background:transparent;color:var(--muted);font-weight:800;padding:10px 6px;cursor:pointer;border-radius:11px}
      .tools-home-tab.active{background:#eaf7fd;color:#147fb2}
      .tools-home-pane[hidden]{display:none!important}
      .tools-home-empty{padding:22px 14px;text-align:center;color:var(--muted);background:#fff;border:1px dashed var(--line);border-radius:16px}
      .tools-home-shell .section-title{margin-top:10px}
      .tools-home-bottom-nav .mytool-bottom-nav-item.is-recent{background:#f8fbfd}
      body.mytool-tools-nav-active{padding-bottom:96px!important}
      @media(max-width:600px){
        .tools-home-shell .grid{grid-template-columns:1fr}
        .tools-home-shell .card{display:grid;grid-template-columns:44px minmax(0,1fr);grid-template-rows:auto auto auto;column-gap:10px;row-gap:2px;padding:12px 13px;min-height:76px}
        .tools-home-shell .card .icon{grid-column:1;grid-row:1/4;width:44px;height:44px;margin:1px 0 0;font-size:23px;border-radius:13px}
        .tools-home-shell .card h2{grid-column:2;grid-row:1;margin:0;font-size:15px}
        .tools-home-shell .card p{grid-column:2;grid-row:2;margin:2px 0 0;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;font-size:12px;line-height:1.45}
        .tools-home-shell .card .badge{grid-column:2;grid-row:3;justify-self:start;margin-top:4px}
      }
    `;
    document.head.appendChild(style);
  }

  function safeReadRecent(){
    try{const value=JSON.parse(localStorage.getItem(RECENT_KEY)||'[]');return Array.isArray(value)?value.filter(x=>typeof x==='string'):[]}catch{return[]}
  }
  function saveRecent(id){
    if(!id)return;
    const next=[id,...safeReadRecent().filter(x=>x!==id)].slice(0,MAX_HISTORY);
    try{localStorage.setItem(RECENT_KEY,JSON.stringify(next))}catch(_e){}
  }
  function normalizeToolId(href){
    try{
      const url=new URL(href,location.href);
      if(url.origin===location.origin&&url.pathname.startsWith(rootUrl.pathname)){
        const rel=url.pathname.slice(rootUrl.pathname.length).replace(/^\/+|\/+$/g,'');
        return 'local:'+(rel||'home');
      }
      return 'external:'+url.origin+url.pathname;
    }catch{return 'href:'+href}
  }
  function titleFor(card){return card.querySelector('h2')?.textContent?.trim()||card.textContent?.trim()||'أداة'}
  function iconFor(card){return card.querySelector('.icon')?.textContent?.trim()||'•'}
  function shortLabel(title){const s=String(title||'أداة').replace(/^صفحة\s+/,'').replace(/^صندوق\s+/,'').replace(/^طلبات\s+/,'');return s.length>10?s.slice(0,9)+'…':s}
  function categoryFor(card){
    const section=card.closest('section.grid');
    const title=section?.previousElementSibling?.classList?.contains('section-title')?section.previousElementSibling.textContent.trim():'';
    return /سريع/.test(title)?'quick':'work';
  }
  function visibleSourceContainers(){
    return ['adminTools','workerTools','generalTools'].map(id=>document.getElementById(id)).filter(el=>el&&!el.hidden);
  }
  function catalog(){
    const seen=new Set(),items=[];
    for(const container of visibleSourceContainers()){
      for(const card of container.querySelectorAll('a.card[href]')){
        const href=card.getAttribute('href')||'';
        const id=normalizeToolId(href);
        if(seen.has(id))continue;
        seen.add(id);
        items.push({id,href,title:titleFor(card),icon:iconFor(card),category:categoryFor(card),source:card});
      }
    }
    return items;
  }
  function cloneTool(item){
    const node=item.source.cloneNode(true);
    node.removeAttribute('id');
    node.dataset.toolId=item.id;
    node.addEventListener('click',()=>{saveRecent(item.id);setTimeout(scheduleRender,0)});
    return node;
  }
  function ensureShell(){
    if(shell&&document.body.contains(shell))return shell;
    shell=document.createElement('section');
    shell.className='tools-home-shell';
    shell.innerHTML=`
      <div class="tools-home-tabs" role="tablist" aria-label="تقسيم أدوات MyTool">
        <button class="tools-home-tab active" type="button" data-tools-tab="recent">الأخيرة</button>
        <button class="tools-home-tab" type="button" data-tools-tab="work">أدوات العمل</button>
        <button class="tools-home-tab" type="button" data-tools-tab="quick">سريعة</button>
      </div>
      <div class="tools-home-pane" data-tools-pane="recent"><h2 class="section-title">آخر الأدوات</h2><section class="grid" data-tools-grid="recent"></section><div class="tools-home-empty" data-tools-empty="recent" hidden>لم تستعمل أداة من هذه الصفحة بعد. اختر «أدوات العمل» ثم افتح أي أداة، وستظهر هنا تلقائيًا.</div></div>
      <div class="tools-home-pane" data-tools-pane="work" hidden><h2 class="section-title">أدوات العمل</h2><section class="grid" data-tools-grid="work"></section><div class="tools-home-empty" data-tools-empty="work" hidden>لا توجد أدوات عمل متاحة لهذه الجلسة.</div></div>
      <div class="tools-home-pane" data-tools-pane="quick" hidden><h2 class="section-title">أدوات سريعة</h2><section class="grid" data-tools-grid="quick"></section><div class="tools-home-empty" data-tools-empty="quick" hidden>لا توجد أدوات سريعة متاحة لهذه الجلسة.</div></div>`;
    const hero=document.querySelector('#dashboard .hero');
    if(hero)hero.insertAdjacentElement('afterend',shell);else document.getElementById('dashboard')?.prepend(shell);
    shell.querySelectorAll('[data-tools-tab]').forEach(btn=>btn.addEventListener('click',()=>selectTab(btn.dataset.toolsTab,true)));
    return shell;
  }
  function selectTab(name,scroll=false){
    if(!shell)return;
    shell.querySelectorAll('[data-tools-tab]').forEach(btn=>btn.classList.toggle('active',btn.dataset.toolsTab===name));
    shell.querySelectorAll('[data-tools-pane]').forEach(pane=>pane.hidden=pane.dataset.toolsPane!==name);
    if(scroll)shell.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function fillGrid(name,items){
    const grid=shell.querySelector(`[data-tools-grid="${name}"]`);
    const empty=shell.querySelector(`[data-tools-empty="${name}"]`);
    grid.replaceChildren(...items.map(cloneTool));
    empty.hidden=items.length>0;
  }
  function ensureBottomNav(){
    if(nav&&document.body.contains(nav))return nav;
    nav=document.createElement('nav');
    nav.className='mytool-bottom-nav tools-home-bottom-nav';
    nav.setAttribute('dir','rtl');
    nav.setAttribute('aria-label','آخر أدوات MyTool');
    nav.innerHTML=[1,2,3,4,5].map(slot=>`<div class="mytool-bottom-nav-slot" data-tools-nav-slot="${slot}"></div>`).join('');
    document.body.appendChild(nav);
    return nav;
  }
  function navItemHtml(item){
    if(!item)return '<div class="mytool-bottom-nav-empty" aria-hidden="true"></div>';
    if(item.all)return '<button type="button" class="mytool-bottom-nav-item is-home" data-tools-all><span class="mytool-nav-icon">☰</span><span class="mytool-nav-label">الأدوات</span></button>';
    return `<a class="mytool-bottom-nav-item is-recent" href="${item.source.getAttribute('href')||item.href}"${item.source.target?` target="${item.source.target}"`:''}${item.source.rel?` rel="${item.source.rel}"`:''} data-tools-recent-id="${item.id}"><span class="mytool-nav-icon">${item.icon}</span><span class="mytool-nav-label">${shortLabel(item.title)}</span></a>`;
  }
  function bindSourceRecents(items){
    items.forEach(item=>{
      const node=item.source;
      if(!node||node.dataset.toolsRecentBound==='1')return;
      node.dataset.toolsRecentBound='1';
      node.addEventListener('click',()=>saveRecent(item.id));
    });
  }
  function renderBottomNav(items){
    const bar=ensureBottomNav();
    const map=new Map(items.map(x=>[x.id,x]));
    const recents=safeReadRecent().map(id=>map.get(id)).filter(Boolean).slice(0,4);
    const slots=[1,2,4,5];
    for(let i=1;i<=5;i++)bar.querySelector(`[data-tools-nav-slot="${i}"]`).innerHTML='';
    slots.forEach((slot,index)=>bar.querySelector(`[data-tools-nav-slot="${slot}"]`).innerHTML=navItemHtml(recents[index]||null));
    bar.querySelector('[data-tools-nav-slot="3"]').innerHTML=navItemHtml({all:true});
    bar.querySelector('[data-tools-all]')?.addEventListener('click',()=>document.getElementById('adminTools')?.scrollIntoView({behavior:'smooth',block:'start'}));
    bar.querySelectorAll('[data-tools-recent-id]').forEach(a=>a.addEventListener('click',()=>saveRecent(a.dataset.toolsRecentId)));
    bar.hidden=false;
    document.body.classList.add('mytool-tools-nav-active');
  }
  function hideEnhancements(){
    if(shell)shell.hidden=true;
    if(nav)nav.hidden=true;
    document.body.classList.remove('mytool-tools-nav-active');
    document.querySelectorAll('.mytool-tools-source-hidden').forEach(el=>el.classList.remove('mytool-tools-source-hidden'));
  }
  function ensureChatPaymentsCard(){
    const quick=document.querySelector('[data-dashboard-section="quick"]');
    if(!quick||quick.querySelector('a[href="chat-payments-reader/"]'))return;
    const card=document.createElement('a');
    card.className='card';
    card.href='chat-payments-reader/';
    card.innerHTML='<div class="icon">💬</div><h2>قارئ مدفوعات الدردشة</h2><p>استخرج مدفوعات عميل من WhatsApp بين تاريخين مع مراجعة المطابقات المختصرة قبل الاعتماد.</p><span class="badge">ZIP / TXT / لصق</span>';
    const after=quick.querySelector('a[href^="document-reader/"]');
    if(after)after.insertAdjacentElement('afterend',card);else quick.prepend(card);
  }

  function render(){
    renderQueued=false;
    if(rendering)return;
    rendering=true;
    try{
      const dashboard=document.getElementById('dashboard');
      if(!dashboard||dashboard.hidden){hideEnhancements();return}
      const sources=visibleSourceContainers();
      if(!sources.length){hideEnhancements();return}
      ensureChatPaymentsCard();
      const items=catalog();

      // Root is now a real dashboard. Do not replace it with the old
      // "Recent / Work / Quick" shell; keep native sections and cards visible.
      if(shell)shell.hidden=true;
      sources.forEach(el=>el.classList.remove('mytool-tools-source-hidden'));
      bindSourceRecents(items);
      renderBottomNav(items);
    }finally{rendering=false}
  }
  function scheduleRender(){if(renderQueued)return;renderQueued=true;setTimeout(render,0)}

  injectAssets();
  const observer=new MutationObserver(mutations=>{
    if(rendering)return;
    if(mutations.every(m=>shell?.contains(m.target)||nav?.contains(m.target)))return;
    scheduleRender();
  });
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scheduleRender,{once:true});else scheduleRender();
})();
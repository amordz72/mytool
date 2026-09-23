(() => {
  'use strict';
  const script=document.currentScript;
  const rootUrl=script?.dataset?.root?new URL(script.dataset.root,location.href):new URL('./',script?.src||location.href);
  const rootPath=rootUrl.pathname.endsWith('/')?rootUrl.pathname:rootUrl.pathname+'/';
  const rel=location.pathname.startsWith(rootPath)?location.pathname.slice(rootPath.length).replace(/^\/+|\/+$/g,''):'';
  const currentApp=(document.body?.dataset?.mytoolApp||script?.dataset?.app||rel.split('/')[0]||'').trim();
  let mounted=false,backdrop,motherDrawer,localDrawer,localButton,scrollTopButton;

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const url=(p)=>new URL(p,rootUrl).href;
  const currentPath=()=>location.pathname.replace(/\/+$/,'/');

  function access(){
    const ctx=window.MyToolAccessContext||{};
    const now=Date.now();
    const workerToken=localStorage.getItem('mytool_shop_worker_token')||'';
    const workerExpiry=Number(localStorage.getItem('mytool_shop_worker_expires_at')||0);
    const workerSession=Boolean(workerToken)&&workerExpiry>now;
    const workspaceRole=localStorage.getItem('mytool_workspace_role')||'';
    const storedAdmin=Number(localStorage.getItem('mytool_admin_expires_at')||0)>now
      || Number(localStorage.getItem('mytool_emergency_admin_expires_at')||0)>now
      || (workerSession&&workspaceRole==='workspace_admin');
    const storedWorker=workerSession&&!storedAdmin;
    const toolsExpiry=Math.max(
      Number(sessionStorage.getItem('mytool_tools_access_expires_at')||0),
      Number(localStorage.getItem('mytool_tools_access_expires_at')||0)
    );
    const toolsToken=sessionStorage.getItem('mytool_tools_access_token')
      || localStorage.getItem('mytool_tools_access_token')||'';
    const admin=Boolean(ctx.adminLike||ctx.ownerActive||storedAdmin);
    const worker=Boolean(ctx.workerLike||storedWorker);
    const tools=Boolean(ctx.toolsActive||(toolsToken&&toolsExpiry>now));
    return {admin,worker,tools,global:admin||tools};
  }
  function titleFromDocument(){
    const raw=(document.title||'').split(/\s+[—-]\s+/)[0].trim();
    return raw&&raw!=='MyTool'?raw:'My Tools';
  }
  function screenTitle(){
    const file=(location.pathname.split('/').pop()||'index.html').toLowerCase();
    if(!currentApp)return 'رئيسية My Tools';
    if(currentApp==='flexy'){
      const map={'home.html':'تميز','index.html':'فليكسي','admin.html':'إدارة فليكسي','accounts.html':'حسابات فليكسي','orders.html':'الطابور','review.html':'مراجعة فليكسي','my-account.html':'حسابي','sims.html':'الشرائح والأرصدة','sim-feeding.html':'تغذية الشرائح'};
      return map[file]||'تميز';
    }
    if(currentApp==='shop'){
      const screen=document.body?.dataset?.screen||file.replace(/\.html$/,'');
      const map={index:'حساب المحل',sale:'البيع',purchase:'المشتريات',stock:'المخزون',inventory:'الجرد','inventory-count':'الجرد','physical-inventory':'الجرد الفعلي','opening-stock':'الجرد الافتتاحي',transfers:'التحويلات',money:'الأموال','cash-receipts':'استلام الأموال','shift-close':'إغلاق الوردية',daily:'التشغيل اليومي',users:'المستخدمون',settings:'الإعدادات',products:'المنتجات',catalog:'التصنيفات',barcodes:'الباركود'};
      return map[screen]||titleFromDocument();
    }
    const map={cards:'معالج البطاقات','accounts-review':'الحسابات',notes:'الملاحظات',orders:'الطلبات',programs:'البرامج',qr:'QR','document-reader':'قارئ المستندات','chat-payments-reader':'قارئ مدفوعات الدردشة',links:'روابط العمل','access-admin':'الإدارة'};
    return map[currentApp]||titleFromDocument();
  }

  function motherItems(){
    const a=access();
    if(a.tools&&!a.admin)return [
      ['home','⌂','رئيسية My Tools',''],
      ['shop','🧾','حساب المحل','shop/'],
      ['cards','🎫','معالج البطاقات','cards/'],
      ['programs','🧰','البرامج','programs/'],
      ['links','↗','روابط العمل','links/'],
      ['qr','▣','QR','qr/']
    ];
    const base=[
      ['home','⌂','رئيسية My Tools',''],
      ['shop','🧾','حساب المحل','shop/'],
      ['flexy','📱','تميز / فليكسي','flexy/home.html'],
      ['orders','📥','الطلبات','orders/?v=20260923-editable-autofill1'],
      ['cards','🎫','معالج البطاقات','cards/'],
      ['accounts-review','📊','الحسابات','accounts-review/'],
      ['notes','📝','الملاحظات','notes/'],
      ['document-reader','📄','قارئ المستندات','document-reader/'],
      ['chat-payments-reader','💬','قارئ مدفوعات الدردشة','chat-payments-reader/'],
      ['programs','🧰','البرامج','programs/'],
      ['links','↗','روابط العمل','links/'],
      ['qr','▣','QR','qr/']
    ];
    if(a.admin)base.push(['access-admin','⚙','الإدارة','access-admin/']);
    return base;
  }
  function flexyItems(){
    const a=access();
    const items=[
      ['home','⌂','رئيسية تميز','flexy/home.html'],
      ['flexy','☎','فليكسي','flexy/?view=offers'],
      ['direct','⚡','شحن مباشر','flexy/?view=balance'],
      ['cards','▣','البطاقات','cards/']
    ];
    if(a.admin)items.push(
      ['sims','📶','الشرائح والأرصدة','flexy/sims.html'],
      ['feeding','🔋','تغذية الشرائح','flexy/sim-feeding.html'],
      ['orders','▤','الطابور','flexy/orders.html'],
      ['accounts','◎','الحسابات','flexy/accounts.html'],
      ['review','✓','المراجعة','flexy/review.html'],
      ['admin','⚙','إدارة فليكسي','flexy/admin.html']
    );
    else items.push(['account','◎','حسابي','flexy/my-account.html']);
    return items;
  }
  function fallbackShopItems(){
    return [
      ['index','⌂','رئيسية المحل','shop/'],
      ['sale','＋','البيع','shop/sale.html'],
      ['purchase','⇩','المشتريات','shop/purchase.html'],
      ['stock','▦','المخزون','shop/stock.html'],
      ['inventory','✓','الجرد','shop/inventory-count.html'],
      ['daily','▤','التشغيل اليومي','shop/daily.html'],
      ['money','دج','الأموال','shop/money.html'],
      ['shift-close','✓','إغلاق الوردية','shop/shift-close.html']
    ];
  }
  function shopItems(){
    if(window.ShopRoutes?.list){
      const ctx={role:access().admin?'admin':'worker',permissions:{}};
      return window.ShopRoutes.list(ctx,'drawer').map(r=>[r.id,r.icon||'•',r.label,url('shop/'+String(r.path).replace(/^\.\//,'')),true]);
    }
    return fallbackShopItems();
  }
  function localItems(){
    if(currentApp==='flexy')return flexyItems();
    if(currentApp==='shop')return shopItems();
    return [];
  }
  function normalizeHref(item){
    const raw=item[3]||'';
    if(item[4])return raw;
    return url(raw);
  }
  function isActive(item){
    const href=normalizeHref(item);
    try{
      const u=new URL(href,location.href);
      const here=currentPath(),there=u.pathname.replace(/\/+$/,'/');
      if(item[0]==='home'&&!currentApp)return here===rootPath;
      if(currentApp==='flexy'&&item[0]==='home')return /\/flexy\/home\.html$/.test(location.pathname);
      if(currentApp==='flexy'&&item[0]==='flexy')return /\/flexy\/(?:index\.html)?$/.test(location.pathname)&&new URLSearchParams(location.search).get('view')!=='balance';
      if(currentApp==='flexy'&&item[0]==='direct')return /\/flexy\/(?:index\.html)?$/.test(location.pathname)&&new URLSearchParams(location.search).get('view')==='balance';
      return here===there||(!u.pathname.endsWith('.html')&&here.startsWith(there));
    }catch{return false}
  }
  function linksHtml(items){
    return items.map(item=>'<a class="mytool-shell-link'+(isActive(item)?' active':'')+'" href="'+esc(normalizeHref(item))+'"><span class="mytool-shell-icon">'+esc(item[1])+'</span><span>'+esc(item[2])+'</span></a>').join('');
  }
  function closeAll(){
    motherDrawer?.classList.remove('open');localDrawer?.classList.remove('open');backdrop?.classList.remove('open');document.documentElement.classList.remove('mytool-shell-nav-open');
  }
  function openDrawer(which){
    closeAll();
    const drawer=which==='mother'?motherDrawer:localDrawer;
    if(which==='local')refreshLocal();
    drawer?.classList.add('open');backdrop?.classList.add('open');document.documentElement.classList.add('mytool-shell-nav-open');
  }
  function refreshLocal(){
    const items=localItems();
    if(localButton)localButton.hidden=!items.length;
    if(!localDrawer)return;
    localDrawer.querySelector('.mytool-shell-list').innerHTML=linksHtml(items);
    localDrawer.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeAll,{once:true}));
  }
  function syncScrollTop(){
    if(!scrollTopButton)return;
    const threshold=Math.max(420,Math.round(window.innerHeight*.65));
    scrollTopButton.classList.toggle('show',window.scrollY>threshold);
  }
  function mountScrollTop(){
    if(scrollTopButton)return;
    scrollTopButton=document.createElement('button');
    scrollTopButton.type='button';
    scrollTopButton.className='mytool-shell-scrolltop';
    scrollTopButton.textContent='↑';
    scrollTopButton.title='الرجوع إلى أعلى الصفحة';
    scrollTopButton.setAttribute('aria-label','الرجوع إلى أعلى الصفحة');
    scrollTopButton.addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));
    document.body.appendChild(scrollTopButton);
    window.addEventListener('scroll',syncScrollTop,{passive:true});
    window.addEventListener('resize',syncScrollTop,{passive:true});
    syncScrollTop();
  }
  function mount(){
    if(mounted)return;
    const a=access();
    // A normal worker stays inside the current program only. The global
    // My Tools bar appears for administration or an explicit tools session.
    if(!a.global)return;
    if(!currentApp){
      const dash=document.getElementById('dashboard');
      if(!dash||dash.hidden)return;
    }
    mounted=true;
    document.body.classList.add('mytool-shell-nav-active');
    if(currentApp)document.body.dataset.mytoolApp=currentApp;

    const top=document.createElement('header');
    top.className='mytool-shell-topbar';
    top.setAttribute('aria-label','تنقل My Tools');
    const adminBellHtml=a.admin
      ? '<a class="mytool-shell-admin-bell" href="'+esc(url('shop/cash-receipts.html'))+'" aria-label="إشعارات المحلات" title="إشعارات المحلات">🔔<span class="mytool-shell-admin-bell-count">0</span></a>'
      : '';
    top.innerHTML='<button class="mytool-shell-menu-btn" data-open="mother" type="button" aria-label="قائمة My Tools">☰</button><div class="mytool-shell-title"><span class="mytool-shell-title-text">'+esc(screenTitle())+'</span>'+adminBellHtml+'</div><button class="mytool-shell-menu-btn" data-open="local" type="button" aria-label="قائمة الأداة">☰</button>';
    document.body.appendChild(top);
    localButton=top.querySelector('[data-open="local"]');

    backdrop=document.createElement('div');backdrop.className='mytool-shell-backdrop';document.body.appendChild(backdrop);
    motherDrawer=document.createElement('aside');motherDrawer.className='mytool-shell-drawer mother';motherDrawer.setAttribute('dir','rtl');
    motherDrawer.innerHTML='<div class="mytool-shell-drawer-head"><div><strong>My Tools</strong><small>النظام الكامل</small></div><button class="mytool-shell-close" type="button" aria-label="إغلاق">×</button></div><nav class="mytool-shell-list">'+linksHtml(motherItems())+'</nav><div class="mytool-shell-footer">التنقل بين الأدوات من هنا دائمًا.</div>';
    document.body.appendChild(motherDrawer);

    localDrawer=document.createElement('aside');localDrawer.className='mytool-shell-drawer local';localDrawer.setAttribute('dir','rtl');
    localDrawer.innerHTML='<div class="mytool-shell-drawer-head"><div><strong>'+esc(screenTitle())+'</strong><small>قائمة الأداة الحالية</small></div><button class="mytool-shell-close" type="button" aria-label="إغلاق">×</button></div><nav class="mytool-shell-list"></nav><div class="mytool-shell-footer">هذه القائمة تتغير حسب الأداة الحالية.</div>';
    document.body.appendChild(localDrawer);
    refreshLocal();
    mountScrollTop();

    top.querySelector('[data-open="mother"]').addEventListener('click',()=>openDrawer('mother'));
    localButton.addEventListener('click',()=>openDrawer('local'));
    backdrop.addEventListener('click',closeAll);
    document.querySelectorAll('.mytool-shell-close').forEach(b=>b.addEventListener('click',closeAll));
    motherDrawer.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeAll,{once:true}));
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAll()});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  if(!currentApp){
    const obs=new MutationObserver(()=>{if(!mounted)mount();if(mounted)obs.disconnect()});
    obs.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
  }
})();

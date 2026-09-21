(() => {
  'use strict';

  const script=document.currentScript;
  const rootUrl=script?.dataset?.root?new URL(script.dataset.root,location.href):new URL('./',script?.src||location.href);
  const labels={cards:'البطاقات',qr:'QR',flexy:'فليكسي',programs:'البرامج',shop:'المحل',notes:'الملاحظات','accounts-review':'الحسابات',communication:'التواصل'};
  const rootPath=rootUrl.pathname.endsWith('/')?rootUrl.pathname:rootUrl.pathname+'/';
  const relative=location.pathname.startsWith(rootPath)?location.pathname.slice(rootPath.length):'';
  const currentApp=(document.body?.dataset?.mytoolApp||script?.dataset?.app||relative.split('/').filter(Boolean)[0]||'').trim();
  const appHome=currentApp?new URL(currentApp+'/',rootUrl):rootUrl;
  let nav=null,notesPagerObserver=null,notesFinderObserver=null,optionsPanel=null;

  function loadShopAdminNotifications(){
    if(currentApp!=='shop'||document.querySelector('script[data-mytool-admin-notifications]'))return;
    const s=document.createElement('script');s.src=new URL('shop/admin-notifications.js?v=20260915-2329',rootUrl).href;s.defer=true;s.dataset.mytoolAdminNotifications='1';document.head.appendChild(s);
  }
  function loadNotesEditor(){
    if(currentApp!=='notes'||document.querySelector('script[data-mytool-notes-edit]'))return;
    const s=document.createElement('script');s.src=new URL('notes/notes-edit.js?v=20260915-2255',rootUrl).href;s.defer=true;s.dataset.mytoolNotesEdit='1';document.head.appendChild(s);
  }
  function loadNotesTabs(){
    if(currentApp!=='notes'||document.querySelector('script[data-mytool-notes-tabs]'))return;
    const s=document.createElement('script');s.src=new URL('notes/notes-tabs.js?v=20260916-0006',rootUrl).href;s.defer=true;s.dataset.mytoolNotesTabs='1';document.head.appendChild(s);
  }

  function toast(text,error=false){
    document.querySelector('.mytool-nav-toast')?.remove();
    const el=document.createElement('div');el.className='mytool-nav-toast'+(error?' error':'');el.textContent=text;document.body.appendChild(el);setTimeout(()=>el.remove(),2200);
  }
  function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]))}
  function itemHtml(slot,item){
    if(!item)return '<div class="mytool-bottom-nav-empty" aria-hidden="true"></div>';
    const icon=item.icon||'•',label=item.label||'',title=item.title||label,cls='mytool-bottom-nav-item'+(item.home?' is-home':'')+(item.optionsTrigger?' is-options':'');
    if(item.href)return '<a class="'+cls+'" href="'+item.href+'" title="'+escapeHtml(title)+'"><span class="mytool-nav-icon">'+escapeHtml(icon)+'</span><span class="mytool-nav-label">'+escapeHtml(label)+'</span></a>';
    return '<button type="button" class="'+cls+'" data-mytool-action-slot="'+slot+'" title="'+escapeHtml(title)+'"'+(item.disabled?' disabled':'')+'><span class="mytool-nav-icon">'+escapeHtml(icon)+'</span><span class="mytool-nav-label">'+escapeHtml(label)+'</span></button>';
  }

  const state={slots:{
    1:null,
    2:null,
    3:{href:appHome.href,icon:'⌂',label:'الرئيسية',title:'الرجوع إلى رئيسية '+(labels[currentApp]||'التطبيق الحالي'),home:true},
    4:null,
    5:null
  },options:[],optionsConfig:{icon:'⋯',label:'خيارات',title:'خيارات إضافية',slot:5}};

  function privilegedToolsAccess(){
    const ctx=window.MyToolAccessContext;
    if(ctx)return Boolean(ctx.adminActive||ctx.emergencyActive||ctx.toolsActive);
    const now=Date.now();
    const admin=Number(localStorage.getItem('mytool_admin_expires_at')||0)>now;
    const emergency=Number(localStorage.getItem('mytool_emergency_admin_expires_at')||0)>now;
    const toolsExpiry=Math.max(Number(sessionStorage.getItem('mytool_tools_access_expires_at')||0),Number(localStorage.getItem('mytool_tools_access_expires_at')||0));
    const toolsToken=sessionStorage.getItem('mytool_tools_access_token')||localStorage.getItem('mytool_tools_access_token')||'';
    return admin||emergency||Boolean(toolsToken&&toolsExpiry>now);
  }

  function toolsNavItem(){return {href:rootUrl.href,icon:'🧰',label:'الأدوات',title:'الرجوع إلى أدوات MyTool',autoTools:true}}

  function showFloatingTools(show){
    let a=document.querySelector('.mytool-floating-tools');
    if(!show){a?.remove();return}
    if(a)return;
    a=document.createElement('a');
    a.className='mytool-floating-tools';a.href=rootUrl.href;a.textContent='🧰';a.title='الأدوات';a.setAttribute('aria-label','الرجوع إلى أدوات MyTool');
    document.body.appendChild(a);
  }

  function syncToolsPlacement(){
    [1,2,4,5].forEach(slot=>{if(state.slots[slot]?.autoTools)state.slots[slot]=null});
    if(!currentApp||!privilegedToolsAccess()){showFloatingTools(false);return}
    const freeSlot=[1,5,2,4].find(slot=>!state.slots[slot]);
    if(freeSlot){state.slots[freeSlot]=toolsNavItem();showFloatingTools(false)}
    else showFloatingTools(true);
  }

  function closeOptions(){
    optionsPanel?.remove();optionsPanel=null;
    nav?.querySelector('.mytool-bottom-nav-item.is-options')?.setAttribute('aria-expanded','false');
  }
  function optionItemHtml(item,index){
    const icon=item?.icon||'•',label=item?.label||item?.title||'خيار',title=item?.title||label,disabled=item?.disabled?' disabled':'';
    if(item?.href)return '<a class="mytool-nav-option-item" data-mytool-option-index="'+index+'" href="'+escapeHtml(item.href)+'" title="'+escapeHtml(title)+'"><span class="mytool-nav-option-icon">'+escapeHtml(icon)+'</span><span>'+escapeHtml(label)+'</span></a>';
    return '<button type="button" class="mytool-nav-option-item" data-mytool-option-index="'+index+'" title="'+escapeHtml(title)+'"'+disabled+'><span class="mytool-nav-option-icon">'+escapeHtml(icon)+'</span><span>'+escapeHtml(label)+'</span></button>';
  }
  function openOptions(){
    if(!nav||!state.options.length)return;
    closeOptions();
    optionsPanel=document.createElement('div');
    optionsPanel.className='mytool-nav-options-panel';
    optionsPanel.setAttribute('dir','rtl');
    optionsPanel.setAttribute('role','menu');
    optionsPanel.setAttribute('aria-label',state.optionsConfig.title||'خيارات إضافية');
    optionsPanel.innerHTML='<div class="mytool-nav-options-head"><strong>'+escapeHtml(state.optionsConfig.title||'خيارات إضافية')+'</strong><button type="button" class="mytool-nav-options-close" aria-label="إغلاق">×</button></div><div class="mytool-nav-options-grid">'+state.options.map(optionItemHtml).join('')+'</div>';
    document.body.appendChild(optionsPanel);
    nav.querySelector('.mytool-bottom-nav-item.is-options')?.setAttribute('aria-expanded','true');
    optionsPanel.querySelector('.mytool-nav-options-close')?.addEventListener('click',closeOptions);
    optionsPanel.querySelectorAll('[data-mytool-option-index]').forEach(el=>{
      const item=state.options[Number(el.dataset.mytoolOptionIndex)];
      if(item?.href){el.addEventListener('click',()=>closeOptions());return}
      if(typeof item?.onClick==='function')el.addEventListener('click',async()=>{if(item.disabled)return;closeOptions();try{await item.onClick()}catch(_e){toast('تعذر تنفيذ الخيار',true)}});
    });
  }
  function toggleOptions(){if(optionsPanel)closeOptions();else openOptions()}
  function optionSlot(config={}){
    const preferred=Number(config.slot||5);const order=[preferred,5,1,4,2].filter((v,i,a)=>a.indexOf(v)===i&&[1,2,4,5].includes(v));
    return order.find(slot=>!state.slots[slot]||state.slots[slot]?.optionsTrigger)||null;
  }
  function placeOptionsButton(items=[],config={}){
    [1,2,4,5].forEach(slot=>{if(state.slots[slot]?.optionsTrigger)state.slots[slot]=null});
    state.options=(items||[]).filter(Boolean);
    state.optionsConfig={icon:config.icon||'⋯',label:config.label||'خيارات',title:config.title||'خيارات إضافية',slot:Number(config.slot||5)};
    closeOptions();
    if(!state.options.length)return;
    const slot=optionSlot(state.optionsConfig);if(!slot)return;
    state.slots[slot]={icon:state.optionsConfig.icon,label:state.optionsConfig.label,title:state.optionsConfig.title,optionsTrigger:true,onClick:toggleOptions};
  }
  function setOptions(items=[],config={}){placeOptionsButton(items,config);render()}
  function configuredOverflowLabels(){return new Set(String(document.body?.dataset?.mytoolNavOverflow||'').split(',').map(x=>x.trim()).filter(Boolean))}

  function currentNotesTab(){
    const root=document.documentElement;
    if(root.classList.contains('notes-archive-mode'))return 'archive';
    if(root.classList.contains('notes-list-mode'))return 'notes';
    return 'quick';
  }
  function notesTabAction(tab,icon,label,active){return {icon,label,title:'فتح '+label,home:active,onClick(){document.querySelector('#notesTabs [data-tab="'+tab+'"]')?.click()}}}
  function setNotesNav(){
    if(currentApp!=='notes')return;
    closeOptions();state.options=[];
    const tab=currentNotesTab();
    const pager=document.getElementById('notesPager');
    const prev=pager?.querySelector('.notes-prev');
    const next=pager?.querySelector('.notes-next');
    const paged=tab!=='quick';

    // #108: ترتيب الشريط منطقي RTL. السابق ثم التالي متجاوران من جهة اليمين.
    state.slots[1]=paged?{icon:'→',label:'السابق',title:'الصفحة السابقة',disabled:!prev||prev.disabled,onClick(){const b=document.querySelector('#notesPager .notes-prev');if(b&&!b.disabled){b.click();setTimeout(setNotesNav,0)}}}:null;
    state.slots[2]=paged?{icon:'←',label:'التالي',title:'الصفحة التالية',disabled:!next||next.disabled,onClick(){const b=document.querySelector('#notesPager .notes-next');if(b&&!b.disabled){b.click();setTimeout(setNotesNav,0)}}}:null;
    state.slots[3]=notesTabAction('quick','⌂','سريع',tab==='quick');
    state.slots[4]=notesTabAction('notes','📝','الملاحظات',tab==='notes');
    state.slots[5]=notesTabAction('archive','🗃','الأرشيف',tab==='archive');
    render();
  }

  function watchNotesPagination(){
    if(currentApp!=='notes')return;
    document.documentElement.classList.add('mytool-notes-fixed-pagination','mytool-notes-context-nav');
    const attach=()=>{
      const pager=document.getElementById('notesPager');
      if(!pager)return false;
      notesFinderObserver?.disconnect();notesFinderObserver=null;notesPagerObserver?.disconnect();
      notesPagerObserver=new MutationObserver(()=>setNotesNav());
      notesPagerObserver.observe(pager,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','hidden']});
      setNotesNav();return true;
    };
    if(attach())return;
    notesFinderObserver=new MutationObserver(()=>attach());notesFinderObserver.observe(document.body,{childList:true,subtree:true});setNotesNav();
  }

  function defaultActions(){
    state.slots[1]=null;
    if(currentApp==='shop')state.slots[5]={icon:'☰',label:'القائمة',title:'فتح قائمة المحل',onClick(){const btn=document.querySelector('#drawerOpen,.menu-toggle');if(btn)btn.click();else toast('القائمة غير متاحة في هذه الصفحة',true)}};
    if(currentApp==='cards'){
      state.slots[4]={href:new URL('cards/settings.html',rootUrl).href,icon:'⚙',label:'إعدادات',title:'إعدادات البطاقات'};
      if(document.getElementById('text'))state.slots[2]={icon:'📋',label:'لصق',title:'لصق النص من الحافظة',async onClick(){try{const value=await navigator.clipboard.readText();const target=document.getElementById('text');if(!target)throw new Error();target.value=value;target.dispatchEvent(new Event('input',{bubbles:true}));target.dispatchEvent(new Event('paste',{bubbles:true}));target.focus();toast('تم اللصق')}catch{document.getElementById('text')?.focus();toast('اضغط مطولًا داخل النص واختر لصق',true)}}};
    }
  }

  function forceFixedPosition(target){
    if(!target)return;
    let spacer=document.querySelector('.mytool-bottom-nav-spacer');if(!spacer){spacer=document.createElement('div');spacer.className='mytool-bottom-nav-spacer';target.insertAdjacentElement('beforebegin',spacer)}
    const style=target.style;style.setProperty('position','fixed','important');style.setProperty('inset','auto','important');style.setProperty('top','auto','important');style.setProperty('right','auto','important');style.setProperty('bottom','calc(8px + env(safe-area-inset-bottom,0px))','important');style.setProperty('left','50%','important');style.setProperty('transform','translateX(-50%)','important');style.setProperty('float','none','important');
  }
  function render(){
    if(!nav)return;
    syncToolsPlacement();
    for(let slot=1;slot<=5;slot++){
      const holder=nav.querySelector('[data-slot="'+slot+'"]');if(!holder)continue;const item=state.slots[slot];holder.innerHTML=itemHtml(slot,item);
      if(item&&!item.href&&typeof item.onClick==='function'){const button=holder.querySelector('button');if(button){button.addEventListener('click',item.onClick);if(item.optionsTrigger){button.setAttribute('aria-haspopup','menu');button.setAttribute('aria-expanded',optionsPanel?'true':'false')}}}
    }
  }
  function setHome(item={}){
    state.slots[3]={
      href:item.href||appHome.href,
      icon:item.icon||'⌂',
      label:item.label||'الرئيسية',
      title:item.title||'الرئيسية',
      home:item.home!==false
    };
    render();
  }

  function setActions(actions=[]){
    closeOptions();state.options=[];
    [1,2,4,5].forEach(slot=>state.slots[slot]=null);
    const overflowLabels=configuredOverflowLabels(),overflow=[],direct=[];
    actions.forEach(action=>{if(action?.overflow===true||overflowLabels.has(String(action?.label||'')))overflow.push(action);else direct.push(action)});
    direct.forEach(action=>{const slot=Number(action?.slot);if([1,2,4,5].includes(slot))state.slots[slot]=action});
    if(overflow.length)placeOptionsButton(overflow,{title:document.body?.dataset?.mytoolNavOptionsTitle||'خيارات إضافية',label:document.body?.dataset?.mytoolNavOptionsLabel||'خيارات',icon:document.body?.dataset?.mytoolNavOptionsIcon||'⋯',slot:Number(document.body?.dataset?.mytoolNavOptionsSlot||5)});
    render();
  }
  function dispatchReady(){window.dispatchEvent(new CustomEvent('mytool-bottom-nav-ready',{detail:{currentApp,appHome:appHome.href,root:rootUrl.href}}))}

  function mount(){
    if(!currentApp)return;
    loadShopAdminNotifications();loadNotesEditor();loadNotesTabs();
    document.addEventListener('pointerdown',event=>{if(optionsPanel&&!optionsPanel.contains(event.target)&&!nav?.contains(event.target))closeOptions()});
    document.addEventListener('keydown',event=>{if(event.key==='Escape')closeOptions()});
    const existing=document.querySelector('.mytool-bottom-nav');
    if(existing){nav=existing;nav.setAttribute('dir','rtl');forceFixedPosition(nav);defaultActions();render();watchNotesPagination();requestAnimationFrame(()=>forceFixedPosition(nav));setTimeout(()=>forceFixedPosition(nav),250);dispatchReady();return}
    nav=document.createElement('nav');nav.className='mytool-bottom-nav';nav.setAttribute('dir','rtl');nav.setAttribute('aria-label','تنقل MyTool السريع');nav.innerHTML=[1,2,3,4,5].map(slot=>'<div class="mytool-bottom-nav-slot" data-slot="'+slot+'"></div>').join('');document.body.appendChild(nav);
    forceFixedPosition(nav);defaultActions();render();watchNotesPagination();requestAnimationFrame(()=>forceFixedPosition(nav));setTimeout(()=>forceFixedPosition(nav),250);dispatchReady();
  }

  if(currentApp==='notes')window.addEventListener('mytool-notes-tab-change',()=>setNotesNav());
  window.MyToolBottomNav={setActions,setHome,setOptions,closeOptions,toast,get currentApp(){return currentApp},get appHome(){return appHome.href},get root(){return rootUrl.href}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
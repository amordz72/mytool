(() => {
  'use strict';

  const script=document.currentScript;
  const rootUrl=script?.dataset?.root?new URL(script.dataset.root,location.href):new URL('./',script?.src||location.href);
  const labels={cards:'البطاقات',qr:'QR',flexy:'فليكسي',programs:'البرامج',shop:'المحل',notes:'الملاحظات','accounts-review':'الحسابات',communication:'التواصل'};
  const rootPath=rootUrl.pathname.endsWith('/')?rootUrl.pathname:rootUrl.pathname+'/';
  const relative=location.pathname.startsWith(rootPath)?location.pathname.slice(rootPath.length):'';
  const currentApp=(document.body?.dataset?.mytoolApp||script?.dataset?.app||relative.split('/').filter(Boolean)[0]||'').trim();
  const appHome=currentApp?new URL(currentApp+'/',rootUrl):rootUrl;
  let nav=null;

  function toast(text,error=false){
    document.querySelector('.mytool-nav-toast')?.remove();
    const el=document.createElement('div');el.className='mytool-nav-toast'+(error?' error':'');el.textContent=text;document.body.appendChild(el);setTimeout(()=>el.remove(),2200);
  }

  function itemHtml(slot,item){
    if(!item)return '<div class="mytool-bottom-nav-empty" aria-hidden="true"></div>';
    const icon=item.icon||'•',label=item.label||'',title=item.title||label,cls='mytool-bottom-nav-item'+(item.home?' is-home':'');
    if(item.href)return '<a class="'+cls+'" href="'+item.href+'" title="'+escapeHtml(title)+'"><span class="mytool-nav-icon">'+escapeHtml(icon)+'</span><span class="mytool-nav-label">'+escapeHtml(label)+'</span></a>';
    return '<button type="button" class="'+cls+'" data-mytool-action-slot="'+slot+'" title="'+escapeHtml(title)+'"'+(item.disabled?' disabled':'')+'><span class="mytool-nav-icon">'+escapeHtml(icon)+'</span><span class="mytool-nav-label">'+escapeHtml(label)+'</span></button>';
  }
  function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

  const state={
    slots:{
      1:{href:rootUrl.href,icon:'MT',label:'MyTool',title:'الرجوع إلى MyTool'},
      2:null,
      3:{href:appHome.href,icon:'⌂',label:'الرئيسية',title:'الرجوع إلى رئيسية '+(labels[currentApp]||'التطبيق الحالي'),home:true},
      4:null,
      5:null
    },
    handlers:{}
  };

  function defaultActions(){
    if(currentApp==='shop')state.slots[5]={icon:'☰',label:'القائمة',title:'فتح قائمة المحل',onClick(){const btn=document.querySelector('#drawerOpen,.menu-toggle');if(btn)btn.click();else toast('القائمة غير متاحة في هذه الصفحة',true)}};
    if(currentApp==='cards'){
      state.slots[4]={href:new URL('cards/settings.html',rootUrl).href,icon:'⚙',label:'إعدادات',title:'إعدادات البطاقات'};
      if(document.getElementById('text'))state.slots[2]={icon:'📋',label:'لصق',title:'لصق النص من الحافظة',async onClick(){try{const value=await navigator.clipboard.readText();const target=document.getElementById('text');if(!target)throw new Error();target.value=value;target.dispatchEvent(new Event('input',{bubbles:true}));target.dispatchEvent(new Event('paste',{bubbles:true}));target.focus();toast('تم اللصق')}catch{document.getElementById('text')?.focus();toast('اضغط مطولًا داخل النص واختر لصق',true)}}};
    }
  }

  function forceFlowPosition(target){
    if(!target)return;
    document.querySelectorAll('.mytool-bottom-nav-spacer').forEach(el=>el.remove());
    const style=target.style;
    [['position','static'],['inset','auto'],['top','auto'],['right','auto'],['bottom','auto'],['left','auto'],['transform','none'],['float','none']].forEach(([prop,value])=>style.setProperty(prop,value,'important'));
  }

  function render(){
    if(!nav)return;
    state.handlers={};
    for(let slot=1;slot<=5;slot++){
      const holder=nav.querySelector('[data-slot="'+slot+'"]');if(!holder)continue;
      const item=state.slots[slot];holder.innerHTML=itemHtml(slot,item);
      if(item&&!item.href&&typeof item.onClick==='function'){
        const button=holder.querySelector('button');
        if(button)button.addEventListener('click',item.onClick);
      }
    }
  }

  function setActions(actions=[]){
    [2,4,5].forEach(slot=>state.slots[slot]=null);
    actions.forEach(action=>{const slot=Number(action?.slot);if([2,4,5].includes(slot))state.slots[slot]=action});
    render();
  }

  function dispatchReady(){
    window.dispatchEvent(new CustomEvent('mytool-bottom-nav-ready',{detail:{currentApp,appHome:appHome.href,root:rootUrl.href}}));
  }

  function mount(){
    if(!currentApp)return;
    const existing=document.querySelector('.mytool-bottom-nav');
    if(existing){
      nav=existing;
      forceFlowPosition(nav);
      defaultActions();render();
      requestAnimationFrame(()=>forceFlowPosition(nav));
      setTimeout(()=>forceFlowPosition(nav),250);
      dispatchReady();
      return;
    }
    nav=document.createElement('nav');
    nav.className='mytool-bottom-nav';
    nav.setAttribute('aria-label','تنقل MyTool السريع');
    nav.innerHTML=[1,2,3,4,5].map(slot=>'<div class="mytool-bottom-nav-slot" data-slot="'+slot+'"></div>').join('');
    document.body.appendChild(nav);
    forceFlowPosition(nav);
    defaultActions();render();
    requestAnimationFrame(()=>forceFlowPosition(nav));
    setTimeout(()=>forceFlowPosition(nav),250);
    dispatchReady();
  }

  window.MyToolBottomNav={setActions,toast,get currentApp(){return currentApp},get appHome(){return appHome.href},get root(){return rootUrl.href}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
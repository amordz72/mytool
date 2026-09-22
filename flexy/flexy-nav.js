(() => {
  'use strict';
  const script=document.currentScript;
  const flexyRoot=new URL('./',script?.src||location.href);

  function role(){
    const ctx=window.MyToolAccessContext;
    return ctx?.adminLike?'admin':'worker';
  }
  function currentName(){return location.pathname.split('/').pop()||'index.html'}
  function applyRequestedView(){
    const current=currentName();
    if(current!=='index.html'&&current!=='')return;
    const view=new URLSearchParams(location.search).get('view');
    if(view==='offers')document.getElementById('offersMode')?.click();
    if(view==='balance')document.getElementById('balanceMode')?.click();
    if(location.hash==='#operationsList')setTimeout(()=>document.getElementById('operationsList')?.scrollIntoView({behavior:'smooth',block:'start'}),60);
  }
  function apply(){
    if(!window.MyToolBottomNav)return false;
    const isAdmin=role()==='admin';
    const current=currentName();

    window.MyToolBottomNav.setHome({
      href:new URL('home.html',flexyRoot).href,
      icon:'⌂',
      label:'الرئيسية',
      title:'رئيسية تميز',
      home:current==='home.html'
    });

    window.MyToolBottomNav.setActions([
      {slot:1,href:new URL('./?view=offers',flexyRoot).href,icon:'☎',label:'فليكسي',title:'فليكسي والعروض',home:(current==='index.html'||current==='')&&new URLSearchParams(location.search).get('view')!=='balance'},
      {slot:2,href:new URL('./?view=balance',flexyRoot).href,icon:'⚡',label:'شحن مباشر',title:'الشحن المباشر',home:(current==='index.html'||current==='')&&new URLSearchParams(location.search).get('view')==='balance'},
      {slot:4,href:new URL('../cards/',flexyRoot).href,icon:'▣',label:'بطاقات',title:'معالج البطاقات'},
      isAdmin
        ? {slot:5,href:new URL('orders.html',flexyRoot).href,icon:'▤',label:'عمليات',title:'عمليات وطابور Flexy',home:current==='orders.html'}
        : {slot:5,href:new URL('./#operationsList',flexyRoot).href,icon:'▤',label:'عمليات',title:'آخر عمليات Flexy'}
    ]);
    applyRequestedView();
    return true;
  }

  if(!apply())window.addEventListener('mytool-bottom-nav-ready',apply,{once:true});
  else applyRequestedView();
})();
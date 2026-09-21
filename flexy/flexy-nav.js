(() => {
  'use strict';
  const script=document.currentScript;
  const flexyRoot=new URL('./',script?.src||location.href);
  const myToolRoot=new URL('../',flexyRoot);

  function role(){
    const ctx=window.MyToolAccessContext;
    return ctx?.adminLike?'admin':'worker';
  }
  function currentName(){return location.pathname.split('/').pop()||'index.html'}
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
      {slot:1,href:new URL('./?v=20260921-empty-phone-2',flexyRoot).href,icon:'☎',label:'فليكسي',title:'فليكسي',home:current==='index.html'||current===''},
      {slot:2,href:new URL('../shop/sale.html',flexyRoot).href,icon:'＋',label:'بيع',title:'البيع في Shop'},
      {slot:4,href:new URL('../cards/',flexyRoot).href,icon:'▣',label:'بطاقات',title:'البطاقات'},
      isAdmin
        ? {slot:5,href:myToolRoot.href,icon:'🧰',label:'الأدوات',title:'أدوات MyTool'}
        : {slot:5,href:new URL('my-account.html',flexyRoot).href,icon:'◉',label:'حسابي',title:'حسابي في تميز',home:current==='my-account.html'}
    ]);
    return true;
  }
  if(!apply())window.addEventListener('mytool-bottom-nav-ready',apply,{once:true});
})();
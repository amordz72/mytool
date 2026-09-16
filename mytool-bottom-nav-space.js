(() => {
  'use strict';

  let resizeObserver=null;
  let finderObserver=null;
  let raf=0;

  function schedule(){
    cancelAnimationFrame(raf);
    raf=requestAnimationFrame(sync);
  }

  function sync(){
    const nav=document.querySelector('.mytool-bottom-nav');
    if(!nav||nav.hidden||getComputedStyle(nav).display==='none')return;
    const rect=nav.getBoundingClientRect();
    const viewportHeight=window.visualViewport?.height||window.innerHeight||document.documentElement.clientHeight;
    const visibleFromTop=Math.max(0,viewportHeight-Math.max(0,rect.top));
    const space=Math.ceil(Math.max(rect.height+20,visibleFromTop+12));
    document.documentElement.style.setProperty('--mytool-bottom-nav-space',space+'px');
    document.documentElement.classList.add('mytool-has-bottom-nav-space');
    const spacer=document.querySelector('.mytool-bottom-nav-spacer');
    if(spacer)spacer.style.setProperty('height',space+'px','important');
    window.dispatchEvent(new CustomEvent('mytool-bottom-nav-space-change',{detail:{space}}));
  }

  function attach(){
    const nav=document.querySelector('.mytool-bottom-nav');
    if(!nav)return false;
    finderObserver?.disconnect();finderObserver=null;
    resizeObserver?.disconnect();
    if('ResizeObserver' in window){
      resizeObserver=new ResizeObserver(schedule);
      resizeObserver.observe(nav);
    }
    schedule();
    setTimeout(schedule,120);
    setTimeout(schedule,420);
    return true;
  }

  function start(){
    if(!attach()){
      finderObserver=new MutationObserver(()=>attach());
      finderObserver.observe(document.body,{childList:true,subtree:true});
    }
    window.addEventListener('resize',schedule,{passive:true});
    window.addEventListener('orientationchange',schedule,{passive:true});
    window.visualViewport?.addEventListener('resize',schedule,{passive:true});
    window.visualViewport?.addEventListener('scroll',schedule,{passive:true});
    window.addEventListener('mytool-bottom-nav-ready',schedule);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

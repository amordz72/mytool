(() => {
'use strict';
let view='source',timer=0;
function panel(id){return document.getElementById(id)}
function force(el,show,display='grid'){
  if(!el)return;
  el.hidden=!show;
  if(show){el.style.removeProperty('display');el.style.display=display}
  else el.style.setProperty('display','none','important');
}
function apply(next){
  if(next)view=next;
  document.body.dataset.accountsView=view;
  force(panel('accountsTotalPanel'),view==='total');
  force(panel('accountsSharedPanel'),view==='shared');
}
function infer(){
  if(document.getElementById('accountsSharedTab')?.classList.contains('active'))return 'shared';
  if(document.getElementById('accountsTotalTab')?.classList.contains('active'))return 'total';
  return 'source';
}
function schedule(next){
  if(next)view=next;
  clearTimeout(timer);
  timer=setTimeout(()=>apply(view),0);
  setTimeout(()=>apply(view),80);
  setTimeout(()=>apply(view),250);
}
document.addEventListener('click',e=>{
  const tab=e.target.closest?.('.tabs .tab');
  if(!tab)return;
  if(tab.id==='accountsTotalTab')schedule('total');
  else if(tab.id==='accountsSharedTab')schedule('shared');
  else schedule('source');
},true);
window.addEventListener('accounts-total-selected',()=>schedule('total'));
window.addEventListener('accounts-shared-selected',()=>schedule('shared'));
window.addEventListener('accounts-source-selected',()=>schedule('source'));
window.addEventListener('accounts-total-exit',()=>{if(view==='total')schedule(infer())});
window.addEventListener('accounts-shared-exit',()=>{if(view==='shared')schedule(infer())});
function start(){
  view=infer();apply(view);
  const root=document.getElementById('app')||document.body;
  new MutationObserver(()=>schedule()).observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
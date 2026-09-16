/* MyTool core shop UI enhancer — visual/ergonomic only. */
(function(){
  'use strict';
  const screen=document.body?.dataset?.screen||'';
  if(!['index','sale','stock'].includes(screen))return;
  const script=document.currentScript;
  const cssHref=new URL('shop-core-design.css?v=20260916-1',script?.src||location.href).href;
  if(!document.querySelector('link[data-shop-core-design]')){const link=document.createElement('link');link.rel='stylesheet';link.href=cssHref;link.dataset.shopCoreDesign='1';document.head.appendChild(link)}
  document.documentElement.classList.add('mt-core-design');
  const workerActive=Boolean(localStorage.getItem('mytool_shop_worker_token'))&&!localStorage.getItem('mytool_admin_expires_at');
  if(workerActive)document.documentElement.classList.add('mt-worker-mode');
  function addHeading(target,title,subtitle,kicker){if(!target||document.querySelector('.mt-page-heading[data-for="'+screen+'"]'))return false;const el=document.createElement('section');el.className='mt-page-heading';el.dataset.for=screen;el.innerHTML='<div><div class="mt-kicker">'+kicker+'</div><h1>'+title+'</h1><p>'+subtitle+'</p></div>';target.insertAdjacentElement('beforebegin',el);return true}
  function enhanceSale(){const card=document.getElementById('saleCard');if(!card)return false;addHeading(card,'البيع','عملية قصيرة وواضحة: المنتج ثم الكمية والسعر ثم التأكيد.','نقطة البيع POS');const qty=document.getElementById('saleQty');if(qty&&!qty.closest('.mt-qty-control')){const wrap=document.createElement('div');wrap.className='mt-qty-control';const minus=document.createElement('button');minus.type='button';minus.textContent='−';minus.setAttribute('aria-label','إنقاص الكمية');const plus=document.createElement('button');plus.type='button';plus.textContent='+';plus.setAttribute('aria-label','زيادة الكمية');qty.parentNode.insertBefore(wrap,qty);wrap.append(minus,qty,plus);const nudge=delta=>{let value=Number(qty.value||1)+delta;value=Math.max(Number(qty.min||1),value);qty.value=String(value);qty.dispatchEvent(new Event('input',{bubbles:true}));qty.dispatchEvent(new Event('change',{bubbles:true}))};minus.addEventListener('click',()=>nudge(-1));plus.addEventListener('click',()=>nudge(1))}return true}
  function enhanceStock(){const card=document.getElementById('stockCard');if(!card)return false;addHeading(card,'المخزون','ابحث أولًا ثم افتح التفاصيل عند الحاجة بدل ازدحام الشاشة.','المخزون');const search=document.getElementById('stockSearch');if(search)search.setAttribute('autocomplete','off');return true}
  function enhanceHome(){const hero=document.querySelector('.dash-hero');if(!hero)return false;addHeading(hero,workerActive?'رئيسية العامل':'الرئيسية',workerActive?'أهم عمليات المحل أمامك مباشرة، والباقي من «المزيد».':'ملخص سريع للمحل والعمليات الأساسية.','MyTool');return true}
  function run(){return screen==='sale'?enhanceSale():screen==='stock'?enhanceStock():enhanceHome()}
  if(run())return;let tries=0;const timer=setInterval(()=>{tries++;if(run()||tries>=50)clearInterval(timer)},100)
})();

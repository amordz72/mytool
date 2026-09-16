/* MyTool physical inventory UI enhancer — visual/ergonomic only. */
(function(){
  'use strict';
  if(document.body?.dataset?.screen!=='physical-inventory')return;

  const script=document.currentScript;
  const cssHref=new URL('physical-inventory-design.css?v=20260916-1',script?.src||location.href).href;
  if(!document.querySelector('link[data-physical-inventory-design]')){
    const link=document.createElement('link');
    link.rel='stylesheet';link.href=cssHref;link.dataset.physicalInventoryDesign='1';document.head.appendChild(link);
  }

  const $=id=>document.getElementById(id);
  const FILTERS=[
    ['uncounted','غير مجرودة','remaining'],
    ['counted','تم جردها','counted'],
    ['review','للمراجعة','reviewCount'],
    ['all','الكل','total']
  ];

  function numberText(id){return Number(String($(id)?.textContent||'0').replace(/[^0-9.-]/g,''))||0}

  function ensureHeading(){
    const main=document.querySelector('main');
    if(!main||main.querySelector('.physical-page-heading'))return;
    const heading=document.createElement('div');
    heading.className='physical-page-heading';
    heading.innerHTML='<div><span class="physical-kicker">الجرد الميداني</span><h1>الجرد الفعلي</h1><p>عدّ سريع للمنتجات مع حفظ المسودة، ثم اعتماد الدفعة كاملة بعد المراجعة.</p></div>';
    const message=$('message');
    if(message)message.insertAdjacentElement('afterend',heading);else main.prepend(heading);
  }

  function ensureProgress(){
    const metrics=document.querySelector('main .metrics');
    if(!metrics||document.querySelector('.physical-progress'))return;
    const block=document.createElement('div');
    block.className='physical-progress';
    block.innerHTML='<div class="physical-progress-head"><strong>تقدم الجرد</strong><span id="physical-progress-label">0%</span></div><div class="physical-progress-track"><div id="physical-progress-fill" class="physical-progress-fill"></div></div><div class="physical-progress-note"><span>ابدأ بغير المجرود</span><span id="physical-progress-remaining">0 متبقي</span></div>';
    metrics.insertAdjacentElement('afterend',block);
  }

  function ensureFilterTabs(){
    const filter=$('filter');
    if(!filter||document.querySelector('.physical-filter-tabs'))return;
    const section=filter.closest('section.card');
    section?.classList.add('physical-filter-card','physical-filter-enhanced');
    filter.parentElement?.classList.add('physical-native-filter');
    const tabs=document.createElement('div');
    tabs.className='physical-filter-tabs';
    tabs.setAttribute('role','tablist');
    tabs.innerHTML=FILTERS.map(([value,label,countId])=>'<button type="button" data-physical-filter="'+value+'"><span>'+label+'</span><b data-count-from="'+countId+'">0</b></button>').join('');
    section?.appendChild(tabs);
    tabs.addEventListener('click',event=>{
      const button=event.target.closest('[data-physical-filter]');
      if(!button)return;
      filter.value=button.dataset.physicalFilter;
      filter.dispatchEvent(new Event('change',{bubbles:true}));
      syncFilterTabs();
    });
    syncFilterTabs();
  }

  function syncFilterTabs(){
    const current=$('filter')?.value||'uncounted';
    document.querySelectorAll('[data-physical-filter]').forEach(button=>button.classList.toggle('active',button.dataset.physicalFilter===current));
    document.querySelectorAll('[data-count-from]').forEach(badge=>{badge.textContent=numberText(badge.dataset.countFrom)});
  }

  function updateProgress(){
    const total=numberText('total'),counted=numberText('counted'),remaining=numberText('remaining');
    const pct=total?Math.min(100,Math.round((counted/total)*100)):0;
    const fill=$('physical-progress-fill'),label=$('physical-progress-label'),left=$('physical-progress-remaining');
    if(fill)fill.style.width=pct+'%';if(label)label.textContent=pct+'%';if(left)left.textContent=remaining+' متبقي';
    syncFilterTabs();
  }

  function readSystemQuantity(card){
    const first=card?.querySelector('.count-grid .box strong');
    return Number(String(first?.textContent||'0').replace(/[^0-9.-]/g,''))||0;
  }

  function previewDifference(card){
    if(!card)return;
    const input=card.querySelector('.actual'),diff=card.querySelector('.diff');
    if(!input||!diff)return;
    if(input.value===''){diff.textContent='—';diff.classList.remove('plus','minus');return}
    const value=Number(input.value),delta=value-readSystemQuantity(card);
    diff.textContent=(delta>0?'+':'')+delta;
    diff.classList.toggle('plus',delta>0);diff.classList.toggle('minus',delta<0);
  }

  function decorateCard(card){
    if(!card||card.dataset.physicalEnhanced==='1')return;
    card.dataset.physicalEnhanced='1';
    const input=card.querySelector('.actual'),actions=card.querySelector('.actions');
    if(!input||!actions)return;
    const system=readSystemQuantity(card);
    const box=input.closest('.box');
    if(box){
      box.classList.add('physical-actual-box');
      const tally=document.createElement('div');
      tally.className='physical-tally';
      input.replaceWith(tally);
      tally.innerHTML='<button type="button" data-count-step="-1" aria-label="إنقاص العدد">−</button><span class="physical-input-slot"></span><button type="button" data-count-step="1" aria-label="زيادة العدد">+</button>';
      tally.querySelector('.physical-input-slot').appendChild(input);
    }
    const quick=document.createElement('div');
    quick.className='physical-quick-count';
    quick.innerHTML='<button type="button" data-count-exact="0">صفر</button><button type="button" data-count-exact="'+system+'">تطابق ('+system+')</button>';
    actions.insertAdjacentElement('beforebegin',quick);
    previewDifference(card);
  }

  function decorateCards(){document.querySelectorAll('#items .item').forEach(decorateCard)}

  function enhanceSecondarySections(){
    [['pendingList','طلبات النقص بانتظار الإدارة'],['historyList','آخر عمليات الجرد']].forEach(([id,title])=>{
      const section=$(id)?.closest('section.card');
      if(!section||section.dataset.physicalSecondary==='1')return;
      section.dataset.physicalSecondary='1';section.classList.add('physical-secondary-section');
      const caption=document.createElement('div');caption.className='physical-secondary-caption';caption.textContent=title;section.prepend(caption);
    });
  }

  function mount(){
    ensureHeading();ensureProgress();ensureFilterTabs();decorateCards();enhanceSecondarySections();updateProgress();
    const items=$('items');
    if(items){
      items.addEventListener('click',event=>{
        const card=event.target.closest('.item');if(!card)return;
        const input=card.querySelector('.actual');if(!input)return;
        const step=event.target.closest('[data-count-step]');
        const exact=event.target.closest('[data-count-exact]');
        if(step){event.preventDefault();const current=input.value===''?readSystemQuantity(card):Number(input.value)||0;input.value=Math.max(0,current+Number(step.dataset.countStep));input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}
        if(exact){event.preventDefault();input.value=Math.max(0,Number(exact.dataset.countExact)||0);input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}
      });
      items.addEventListener('input',event=>{if(event.target.matches('.actual'))previewDifference(event.target.closest('.item'))});
      new MutationObserver(()=>{decorateCards();updateProgress()}).observe(items,{childList:true,subtree:true});
    }
    const metricRoot=document.querySelector('main .metrics');
    if(metricRoot)new MutationObserver(updateProgress).observe(metricRoot,{subtree:true,childList:true,characterData:true});
    const filter=$('filter');if(filter)filter.addEventListener('change',syncFilterTabs);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();

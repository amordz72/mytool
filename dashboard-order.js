(() => {
  'use strict';

  const STORAGE_KEY='mytool_dashboard_card_order_v1';
  const $=id=>document.getElementById(id);
  let editing=false;

  function cardKey(card){
    const href=card.getAttribute('href')||'';
    try{
      const url=new URL(href,location.href);
      return url.origin===location.origin
        ? 'local:'+url.pathname.replace(/\/+$/,'')
        : 'external:'+url.origin+url.pathname;
    }catch(_e){
      return 'href:'+href;
    }
  }

  function sections(){
    return [...document.querySelectorAll('#adminTools section.grid[data-dashboard-section]')];
  }

  function readConfig(){
    try{
      const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
      return value&&typeof value==='object'?value:{};
    }catch(_e){
      return {};
    }
  }

  function writeConfig(){
    const value={};
    sections().forEach(section=>{
      value[section.dataset.dashboardSection]=[...section.querySelectorAll(':scope > a.card[href]')].map(cardKey);
    });
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(value));}catch(_e){}
  }

  function applyConfig(){
    const config=readConfig();
    sections().forEach(section=>{
      const key=section.dataset.dashboardSection;
      const cards=[...section.querySelectorAll(':scope > a.card[href]')];
      const byKey=new Map(cards.map(card=>[cardKey(card),card]));
      const ordered=[];
      (Array.isArray(config[key])?config[key]:[]).forEach(id=>{
        const card=byKey.get(id);
        if(card){ordered.push(card);byKey.delete(id);}
      });
      cards.forEach(card=>{if(byKey.has(cardKey(card))){ordered.push(card);byKey.delete(cardKey(card));}});
      ordered.forEach(card=>section.appendChild(card));
    });
  }

  function ensureControls(){
    sections().forEach(section=>{
      [...section.querySelectorAll(':scope > a.card[href]')].forEach(card=>{
        if(card.querySelector(':scope > .dashboard-card-order'))return;
        const controls=document.createElement('div');
        controls.className='dashboard-card-order';
        controls.hidden=!editing;
        controls.innerHTML='<button type="button" data-move="up" aria-label="تحريك للأعلى">↑</button><button type="button" data-move="down" aria-label="تحريك للأسفل">↓</button>';
        controls.addEventListener('click',event=>{
          const button=event.target.closest('button[data-move]');
          if(!button)return;
          event.preventDefault();
          event.stopPropagation();
          const dir=button.dataset.move;
          if(dir==='up'){
            const prev=card.previousElementSibling;
            if(prev?.matches('a.card[href]'))section.insertBefore(card,prev);
          }else{
            const next=card.nextElementSibling;
            if(next?.matches('a.card[href]'))section.insertBefore(next,card);
          }
          writeConfig();
        });
        card.appendChild(controls);
      });
    });
  }

  function setEditing(on){
    editing=Boolean(on);
    document.body.classList.toggle('dashboard-order-edit',editing);
    ensureControls();
    document.querySelectorAll('.dashboard-card-order').forEach(el=>el.hidden=!editing);
    const btn=$('dashboardOrderBtn');
    if(btn)btn.textContent=editing?'تم':'تعديل الترتيب';
    const reset=$('dashboardOrderResetBtn');
    if(reset)reset.hidden=!editing;
    const hint=$('dashboardOrderHint');
    if(hint)hint.hidden=!editing;
  }

  function resetOrder(){
    try{localStorage.removeItem(STORAGE_KEY);}catch(_e){}
    location.reload();
  }

  function injectStyle(){
    if(document.getElementById('dashboardOrderStyle'))return;
    const style=document.createElement('style');
    style.id='dashboardOrderStyle';
    style.textContent=`
      .dashboard-controls{display:flex;align-items:center;gap:8px;justify-content:flex-start;margin:10px 0 4px;min-height:38px}
      .dashboard-controls .small{margin:0}
      .dashboard-controls .btn{width:auto;padding:8px 11px}
      .dashboard-card-order{position:absolute;inset-inline-start:8px;top:8px;display:flex;gap:5px;z-index:3}
      .dashboard-card-order button{width:32px;height:32px;padding:0;border:1px solid var(--line);background:#fff;color:#14729f;border-radius:10px;font-weight:900;cursor:pointer;box-shadow:0 3px 10px rgba(22,48,71,.08)}
      .dashboard-order-edit #adminTools .card{position:relative;outline:2px dashed #bfe3f6;outline-offset:-3px}
      @media(max-width:600px){
        #dashboard .grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
        #dashboard .card{padding:10px;border-radius:14px;min-height:94px}
        #dashboard .icon{width:38px;height:38px;border-radius:11px;font-size:20px;margin-bottom:7px}
        #dashboard .card h2{font-size:13px;line-height:1.35;margin:0}
        #dashboard .card p,#dashboard .card .badge{display:none}
        #dashboard .section-title{margin:17px 3px 8px;font-size:15px}
        .dashboard-controls{margin-top:8px;margin-bottom:2px}
        .dashboard-card-order{inset-inline-start:5px;top:5px;gap:3px}
        .dashboard-card-order button{width:25px;height:25px;border-radius:8px;font-size:12px}
      }
    `;
    document.head.appendChild(style);
  }

  function boot(){
    const btn=$('dashboardOrderBtn');
    if(!btn)return;
    injectStyle();
    applyConfig();
    ensureControls();
    btn.addEventListener('click',()=>setEditing(!editing));
    $('dashboardOrderResetBtn')?.addEventListener('click',resetOrder);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
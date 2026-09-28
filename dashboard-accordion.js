(() => {
  'use strict';

  const MOBILE_QUERY='(max-width: 700px)';
  let groups=[];

  function injectStyle(){
    if(document.getElementById('dashboardAccordionStyle'))return;
    const style=document.createElement('style');
    style.id='dashboardAccordionStyle';
    style.textContent=`
      #adminTools > .section-title.dashboard-accordion-title{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        padding:11px 13px;
        border:1px solid var(--line);
        border-radius:14px;
        background:rgba(255,255,255,.86);
        box-shadow:0 4px 14px rgba(22,48,71,.05);
        cursor:pointer;
        user-select:none;
        scroll-margin-top:78px;
      }
      #adminTools > .section-title.dashboard-accordion-title:focus-visible{
        outline:3px solid rgba(46,168,230,.28);
        outline-offset:2px;
      }
      .dashboard-accordion-indicator{
        width:28px;
        height:28px;
        border-radius:9px;
        display:grid;
        place-items:center;
        flex:0 0 auto;
        background:#eef8ff;
        color:#14729f;
        font-size:16px;
        font-weight:900;
        transition:transform .18s ease;
      }
      .dashboard-accordion-title[aria-expanded="true"] .dashboard-accordion-indicator{
        transform:rotate(180deg);
      }
      @media(max-width:700px){
        #adminTools > .section-title.dashboard-accordion-title{
          position:relative;
          margin:12px 0 7px;
          padding:11px 12px;
          font-size:15px;
          scroll-margin-top:72px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function collectGroups(){
    const host=document.getElementById('adminTools');
    if(!host)return [];
    return [...host.querySelectorAll(':scope > .section-title')].map(title=>{
      const panel=title.nextElementSibling;
      if(!panel?.matches('section.grid[data-dashboard-section]'))return null;
      return {title,panel};
    }).filter(Boolean);
  }

  function setOpen(target,shouldScroll=false){
    groups.forEach(group=>{
      const open=group===target;
      group.panel.hidden=!open;
      group.title.setAttribute('aria-expanded',open?'true':'false');
    });

    if(!shouldScroll||!window.matchMedia(MOBILE_QUERY).matches)return;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const bar=document.querySelector('.mytool-shell-topbar');
      const offset=Math.max(64,Math.round((bar?.getBoundingClientRect().height||52)+10));
      const currentTop=target.title.getBoundingClientRect().top;
      const comfortableTop=offset+8;
      const tooLow=currentTop>Math.min(window.innerHeight*.34,240);
      const tooHigh=currentTop<offset;
      if(!tooLow&&!tooHigh)return;
      const y=window.scrollY+currentTop-comfortableTop;
      window.scrollTo({top:Math.max(0,y),behavior:'smooth'});
    }));
  }

  function prepareTitle(group,index){
    const {title,panel}=group;
    title.classList.add('dashboard-accordion-title');
    title.setAttribute('role','button');
    title.setAttribute('tabindex','0');
    title.setAttribute('aria-controls',panel.id||(panel.id='dashboardAccordionPanel'+(index+1)));
    if(!title.querySelector('.dashboard-accordion-indicator')){
      const indicator=document.createElement('span');
      indicator.className='dashboard-accordion-indicator';
      indicator.textContent='⌄';
      indicator.setAttribute('aria-hidden','true');
      title.appendChild(indicator);
    }
    const open=()=>setOpen(group,true);
    title.addEventListener('click',open);
    title.addEventListener('keydown',event=>{
      if(event.key!=='Enter'&&event.key!==' ')return;
      event.preventDefault();
      open();
    });
  }

  function boot(){
    injectStyle();
    groups=collectGroups();
    if(!groups.length)return;
    groups.forEach(prepareTitle);
    setOpen(groups[0],false);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
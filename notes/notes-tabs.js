/* MyTool Notes #104 — split active notes and archive into tabs. */
(() => {
  'use strict';

  const TAB_KEY='mytool.notes.activeTab';
  let lastNotesStatus='ACTIVE';

  function ensureStyles(){
    if(document.getElementById('mytool-notes-tabs-style'))return;
    const style=document.createElement('style');
    style.id='mytool-notes-tabs-style';
    style.textContent=`
.notes-tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:0 0 14px;padding:5px;background:#e8eef3;border:1px solid #d9e1e7;border-radius:16px;position:sticky;top:58px;z-index:4}
.notes-tab{min-height:44px;border:0;border-radius:12px;background:transparent;color:#475569;font-weight:900;cursor:pointer}
.notes-tab.active{background:#fff;color:var(--teal,#117f78);box-shadow:0 3px 12px #102a4318}
.notes-archive-mode .notes-compose-panel{display:none!important}
.notes-archive-mode #statusFilter{display:none!important}
.notes-archive-mode .toolbar{grid-template-columns:2fr 1fr}
@media(max-width:640px){.notes-tabs{top:53px}.notes-archive-mode .toolbar{grid-template-columns:1fr}}
`;
    document.head.appendChild(style);
  }

  function currentSavedTab(){
    try{return sessionStorage.getItem(TAB_KEY)==='archive'?'archive':'notes'}catch{return 'notes'}
  }

  function saveTab(tab){try{sessionStorage.setItem(TAB_KEY,tab)}catch(_e){}}

  function dispatchFilter(filter){
    filter.dispatchEvent(new Event('change',{bubbles:true}));
  }

  function setTab(tab,{fromFilter=false}={}){
    const filter=document.getElementById('statusFilter');
    const tabs=document.getElementById('notesTabs');
    if(!filter||!tabs)return;
    const archive=tab==='archive';
    document.documentElement.classList.toggle('notes-archive-mode',archive);
    tabs.querySelectorAll('.notes-tab').forEach(button=>{
      const active=button.dataset.tab===tab;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',active?'true':'false');
    });
    saveTab(tab);
    if(fromFilter)return;
    if(archive){
      if(filter.value!=='ARCHIVED'){
        if(!['ARCHIVED','ALL'].includes(filter.value))lastNotesStatus=filter.value||'ACTIVE';
        filter.value='ARCHIVED';
        dispatchFilter(filter);
      }
    }else{
      const target=['ARCHIVED','ALL'].includes(lastNotesStatus)?'ACTIVE':lastNotesStatus;
      if(filter.value!==target){filter.value=target;dispatchFilter(filter)}
    }
  }

  function start(){
    ensureStyles();
    const main=document.querySelector('main');
    const panels=[...document.querySelectorAll('main > .panel')];
    const compose=panels[0];
    const filter=document.getElementById('statusFilter');
    if(!main||!compose||!filter||document.getElementById('notesTabs'))return;
    compose.classList.add('notes-compose-panel');
    if(!['ARCHIVED','ALL'].includes(filter.value))lastNotesStatus=filter.value||'ACTIVE';

    const tabs=document.createElement('div');
    tabs.id='notesTabs';
    tabs.className='notes-tabs';
    tabs.setAttribute('role','tablist');
    tabs.setAttribute('aria-label','أقسام الملاحظات');
    tabs.innerHTML='<button type="button" class="notes-tab" data-tab="notes" role="tab">📝 الملاحظات</button><button type="button" class="notes-tab" data-tab="archive" role="tab">🗃 الأرشيف</button>';
    main.insertBefore(tabs,compose);

    tabs.querySelectorAll('.notes-tab').forEach(button=>button.onclick=()=>setTab(button.dataset.tab));
    filter.addEventListener('change',()=>{
      if(filter.value==='ARCHIVED')setTab('archive',{fromFilter:true});
      else{
        if(filter.value!=='ALL')lastNotesStatus=filter.value||'ACTIVE';
        setTab('notes',{fromFilter:true});
      }
    });

    const initial=currentSavedTab();
    setTab(initial);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

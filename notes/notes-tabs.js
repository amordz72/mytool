/* MyTool Notes #104/#105 — compact tabs: quick, all notes, archive. */
(() => {
  'use strict';

  const TAB_KEY='mytool.notes.activeTab.v2';
  let lastNotesStatus='ACTIVE';
  let listObserver=null;

  function ensureStyles(){
    if(document.getElementById('mytool-notes-tabs-style'))return;
    const style=document.createElement('style');
    style.id='mytool-notes-tabs-style';
    style.textContent=`
.notes-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:0 0 14px;padding:5px;background:#e8eef3;border:1px solid #d9e1e7;border-radius:16px;position:sticky;top:58px;z-index:4}
.notes-tab{min-height:44px;border:0;border-radius:12px;background:transparent;color:#475569;font-weight:900;cursor:pointer}
.notes-tab.active{background:#fff;color:var(--teal,#117f78);box-shadow:0 3px 12px #102a4318}
.notes-quick-mode .notes-list-panel,.notes-quick-mode #list,.notes-quick-mode #notesPager{display:none!important}
.notes-list-mode .notes-compose-panel,.notes-list-mode .notes-quick-latest{display:none!important}
.notes-archive-mode .notes-compose-panel,.notes-archive-mode .notes-quick-latest{display:none!important}
.notes-archive-mode #statusFilter{display:none!important}
.notes-archive-mode .toolbar{grid-template-columns:2fr 1fr}
.notes-quick-latest{padding:14px 16px;cursor:pointer}
.notes-quick-latest-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
.notes-quick-latest-title{font-weight:900}.notes-quick-latest-open{font-size:12px;font-weight:900;color:var(--teal,#117f78)}
.notes-quick-latest-body{color:#334155;line-height:1.7;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.notes-quick-latest-meta{margin-top:8px;font-size:12px;color:#64748b}
.notes-quick-empty{color:#64748b;text-align:center;padding:12px}
@media(max-width:640px){.notes-tabs{top:53px}.notes-tab{font-size:12px}.notes-archive-mode .toolbar{grid-template-columns:1fr}}
`;
    document.head.appendChild(style);
  }

  function currentSavedTab(){
    try{
      const saved=sessionStorage.getItem(TAB_KEY);
      return ['quick','notes','archive'].includes(saved)?saved:'quick';
    }catch{return 'quick'}
  }

  function saveTab(tab){try{sessionStorage.setItem(TAB_KEY,tab)}catch(_e){}}
  function dispatchFilter(filter){filter.dispatchEvent(new Event('change',{bubbles:true}))}

  function ensureQuickLatest(){
    let panel=document.getElementById('notesQuickLatest');
    if(panel)return panel;
    const list=document.getElementById('list');
    if(!list)return null;
    panel=document.createElement('section');
    panel.id='notesQuickLatest';
    panel.className='panel notes-quick-latest';
    panel.setAttribute('role','button');
    panel.tabIndex=0;
    list.insertAdjacentElement('beforebegin',panel);
    const open=()=>{
      const id=panel.dataset.noteId||'';
      setTab('notes');
      setTimeout(()=>{
        const note=[...document.querySelectorAll('#list > .note')].find(article=>article.querySelector('.pick')?.value===id);
        if(!note)return;
        const more=note.querySelector('.more');
        if(more&&note.querySelector('.note-body')?.classList.contains('collapsed'))more.click();
        note.scrollIntoView({behavior:'smooth',block:'start'});
      },80);
    };
    panel.addEventListener('click',open);
    panel.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open()}});
    return panel;
  }

  function renderQuickLatest(){
    const panel=ensureQuickLatest();
    if(!panel)return;
    const note=document.querySelector('#list > .note');
    if(!note){
      panel.dataset.noteId='';
      panel.innerHTML='<div class="notes-quick-empty">لا توجد ملاحظات حالية.</div>';
      return;
    }
    const id=note.querySelector('.pick')?.value||'';
    const body=note.querySelector('.note-body')?.textContent?.trim()||'ملاحظة بدون نص';
    const meta=note.querySelector('.meta')?.textContent?.trim()||'';
    const badges=[...note.querySelectorAll('.badge')].map(x=>x.textContent.trim()).filter(Boolean).slice(0,3).join(' • ');
    panel.dataset.noteId=id;
    panel.innerHTML='<div class="notes-quick-latest-head"><span class="notes-quick-latest-title">آخر ملاحظة'+(id?' #'+id:'')+'</span><span class="notes-quick-latest-open">فتح ›</span></div><div class="notes-quick-latest-body">'+escapeHtml(body)+'</div><div class="notes-quick-latest-meta">'+escapeHtml([badges,meta].filter(Boolean).join(' — '))+'</div>';
  }

  function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

  function notifyTabChange(tab){
    window.dispatchEvent(new CustomEvent('mytool-notes-tab-change',{detail:{tab}}));
  }

  function setTab(tab,{fromFilter=false}={}){
    const filter=document.getElementById('statusFilter');
    const tabs=document.getElementById('notesTabs');
    if(!filter||!tabs)return;
    if(!['quick','notes','archive'].includes(tab))tab='quick';
    const root=document.documentElement;
    root.classList.toggle('notes-quick-mode',tab==='quick');
    root.classList.toggle('notes-list-mode',tab==='notes');
    root.classList.toggle('notes-archive-mode',tab==='archive');
    tabs.querySelectorAll('.notes-tab').forEach(button=>{
      const active=button.dataset.tab===tab;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',active?'true':'false');
    });
    saveTab(tab);
    if(tab==='quick')renderQuickLatest();
    notifyTabChange(tab);
    if(fromFilter)return;
    if(tab==='archive'){
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
    const compose=panels[0],listPanel=panels[1];
    const filter=document.getElementById('statusFilter');
    const list=document.getElementById('list');
    if(!main||!compose||!listPanel||!filter||!list||document.getElementById('notesTabs'))return;
    compose.classList.add('notes-compose-panel');
    listPanel.classList.add('notes-list-panel');
    if(!['ARCHIVED','ALL'].includes(filter.value))lastNotesStatus=filter.value||'ACTIVE';

    const tabs=document.createElement('div');
    tabs.id='notesTabs';
    tabs.className='notes-tabs';
    tabs.setAttribute('role','tablist');
    tabs.setAttribute('aria-label','أقسام الملاحظات');
    tabs.innerHTML='<button type="button" class="notes-tab" data-tab="quick" role="tab">⚡ سريع</button><button type="button" class="notes-tab" data-tab="notes" role="tab">📝 الملاحظات</button><button type="button" class="notes-tab" data-tab="archive" role="tab">🗃 الأرشيف</button>';
    main.insertBefore(tabs,compose);
    ensureQuickLatest();

    tabs.querySelectorAll('.notes-tab').forEach(button=>button.onclick=()=>setTab(button.dataset.tab));
    filter.addEventListener('change',()=>{
      if(filter.value==='ARCHIVED')setTab('archive',{fromFilter:true});
      else if(!document.documentElement.classList.contains('notes-quick-mode')){
        if(filter.value!=='ALL')lastNotesStatus=filter.value||'ACTIVE';
        setTab('notes',{fromFilter:true});
      }
    });

    listObserver=new MutationObserver(()=>renderQuickLatest());
    listObserver.observe(list,{childList:true,subtree:true,characterData:true});
    renderQuickLatest();
    setTab(currentSavedTab());
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

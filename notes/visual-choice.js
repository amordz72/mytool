/* Tasks #84/#85/#86/#88/#89/#90 — visual choices, responsive note actions, archive tab and no-jump local actions. */
(function(){
  'use strict';

  const MAX_OPTIONS=12;
  const PRIMARY_IDS=new Set(['type','priority','area']);
  const state=new WeakMap();
  let activeSelect=null;

  function eligible(select){
    if(!(select instanceof HTMLSelectElement))return false;
    if(select.multiple||select.dataset.visualChoice==='off')return false;
    const count=[...select.options].filter(o=>!o.hidden).length;
    return count>=2&&count<=MAX_OPTIONS;
  }

  function optionRows(select){
    return [...select.options].filter(o=>!o.hidden).map(o=>({value:o.value,label:(o.textContent||o.label||o.value).trim(),disabled:o.disabled}));
  }

  function prepareContainers(){
    const toolbar=document.querySelector('section.panel .toolbar');
    if(toolbar&&!toolbar.dataset.containerReady){
      toolbar.dataset.containerReady='1';
      const search=document.getElementById('search');
      const status=document.getElementById('statusFilter');
      const type=document.getElementById('typeFilter');
      const searchGroup=document.createElement('div');
      searchGroup.className='toolbar-search';
      const filterGroup=document.createElement('div');
      filterGroup.className='toolbar-filters';
      if(search)searchGroup.appendChild(search);
      if(status)filterGroup.appendChild(status);
      if(type)filterGroup.appendChild(type);
      toolbar.append(searchGroup,filterGroup);
    }
  }

  function syncArchiveTabs(){
    const filter=document.getElementById('statusFilter');
    const tabs=document.querySelector('.notes-tabs');
    if(!filter||!tabs)return;
    const archived=filter.value==='ARCHIVED';
    document.body.classList.toggle('notes-archive-mode',archived);
    tabs.querySelectorAll('[data-notes-tab]').forEach(button=>{
      const active=(button.dataset.notesTab==='archived')===archived;
      button.classList.toggle('is-active',active);
      button.setAttribute('aria-selected',String(active));
    });
  }

  function setNotesTab(mode){
    const filter=document.getElementById('statusFilter');
    if(!filter)return;
    filter.value=mode==='archived'?'ARCHIVED':'ACTIVE';
    filter.dispatchEvent(new Event('input',{bubbles:true}));
    filter.dispatchEvent(new Event('change',{bubbles:true}));
    syncArchiveTabs();
  }

  function prepareArchiveTabs(){
    const toolbar=document.querySelector('section.panel .toolbar');
    const filter=document.getElementById('statusFilter');
    if(!toolbar||!filter)return;

    const archivedOption=filter.querySelector('option[value="ARCHIVED"]');
    if(archivedOption)archivedOption.hidden=true;

    let tabs=document.querySelector('.notes-tabs');
    if(!tabs){
      tabs=document.createElement('div');
      tabs.className='notes-tabs';
      tabs.setAttribute('role','tablist');
      tabs.setAttribute('aria-label','عرض الملاحظات');
      const current=document.createElement('button');
      current.type='button';
      current.className='notes-tab';
      current.dataset.notesTab='current';
      current.textContent='الحالية';
      current.setAttribute('role','tab');
      current.addEventListener('click',()=>setNotesTab('current'));
      const archived=document.createElement('button');
      archived.type='button';
      archived.className='notes-tab';
      archived.dataset.notesTab='archived';
      archived.textContent='المؤرشفة';
      archived.setAttribute('role','tab');
      archived.addEventListener('click',()=>setNotesTab('archived'));
      tabs.append(current,archived);
      toolbar.parentElement.insertBefore(tabs,toolbar);
    }

    if(!filter.dataset.archiveTabsReady){
      filter.dataset.archiveTabsReady='1';
      filter.addEventListener('change',syncArchiveTabs);
      filter.addEventListener('input',syncArchiveTabs);
    }
    syncArchiveTabs();
  }

  function markLayout(select){
    if(!PRIMARY_IDS.has(select.id))return;
    const label=select.closest('label');
    if(!label)return;
    label.classList.add('vchoice-primary-field');
    const row=label.parentElement;
    if(row?.classList.contains('row'))row.classList.add('vchoice-primary-row');
  }

  function closeActive(except=null){
    if(!activeSelect||activeSelect===except)return;
    const previous=activeSelect;
    activeSelect=null;
    const old=state.get(previous);
    if(old){old.expanded=false;render(previous)}
  }

  function setExpanded(select,expanded){
    const s=state.get(select);
    if(!s||select.disabled)return;
    if(expanded){
      closeActive(select);
      activeSelect=select;
    }else if(activeSelect===select){
      activeSelect=null;
    }
    s.expanded=expanded;
    render(select);
  }

  function build(select){
    if(state.has(select)||!eligible(select))return;
    markLayout(select);
    select.classList.add('vchoice-source');
    select.tabIndex=-1;

    const root=document.createElement('div');
    root.className='vchoice';
    root.dataset.forSelect=select.id||'';
    const current=document.createElement('div');
    current.className='vchoice-current';
    const selected=document.createElement('button');
    selected.type='button';
    selected.className='vchoice-selected';
    selected.setAttribute('aria-haspopup','listbox');
    const selectedText=document.createElement('span');
    selectedText.className='vchoice-selected-text';
    const caret=document.createElement('span');
    caret.className='vchoice-caret';
    caret.setAttribute('aria-hidden','true');
    selected.append(selectedText,caret);
    const options=document.createElement('div');
    options.className='vchoice-options';
    options.hidden=true;
    options.setAttribute('role','listbox');
    current.append(selected);
    root.append(current,options);
    select.insertAdjacentElement('afterend',root);

    const s={root,current,selected,selectedText,caret,options,expanded:false,lastSignature:''};
    state.set(select,s);

    selected.addEventListener('click',()=>setExpanded(select,!s.expanded));
    select.addEventListener('change',()=>{
      s.expanded=false;
      if(activeSelect===select)activeSelect=null;
      render(select);
    });
    select.addEventListener('input',()=>render(select));
    render(select);
  }

  function render(select){
    const s=state.get(select);
    if(!s)return;
    const rows=optionRows(select);
    if(rows.length<2||rows.length>MAX_OPTIONS){
      if(activeSelect===select)activeSelect=null;
      s.root.remove();
      select.classList.remove('vchoice-source');
      select.tabIndex=0;
      state.delete(select);
      return;
    }
    const selectedOption=select.selectedOptions[0]||rows.find(r=>r.value===select.value)||rows[0];
    const selectedLabel=selectedOption?.label||'اختر';
    s.selectedText.textContent='✓ '+selectedLabel;
    s.caret.textContent=s.expanded?'⌃':'⌄';
    s.selected.disabled=select.disabled;
    s.root.classList.toggle('is-disabled',select.disabled);
    s.root.classList.toggle('is-open',s.expanded);
    s.options.hidden=!s.expanded;
    s.selected.setAttribute('aria-expanded',String(s.expanded));

    const sig=rows.map(r=>r.value+'\u0000'+r.label+'\u0000'+r.disabled).join('\u0001')+'|'+select.value+'|'+select.disabled;
    if(sig===s.lastSignature&&s.options.children.length)return;
    s.lastSignature=sig;
    s.options.innerHTML='';
    for(const row of rows){
      const button=document.createElement('button');
      button.type='button';
      button.className='vchoice-option'+(row.value===select.value?' is-selected':'');
      button.setAttribute('role','option');
      button.setAttribute('aria-selected',String(row.value===select.value));
      button.disabled=select.disabled||row.disabled;
      const box=document.createElement('span');
      box.className='vchoice-box';
      box.textContent='✓';
      const text=document.createElement('span');
      text.className='vchoice-option-text';
      text.textContent=row.label;
      button.append(box,text);
      button.addEventListener('click',()=>{
        if(button.disabled)return;
        select.value=row.value;
        s.expanded=false;
        if(activeSelect===select)activeSelect=null;
        select.dispatchEvent(new Event('input',{bubbles:true}));
        select.dispatchEvent(new Event('change',{bubbles:true}));
        render(select);
      });
      s.options.appendChild(button);
    }
  }

  function runLocalWithoutJump(action){
    const y=window.scrollY;
    const x=window.scrollX;
    const message=document.getElementById('message');
    let restoreMessage=null;
    if(message){
      const hadOwn=Object.prototype.hasOwnProperty.call(message,'scrollIntoView');
      const previous=message.scrollIntoView;
      try{
        message.scrollIntoView=()=>{};
        restoreMessage=()=>{
          try{
            if(hadOwn)message.scrollIntoView=previous;
            else delete message.scrollIntoView;
          }catch{}
        };
      }catch{}
    }
    action();
    [0,80,220,500].forEach(delay=>setTimeout(()=>window.scrollTo({top:y,left:x,behavior:'auto'}),delay));
    if(restoreMessage)setTimeout(restoreMessage,1200);
  }

  function runLegacyActionForNote(article,actionId){
    const pick=article.querySelector('.pick');
    const action=document.getElementById(actionId);
    if(!pick||!action)return;
    const run=()=>{
      document.querySelectorAll('.pick').forEach(x=>x.checked=false);
      pick.checked=true;
      action.click();
      pick.checked=false;
    };
    if(actionId==='copy')runLocalWithoutJump(run);
    else run();
  }

  function configureArchiveAction(article){
    const status=article.querySelector('select.status');
    const archive=article.querySelector('button.archive');
    if(!status||!archive)return;
    if(status.value==='ARCHIVED'){
      archive.textContent='↩ إرجاع من الأرشيف';
      archive.classList.add('restore');
      archive.title='إرجاع الملاحظة إلى الحالية';
      archive.onclick=event=>{
        event.preventDefault();
        runLocalWithoutJump(()=>{
          status.value='NEW';
          status.dispatchEvent(new Event('input',{bubbles:true}));
          status.dispatchEvent(new Event('change',{bubbles:true}));
        });
      };
    }else{
      archive.classList.remove('restore');
      archive.title='أرشفة الملاحظة';
    }
  }

  function enhanceNote(article){
    if(!(article instanceof HTMLElement)||!article.matches('.note'))return;
    configureArchiveAction(article);
    if(article.dataset.toolsReady)return;
    article.dataset.toolsReady='1';
    const ops=article.querySelector('.actions');
    if(ops)ops.classList.add('note-ops');
    const tools=document.createElement('div');
    tools.className='note-tools';
    const defs=[['copy','🤖 AI','نسخ هذه الملاحظة للذكاء الاصطناعي'],['txt','TXT','تحميل هذه الملاحظة TXT'],['json','JSON','تحميل هذه الملاحظة JSON']];
    for(const [actionId,label,title] of defs){
      const button=document.createElement('button');
      button.type='button';
      button.className='outline note-tool';
      button.textContent=label;
      button.title=title;
      button.setAttribute('aria-label',title);
      button.addEventListener('click',()=>runLegacyActionForNote(article,actionId));
      tools.appendChild(button);
    }
    const meta=article.querySelector('.meta');
    if(meta)article.insertBefore(tools,meta);else article.appendChild(tools);
  }

  function enhanceNotes(root=document){
    if(root instanceof HTMLElement&&root.matches('.note'))enhanceNote(root);
    root.querySelectorAll?.('.note').forEach(enhanceNote);
  }

  function scan(root=document){
    if(root instanceof HTMLSelectElement)build(root);
    root.querySelectorAll?.('select').forEach(build);
    enhanceNotes(root);
  }

  function syncAll(){
    activeSelect=null;
    prepareContainers();
    prepareArchiveTabs();
    document.querySelectorAll('select').forEach(select=>{
      if(state.has(select)){
        state.get(select).expanded=false;
        render(select);
      }else build(select);
    });
    enhanceNotes(document);
    syncArchiveTabs();
  }

  const observer=new MutationObserver(mutations=>{
    for(const mutation of mutations){
      if(mutation.type==='childList'){
        mutation.addedNodes.forEach(node=>{if(node.nodeType===1)scan(node)});
        const parent=mutation.target.closest?.('select');
        if(parent){
          if(state.has(parent))render(parent);
          else build(parent);
        }
      }
      if(mutation.type==='attributes'&&mutation.target instanceof HTMLSelectElement){
        const select=mutation.target;
        if(state.has(select))render(select);else build(select);
      }
    }
    syncArchiveTabs();
  });

  function start(){
    prepareContainers();
    prepareArchiveTabs();
    scan(document);
    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled']});
    document.addEventListener('click',event=>{
      if(!activeSelect)return;
      const s=state.get(activeSelect);
      if(s&&!s.root.contains(event.target))setExpanded(activeSelect,false);
    });
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&activeSelect)setExpanded(activeSelect,false);
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.VisualChoices={syncAll};
})();

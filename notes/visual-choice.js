/* Task #84 — replace suitable native selects with compact visual single-choice controls.
 * The original <select> remains the source of truth so existing save/filter logic keeps working.
 */
(function(){
  'use strict';

  const MAX_OPTIONS=12;
  const state=new WeakMap();

  function eligible(select){
    if(!(select instanceof HTMLSelectElement))return false;
    if(select.multiple||select.dataset.visualChoice==='off')return false;
    const count=[...select.options].filter(o=>!o.hidden).length;
    return count>=2&&count<=MAX_OPTIONS;
  }

  function optionRows(select){
    return [...select.options].filter(o=>!o.hidden).map(o=>({value:o.value,label:(o.textContent||o.label||o.value).trim(),disabled:o.disabled}));
  }

  function build(select){
    if(state.has(select)||!eligible(select))return;
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
    const change=document.createElement('button');
    change.type='button';
    change.className='vchoice-change';
    change.textContent='×';
    change.title='تغيير الاختيار';
    change.setAttribute('aria-label','إظهار بقية الخيارات');
    const options=document.createElement('div');
    options.className='vchoice-options';
    options.hidden=true;
    options.setAttribute('role','listbox');
    current.append(selected,change);
    root.append(current,options);
    select.insertAdjacentElement('afterend',root);

    const s={root,current,selected,change,options,expanded:false,lastSignature:''};
    state.set(select,s);

    const open=()=>{
      if(select.disabled)return;
      s.expanded=true;
      render(select,true);
    };
    selected.addEventListener('click',open);
    change.addEventListener('click',open);
    select.addEventListener('change',()=>render(select,false));
    select.addEventListener('input',()=>render(select,false));
    render(select,false);
  }

  function render(select,preserveOpen){
    const s=state.get(select);
    if(!s)return;
    const rows=optionRows(select);
    if(rows.length<2||rows.length>MAX_OPTIONS){
      s.root.remove();
      select.classList.remove('vchoice-source');
      select.tabIndex=0;
      state.delete(select);
      return;
    }
    const selectedOption=select.selectedOptions[0]||rows.find(r=>r.value===select.value)||rows[0];
    const selectedLabel=selectedOption?.label||'اختر';
    s.selected.textContent='✓ '+selectedLabel;
    s.selected.disabled=select.disabled;
    s.change.disabled=select.disabled;
    s.root.classList.toggle('is-disabled',select.disabled);
    if(!preserveOpen)s.expanded=false;
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
      text.textContent=row.label;
      button.append(box,text);
      button.addEventListener('click',()=>{
        if(button.disabled)return;
        select.value=row.value;
        select.dispatchEvent(new Event('input',{bubbles:true}));
        select.dispatchEvent(new Event('change',{bubbles:true}));
        s.expanded=false;
        render(select,false);
      });
      s.options.appendChild(button);
    }
  }

  function scan(root=document){
    if(root instanceof HTMLSelectElement)build(root);
    root.querySelectorAll?.('select').forEach(build);
  }

  function syncAll(){
    document.querySelectorAll('select').forEach(select=>{
      if(state.has(select))render(select,state.get(select).expanded);
      else build(select);
    });
  }

  const observer=new MutationObserver(mutations=>{
    for(const mutation of mutations){
      if(mutation.type==='childList'){
        mutation.addedNodes.forEach(node=>{if(node.nodeType===1)scan(node)});
        const parent=mutation.target.closest?.('select');
        if(parent){
          if(state.has(parent))render(parent,state.get(parent).expanded);
          else build(parent);
        }
      }
      if(mutation.type==='attributes'&&mutation.target instanceof HTMLSelectElement){
        const select=mutation.target;
        if(state.has(select))render(select,state.get(select).expanded);else build(select);
      }
    }
  });

  function start(){
    scan(document);
    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled']});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.VisualChoices={syncAll};
})();

(()=>{
  const result=document.getElementById('result'),status=document.getElementById('status');
  if(!result)return;

  const SPLIT_PREFIX='mytool.cards.split.';
  const readSplit=id=>{try{const v=localStorage.getItem(SPLIT_PREFIX+id);return v===null?id==='mobilis':v!=='0'}catch(e){return id==='mobilis'}};

  function detectGroupType(group){
    const down=group.querySelector('.actions button[id$="download"]');
    if(!down)return null;
    const id=down.id||'';
    if(/^waf\d+download$/.test(id))return'waffarly';
    if(/^tok\d+download$/.test(id))return'token';
    const m=id.match(/^card-(.+)download$/);
    return m?m[1]:null;
  }

  function applySplitVisibility(){
    result.querySelectorAll('.group').forEach(group=>{
      const type=detectGroupType(group);
      if(!type)return;
      const show=readSplit(type);
      group.querySelectorAll('.splitQuick,.splitDetails').forEach(el=>el.hidden=!show);
    });
  }

  function mainDownloadButtons(){
    return [...result.querySelectorAll('.group .actions button[id$="download"]')].filter(x=>!x.disabled);
  }

  function ensureDownloadAll(){
    const existing=document.getElementById('downloadAllFiles');
    const buttons=mainDownloadButtons();
    if(buttons.length<2){if(existing)existing.remove();return}
    if(existing)return;
    const bar=document.createElement('div');
    bar.id='downloadAllFiles';
    bar.style.cssText='margin:8px 0;padding:9px;border:1px solid #d7e5ee;border-radius:12px;background:#f7fbfe';
    const btn=document.createElement('button');
    btn.className='btn gold';
    btn.style.width='100%';
    btn.textContent='⬇️ تحميل كل الملفات';
    btn.onclick=()=>{
      const list=mainDownloadButtons();
      if(!list.length)return;
      btn.disabled=true;
      const old=btn.textContent;
      btn.textContent='⏳ جاري تحميل الملفات...';
      list.forEach((b,i)=>setTimeout(()=>b.click(),i*350));
      if(status)status.textContent=`تم إرسال ${list.length} ملفات للتحميل، كل نوع في ملف مستقل.`;
      setTimeout(()=>{btn.disabled=false;btn.textContent=old},Math.max(2600,list.length*350+800));
    };
    bar.appendChild(btn);
    result.prepend(bar);
  }

  function refresh(){applySplitVisibility();ensureDownloadAll()}
  const observer=new MutationObserver(()=>setTimeout(refresh,0));
  observer.observe(result,{childList:true,subtree:true});
  window.addEventListener('pageshow',refresh);
  window.addEventListener('storage',refresh);

  // منع النقر المزدوج على أي تحميل TXT أو تحميل تقسيم.
  document.addEventListener('click',e=>{
    const btn=e.target.closest('button');
    if(!btn)return;
    const isMain=/download$/.test(btn.id||'')&&btn.closest('.actions');
    const isSplit=btn.classList.contains('splitDownload');
    if(!isMain&&!isSplit)return;
    const old=btn.textContent;
    setTimeout(()=>{
      btn.disabled=true;
      btn.textContent='⏳ جاري التحميل...';
      setTimeout(()=>{btn.disabled=false;btn.textContent=old},2500);
    },0);
  });

  refresh();
})();

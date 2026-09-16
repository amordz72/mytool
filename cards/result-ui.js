(()=>{
  const result=document.getElementById('result'),status=document.getElementById('status');
  if(!result)return;

  const SPLIT_PREFIX='mytool.cards.split.';
  const SMART_SPLIT_MIGRATION_KEY='mytool.cards.smartSplitDefaultV2';
  const TRIM_KEY='mytool.cards.trim';
  const readBool=(key,def)=>{try{const v=localStorage.getItem(key);return v===null?def:v!=='0'}catch(e){return def}};

  // من هذه النسخة: الاستخراج الذكي يعرض التقسيم افتراضيًا مثل Mobilis.
  // ترحيل لمرة واحدة حتى لا يبقى مخفيًا عند من حفظ الإعدادات القديمة.
  try{
    if(localStorage.getItem(SMART_SPLIT_MIGRATION_KEY)===null){
      localStorage.setItem(SPLIT_PREFIX+'plain','1');
      localStorage.setItem(SMART_SPLIT_MIGRATION_KEY,'1');
    }
  }catch(e){}

  const readSplit=id=>readBool(SPLIT_PREFIX+id,id==='mobilis'||id==='plain');

  const pad=n=>String(n).padStart(2,'0');
  function plainName(count,part,total){
    const d=new Date(),tm=pad(d.getHours())+pad(d.getMinutes()),dt=pad(d.getDate())+pad(d.getMonth()+1)+String(d.getFullYear()).slice(-2),p=part?`_P${part}-${total}`:'';
    return `TXT_${count}${p}_${tm}_${dt}.txt`;
  }
  function smartName(kind,length,count,part,total){
    const d=new Date(),tm=pad(d.getHours())+pad(d.getMinutes()),dt=pad(d.getDate())+pad(d.getMonth()+1)+String(d.getFullYear()).slice(-2),p=part?`_P${part}-${total}`:'';
    return `SMART_${kind}_${length}_Count${count}${p}_${dt}_${tm}.txt`;
  }

  // النص العادي القديم يحتفظ بسلوكه إن استُخدم مباشرة.
  if(typeof window.processPlain==='function'&&!window.processPlain.__mytoolPlainSplit){
    const original=window.processPlain;
    const wrapped=function(){
      if(!readSplit('plain'))return original();
      if(typeof window.group!=='function'||typeof window.bindGroup!=='function')return original();
      const box=document.getElementById('text');
      if(!box)return original();
      let raw=box.value;
      if(typeof window.cleanWhatsAppEnvelope==='function')raw=window.cleanWhatsAppEnvelope(raw);
      let lines=String(raw||'').split(/\r\n|\n|\r/);
      if(readBool(TRIM_KEY,true))lines=lines.map(x=>x.trim());
      lines=lines.filter(x=>x!=='');
      if(!lines.length)return original();
      const nameFn=(n,a,b)=>plainName(n,a,b),filename=plainName(lines.length);
      result.innerHTML=window.group('النص جاهز',lines,filename,'plain',nameFn,true);
      window.bindGroup('plain',lines,filename,nameFn,true,true);
    };
    wrapped.__mytoolPlainSplit=true;
    window.processPlain=wrapped;
  }

  function detectGroupType(group){
    const down=group.querySelector('.actions button[id$="download"]');
    if(!down)return null;
    const id=down.id||'';
    if(id==='plaindownload'||/^smart\d+download$/.test(id))return'plain';
    if(/^waf\d+download$/.test(id))return'waffarly';
    if(/^tok\d+download$/.test(id))return'token';
    const m=id.match(/^card-(.+)download$/);
    return m?m[1]:null;
  }

  function smartMeta(group){
    const label=(group.querySelector('.title span')?.textContent||'').replace(/^🔎\s*/,'');
    const length=(label.match(/(\d+)\s*خانة/)||[])[1]||'X';
    let kind='MIXED';
    if(label.includes('أرقام فقط'))kind='DIGITS';
    else if(label.includes('أحرف + أرقام'))kind='ALNUM';
    return{kind,length};
  }

  // smart-extractor يرسم نتيجته بنفسه، لذلك نضيف أدوات التقسيم بعد ظهور كل مجموعة.
  function ensureSmartSplit(){
    result.querySelectorAll('.group').forEach(group=>{
      const down=group.querySelector('.actions button[id^="smart"][id$="download"]');
      if(!down||group.querySelector('.splitQuick'))return;
      const id=(down.id||'').replace(/download$/,'');
      const box=group.querySelector('.codes');
      if(!id||!box)return;
      const codes=String(box.textContent||'').split(/\r\n|\n|\r/).map(x=>x.trim()).filter(Boolean);
      if(codes.length<2)return;
      if(typeof window.splitTopUI!=='function'||typeof window.splitBottomUI!=='function'||typeof window.initSplit!=='function')return;
      const actions=group.querySelector('.actions');
      if(!actions)return;
      actions.insertAdjacentHTML('afterend',window.splitTopUI(id,codes));
      box.insertAdjacentHTML('afterend',window.splitBottomUI(id,codes));
      const meta=smartMeta(group),nameFn=(n,a,b)=>smartName(meta.kind,meta.length,n,a,b);
      window.initSplit(id,codes,nameFn,true);
    });
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

  function refresh(){ensureSmartSplit();applySplitVisibility();ensureDownloadAll()}
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

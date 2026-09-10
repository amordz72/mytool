(()=>{
  const FORMAT='mytool-cards-backup';
  const VERSION=1;
  const LAST_AT='mytool.cards.lastBackupAt';
  const LAST_FP='mytool.cards.lastBackupFingerprint';
  const EXACT_KEYS=[
    'mytool.cards.customSources.v1',
    'mytool.cards.trim',
    'mytool.cards.autoDetect',
    'mytool.cards.autoProcess',
    'mytool.cards.showMainOptions',
    'mytool.cards.smartDedupe',
    'mytool.cards.smartIgnoreRules'
  ];
  const PREFIX_KEYS=['mytool.cards.split.'];

  function allowedKey(key){return EXACT_KEYS.includes(key)||PREFIX_KEYS.some(prefix=>key.startsWith(prefix))}
  function collect(){
    const out={};
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(key&&allowedKey(key))out[key]=localStorage.getItem(key);
    }
    return Object.fromEntries(Object.entries(out).sort(([a],[b])=>a.localeCompare(b)));
  }
  function stableData(data){return JSON.stringify(Object.fromEntries(Object.entries(data||{}).sort(([a],[b])=>a.localeCompare(b))))}
  function hash(value){
    let h=2166136261;
    const s=String(value||'');
    for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}
    return (h>>>0).toString(16).padStart(8,'0');
  }
  function fingerprint(){return hash(stableData(collect()))}
  function build(){return{format:FORMAT,version:VERSION,createdAt:new Date().toISOString(),scope:'settings-and-source-formats-only',data:{localStorage:collect()}}}
  function safeStamp(){const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`}
  function download(){
    const payload=build(),content=JSON.stringify(payload,null,2),blob=new Blob([content],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`MyTool_Backup_${safeStamp()}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),800);
    try{localStorage.setItem(LAST_AT,payload.createdAt);localStorage.setItem(LAST_FP,fingerprint())}catch(e){}
    try{window.dispatchEvent(new CustomEvent('mytool:backup-updated'))}catch(e){}
    return payload;
  }
  function parse(text){
    let payload;
    try{payload=JSON.parse(String(text||''))}catch(e){throw new Error('الملف ليس JSON صالحًا.')}
    if(!payload||payload.format!==FORMAT)throw new Error('هذا الملف ليس نسخة احتياطية معتمدة من MyTool.')
    if(Number(payload.version)!==VERSION)throw new Error('إصدار النسخة الاحتياطية غير مدعوم حاليًا.')
    const source=payload.data&&payload.data.localStorage;
    if(!source||typeof source!=='object'||Array.isArray(source))throw new Error('بيانات النسخة الاحتياطية ناقصة.')
    const filtered={},ignored=[];
    Object.entries(source).forEach(([key,value])=>{
      if(allowedKey(key))filtered[key]=String(value??'');else ignored.push(key);
    });
    if(!Object.keys(filtered).length)throw new Error('لم أجد إعدادات أو صيغ قابلة للاسترجاع داخل الملف.')
    return{payload:{...payload,data:{localStorage:filtered}},ignored};
  }
  function preview(parsed){
    const data=parsed.payload.data.localStorage,sourceRaw=data['mytool.cards.customSources.v1'];
    let sources=[];
    try{const v=JSON.parse(sourceRaw||'[]');if(Array.isArray(v))sources=v.map(x=>String(x&&x.name||'مصدر بدون اسم'))}catch(e){}
    const splitCount=Object.keys(data).filter(k=>k.startsWith('mytool.cards.split.')).length;
    const settingsCount=Object.keys(data).length-(sourceRaw!==undefined?1:0)-splitCount;
    return{sources,sourceCount:sources.length,splitCount,settingsCount,totalKeys:Object.keys(data).length,ignoredCount:parsed.ignored.length,createdAt:parsed.payload.createdAt||''};
  }
  function restore(parsed){
    const data=parsed.payload.data.localStorage;
    const remove=[];
    for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key&&allowedKey(key))remove.push(key)}
    remove.forEach(key=>localStorage.removeItem(key));
    Object.entries(data).forEach(([key,value])=>localStorage.setItem(key,value));
    try{
      localStorage.setItem(LAST_AT,parsed.payload.createdAt||new Date().toISOString());
      localStorage.setItem(LAST_FP,fingerprint());
    }catch(e){}
    try{window.dispatchEvent(new CustomEvent('mytool:custom-sources-changed'));window.dispatchEvent(new CustomEvent('mytool:backup-updated'))}catch(e){}
  }
  function info(){
    const at=localStorage.getItem(LAST_AT)||'',saved=localStorage.getItem(LAST_FP)||'',current=fingerprint();
    if(!at||!saved)return{state:'missing',text:'⚠️ لم يتم إنشاء نسخة احتياطية للإعدادات والصيغ بعد.',at:''};
    if(saved!==current)return{state:'stale',text:`⚠️ تغيّرت الإعدادات أو الصيغ بعد آخر نسخة احتياطية (${formatDate(at)}).`,at};
    return{state:'ok',text:`✅ النسخة الاحتياطية محدثة — آخر نسخة: ${formatDate(at)}.`,at};
  }
  function formatDate(value){
    const d=new Date(value);if(Number.isNaN(d.getTime()))return value||'-';
    try{return new Intl.DateTimeFormat('ar-DZ',{dateStyle:'medium',timeStyle:'short'}).format(d)}catch(e){return d.toLocaleString()}
  }

  window.mytoolBackup={FORMAT,VERSION,collect,fingerprint,build,download,parse,preview,restore,info,formatDate};

  function injectMain(){
    const settings=document.getElementById('cardsSettingsLink');
    if(!settings)return false;
    let link=document.getElementById('cardsBackupLink');
    if(!link){
      link=document.createElement('a');link.id='cardsBackupLink';link.href='./backup.html';link.textContent='💾 نسخ احتياطي';
      link.style.cssText=settings.style.cssText+';margin-inline-start:6px';
      const formats=document.getElementById('customSourcesLink');(formats||settings).insertAdjacentElement('afterend',link);
    }
    let box=document.getElementById('cardsBackupStatus');
    if(!box){
      box=document.createElement('div');box.id='cardsBackupStatus';
      box.style.cssText='font-size:12px;line-height:1.6;padding:8px 10px;margin:0 0 8px;border-radius:10px;border:1px solid #d7e5ee;background:#fffaf5;color:#61778a';
      const bar=settings.parentElement;bar.insertAdjacentElement('afterend',box);
    }
    const state=info();box.textContent=state.text;
    box.style.background=state.state==='ok'?'#f2fff9':'#fffaf0';box.style.color=state.state==='ok'?'#0f7f59':'#8a5a13';
    return true;
  }
  function refreshSoon(){[0,120,350,900].forEach(ms=>setTimeout(injectMain,ms))}
  refreshSoon();
  window.addEventListener('pageshow',refreshSoon);
  window.addEventListener('storage',refreshSoon);
  window.addEventListener('mytool:custom-sources-changed',refreshSoon);
  window.addEventListener('mytool:backup-updated',refreshSoon);
})();

(()=>{
  if(!document.getElementById('text')||typeof window.processPlain!=='function')return;
  if(document.querySelector('script[data-helper="./smart-table-extractor-v2.js?v=20260910-0830"]'))return;
  const s=document.createElement('script');
  s.src='./smart-table-extractor-v2.js?v=20260910-0830';
  s.dataset.helper='./smart-table-extractor-v2.js?v=20260910-0830';
  document.body.appendChild(s);
})();
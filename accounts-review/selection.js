(() => {
  'use strict';

  const DB_NAME='mytool-accounts-review';
  const DB_VERSION=2;
  const SELECT_KEY='mytool_accounts_selected_v1';
  let selectionMode=false;
  let syncTimer=0;

  function normalize(v){return String(v??'').trim().toLowerCase().normalize('NFKC').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/ة/g,'ه').replace(/\s+/g,' ')}
  function displayName(row){return [row?.first,row?.last].filter(Boolean).join(' ').trim()||row?.store||'بدون اسم'}
  function displayNumber(value){return new Intl.NumberFormat('ar-DZ',{minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(value)||0)}
  function activeSourceName(){const tab=document.querySelector('.tabs .tab.active:not(.warn)');return tab?tab.textContent.replace(/\s*\(\d+\)\s*$/,'').trim():''}
  function knownSourceVisible(){return Boolean(activeSourceName()&&document.querySelector('.view-tabs')&&!document.querySelector('.unknown-box'))}

  function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
  async function allSources(){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction('sources','readonly');const req=tx.objectStore('sources').getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close()})}
  async function currentSource(){const name=activeSourceName();if(!name)return null;const all=await allSources();return all.find(x=>String(x.name||'').trim()===name)||null}

  function loadSelections(){try{const raw=JSON.parse(localStorage.getItem(SELECT_KEY)||'{}');return raw&&typeof raw==='object'?raw:{}}catch{return {}}}
  function saveSelections(data){try{localStorage.setItem(SELECT_KEY,JSON.stringify(data))}catch{}}
  function selectionSet(source){const all=loadSelections();const list=Array.isArray(all[source.id])?all[source.id]:[];return new Set(list.map(String))}
  function writeSelection(source,set){const all=loadSelections();all[source.id]=[...set];saveSelections(all)}
  function selectedRows(source){const set=selectionSet(source);return (source.rows||[]).filter(row=>set.has(String(row.key)))}

  function findRecordForDomRow(tr,source){
    const username=tr.querySelector('.username')?.textContent?.trim()||'';
    if(username&&username!=='—'){
      const match=(source.rows||[]).find(row=>normalize(row.username)===normalize(username));
      if(match)return match;
    }
    const name=tr.querySelector('.name-main')?.textContent?.trim()||'';
    const matches=(source.rows||[]).filter(row=>normalize(displayName(row))===normalize(name));
    return matches.length===1?matches[0]:null;
  }

  function removeSelectionUi(){
    document.querySelectorAll('.account-select-control').forEach(x=>x.remove());
    document.querySelectorAll('tr.is-account-selected').forEach(x=>x.classList.remove('is-account-selected'));
    document.getElementById('accountsSelectionBar')?.remove();
  }

  async function updateSelectionUi(){
    if(!selectionMode||!knownSourceVisible()){removeSelectionUi();return}
    const source=await currentSource();if(!source)return;
    const set=selectionSet(source);
    const tbody=document.querySelector('.table-wrap table tbody');if(!tbody)return;
    const rows=[...tbody.querySelectorAll('tr')];
    rows.forEach(tr=>{
      const record=findRecordForDomRow(tr,source);if(!record)return;
      let control=tr.querySelector('.account-select-control');
      if(!control){
        control=document.createElement('label');control.className='account-select-control';
        const input=document.createElement('input');input.type='checkbox';input.setAttribute('aria-label','تحديد '+displayName(record));
        const mark=document.createElement('span');mark.className='account-select-mark';
        control.append(input,mark);tr.querySelector('td')?.prepend(control);
        input.addEventListener('change',()=>{const current=selectionSet(source);if(input.checked)current.add(String(record.key));else current.delete(String(record.key));writeSelection(source,current);tr.classList.toggle('is-account-selected',input.checked);updateSelectionBar(source);syncNavSoon()});
      }
      const input=control.querySelector('input');if(input)input.checked=set.has(String(record.key));
      tr.classList.toggle('is-account-selected',set.has(String(record.key)));
    });
    ensureSelectionBar(source);
  }

  function ensureSelectionBar(source){
    const wrap=document.querySelector('.table-wrap');if(!wrap)return;
    let bar=document.getElementById('accountsSelectionBar');
    if(!bar){bar=document.createElement('div');bar.id='accountsSelectionBar';bar.className='accounts-selection-bar';wrap.prepend(bar)}
    updateSelectionBar(source);
  }

  function updateSelectionBar(source){
    const bar=document.getElementById('accountsSelectionBar');if(!bar)return;
    const rows=selectedRows(source);const debt=rows.reduce((s,x)=>s+(Number(x.debt)||0),0);const balance=rows.reduce((s,x)=>s+(Number(x.balance)||0),0);
    const html='<strong>تم تحديد '+rows.length+'</strong><span>الرصيد '+displayNumber(balance)+'</span><span>الدين '+displayNumber(debt)+'</span>';
    if(bar.innerHTML!==html)bar.innerHTML=html;
  }

  function debtorsTabButton(){return [...document.querySelectorAll('.view-tab')].find(btn=>btn.textContent.trim()==='المدينون')}
  async function startSelection(){
    if(!knownSourceVisible())return;
    selectionMode=true;
    debtorsTabButton()?.click();
    setTimeout(()=>{const select=document.querySelector('select[aria-label="عدد المدينين"]');if(select){select.value='all';select.dispatchEvent(new Event('change',{bubbles:true}));select.dispatchEvent(new Event('input',{bubbles:true}))}},40);
    setTimeout(()=>{updateSelectionUi();syncNavSoon()},100);
  }
  function endSelection(){selectionMode=false;removeSelectionUi();syncNavSoon()}

  async function selectAllVisible(){
    const source=await currentSource();if(!source)return;await updateSelectionUi();const set=selectionSet(source);
    document.querySelectorAll('.table-wrap tbody tr').forEach(tr=>{const rec=findRecordForDomRow(tr,source);if(rec)set.add(String(rec.key))});
    writeSelection(source,set);await updateSelectionUi();syncNavSoon();
  }
  async function clearSelection(){const source=await currentSource();if(!source)return;writeSelection(source,new Set());await updateSelectionUi();syncNavSoon()}

  function selectionText(source){
    const rows=selectedRows(source);const total=rows.reduce((s,x)=>s+(Number(x.debt)||0),0);
    const lines=['قائمة التحصيل — '+source.name,'عدد المحلات: '+rows.length,''];
    rows.forEach((row,i)=>{lines.push((i+1)+'. '+displayName(row));lines.push((row.username||'—')+' | الرصيد '+displayNumber(row.balance)+' | الدين '+displayNumber(row.debt))});
    lines.push('','مجموع الدين: '+displayNumber(total));return lines.join('\n');
  }
  async function requireSelected(){const source=await currentSource();if(!source)return null;const rows=selectedRows(source);if(!rows.length){window.MyToolBottomNav?.toast('لم تحدد أي محل',true);return null}return source}
  async function writeClipboard(text){try{await navigator.clipboard.writeText(text);return true}catch{try{const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();const ok=document.execCommand('copy');area.remove();return ok}catch{return false}}}
  async function copySelected(){const source=await requireSelected();if(!source)return;const ok=await writeClipboard(selectionText(source));window.MyToolBottomNav?.toast(ok?'تم نسخ قائمة المحلات':'تعذر النسخ',!ok)}
  async function shareSelected(){const source=await requireSelected();if(!source)return;if(!navigator.share){await copySelected();return}try{await navigator.share({title:'قائمة التحصيل — '+source.name,text:selectionText(source)})}catch(error){if(error?.name!=='AbortError')window.MyToolBottomNav?.toast('تعذرت المشاركة، استخدم النسخ',true)}}
  async function downloadSelected(){const source=await requireSelected();if(!source)return;const text='\uFEFF'+selectionText(source);const blob=new Blob([text],{type:'text/plain;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);const safe=String(source.name||'accounts').replace(/[\\/:*?"<>|]+/g,'-');a.download='تحصيل-'+safe+'-'+new Date().toISOString().slice(0,10)+'.txt';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);window.MyToolBottomNav?.toast('تم تحميل قائمة المحلات')}
  async function copySummary(){const source=await currentSource();if(!source)return;const debt=(source.rows||[]).reduce((s,x)=>s+(Number(x.debt)||0),0);const balance=(source.rows||[]).reduce((s,x)=>s+(Number(x.balance)||0),0);const profit=(source.rows||[]).reduce((s,x)=>s+(Number(x.profit)||0),0);const text=source.name+' — مراجعة الحسابات\nإجمالي الديون: '+displayNumber(debt)+'\nإجمالي الأرصدة: '+displayNumber(balance)+'\nإجمالي الأرباح: '+displayNumber(profit);const ok=await writeClipboard(text);window.MyToolBottomNav?.toast(ok?'تم نسخ الملخص':'تعذر النسخ',!ok)}
  function pickFile(){document.querySelector('input[type="file"][multiple]')?.click()}
  async function focusSelected(){document.getElementById('accountsSelectionBar')?.scrollIntoView({behavior:'smooth',block:'center'})}

  async function syncNav(){
    if(!window.MyToolBottomNav||!knownSourceVisible())return;
    if(!selectionMode){
      window.MyToolBottomNav.setActions([
        {slot:1,icon:'☑',label:'تحديد',title:'اختيار محلات لإرسالها',onClick:startSelection},
        {slot:2,icon:'📂',label:'ملف',title:'إضافة أو تحديث ملف',onClick:pickFile},
        {icon:'📋',label:'نسخ',title:'نسخ ملخص المصدر الحالي',overflow:true,onClick:copySummary}
      ]);return;
    }
    const source=await currentSource();if(!source)return;const count=selectedRows(source).length;
    const actions=[
      {slot:1,icon:'✓',label:String(count)+' مختار',title:'الانتقال إلى المحلات المحددة',onClick:focusSelected},
      {slot:2,icon:'📂',label:'ملف',title:'إضافة أو تحديث ملف',onClick:pickFile},
      {icon:'☑',label:'تحديد الكل',title:'تحديد كل المحلات الظاهرة',overflow:true,onClick:selectAllVisible},
      {icon:'☐',label:'إلغاء التحديد',title:'إلغاء تحديد كل المحلات',overflow:true,onClick:clearSelection},
      {icon:'📋',label:'نسخ المختار',title:'نسخ قائمة المحلات المحددة',overflow:true,onClick:copySelected},
      {icon:'📤',label:'مشاركة',title:'مشاركة قائمة المحلات المحددة',overflow:true,onClick:shareSelected},
      {icon:'⬇',label:'تحميل',title:'تحميل قائمة المحلات المحددة TXT',overflow:true,onClick:downloadSelected},
      {icon:'✕',label:'إنهاء التحديد',title:'الخروج من وضع التحديد',overflow:true,onClick:endSelection}
    ];
    window.MyToolBottomNav.setActions(actions);
  }
  function syncNavSoon(){clearTimeout(syncTimer);syncTimer=setTimeout(()=>{syncNav();if(selectionMode)updateSelectionUi()},80)}

  function bind(){
    const app=document.getElementById('app');if(!app)return;
    app.addEventListener('click',event=>{if(event.target.closest('.tab')){if(selectionMode){selectionMode=false;removeSelectionUi()}setTimeout(syncNavSoon,80)}else if(event.target.closest('.view-tab'))setTimeout(syncNavSoon,80)});
    new MutationObserver(()=>syncNavSoon()).observe(app,{childList:true,subtree:true});
    window.addEventListener('mytool-bottom-nav-ready',syncNavSoon);
    syncNavSoon();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
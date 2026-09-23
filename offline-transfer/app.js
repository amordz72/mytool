(() => {
  'use strict';

  const DB_NAME='mytool-offline-transfer';
  const DB_VERSION=1;
  const STORE='kv';
  const PROFILE_KEY='profile';
  const REPORT_KEY='current_report';

  const $=id=>document.getElementById(id);
  let db=null,profile=null,report=null,lastReportText='';

  function uuid(prefix){
    const raw=(crypto.randomUUID?crypto.randomUUID():('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
      const r=Math.random()*16|0,v=c==='x'?r:(r&3|8);return v.toString(16);
    })));
    return prefix+'-'+raw;
  }
  function nowIso(){return new Date().toISOString();}
  function fmt(n){return new Intl.NumberFormat('fr-DZ').format(Number(n)||0)+' دج';}
  function total(){return (report?.items||[]).reduce((s,x)=>s+Number(x.amount||0),0);}
  function openDb(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE);};
      req.onsuccess=()=>{db=req.result;resolve(db);};
      req.onerror=()=>reject(req.error);
    });
  }
  function get(key){return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),r=tx.objectStore(STORE).get(key);r.onsuccess=()=>resolve(r.result??null);r.onerror=()=>reject(r.error);});}
  function put(key,value){return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
  function newReport(){
    const t=nowIso();
    return {report_id:uuid('RPT'),revision:1,created_at:t,updated_at:t,items:[]};
  }
  async function saveReport(mutated=true){
    if(mutated){report.revision=Math.max(1,Number(report.revision||1)+1);report.updated_at=nowIso();}
    await put(REPORT_KEY,report);
    render();
  }
  function setMsg(text,type='ok'){
    const el=$('actionMsg');el.textContent=text;el.className='msg '+type;el.classList.remove('hidden');
    clearTimeout(setMsg.t);setMsg.t=setTimeout(()=>el.classList.add('hidden'),2400);
  }
  function render(){
    $('personBadge').textContent=profile?.person_name||'';
    $('installationFull').textContent=profile?.installation_id||'';
    $('reportMeta').textContent='ID: '+String(report?.report_id||'').slice(-8)+' · Revision '+(report?.revision||1);
    const rows=$('rows');rows.innerHTML='';
    if(!report.items.length){
      rows.innerHTML='<div class="empty">لا توجد مبالغ في التقرير الحالي.</div>';
    }else{
      report.items.forEach((item,i)=>{
        const row=document.createElement('div');row.className='row';
        row.innerHTML='<div><strong></strong><small>مسجل محليًا</small></div><div class="amount"></div><button class="x" type="button">×</button>';
        row.querySelector('strong').textContent=item.name;
        row.querySelector('.amount').textContent=fmt(item.amount);
        row.querySelector('.x').onclick=async()=>{report.items.splice(i,1);await saveReport(true);};
        rows.appendChild(row);
      });
    }
    $('count').textContent=report.items.length;
    $('total').textContent=fmt(total());
    $('reportBox').classList.add('hidden');$('shareTextBtn').classList.add('hidden');lastReportText='';
  }
  function makeText(){
    const d=new Date();
    const lines=report.items.map((x,i)=>(i+1)+'. '+x.name+': '+fmt(x.amount));
    return ['تقرير الأموال المسلّمة','الاسم: '+profile.person_name,'التاريخ: '+d.toLocaleDateString('ar-DZ'),'',''+lines.join('\n'),'','الإجمالي: '+fmt(total())].join('\n');
  }
  function packageData(){
    return {
      format:'mytool-offline-transfer',
      version:1,
      package_id:uuid('PKG'),
      type:'delivered_money',
      installation_id:profile.installation_id,
      person_name:profile.person_name,
      report_id:report.report_id,
      revision:report.revision,
      created_at:report.created_at,
      updated_at:report.updated_at,
      exported_at:nowIso(),
      items:report.items.map(x=>({name:x.name,amount:Number(x.amount)})),
      total:total()
    };
  }
  function fileName(){
    const d=new Date(),p=n=>String(n).padStart(2,'0');
    const stamp=d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+'-'+p(d.getHours())+p(d.getMinutes());
    return 'mytool-money-'+stamp+'-'+String(report.report_id).slice(-6)+'.m2';
  }
  function makeJsonFile(){
    return new File([JSON.stringify(packageData(),null,2)],fileName(),{type:'application/octet-stream'});
  }
  async function downloadJson(){
    const file=makeJsonFile(),url=URL.createObjectURL(file),a=document.createElement('a');
    a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);
    setMsg('تم إنشاء ملف M2.');
  }
  async function shareJson(){
    const file=makeJsonFile();
    try{
      if(navigator.share && (!navigator.canShare || navigator.canShare({files:[file]}))){
        await navigator.share({title:'MyTool Transfer',text:'ملف M2 من MyTool',files:[file]});return;
      }
    }catch(e){if(e?.name==='AbortError')return;}
    await downloadJson();
    setMsg('المشاركة بالملف غير مدعومة هنا؛ تم تنزيل ملف M2 بدلًا منها.');
  }
  async function shareText(){
    const text=lastReportText||makeText();
    try{if(navigator.share){await navigator.share({title:'تقرير الأموال المسلّمة',text});return;}}catch(e){if(e?.name==='AbortError')return;}
    try{await navigator.clipboard.writeText(text);setMsg('تم نسخ التقرير.');}catch(_){setMsg('تعذر النسخ على هذا المتصفح.','err');}
  }
  async function setup(){
    const name=$('setupName').value.trim();
    if(!name){$('setupMsg').textContent='لازم تدخل الاسم قبل المتابعة.';$('setupMsg').classList.remove('hidden');$('setupName').focus();return;}
    profile={installation_id:uuid('DEV'),person_name:name,created_at:nowIso()};
    report=newReport();
    await put(PROFILE_KEY,profile);await put(REPORT_KEY,report);
    showApp();
  }
  function showApp(){
    $('setup').classList.add('hidden');$('app').classList.remove('hidden');render();
  }
  async function init(){
    try{
      await openDb();
      profile=await get(PROFILE_KEY);
      report=await get(REPORT_KEY);
      if(profile){
        if(!report){report=newReport();await put(REPORT_KEY,report);}
        showApp();
      }else{
        $('setup').classList.remove('hidden');$('setupName').focus();
      }
    }catch(e){
      $('setupMsg').textContent='تعذر فتح التخزين المحلي على هذا الجهاز.';$('setupMsg').classList.remove('hidden');
    }
  }

  $('setupBtn').addEventListener('click',setup);
  $('setupName').addEventListener('keydown',e=>{if(e.key==='Enter')setup();});
  $('addBtn').addEventListener('click',async()=>{
    const name=$('partyName').value.trim();
    const amount=Number(String($('amount').value||'').replace(/[^\d.]/g,''));
    if(!name){$('partyName').focus();return;}
    if(!amount||amount<=0){$('amount').focus();return;}
    report.items.push({operation_id:uuid('OP'),name,amount});
    $('partyName').value='';$('amount').value='';
    await saveReport(true);$('partyName').focus();
  });
  $('makeReportBtn').addEventListener('click',()=>{
    lastReportText=makeText();$('reportBox').textContent=lastReportText;$('reportBox').classList.remove('hidden');$('shareTextBtn').classList.remove('hidden');
  });
  $('shareTextBtn').addEventListener('click',shareText);
  $('exportBtn').addEventListener('click',downloadJson);
  $('shareJsonBtn').addEventListener('click',shareJson);
  $('newReportBtn').addEventListener('click',async()=>{
    if(report.items.length && !confirm('بدء تقرير جديد؟ التقرير الحالي سيبقى فقط إذا كنت قد صدّرته أو شاركته.'))return;
    report=newReport();await put(REPORT_KEY,report);render();setMsg('بدأ تقرير جديد.');
  });

  init();
})();
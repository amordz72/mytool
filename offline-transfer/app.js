(() => {
  'use strict';

  const DB_NAME='mytool-offline-transfer';
  const DB_VERSION=1;
  const STORE='kv';
  const PROFILE_KEY='profile';
  const REPORT_KEY='current_report';

  const SUPABASE_URL='https://wqyebqzbbpohbnznqdjj.supabase.co';
  const SUPABASE_KEY='sb_publishable_gO4umNBMJ0AWRk19HtKd7A_9X4DibYj';

  const $=id=>document.getElementById(id);
  let db=null,profile=null,report=null,sending=false;

  function uuid(){
    if(crypto.randomUUID)return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
      const r=Math.random()*16|0,v=c==='x'?r:(r&3|8);return v.toString(16);
    });
  }
  function randomHex(bytes=32){
    const a=new Uint8Array(bytes);crypto.getRandomValues(a);
    return Array.from(a,b=>b.toString(16).padStart(2,'0')).join('');
  }
  function nowIso(){return new Date().toISOString();}
  function fmt(n){return new Intl.NumberFormat('fr-DZ').format(Number(n)||0)+' دج';}
  function total(){return (report?.items||[]).reduce((s,x)=>s+Number(x.amount||0),0);}
  function deviceShort(){return String(profile?.public_device_id||'').slice(0,8);}
  function reportShort(){return String(report?.report_id||'').replace(/^RPT-/,'').slice(0,8);}

  function openDb(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const d=req.result;
        if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE);
      };
      req.onsuccess=()=>{db=req.result;resolve(db);};
      req.onerror=()=>reject(req.error);
    });
  }
  function get(key){
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readonly'),r=tx.objectStore(STORE).get(key);
      r.onsuccess=()=>resolve(r.result??null);r.onerror=()=>reject(r.error);
    });
  }
  function put(key,value){
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put(value,key);
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
    });
  }

  function newReport(){
    const t=nowIso();
    return {
      report_id:'RPT-'+uuid(),
      revision:1,
      created_at:t,
      updated_at:t,
      items:[],
      pending_sync:false,
      synced_revision:0,
      server_report_status:null
    };
  }

  async function ensureProfileIdentity(){
    let changed=false;
    if(!profile.public_device_id){
      const old=String(profile.installation_id||'');
      const candidate=old.startsWith('DEV-')?old.slice(4):'';
      profile.public_device_id=/^[0-9a-f-]{36}$/i.test(candidate)?candidate:uuid();
      changed=true;
    }
    if(!profile.installation_id){
      profile.installation_id='DEV-'+profile.public_device_id;
      changed=true;
    }
    if(!profile.device_secret||!/^[0-9a-f]{64}$/i.test(profile.device_secret)){
      profile.device_secret=randomHex(32);
      changed=true;
    }
    if(!profile.identity_version){profile.identity_version=1;changed=true;}
    if(changed)await put(PROFILE_KEY,profile);
  }

  async function persistReport(){await put(REPORT_KEY,report);}
  async function mutateReport(){
    report.revision=Math.max(1,Number(report.revision||1)+1);
    report.updated_at=nowIso();
    report.pending_sync=false;
    await persistReport();
    render();
  }

  async function rpc(name,payload){
    const res=await fetch(SUPABASE_URL+'/rest/v1/rpc/'+name,{
      method:'POST',
      headers:{
        'apikey':SUPABASE_KEY,
        'Content-Type':'application/json'
      },
      body:JSON.stringify(payload)
    });
    const raw=await res.text();
    let data=null;
    if(raw){
      try{data=JSON.parse(raw);}catch(_e){data=raw;}
    }
    if(!res.ok){
      const message=typeof data==='object'&&data?.message?data.message:('HTTP '+res.status);
      throw new Error(message);
    }
    return data;
  }

  function platformHint(){
    const ua=navigator.userAgent||'';
    const platform=navigator.userAgentData?.platform||navigator.platform||'';
    return [platform,ua].filter(Boolean).join(' | ').slice(0,240);
  }
  function deviceLabel(){
    return String(navigator.userAgentData?.platform||navigator.platform||'Browser').slice(0,80);
  }

  async function applyDeviceState(state){
    if(!state||typeof state!=='object')return;
    profile.server_status=state.status||profile.server_status||null;
    profile.identity_version=Number(state.identity_version||profile.identity_version||1);
    profile.party_id=state.party_id??profile.party_id??null;
    if(state.display_name&&String(state.display_name).trim()){
      profile.person_name=String(state.display_name).trim();
    }
    await put(PROFILE_KEY,profile);
  }

  async function registerDevice(){
    if(!navigator.onLine)throw new Error('OFFLINE');
    const state=await rpc('m2_device_register',{
      p_public_device_id:profile.public_device_id,
      p_device_secret:profile.device_secret,
      p_display_name:profile.person_name,
      p_device_label:deviceLabel(),
      p_platform_hint:platformHint()
    });
    await applyDeviceState(state);
    return state;
  }

  async function refreshDeviceState(){
    if(!navigator.onLine)return null;
    try{
      const state=await rpc('m2_device_status',{
        p_public_device_id:profile.public_device_id,
        p_device_secret:profile.device_secret
      });
      if(state?.state==='NOT_REGISTERED')return registerDevice();
      await applyDeviceState(state);
      render();
      return state;
    }catch(_e){
      return null;
    }
  }

  function setMsg(text,type='ok'){
    const el=$('actionMsg');
    el.textContent=text;
    el.className='msg '+type;
    el.classList.remove('hidden');
    clearTimeout(setMsg.t);
    setMsg.t=setTimeout(()=>el.classList.add('hidden'),3200);
  }

  function setSyncState(text,kind=''){
    const el=$('syncState');
    if(!el)return;
    el.textContent=text;
    el.className='sync-state'+(kind?' '+kind:'');
  }

  function renderSync(){
    if(!report)return;
    const synced=Number(report.synced_revision||0);
    const rev=Number(report.revision||1);

    if(report.pending_sync){
      setSyncState('لا يوجد اتصال. التقرير محفوظ وسيُرسل عند رجوع الإنترنت.','warn');
      return;
    }
    if(synced===rev&&synced>0){
      if(profile?.server_status==='pending'){
        setSyncState('تم الإرسال. هذا الجهاز ما زال بانتظار اعتماد الإدارة.','warn');
      }else{
        setSyncState('تم الإرسال إلى MyTool وبانتظار مراجعة الإدارة.','ok');
      }
      return;
    }
    if(synced>0&&synced<rev){
      setSyncState('عندك تعديلات جديدة لم تُرسل بعد.','warn');
      return;
    }
    setSyncState('لم يُرسل هذا التقرير بعد.');
  }

  function render(){
    if(!profile||!report)return;
    $('personBadge').textContent=profile.person_name||'';
    $('installationFull').textContent=profile.installation_id||'';
    $('reportMeta').textContent='ID: '+reportShort()+' · Revision '+(report.revision||1);

    const rows=$('rows');rows.innerHTML='';
    if(!report.items.length){
      rows.innerHTML='<div class="empty">لا توجد مبالغ في التقرير الحالي.</div>';
    }else{
      report.items.forEach((item,i)=>{
        const row=document.createElement('div');row.className='row';
        row.innerHTML='<div><strong></strong><small>مسجل على هذا الجهاز</small></div><div class="amount"></div><button class="x" type="button">×</button>';
        row.querySelector('strong').textContent=item.name;
        row.querySelector('.amount').textContent=fmt(item.amount);
        row.querySelector('.x').onclick=async()=>{
          report.items.splice(i,1);
          await mutateReport();
        };
        rows.appendChild(row);
      });
    }
    $('count').textContent=report.items.length;
    $('total').textContent=fmt(total());
    renderSync();
  }

  function makeText(){
    const d=new Date();
    const lines=report.items.map((x,i)=>(i+1)+'. '+x.name+': '+fmt(x.amount));
    return [
      'تقرير الأموال المسلّمة',
      'الاسم: '+profile.person_name,
      'التاريخ: '+d.toLocaleDateString('ar-DZ'),
      '',
      lines.join('\n'),
      '',
      'الإجمالي: '+fmt(total()),
      '',
      'M2REF:'+profile.installation_id+':'+report.report_id+':R'+report.revision
    ].join('\n');
  }

  function packageData(){
    return {
      format:'mytool-offline-transfer',
      version:1,
      direction:'client_to_admin',
      package_id:'PKG-'+uuid(),
      type:'delivered_money',
      installation_id:profile.installation_id,
      public_device_id:profile.public_device_id,
      person_name:profile.person_name,
      identity_version:profile.identity_version||1,
      report_id:report.report_id,
      revision:report.revision,
      created_at:report.created_at,
      updated_at:report.updated_at,
      exported_at:nowIso(),
      items:report.items.map(x=>({operation_id:x.operation_id,name:x.name,amount:Number(x.amount)})),
      total:total()
    };
  }

  function fileName(){
    const d=new Date(),p=n=>String(n).padStart(2,'0');
    const stamp=d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+'-'+p(d.getHours())+p(d.getMinutes());
    return 'm2-'+stamp+'-'+reportShort()+'.m2';
  }

  function makeM2File(){
    return new File([JSON.stringify(packageData(),null,2)],fileName(),{type:'application/octet-stream'});
  }

  async function downloadM2(){
    const file=makeM2File(),url=URL.createObjectURL(file),a=document.createElement('a');
    a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1200);
    setMsg('تم حفظ ملف M2 على الجهاز.');
  }

  async function shareM2(){
    const file=makeM2File();
    try{
      if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){
        await navigator.share({title:'M2',text:'ملف M2 احتياطي',files:[file]});
        return;
      }
    }catch(e){if(e?.name==='AbortError')return;}
    await downloadM2();
    setMsg('المشاركة بالملف غير مدعومة هنا؛ تم حفظ M2 بدلًا منها.');
  }

  async function shareText(){
    if(!report.items.length)return setMsg('أضف مبلغًا واحدًا على الأقل أولًا.','err');
    const text=makeText();
    try{
      if(navigator.share){
        await navigator.share({title:'تقرير الأموال المسلّمة',text});
        return;
      }
    }catch(e){if(e?.name==='AbortError')return;}
    try{
      await navigator.clipboard.writeText(text);
      setMsg('تم نسخ التقرير. يمكنك لصقه في واتساب.');
    }catch(_e){
      setMsg('تعذر نسخ التقرير على هذا المتصفح.','err');
    }
  }

  async function submitReport({silent=false}={}){
    if(sending)return;
    if(!report.items.length){
      if(!silent)setMsg('أضف مبلغًا واحدًا على الأقل أولًا.','err');
      return;
    }

    sending=true;
    const btn=$('sendBtn');
    if(btn){btn.disabled=true;btn.textContent='جاري الإرسال…';}

    try{
      const deviceState=await registerDevice();
      if(deviceState?.state==='DEVICE_BLOCKED'||deviceState?.state==='DEVICE_REJECTED'){
        report.pending_sync=false;
        await persistReport();
        renderSync();
        if(!silent)setMsg('هذا الجهاز غير مفعل. اتصل بالإدارة.','err');
        return;
      }
      if(deviceState?.state==='INVALID_DEVICE_CREDENTIAL'){
        if(!silent)setMsg('هوية الجهاز غير مطابقة. اتصل بالإدارة.','err');
        return;
      }

      const result=await rpc('m2_submit_report',{
        p_public_device_id:profile.public_device_id,
        p_device_secret:profile.device_secret,
        p_report_key:report.report_id,
        p_revision:report.revision,
        p_payload:{items:report.items.map(x=>({name:x.name,amount:Number(x.amount)}))},
        p_client_created_at:report.created_at,
        p_client_updated_at:report.updated_at
      });

      if(['SAVED','DUPLICATE'].includes(result?.state)){
        report.synced_revision=Number(result.stored_revision||report.revision);
        report.server_report_status=result.status||'pending_review';
        report.pending_sync=false;
        if(result.display_name&&result.display_name!==profile.person_name){
          profile.person_name=result.display_name;
          await put(PROFILE_KEY,profile);
        }
        await persistReport();
        render();
        if(!silent){
          setMsg(
            result.device_status==='pending'
              ?'تم الإرسال. الجهاز ينتظر اعتماد الإدارة.'
              :'تم الإرسال إلى الإدارة.',
            'ok'
          );
        }
        return;
      }

      if(result?.state==='REVIEWED_LOCKED'){
        report.pending_sync=false;
        await persistReport();
        renderSync();
        if(!silent)setMsg('الإدارة راجعت هذا التقرير. ابدأ تقريرًا جديدًا لأي تعديل جديد.','err');
        return;
      }

      if(result?.state==='STALE_REVISION'){
        if(!silent)setMsg('هناك نسخة أحدث عند الإدارة. اتصل بالإدارة قبل المتابعة.','err');
        return;
      }

      if(result?.state==='DEVICE_BLOCKED'||result?.state==='DEVICE_REJECTED'){
        if(!silent)setMsg('هذا الجهاز غير مفعل. اتصل بالإدارة.','err');
        return;
      }

      if(!silent)setMsg('تعذر إرسال التقرير. جرّب مرة أخرى.','err');
    }catch(e){
      report.pending_sync=true;
      await persistReport();
      renderSync();
      if(!silent){
        setMsg(
          navigator.onLine
            ?'تعذر الاتصال بـMyTool الآن. التقرير محفوظ وسيعاد إرساله لاحقًا.'
            :'لا يوجد إنترنت. التقرير محفوظ وسيُرسل عند رجوع الاتصال.',
          'err'
        );
      }
    }finally{
      sending=false;
      if(btn){btn.disabled=false;btn.textContent='إرسال / تحديث';}
    }
  }

  async function setup(){
    const name=$('setupName').value.trim();
    if(!name){
      $('setupMsg').textContent='لازم تدخل الاسم قبل المتابعة.';
      $('setupMsg').classList.remove('hidden');
      $('setupName').focus();
      return;
    }

    const publicDeviceId=uuid();
    profile={
      installation_id:'DEV-'+publicDeviceId,
      public_device_id:publicDeviceId,
      device_secret:randomHex(32),
      person_name:name,
      identity_version:1,
      server_status:null,
      party_id:null,
      created_at:nowIso()
    };
    report=newReport();
    await put(PROFILE_KEY,profile);
    await put(REPORT_KEY,report);
    showApp();

    try{
      await registerDevice();
      render();
      setMsg('تم تسجيل هذا الجهاز في MyTool.','ok');
    }catch(_e){
      setSyncState('الجهاز محفوظ محليًا وسيتم تسجيله عند رجوع الإنترنت.','warn');
    }
  }

  function showApp(){
    $('setup').classList.add('hidden');
    $('app').classList.remove('hidden');
    render();
  }

  async function init(){
    try{
      await openDb();
      profile=await get(PROFILE_KEY);
      report=await get(REPORT_KEY);

      if(profile){
        await ensureProfileIdentity();
        if(!report){report=newReport();await persistReport();}
        if(!Array.isArray(report.items))report.items=[];
        showApp();

        const state=await refreshDeviceState();
        if(!state&&navigator.onLine){
          try{await registerDevice();render();}catch(_e){}
        }
        if(report.pending_sync&&navigator.onLine)submitReport({silent:true});
      }else{
        $('setup').classList.remove('hidden');
        $('setupName').focus();
      }
    }catch(_e){
      $('setupMsg').textContent='تعذر فتح التخزين المحلي على هذا الجهاز.';
      $('setupMsg').classList.remove('hidden');
    }
  }

  $('setupBtn').addEventListener('click',setup);
  $('setupName').addEventListener('keydown',e=>{if(e.key==='Enter')setup();});

  $('addBtn').addEventListener('click',async()=>{
    const name=$('partyName').value.trim();
    const amount=Number(String($('amount').value||'').replace(/[^\d.]/g,''));
    if(!name){$('partyName').focus();return;}
    if(!amount||amount<=0){$('amount').focus();return;}
    report.items.push({operation_id:'OP-'+uuid(),name,amount});
    $('partyName').value='';$('amount').value='';
    await mutateReport();
    $('partyName').focus();
  });

  $('sendBtn').addEventListener('click',()=>submitReport());
  $('shareTextBtn').addEventListener('click',shareText);
  $('exportBtn').addEventListener('click',downloadM2);
  $('shareJsonBtn').addEventListener('click',shareM2);

  $('newReportBtn').addEventListener('click',async()=>{
    const unsent=report.items.length&&Number(report.synced_revision||0)!==Number(report.revision||1);
    if(unsent&&!confirm('عندك تعديلات غير مرسلة. تبدأ تقريرًا جديدًا رغم ذلك؟'))return;
    report=newReport();
    await persistReport();
    render();
    setMsg('بدأ تقرير جديد.','ok');
  });

  window.addEventListener('online',async()=>{
    await refreshDeviceState();
    if(report?.pending_sync&&report.items?.length)submitReport({silent:true});
  });

  init();
})();
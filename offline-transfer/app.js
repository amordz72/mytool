(() => {
  'use strict';

  const DB_NAME='mytool-offline-transfer';
  const DB_VERSION=1;
  const STORE='kv';
  const PROFILE_KEY='profile';
  const REPORT_KEY='current_report';
  const SESSION_KEY='m2_account_session';

  const SUPABASE_URL='https://wqyebqzbbpohbnznqdjj.supabase.co';
  const SUPABASE_KEY='sb_publishable_gO4umNBMJ0AWRk19HtKd7A_9X4DibYj';

  const $=id=>document.getElementById(id);
  let db=null,profile=null,report=null,sending=false,pendingTimer=null;

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
  function reportShort(){return String(report?.report_id||'').replace(/^RPT-/,'').slice(0,8);}
  function sessionToken(){return sessionStorage.getItem(SESSION_KEY)||'';}
  function setSession(token){if(token)sessionStorage.setItem(SESSION_KEY,token);else sessionStorage.removeItem(SESSION_KEY);}

  function openDb(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const d=req.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE);
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
      const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(value,key);
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
    });
  }

  async function ensureProfile(){
    if(!profile||typeof profile!=='object')profile={};
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
    if(profile.person_name&&!profile.display_name){
      profile.display_name=profile.person_name;
      changed=true;
    }
    if(changed||!(await get(PROFILE_KEY)))await put(PROFILE_KEY,profile);
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
  async function persistReport(){await put(REPORT_KEY,report);}
  async function mutateReport(){
    report.revision=Math.max(1,Number(report.revision||1)+1);
    report.updated_at=nowIso();
    report.pending_sync=false;
    await persistReport();
    renderReport();
  }

  async function rpc(name,payload){
    const res=await fetch(SUPABASE_URL+'/rest/v1/rpc/'+name,{
      method:'POST',
      headers:{'apikey':SUPABASE_KEY,'Content-Type':'application/json'},
      body:JSON.stringify(payload||{})
    });
    const raw=await res.text();
    let data=null;
    if(raw){try{data=JSON.parse(raw);}catch(_e){data=raw;}}
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

  function hideAllAuthViews(){
    ['loginView','pendingView','pinSetupView','pinView','lockedView'].forEach(id=>$(id)?.classList.add('hidden'));
  }
  function showAuthView(id){
    clearTimeout(pendingTimer);
    $('workerApp').classList.add('hidden');
    $('genericApp').classList.add('hidden');
    $('authGate').classList.remove('hidden');
    hideAllAuthViews();
    $(id).classList.remove('hidden');
    $('authMsg').classList.add('hidden');
    if(id==='loginView'){
      $('loginUsername').value=profile?.username||'';
      setTimeout(()=>((profile?.username?$('loginPassword'):$('loginUsername'))?.focus()),0);
    }else if(id==='pinView'){
      $('pinAccountName').textContent=profile?.display_name||profile?.username||'';
      $('pinLogin').value='';
      setTimeout(()=>$('pinLogin').focus(),0);
    }else if(id==='pendingView'){
      schedulePendingCheck();
    }
  }
  function authMsg(text,type=''){
    const el=$('authMsg');
    el.textContent=text;el.className='gate-msg'+(type?' '+type:'');el.classList.remove('hidden');
  }

  async function saveState(state){
    if(!state||typeof state!=='object')return;
    if(state.display_name)profile.display_name=state.display_name;
    if(state.account_role)profile.account_role=state.account_role;
    if(state.trust_id)profile.trust_id=state.trust_id;
    await put(PROFILE_KEY,profile);
  }

  function routeAccount(){
    $('authGate').classList.add('hidden');
    if(profile.account_role==='worker'||profile.account_role==='workspace_admin'){
      $('genericApp').classList.add('hidden');
      $('workerApp').classList.remove('hidden');
      renderReport();
    }else{
      $('workerApp').classList.add('hidden');
      $('genericApp').classList.remove('hidden');
      $('genericBadge').textContent=profile.display_name||profile.username||'';
    }
  }

  async function activateSession(state){
    await saveState(state);
    if(!state?.session_token){authMsg('لم يتم إنشاء جلسة. أعد المحاولة.','err');return;}
    setSession(state.session_token);
    profile.pin_ready=true;
    profile.request_token=null;
    await put(PROFILE_KEY,profile);
    routeAccount();
    if(report?.pending_sync&&navigator.onLine&&(profile.account_role==='worker'||profile.account_role==='workspace_admin')){
      submitReport({silent:true});
    }
  }

  async function handleAuthState(state){
    if(!state||typeof state!=='object'){
      authMsg('رد غير صالح من الخادم.','err');return;
    }
    await saveState(state);

    switch(state.state){
      case 'SESSION_CREATED':
        await activateSession(state);break;
      case 'PENDING_APPROVAL':
        if(state.request_token){profile.request_token=state.request_token;await put(PROFILE_KEY,profile);}
        showAuthView('pendingView');break;
      case 'PIN_SETUP_REQUIRED':
        profile.pin_ready=false;profile.request_token=null;await put(PROFILE_KEY,profile);
        showAuthView('pinSetupView');break;
      case 'PIN_REQUIRED':
        profile.pin_ready=true;profile.request_token=null;await put(PROFILE_KEY,profile);
        showAuthView('pinView');break;
      case 'PIN_LOCKED':
        showAuthView('lockedView');break;
      case 'DEVICE_REVOKED':
      case 'DEVICE_REJECTED':
        profile.pin_ready=false;profile.request_token=null;await put(PROFILE_KEY,profile);
        showAuthView('loginView');authMsg('هذا الجهاز غير معتمد. اتصل بالإدارة.','err');break;
      case 'TRUST_EXPIRED':
      case 'TRUST_NOT_ACTIVE':
        profile.pin_ready=false;profile.request_token=null;await put(PROFILE_KEY,profile);
        showAuthView('loginView');authMsg('انتهت صلاحية اعتماد الجهاز. سجل الدخول لإرسال طلب جديد.','warn');break;
      case 'REQUEST_EXPIRED':
      case 'INVALID_REQUEST':
        profile.request_token=null;await put(PROFILE_KEY,profile);
        showAuthView('loginView');authMsg('انتهى طلب الجهاز. سجل الدخول من جديد.','warn');break;
      case 'INVALID_LOGIN':
        showAuthView('loginView');authMsg('اسم المستخدم أو كلمة المرور غير صحيحة.','err');break;
      case 'LOGIN_TEMPORARILY_THROTTLED':
        showAuthView('loginView');authMsg('محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.','warn');break;
      case 'INVALID_DEVICE_CREDENTIAL':
        showAuthView('loginView');authMsg('هوية هذا الجهاز غير مطابقة. اتصل بالإدارة.','err');break;
      default:
        authMsg('تعذر إكمال الدخول. الحالة: '+String(state.state||'UNKNOWN'),'err');
    }
  }

  async function passwordLogin(){
    const username=$('loginUsername').value.trim();
    const password=$('loginPassword').value;
    if(!username){$('loginUsername').focus();return;}
    if(!password){$('loginPassword').focus();return;}
    if(!navigator.onLine){authMsg('الدخول الأول واعتماد الجهاز يحتاجان إنترنت.','warn');return;}

    const btn=$('loginBtn');btn.disabled=true;btn.textContent='جاري التحقق…';
    try{
      profile.username=username;
      await put(PROFILE_KEY,profile);
      const state=await rpc('core_account_begin_device_login',{
        p_username:username,
        p_password:password,
        p_public_device_id:profile.public_device_id,
        p_device_secret:profile.device_secret,
        p_device_label:deviceLabel(),
        p_platform_hint:platformHint()
      });
      $('loginPassword').value='';
      await handleAuthState(state);
    }catch(e){authMsg('تعذر الاتصال بالخادم الآن.','err');}
    finally{btn.disabled=false;btn.textContent='دخول';}
  }

  async function checkApproval({silent=false}={}){
    if(!profile?.request_token){
      showAuthView('loginView');return;
    }
    if(!navigator.onLine){
      if(!silent)authMsg('لا يوجد إنترنت للتحقق من الموافقة.','warn');
      return;
    }
    const btn=$('checkApprovalBtn');if(!silent){btn.disabled=true;btn.textContent='جاري التحقق…';}
    try{
      const state=await rpc('core_account_device_request_status',{p_request_token:profile.request_token});
      await handleAuthState(state);
    }catch(e){
      if(!silent)authMsg('تعذر التحقق الآن.','err');
    }finally{
      if(!silent){btn.disabled=false;btn.textContent='تحقق من الموافقة';}
    }
  }
  function schedulePendingCheck(){
    clearTimeout(pendingTimer);
    pendingTimer=setTimeout(async()=>{
      if(!$('pendingView').classList.contains('hidden')){
        await checkApproval({silent:true});
        if(!$('pendingView').classList.contains('hidden'))schedulePendingCheck();
      }
    },8000);
  }

  async function setDevicePin(){
    const password=$('pinSetupPassword').value;
    const pin=$('newPin').value.trim();
    const confirmPin=$('confirmPin').value.trim();
    if(!password){$('pinSetupPassword').focus();return;}
    if(!/^\d{4,6}$/.test(pin)){authMsg('PIN لازم يكون من 4 إلى 6 أرقام.','err');$('newPin').focus();return;}
    if(pin!==confirmPin){authMsg('تأكيد PIN غير مطابق.','err');$('confirmPin').focus();return;}
    if(!profile?.username){showAuthView('loginView');return;}

    const btn=$('setPinBtn');btn.disabled=true;btn.textContent='جاري الحفظ…';
    try{
      const state=await rpc('core_account_set_device_pin',{
        p_username:profile.username,
        p_password:password,
        p_public_device_id:profile.public_device_id,
        p_device_secret:profile.device_secret,
        p_pin:pin
      });
      $('pinSetupPassword').value='';$('newPin').value='';$('confirmPin').value='';
      await handleAuthState(state);
    }catch(e){authMsg('تعذر حفظ PIN الآن.','err');}
    finally{btn.disabled=false;btn.textContent='حفظ PIN والدخول';}
  }

  async function pinLogin(){
    const pin=$('pinLogin').value.trim();
    if(!/^\d{4,6}$/.test(pin)){authMsg('أدخل PIN من 4 إلى 6 أرقام.','err');return;}
    if(!profile?.username){showAuthView('loginView');return;}
    if(!navigator.onLine){authMsg('الفتح الحالي يحتاج تحققًا أونلاين. دعم Offline سيضاف لاحقًا.','warn');return;}

    const btn=$('pinLoginBtn');btn.disabled=true;btn.textContent='جاري الفتح…';
    try{
      const state=await rpc('core_account_pin_login',{
        p_username:profile.username,
        p_pin:pin,
        p_public_device_id:profile.public_device_id,
        p_device_secret:profile.device_secret
      });
      $('pinLogin').value='';
      if(state?.state==='INVALID_PIN'){
        const left=Number(state.attempts_remaining);
        authMsg('PIN غير صحيح'+(Number.isFinite(left)?' — باقي '+left+' محاولات':''),'err');
      }else{
        await handleAuthState(state);
      }
    }catch(e){authMsg('تعذر فتح الحساب الآن.','err');}
    finally{btn.disabled=false;btn.textContent='دخول';}
  }

  async function logout(){
    const token=sessionToken();
    setSession('');
    if(token&&navigator.onLine){
      try{await rpc('core_account_logout',{p_session_token:token});}catch(_e){}
    }
    if(profile?.pin_ready)showAuthView('pinView');else showAuthView('loginView');
  }

  async function restoreSession(){
    const token=sessionToken();
    if(!token)return false;
    try{
      const ctx=await rpc('core_account_session_context',{p_session_token:token});
      if(ctx?.state==='ACTIVE'){
        await saveState(ctx);routeAccount();return true;
      }
    }catch(_e){}
    setSession('');
    return false;
  }

  function setActionMsg(text,type='ok'){
    const el=$('actionMsg');el.textContent=text;el.className='msg '+type;el.classList.remove('hidden');
    clearTimeout(setActionMsg.t);setActionMsg.t=setTimeout(()=>el.classList.add('hidden'),3200);
  }
  function setSyncState(text,kind=''){
    const el=$('syncState');if(!el)return;
    el.textContent=text;el.className='sync-state'+(kind?' '+kind:'');
  }
  function renderSync(){
    const synced=Number(report?.synced_revision||0),rev=Number(report?.revision||1);
    if(report?.pending_sync){setSyncState('تعذر الإرسال. التقرير محفوظ وسيعاد إرساله بعد الدخول وعودة الإنترنت.','warn');return;}
    if(synced===rev&&synced>0){setSyncState('تم الإرسال إلى MyTool وبانتظار مراجعة الإدارة.','ok');return;}
    if(synced>0&&synced<rev){setSyncState('عندك تعديلات جديدة لم تُرسل بعد.','warn');return;}
    setSyncState('لم يُرسل هذا التقرير بعد.');
  }
  function renderReport(){
    if(!profile||!report)return;
    $('personBadge').textContent=profile.display_name||profile.username||'';
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
        row.querySelector('.x').onclick=async()=>{report.items.splice(i,1);await mutateReport();};
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
      'الاسم: '+(profile.display_name||profile.username||''),
      'التاريخ: '+d.toLocaleDateString('ar-DZ'),'',
      lines.join('\n'),'',
      'الإجمالي: '+fmt(total()),'',
      'M2REF:'+profile.installation_id+':'+report.report_id+':R'+report.revision
    ].join('\n');
  }
  function packageData(){
    return {
      format:'mytool-offline-transfer',version:1,direction:'client_to_admin',
      package_id:'PKG-'+uuid(),type:'delivered_money',
      installation_id:profile.installation_id,
      public_device_id:profile.public_device_id,
      username:profile.username||null,
      person_name:profile.display_name||profile.username||null,
      report_id:report.report_id,revision:report.revision,
      created_at:report.created_at,updated_at:report.updated_at,exported_at:nowIso(),
      items:report.items.map(x=>({operation_id:x.operation_id,name:x.name,amount:Number(x.amount)})),
      total:total()
    };
  }
  function fileName(){
    const d=new Date(),p=n=>String(n).padStart(2,'0');
    const stamp=d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+'-'+p(d.getHours())+p(d.getMinutes());
    return 'm2-'+stamp+'-'+reportShort()+'.m2';
  }
  function makeM2File(){return new File([JSON.stringify(packageData(),null,2)],fileName(),{type:'application/octet-stream'});}
  async function downloadM2(){
    const file=makeM2File(),url=URL.createObjectURL(file),a=document.createElement('a');
    a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);
    setActionMsg('تم حفظ ملف M2 على الجهاز.');
  }
  async function shareM2(){
    const file=makeM2File();
    try{
      if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){
        await navigator.share({title:'M2',text:'ملف M2 احتياطي',files:[file]});return;
      }
    }catch(e){if(e?.name==='AbortError')return;}
    await downloadM2();
  }
  async function shareText(){
    if(!report.items.length){setActionMsg('أضف مبلغًا واحدًا على الأقل أولًا.','err');return;}
    const text=makeText();
    try{if(navigator.share){await navigator.share({title:'تقرير الأموال المسلّمة',text});return;}}
    catch(e){if(e?.name==='AbortError')return;}
    try{await navigator.clipboard.writeText(text);setActionMsg('تم نسخ التقرير.');}
    catch(_e){setActionMsg('تعذر النسخ على هذا المتصفح.','err');}
  }

  async function submitReport({silent=false}={}){
    if(sending)return;
    if(!report.items.length){if(!silent)setActionMsg('أضف مبلغًا واحدًا على الأقل أولًا.','err');return;}
    const token=sessionToken();
    if(!token){
      report.pending_sync=true;await persistReport();
      if(!silent){showAuthView(profile?.pin_ready?'pinView':'loginView');authMsg('افتح الحساب أولًا ثم أعد الإرسال.','warn');}
      return;
    }
    if(!navigator.onLine){
      report.pending_sync=true;await persistReport();renderSync();
      if(!silent)setActionMsg('لا يوجد إنترنت. التقرير محفوظ وسيُرسل بعد رجوع الاتصال.','err');
      return;
    }

    sending=true;const btn=$('sendBtn');btn.disabled=true;btn.textContent='جاري الإرسال…';
    try{
      const result=await rpc('m2_submit_session_report',{
        p_session_token:token,
        p_report_key:report.report_id,
        p_revision:report.revision,
        p_payload:{items:report.items.map(x=>({name:x.name,amount:Number(x.amount)}))},
        p_client_created_at:report.created_at,
        p_client_updated_at:report.updated_at
      });

      if(['SAVED','DUPLICATE'].includes(result?.state)){
        report.synced_revision=Number(result.stored_revision||report.revision);
        report.server_report_status=result.status||'pending_review';
        report.pending_sync=false;await persistReport();renderReport();
        if(!silent)setActionMsg('تم الإرسال إلى الإدارة.','ok');
      }else if(result?.state==='INVALID_SESSION'){
        setSession('');report.pending_sync=true;await persistReport();
        showAuthView('pinView');authMsg('انتهت الجلسة. افتح الحساب بالـPIN ثم أعد الإرسال.','warn');
      }else if(result?.state==='ACCOUNT_FEATURE_NOT_ALLOWED'){
        if(!silent)setActionMsg('هذه الخدمة غير متاحة لهذا الحساب.','err');
      }else if(result?.state==='REVIEWED_LOCKED'){
        if(!silent)setActionMsg('الإدارة راجعت هذا التقرير. ابدأ تقريرًا جديدًا لأي تعديل جديد.','err');
      }else if(result?.state==='STALE_REVISION'){
        if(!silent)setActionMsg('هناك نسخة أحدث عند الإدارة. اتصل بالإدارة.','err');
      }else{
        if(!silent)setActionMsg('تعذر إرسال التقرير.','err');
      }
    }catch(e){
      report.pending_sync=true;await persistReport();renderSync();
      if(!silent)setActionMsg('تعذر الاتصال بـMyTool الآن. التقرير محفوظ.','err');
    }finally{
      sending=false;btn.disabled=false;btn.textContent='إرسال / تحديث';
    }
  }

  async function init(){
    try{
      await openDb();
      profile=await get(PROFILE_KEY)||{};
      await ensureProfile();
      report=await get(REPORT_KEY);
      if(!report){report=newReport();await persistReport();}
      if(!Array.isArray(report.items))report.items=[];

      if(await restoreSession())return;

      if(profile.request_token){
        showAuthView('pendingView');
        if(navigator.onLine)checkApproval({silent:true});
      }else if(profile.username&&profile.pin_ready){
        showAuthView('pinView');
      }else{
        showAuthView('loginView');
      }
    }catch(_e){
      profile=profile||{};
      $('authGate').classList.remove('hidden');
      showAuthView('loginView');
      authMsg('تعذر فتح التخزين المحلي على هذا الجهاز.','err');
    }
  }

  $('loginBtn').addEventListener('click',passwordLogin);
  $('loginPassword').addEventListener('keydown',e=>{if(e.key==='Enter')passwordLogin();});
  $('checkApprovalBtn').addEventListener('click',()=>checkApproval());
  $('pendingBackBtn').addEventListener('click',async()=>{profile.request_token=null;await put(PROFILE_KEY,profile);showAuthView('loginView');});
  $('setPinBtn').addEventListener('click',setDevicePin);
  $('confirmPin').addEventListener('keydown',e=>{if(e.key==='Enter')setDevicePin();});
  $('pinLoginBtn').addEventListener('click',pinLogin);
  $('pinLogin').addEventListener('keydown',e=>{if(e.key==='Enter')pinLogin();});
  $('usePasswordBtn').addEventListener('click',()=>showAuthView('loginView'));
  $('lockedBackBtn').addEventListener('click',()=>showAuthView('loginView'));
  $('logoutBtn').addEventListener('click',logout);
  $('genericLogoutBtn').addEventListener('click',logout);

  $('addBtn').addEventListener('click',async()=>{
    const name=$('partyName').value.trim();
    const amount=Number(String($('amount').value||'').replace(/[^\d.]/g,''));
    if(!name){$('partyName').focus();return;}
    if(!amount||amount<=0){$('amount').focus();return;}
    report.items.push({operation_id:'OP-'+uuid(),name,amount});
    $('partyName').value='';$('amount').value='';
    await mutateReport();$('partyName').focus();
  });
  $('sendBtn').addEventListener('click',()=>submitReport());
  $('shareTextBtn').addEventListener('click',shareText);
  $('exportBtn').addEventListener('click',downloadM2);
  $('shareJsonBtn').addEventListener('click',shareM2);
  $('newReportBtn').addEventListener('click',async()=>{
    const unsent=report.items.length&&Number(report.synced_revision||0)!==Number(report.revision||1);
    if(unsent&&!confirm('عندك تعديلات غير مرسلة. تبدأ تقريرًا جديدًا رغم ذلك؟'))return;
    report=newReport();await persistReport();renderReport();setActionMsg('بدأ تقرير جديد.','ok');
  });

  window.addEventListener('online',async()=>{
    if(!$('pendingView').classList.contains('hidden'))checkApproval({silent:true});
    if(sessionToken()&&report?.pending_sync&&report.items?.length)submitReport({silent:true});
  });

  init();
})();
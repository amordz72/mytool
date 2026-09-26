(() => {
  'use strict';

  const API_BASE='https://mytool-access.dzamor72.workers.dev';
  const SUPABASE_URL='https://wqyebqzbbpohbnznqdjj.supabase.co';
  const SUPABASE_KEY='sb_publishable_gO4umNBMJ0AWRk19HtKd7A_9X4DibYj';
  const SUPABASE_MODULE='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
  const TOOLS_TOKEN_KEY='mytool_tools_access_token';
  const TOOLS_EXPIRES_KEY='mytool_tools_access_expires_at';
  const TOOLS_TYPE_KEY='mytool_tools_access_type';
  const REQUEST_ID_KEY='mytool_tools_request_id';
  const REQUEST_TOKEN_KEY='mytool_tools_request_token';
  const REQUEST_EXPIRES_KEY='mytool_tools_request_expires_at';
  const REQUEST_TYPE_KEY='mytool_tools_request_type';
  const DEVICE_ID_KEY='mytool_device_id';
  const GOOGLE_PENDING_KEY='mytool_google_oauth_pending';
  const ADMIN_HOURS_KEY='mytool_admin_session_hours';
  const ADMIN_EXPIRES_KEY='mytool_admin_expires_at';
  const OWNER_TOKEN_KEY='mytool_tools_owner_token';
  const OWNER_EXPIRES_KEY='mytool_tools_owner_expires_at';
  const EMERGENCY_EXPIRES_KEY='mytool_emergency_admin_expires_at';
  const WORKER_TOKEN_KEY='mytool_shop_worker_token';
  const WORKER_NICKNAME_KEY='mytool_shop_worker_nickname';
  const WORKER_EXPIRES_KEY='mytool_shop_worker_expires_at';

  const $=id=>document.getElementById(id);
  let pollTimer=0;
  let expiryTimer=0;
  let authClient=null;

  function otherModeActive(){
    const dashboard=$('dashboard');
    const general=$('generalTools');
    // Trust the UI state that root auth has actually established, not stale
    // local expiry markers. A stale admin timer must not block an approved
    // personal-tools session from resuming.
    return Boolean(dashboard&&!dashboard.hidden&&(!general||general.hidden));
  }

  function showRootLoginFallback(){
    if(otherModeActive())return;
    const login=$('loginView'),dashboard=$('dashboard');
    if(dashboard)dashboard.hidden=true;
    if(login)login.hidden=false;
  }

  function adminDurationMs(){
    const raw=Math.floor(Number(localStorage.getItem(ADMIN_HOURS_KEY)||24)||24);
    const hours=Math.min(96,Math.max(1,raw));
    return hours*60*60*1000;
  }

  async function getAuthClient(){
    if(authClient)return authClient;
    const mod=await import(SUPABASE_MODULE);
    authClient=mod.createClient(SUPABASE_URL,SUPABASE_KEY);
    return authClient;
  }

  function getDeviceId(){
    try{
      let id=localStorage.getItem(DEVICE_ID_KEY)||'';
      if(/^D-[A-Z0-9]{8}$/.test(id))return id;
      const raw=globalThis.crypto?.randomUUID?.().replace(/-/g,'').slice(0,8)
        ||Math.random().toString(36).slice(2,10);
      id=`D-${String(raw).toUpperCase().replace(/[^A-Z0-9]/g,'').padEnd(8,'0').slice(0,8)}`;
      localStorage.setItem(DEVICE_ID_KEY,id);
      return id;
    }catch(_e){return 'D-UNKNOWN';}
  }

  function detectBrowser(){
    const ua=navigator.userAgent||'';
    if(/SamsungBrowser\//i.test(ua))return 'Samsung Internet';
    if(/Edg\//i.test(ua))return 'Edge';
    if(/OPR\//i.test(ua))return 'Opera';
    if(/Firefox\//i.test(ua)||/FxiOS\//i.test(ua))return 'Firefox';
    if(/Chrome\//i.test(ua)||/CriOS\//i.test(ua))return 'Chrome';
    if(/Safari\//i.test(ua))return 'Safari';
    return 'Browser';
  }

  function detectDeviceType(){
    const ua=navigator.userAgent||'';
    const platform=navigator.platform||'';
    if(/Android/i.test(ua))return /Mobile/i.test(ua)?'Android phone':'Android tablet';
    if(/iPhone/i.test(ua))return 'iPhone';
    if(/iPad/i.test(ua)||(/Mac/i.test(platform)&&navigator.maxTouchPoints>1))return 'iPad';
    if(/Windows/i.test(ua)||/Win/i.test(platform))return 'Windows PC';
    if(/Macintosh|Mac OS X/i.test(ua)||/Mac/i.test(platform))return 'Mac';
    if(/Linux/i.test(ua)||/Linux/i.test(platform))return 'Linux PC';
    return 'Device';
  }

  function buildClientLabel(accessType){
    const scope=accessType==='personal'?'شخصي':'مؤقت';
    return `${scope} · ${detectDeviceType()} · ${detectBrowser()} · ${getDeviceId()}`.slice(0,80);
  }

  function clearStorageSession(storage){
    try{
      storage.removeItem(TOOLS_TOKEN_KEY);
      storage.removeItem(TOOLS_EXPIRES_KEY);
      storage.removeItem(TOOLS_TYPE_KEY);
    }catch(_e){}
  }

  function clearToolsSession(){
    clearStorageSession(sessionStorage);
    clearStorageSession(localStorage);
  }

  function readStorageSession(storage){
    try{
      const token=storage.getItem(TOOLS_TOKEN_KEY)||'';
      const expiresAt=Number(storage.getItem(TOOLS_EXPIRES_KEY)||0);
      const accessType=storage.getItem(TOOLS_TYPE_KEY)||'client';
      return {storage,token,expiresAt,accessType};
    }catch(_e){return {storage,token:'',expiresAt:0,accessType:'client'}}
  }

  function readToolsSession(){
    const current=readStorageSession(sessionStorage);
    if(current.token&&current.expiresAt>Date.now())return current;
    const personal=readStorageSession(localStorage);
    if(personal.token&&personal.expiresAt>Date.now())return personal;
    return {storage:null,token:'',expiresAt:0,accessType:'client'};
  }

  function saveToolsSession(token,expiresAt,accessType='client'){
    clearToolsSession();
    const storage=accessType==='personal'?localStorage:sessionStorage;
    storage.setItem(TOOLS_TOKEN_KEY,token);
    storage.setItem(TOOLS_EXPIRES_KEY,String(expiresAt));
    storage.setItem(TOOLS_TYPE_KEY,accessType);
  }

  function clearRequest(){
    sessionStorage.removeItem(REQUEST_ID_KEY);
    sessionStorage.removeItem(REQUEST_TOKEN_KEY);
    sessionStorage.removeItem(REQUEST_EXPIRES_KEY);
    sessionStorage.removeItem(REQUEST_TYPE_KEY);
    if(pollTimer){clearInterval(pollTimer);pollTimer=0;}
  }

  function clearLoginMessage(){
    const el=$('loginMessage');
    if(!el)return;
    el.hidden=true;
    el.textContent='';
  }

  function setLoginMessage(text,type='error'){
    const el=$('loginMessage');
    if(!el)return;
    el.textContent=text;
    el.className='msg '+type;
    el.hidden=false;
  }

  function setRequestState(text,type='ok'){
    const el=$('toolsRequestState');
    if(!el)return;
    el.textContent=text;
    el.className='msg '+type;
    el.hidden=false;
  }

  function formatRemaining(target){
    const ms=Math.max(0,Number(target||0)-Date.now());
    const hours=Math.floor(ms/3600000);
    const mins=Math.floor((ms%3600000)/60000);
    return hours?`${hours}س ${mins}د`:`${Math.max(1,mins)}د`;
  }

  async function api(path,{method='GET',token='',body}={}){
    const headers={'Accept':'application/json'};
    if(token)headers.Authorization=`Bearer ${token}`;
    if(body!==undefined)headers['Content-Type']='application/json';
    const response=await fetch(API_BASE+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
    const data=await response.json().catch(()=>({ok:false,code:'INVALID_RESPONSE'}));
    if(!response.ok){
      const error=new Error(data.code||`HTTP_${response.status}`);
      error.status=response.status;
      error.data=data;
      throw error;
    }
    return data;
  }

  function errorText(error){
    const code=error?.data?.code||error?.message||'';
    if(code==='ACCESS_COOLDOWN')return `تم رفض طلب سابق. يمكن المحاولة بعد ${formatRemaining(error.data.blocked_until)}.`;
    if(code==='REQUEST_ALREADY_PENDING')return 'يوجد طلب سابق ما زال قيد المراجعة. انتظر قرار الإدارة ثم حاول من نفس الجلسة.';
    if(code==='RATE_LIMITED')return 'تم إرسال طلبات كثيرة. حاول لاحقًا.';
    if(code==='INVALID_IDENTIFIER')return 'اكتب بريدًا أو رقم هاتف أو اسم مستخدم صالحًا.';
    if(code==='SESSION_INVALID_OR_EXPIRED')return 'انتهت جلسة الأدوات أو تم إلغاؤها.';
    return 'تعذر الاتصال بخدمة الدخول. حاول مرة أخرى.';
  }

  async function startGoogleLogin(){
    clearLoginMessage();
    const btn=$('googleLoginBtn');
    if(btn){btn.disabled=true;btn.textContent='جاري فتح حسابات Google…';}
    try{
      localStorage.setItem(GOOGLE_PENDING_KEY,'1');
      const client=await getAuthClient();
      const redirectTo=`${location.origin}${location.pathname}`;
      const {error}=await client.auth.signInWithOAuth({
        provider:'google',
        options:{redirectTo,queryParams:{prompt:'select_account'}}
      });
      if(error)throw error;
    }catch(_error){
      localStorage.removeItem(GOOGLE_PENDING_KEY);
      setLoginMessage('تعذر بدء دخول Google. إذا كانت أول مرة، قد يحتاج مزود Google إلى التفعيل في Supabase.');
      if(btn){btn.disabled=false;btn.textContent='الدخول بحساب Google';}
    }
  }

  async function restoreGoogleLogin(){
    const pending=localStorage.getItem(GOOGLE_PENDING_KEY)==='1';
    const oauthSignal=pending||/access_token=|error=/.test(location.hash)||/[?&](code|error)=/.test(location.search);
    if(!oauthSignal)return false;

    const btn=$('googleLoginBtn');
    if(btn){btn.disabled=true;btn.textContent='جاري التحقق من حساب Google…';}
    try{
      const client=await getAuthClient();
      const {data,error}=await client.auth.getSession();
      if(error)throw error;
      const session=data?.session;
      if(!session?.access_token)throw new Error('GOOGLE_SESSION_MISSING');

      const owner=await api('/v1/owner/session',{method:'POST',token:session.access_token});
      clearToolsSession();
      clearRequest();
      localStorage.removeItem(EMERGENCY_EXPIRES_KEY);
      localStorage.removeItem(WORKER_TOKEN_KEY);
      localStorage.removeItem(WORKER_NICKNAME_KEY);
      localStorage.removeItem(WORKER_EXPIRES_KEY);
      const exp=Date.now()+adminDurationMs();
      localStorage.setItem(ADMIN_EXPIRES_KEY,String(exp));
      sessionStorage.setItem(OWNER_TOKEN_KEY,owner.session_token);
      sessionStorage.setItem(OWNER_EXPIRES_KEY,String(owner.expires_at));
      localStorage.removeItem(GOOGLE_PENDING_KEY);
      history.replaceState({},document.title,location.pathname);
      location.replace(`${location.origin}${location.pathname}`);
      return true;
    }catch(error){
      localStorage.removeItem(GOOGLE_PENDING_KEY);
      localStorage.removeItem(ADMIN_EXPIRES_KEY);
      try{(await getAuthClient()).auth.signOut();}catch(_e){}
      const code=error?.data?.code||error?.message||'';
      if(code==='OWNER_NOT_ALLOWED')setLoginMessage('هذا حساب Google غير مسموح له بدخول الإدارة.');
      else if(code==='OWNER_PROVIDER_INVALID')setLoginMessage('تعذر التحقق من حساب Google.');
      else setLoginMessage('تعذر إكمال دخول Google. إذا كانت أول مرة، قد يحتاج مزود Google إلى التفعيل في Supabase.');
      if(btn){btn.disabled=false;btn.textContent='الدخول بحساب Google';}
      return false;
    }
  }

  function injectUi(){
    const loginForm=$('loginForm');
    if(loginForm&&!$('googleLoginBtn')){
      const googleBtn=document.createElement('button');
      googleBtn.id='googleLoginBtn';
      googleBtn.className='btn secondary';
      googleBtn.type='button';
      googleBtn.style.marginTop='8px';
      googleBtn.textContent='الدخول بحساب Google';
      loginForm.appendChild(googleBtn);
      const googleNote=document.createElement('div');
      googleNote.className='small';
      googleNote.textContent='للإدارة: اختر حساب Google المسموح بدل كتابة البريد وكلمة المرور.';
      loginForm.appendChild(googleNote);
      googleBtn.addEventListener('click',startGoogleLogin);
    }

    if(loginForm&&!$('toolsRequestBtn')){
      const box=document.createElement('div');
      box.id='toolsAccessBox';
      box.style.marginTop='14px';
      box.style.paddingTop='14px';
      box.style.borderTop='1px solid var(--line)';
      box.innerHTML=`
        <button id="toolsRequestBtn" class="btn secondary" type="button">طلب دخول مؤقت للأدوات</button>
        <button id="personalRequestBtn" class="btn secondary" type="button" style="margin-top:8px">هذا جهازي الشخصي</button>
        <div class="small">لا تحتاج كلمة مرور. الدخول المؤقت يحفظ الجلسة داخل هذه التبويبة فقط. الجهاز الشخصي يحتاج موافقة الإدارة أيضًا، وبعد القبول تُحفظ جلسته على هذا المتصفح حتى انتهاء المدة أو إلغائها.</div>
        <div id="toolsRequestState" class="msg" hidden></div>
        <button id="toolsCheckBtn" class="btn secondary" type="button" hidden style="margin-top:8px">تحقق الآن</button>`;
      loginForm.insertAdjacentElement('afterend',box);
      $('toolsRequestBtn').addEventListener('click',()=>requestAccess('client'));
      $('personalRequestBtn').addEventListener('click',()=>requestAccess('personal'));
      $('toolsCheckBtn').addEventListener('click',()=>checkRequest(true));
    }

    const dashboard=$('dashboard');
    const workerTools=$('workerTools');
    if(dashboard&&workerTools&&!$('generalTools')){
      const panel=document.createElement('div');
      panel.id='generalTools';
      panel.hidden=true;
      panel.innerHTML=`
        <h2 class="section-title">الأدوات العامة</h2>
        <section class="grid">
          <a class="card" href="commands/"><div class="icon">⌨️</div><h2>أوامر أساسية</h2><p>ملفات تحديث وبناء جاهزة للتحميل والاستعمال على الكمبيوتر.</p><span class="badge">تحميل مباشر</span></a>
          <a class="card" href="cards/"><div class="icon">🎫</div><h2>معالج البطاقات</h2><p>استخراج الأكواد وتنظيمها وتحميل النتائج.</p><span class="badge">جلسة أدوات</span></a>
          <a class="card" href="programs/"><div class="icon">🧰</div><h2>البرامج</h2><p>روابط البرامج وأدوات الصيانة الأساسية.</p><span class="badge">جلسة أدوات</span></a>
          <a class="card" href="qr/"><div class="icon">🔳</div><h2>مولّد QR</h2><p>تحويل رابط أو رقم أو نص إلى QR.</p><span class="badge">جلسة أدوات</span></a>
          <a class="card" href="https://pairdrop.net/" target="_blank" rel="noopener"><div class="icon">📲</div><h2>PairDrop</h2><p>نقل ملفات بين الهاتف والكمبيوتر من المتصفح.</p><span class="badge">خارجي</span></a>
          <a class="card" href="https://omnitools.app/" target="_blank" rel="noopener"><div class="icon">🖼️</div><h2>أدوات الصور والملفات</h2><p>تحويل وضغط الصور وPDF وأدوات أخرى.</p><span class="badge">خارجي</span></a>
        </section>
        <div id="toolsSessionNote" class="small">هذه جلسة مؤقتة للأدوات العامة فقط، ولا تفتح حساب المحل أو الملاحظات أو بيانات الإدارة.</div>`;
      workerTools.insertAdjacentElement('beforebegin',panel);
    }
  }

  function showTools(expiresAt,accessType='client'){
    if(otherModeActive())return;
    const login=$('loginView'),dashboard=$('dashboard');
    if(!login||!dashboard)return;
    login.hidden=true;
    dashboard.hidden=false;
    if($('adminTools'))$('adminTools').hidden=true;
    if($('workerTools'))$('workerTools').hidden=true;
    if($('generalTools'))$('generalTools').hidden=false;
    if($('githubLink'))$('githubLink').hidden=true;
    if($('sessionMode'))$('sessionMode').textContent=accessType==='personal'?'دخول أدوات — جهاز شخصي':'دخول أدوات مؤقت';
    if($('toolsSessionNote'))$('toolsSessionNote').textContent=accessType==='personal'
      ?'هذا الجهاز معتمد حاليًا كجهاز شخصي أونلاين. لا يوجد PIN أو Offline في هذه الدفعة، ويمكن للإدارة إلغاء الجلسة في أي وقت.'
      :'هذه جلسة مؤقتة للأدوات العامة فقط، ولا تفتح حساب المحل أو الملاحظات أو بيانات الإدارة.';
    updateToolsExpiry(expiresAt,accessType);
    if(expiryTimer)clearInterval(expiryTimer);
    expiryTimer=setInterval(()=>{
      const current=readToolsSession();
      if(!current.token||current.expiresAt<=Date.now()){
        clearToolsSession();
        clearInterval(expiryTimer);expiryTimer=0;
        location.replace(location.href);
      }else updateToolsExpiry(current.expiresAt,current.accessType);
    },30000);
  }

  function updateToolsExpiry(expiresAt,accessType='client'){
    if($('sessionExpiry'))$('sessionExpiry').textContent=`${accessType==='personal'?'اعتماد الجهاز':'جلسة الأدوات'} ينتهي بعد ${formatRemaining(expiresAt)}`;
  }

  async function restoreTools(){
    if(otherModeActive())return;
    const current=readToolsSession();
    if(current.token&&current.expiresAt>Date.now()){
      const personal=current.accessType==='personal'&&current.storage===localStorage;
      if(personal)showTools(current.expiresAt,'personal');
      try{
        const session=await api('/v1/session',{token:current.token});
        if(session.ok&&session.role==='tools'){
          const accessType=session.access_type||current.accessType||'client';
          if(accessType==='personal'&&current.storage!==localStorage)saveToolsSession(current.token,Number(session.expires_at),accessType);
          showTools(Number(session.expires_at),accessType);
          return;
        }
        clearToolsSession();showRootLoginFallback();
      }catch(error){
        if(personal&&!error?.status){
          // Network problem only: keep the approved personal-device session locally.
          // It will be validated again on the next load/online request.
          return;
        }
        clearToolsSession();showRootLoginFallback();
      }
    }else{
      const staleSession=readStorageSession(sessionStorage);
      const stalePersonal=readStorageSession(localStorage);
      if(staleSession.token||staleSession.expiresAt||stalePersonal.token||stalePersonal.expiresAt)clearToolsSession();
    }

    const requestId=sessionStorage.getItem(REQUEST_ID_KEY)||'';
    const requestToken=sessionStorage.getItem(REQUEST_TOKEN_KEY)||'';
    const requestExpires=Number(sessionStorage.getItem(REQUEST_EXPIRES_KEY)||0);
    const requestType=sessionStorage.getItem(REQUEST_TYPE_KEY)||'client';
    if(requestId&&requestToken&&requestExpires>Date.now()){
      showPending(requestExpires,requestType);
      await checkRequest(false);
      startPolling();
    }else if(requestId||requestToken||requestExpires){
      clearRequest();
    }
  }

  function showPending(expiresAt,accessType='client'){
    const btn=$('toolsRequestBtn'),personalBtn=$('personalRequestBtn'),check=$('toolsCheckBtn');
    if(btn){btn.disabled=true;btn.textContent=accessType==='personal'?'طلب اعتماد جهاز شخصي قيد المراجعة':'طلب الدخول المؤقت قيد المراجعة';}
    if(personalBtn)personalBtn.disabled=true;
    if(check)check.hidden=false;
    setRequestState(`${accessType==='personal'?'تم إرسال طلب اعتماد الجهاز الشخصي':'تم إرسال طلب الدخول'} للإدارة. يبقى الطلب صالحًا حوالي ${formatRemaining(expiresAt)}.`,'ok');
  }

  function resetRequestUi(){
    const btn=$('toolsRequestBtn'),personalBtn=$('personalRequestBtn'),check=$('toolsCheckBtn');
    if(btn){btn.disabled=false;btn.textContent='طلب دخول مؤقت للأدوات';}
    if(personalBtn){personalBtn.disabled=false;personalBtn.textContent='هذا جهازي الشخصي';}
    if(check)check.hidden=true;
  }

  function startPolling(){
    if(pollTimer)return;
    pollTimer=setInterval(()=>checkRequest(false),5000);
  }

  async function requestAccess(accessType='client'){
    clearLoginMessage();
    const identity=String($('identity')?.value||'').trim();
    if(identity.length<3){setLoginMessage('اكتب بريدك أو رقم هاتفك أو اسمًا واضحًا في الخانة الأولى.');return;}
    const btn=accessType==='personal'?$('personalRequestBtn'):$('toolsRequestBtn');
    if(btn){btn.disabled=true;btn.textContent='جاري إرسال الطلب…';}
    if($('toolsRequestBtn'))$('toolsRequestBtn').disabled=true;
    if($('personalRequestBtn'))$('personalRequestBtn').disabled=true;
    try{
      const data=await api('/v1/access/requests',{
        method:'POST',
        body:{identifier:identity,access_type:accessType,client_label:buildClientLabel(accessType)}
      });
      sessionStorage.setItem(REQUEST_ID_KEY,data.request_id);
      sessionStorage.setItem(REQUEST_TOKEN_KEY,data.request_token);
      sessionStorage.setItem(REQUEST_EXPIRES_KEY,String(data.expires_at));
      sessionStorage.setItem(REQUEST_TYPE_KEY,accessType);
      showPending(data.expires_at,accessType);
      startPolling();
    }catch(error){
      resetRequestUi();
      setRequestState(errorText(error),'error');
    }
  }

  async function checkRequest(manual){
    const requestId=sessionStorage.getItem(REQUEST_ID_KEY)||'';
    const requestToken=sessionStorage.getItem(REQUEST_TOKEN_KEY)||'';
    if(!requestId||!requestToken)return;
    const check=$('toolsCheckBtn');
    if(manual&&check){check.disabled=true;check.textContent='جاري التحقق…';}
    try{
      const state=await api(`/v1/access/requests/${encodeURIComponent(requestId)}`,{token:requestToken});
      if(state.status==='pending'){
        showPending(state.request_expires_at,state.access_type||sessionStorage.getItem(REQUEST_TYPE_KEY)||'client');
        return;
      }
      if(state.status==='approved'&&state.can_exchange){
        const session=await api(`/v1/access/requests/${encodeURIComponent(requestId)}/exchange`,{method:'POST',token:requestToken});
        const accessType=session.access_type||sessionStorage.getItem(REQUEST_TYPE_KEY)||'client';
        saveToolsSession(session.session_token,session.expires_at,accessType);
        clearRequest();
        resetRequestUi();
        showTools(session.expires_at,accessType);
        return;
      }
      if(state.status==='rejected'){
        clearRequest();
        resetRequestUi();
        setRequestState(`تم رفض الطلب. يمكن إعادة المحاولة بعد ${formatRemaining(state.blocked_until)}.`,'error');
        return;
      }
      if(state.status==='expired'){
        clearRequest();
        resetRequestUi();
        setRequestState('انتهت مدة الطلب قبل اتخاذ قرار. يمكنك إرسال طلب جديد.','error');
      }
    }catch(error){
      if(manual)setRequestState(errorText(error),'error');
    }finally{
      if(manual&&check){check.disabled=false;check.textContent='تحقق الآن';}
    }
  }

  injectUi();

  $('loginForm')?.addEventListener('submit',()=>{
    const current=readToolsSession();
    if(current.accessType!=='personal')clearToolsSession();
    clearRequest();
  },{capture:true});
  $('logoutBtn')?.addEventListener('click',()=>{
    if(!$('generalTools')?.hidden){
      clearToolsSession();clearRequest();
      if(expiryTimer){clearInterval(expiryTimer);expiryTimer=0;}
    }
  });

  setTimeout(async()=>{
    const handled=await restoreGoogleLogin();
    if(!handled)await restoreTools();
  },0);
})();
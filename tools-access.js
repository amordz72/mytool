(() => {
  'use strict';

  const API_BASE='https://mytool-access.dzamor72.workers.dev';
  const TOOLS_TOKEN_KEY='mytool_tools_access_token';
  const TOOLS_EXPIRES_KEY='mytool_tools_access_expires_at';
  const TOOLS_TYPE_KEY='mytool_tools_access_type';
  const REQUEST_ID_KEY='mytool_tools_request_id';
  const REQUEST_TOKEN_KEY='mytool_tools_request_token';
  const REQUEST_EXPIRES_KEY='mytool_tools_request_expires_at';
  const ADMIN_EXPIRES_KEY='mytool_admin_expires_at';
  const EMERGENCY_EXPIRES_KEY='mytool_emergency_admin_expires_at';
  const WORKER_TOKEN_KEY='mytool_shop_worker_token';
  const WORKER_EXPIRES_KEY='mytool_shop_worker_expires_at';

  const $=id=>document.getElementById(id);
  let pollTimer=0;
  let expiryTimer=0;

  function otherModeActive(){
    const now=Date.now();
    return Number(localStorage.getItem(ADMIN_EXPIRES_KEY)||0)>now
      ||Number(localStorage.getItem(EMERGENCY_EXPIRES_KEY)||0)>now
      ||(Boolean(localStorage.getItem(WORKER_TOKEN_KEY))&&Number(localStorage.getItem(WORKER_EXPIRES_KEY)||0)>now);
  }

  function clearToolsSession(){
    sessionStorage.removeItem(TOOLS_TOKEN_KEY);
    sessionStorage.removeItem(TOOLS_EXPIRES_KEY);
    sessionStorage.removeItem(TOOLS_TYPE_KEY);
  }

  function clearRequest(){
    sessionStorage.removeItem(REQUEST_ID_KEY);
    sessionStorage.removeItem(REQUEST_TOKEN_KEY);
    sessionStorage.removeItem(REQUEST_EXPIRES_KEY);
    if(pollTimer){clearInterval(pollTimer);pollTimer=0;}
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

  function injectUi(){
    const loginForm=$('loginForm');
    if(loginForm&&!$('toolsRequestBtn')){
      const box=document.createElement('div');
      box.id='toolsAccessBox';
      box.style.marginTop='14px';
      box.style.paddingTop='14px';
      box.style.borderTop='1px solid var(--line)';
      box.innerHTML=`
        <button id="toolsRequestBtn" class="btn secondary" type="button">طلب دخول الأدوات العامة</button>
        <div class="small">لا تحتاج كلمة مرور. اكتب في الخانة الأولى بريدك أو رقم هاتفك أو اسمًا واضحًا، ثم أرسل الطلب للإدارة.</div>
        <div id="toolsRequestState" class="msg" hidden></div>
        <button id="toolsCheckBtn" class="btn secondary" type="button" hidden style="margin-top:8px">تحقق الآن</button>`;
      loginForm.insertAdjacentElement('afterend',box);
      $('toolsRequestBtn').addEventListener('click',requestAccess);
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
          <a class="card" href="cards/"><div class="icon">🎫</div><h2>معالج البطاقات</h2><p>استخراج الأكواد وتنظيمها وتحميل النتائج.</p><span class="badge">جلسة أدوات</span></a>
          <a class="card" href="programs/"><div class="icon">🧰</div><h2>البرامج</h2><p>روابط البرامج وأدوات الصيانة الأساسية.</p><span class="badge">جلسة أدوات</span></a>
          <a class="card" href="qr/"><div class="icon">🔳</div><h2>مولّد QR</h2><p>تحويل رابط أو رقم أو نص إلى QR.</p><span class="badge">جلسة أدوات</span></a>
          <a class="card" href="https://pairdrop.net/" target="_blank" rel="noopener"><div class="icon">📲</div><h2>PairDrop</h2><p>نقل ملفات بين الهاتف والكمبيوتر من المتصفح.</p><span class="badge">خارجي</span></a>
          <a class="card" href="https://omnitools.app/" target="_blank" rel="noopener"><div class="icon">🖼️</div><h2>أدوات الصور والملفات</h2><p>تحويل وضغط الصور وPDF وأدوات أخرى.</p><span class="badge">خارجي</span></a>
        </section>
        <div class="small">هذه جلسة مؤقتة للأدوات العامة فقط، ولا تفتح حساب المحل أو الملاحظات أو بيانات الإدارة.</div>`;
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
    updateToolsExpiry(expiresAt);
    if(expiryTimer)clearInterval(expiryTimer);
    expiryTimer=setInterval(()=>{
      const current=Number(sessionStorage.getItem(TOOLS_EXPIRES_KEY)||0);
      if(!current||current<=Date.now()){
        clearToolsSession();
        clearInterval(expiryTimer);expiryTimer=0;
        location.replace(location.href);
      }else updateToolsExpiry(current);
    },30000);
  }

  function updateToolsExpiry(expiresAt){
    if($('sessionExpiry'))$('sessionExpiry').textContent=`تنتهي جلسة الأدوات بعد ${formatRemaining(expiresAt)}`;
  }

  async function restoreTools(){
    if(otherModeActive())return;
    const token=sessionStorage.getItem(TOOLS_TOKEN_KEY)||'';
    const expiresAt=Number(sessionStorage.getItem(TOOLS_EXPIRES_KEY)||0);
    if(token&&expiresAt>Date.now()){
      try{
        const session=await api('/v1/session',{token});
        if(session.ok&&session.role==='tools'){
          showTools(Number(session.expires_at),session.access_type||sessionStorage.getItem(TOOLS_TYPE_KEY)||'client');
          return;
        }
      }catch(_e){}
      clearToolsSession();
    }else if(token||expiresAt){
      clearToolsSession();
    }

    const requestId=sessionStorage.getItem(REQUEST_ID_KEY)||'';
    const requestToken=sessionStorage.getItem(REQUEST_TOKEN_KEY)||'';
    const requestExpires=Number(sessionStorage.getItem(REQUEST_EXPIRES_KEY)||0);
    if(requestId&&requestToken&&requestExpires>Date.now()){
      showPending(requestExpires);
      await checkRequest(false);
      startPolling();
    }else if(requestId||requestToken||requestExpires){
      clearRequest();
    }
  }

  function showPending(expiresAt){
    const btn=$('toolsRequestBtn'),check=$('toolsCheckBtn');
    if(btn){btn.disabled=true;btn.textContent='الطلب قيد المراجعة';}
    if(check)check.hidden=false;
    setRequestState(`تم إرسال الطلب للإدارة. يبقى صالحًا حوالي ${formatRemaining(expiresAt)}.`,'ok');
  }

  function resetRequestUi(){
    const btn=$('toolsRequestBtn'),check=$('toolsCheckBtn');
    if(btn){btn.disabled=false;btn.textContent='طلب دخول الأدوات العامة';}
    if(check)check.hidden=true;
  }

  function startPolling(){
    if(pollTimer)return;
    pollTimer=setInterval(()=>checkRequest(false),5000);
  }

  async function requestAccess(){
    const identity=String($('identity')?.value||'').trim();
    if(identity.length<3){setLoginMessage('اكتب بريدك أو رقم هاتفك أو اسمًا واضحًا في الخانة الأولى.');return;}
    const btn=$('toolsRequestBtn');
    btn.disabled=true;btn.textContent='جاري إرسال الطلب…';
    try{
      const data=await api('/v1/access/requests',{
        method:'POST',
        body:{identifier:identity,access_type:'client',client_label:'MyTool web'}
      });
      sessionStorage.setItem(REQUEST_ID_KEY,data.request_id);
      sessionStorage.setItem(REQUEST_TOKEN_KEY,data.request_token);
      sessionStorage.setItem(REQUEST_EXPIRES_KEY,String(data.expires_at));
      showPending(data.expires_at);
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
        showPending(state.request_expires_at);
        return;
      }
      if(state.status==='approved'&&state.can_exchange){
        const session=await api(`/v1/access/requests/${encodeURIComponent(requestId)}/exchange`,{method:'POST',token:requestToken});
        sessionStorage.setItem(TOOLS_TOKEN_KEY,session.session_token);
        sessionStorage.setItem(TOOLS_EXPIRES_KEY,String(session.expires_at));
        sessionStorage.setItem(TOOLS_TYPE_KEY,session.access_type||'client');
        clearRequest();
        resetRequestUi();
        showTools(session.expires_at,session.access_type||'client');
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

  $('loginForm')?.addEventListener('submit',()=>{clearToolsSession();clearRequest();},{capture:true});
  $('logoutBtn')?.addEventListener('click',()=>{
    if(!$('generalTools')?.hidden){
      clearToolsSession();clearRequest();
      if(expiryTimer){clearInterval(expiryTimer);expiryTimer=0;}
    }
  });

  setTimeout(restoreTools,0);
})();

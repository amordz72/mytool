import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabase=createClient(window.ShopApiConfig.url,window.ShopApiConfig.key);
const CACHE='mytool_customer_linking_service_cache_v1';
const DIRECTORY_CACHE='mytool_customer_directory_cache_v1';
const PAGE_SIZE=15;
const WORKER_TOKEN='mytool_shop_worker_token',WORKER_EXPIRES='mytool_shop_worker_expires_at',WORKSPACE_ROLE='mytool_workspace_role',WORKSPACE_CODE='mytool_workspace_code',ADMIN_EXPIRES='mytool_admin_expires_at';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v??'').trim().toLowerCase();

let me=null,sources=[],parties=[],suggestions=[],platforms=[],platformSignatures=[],identityReviews=[],importQueue=[],page=1;
let adminMode='none',workspaceToken='';
let importBusy=false;
let confirmResolve=null;
const selectedSources=new Set();
let currentPageIds=[];

function msg(text,kind='info'){
  $('message').textContent=text;
  $('message').className='message '+kind;
}
function platformLabel(v){
  return platforms.find(x=>x.platform_key===v)?.display_name||({tehna_pay:'تهنى باي',hanii_rohek:'هني روحك',wafarly:'وفرلي'}[v]||v||'مصدر');
}
function platformKeyFromName(name){
  const base=norm(name).normalize('NFKD').replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  return base?('custom_'+base.slice(0,32)):('platform_'+Date.now().toString(36));
}
function renderPlatformControls(){
  const current=$('importPlatform').value;
  $('importPlatform').innerHTML='<option value="">لا تخمّن — اطلب مني الاختيار</option>'+platforms.map(p=>'<option value="'+esc(p.platform_key)+'">'+esc(p.display_name)+'</option>').join('');
  if(platforms.some(p=>p.platform_key===current))$('importPlatform').value=current;
  const pf=$('platformFilter').value;
  $('platformFilter').innerHTML='<option value="all">كل المنصات</option>'+platforms.map(p=>'<option value="'+esc(p.platform_key)+'">'+esc(p.display_name)+'</option>').join('');
  if(pf==='all'||platforms.some(p=>p.platform_key===pf))$('platformFilter').value=pf;
  if(importQueue.length)renderImportQueue();
}
async function sha256File(file){
  const bytes=await file.arrayBuffer();
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function previewSourceImport(platform,hash){
  const {data,error}=await adminRpc(
    'admin_customer_preview_source_import',
    'workspace_admin_preview_source_import',
    {p_platform_key:platform||null,p_file_sha256:hash}
  );
  if(error)throw error;
  return data;
}
async function registerSourceImport(platform,file,knownHash=null){
  const hash=knownHash||await sha256File(file);
  const {data,error}=await adminRpc(
    'admin_customer_register_source_import',
    'workspace_admin_register_source_import',
    {p_platform_key:platform,p_file_name:file.name,p_file_sha256:hash}
  );
  if(error)throw error;
  return data;
}
function statusLabel(v){
  return ({linked:'مسجل في MyTool',unlinked:'غير مسجل',pending_review:'بانتظار الموافقة',conflict:'تعارض'}[v]||v);
}
function partyAccountCount(partyId){
  const id=Number(partyId||0);
  if(!id)return 0;
  return sources.filter(x=>Number(x.linked_party_id||0)===id).length;
}
function partyPlatformCount(partyId){
  const id=Number(partyId||0);
  if(!id)return 0;
  return new Set(
    sources
      .filter(x=>Number(x.linked_party_id||0)===id)
      .map(x=>String(x.platform_key||'').trim())
      .filter(Boolean)
  ).size;
}
function crossPlatformPartyCount(){
  const byParty=new Map();
  for(const s of sources){
    const id=Number(s.linked_party_id||0);
    const platform=String(s.platform_key||'').trim();
    if(!id||!platform)continue;
    if(!byParty.has(id))byParty.set(id,new Set());
    byParty.get(id).add(platform);
  }
  return [...byParty.values()].filter(set=>set.size>=2).length;
}
function safeError(error){
  return String(error?.message||error||'خطأ غير معروف').replace(/(eyJ[a-zA-Z0-9._-]{20,}|sb_[a-zA-Z0-9_-]{20,})/g,'[محجوب]');
}

async function adminRpc(ownerName,workspaceName,params={}){
  if(adminMode==='local'){
    return supabase.rpc(workspaceName,{p_session_token:workspaceToken,...params});
  }
  return supabase.rpc(ownerName,params);
}
function saveCache(){
  const payload={saved_at:Date.now(),sources,parties,suggestions,platforms,platformSignatures,identityReviews};
  localStorage.setItem(CACHE,JSON.stringify(payload));
  localStorage.setItem(DIRECTORY_CACHE,JSON.stringify({
    saved_at:payload.saved_at,
    parties,
    linked_sources:sources.filter(x=>x.link_status==='linked').map(x=>({
      id:x.id,platform_key:x.platform_key,username:x.username,display_name:x.display_name,
      party_id:x.linked_party_id,party_name:x.linked_party_name,phone:x.phone,email:x.email
    }))
  }));
}
function loadCache(){
  try{
    const v=JSON.parse(localStorage.getItem(CACHE)||'null');
    if(!v||!Array.isArray(v.sources)||!Array.isArray(v.parties))return false;
    sources=v.sources;parties=v.parties;suggestions=Array.isArray(v.suggestions)?v.suggestions:[];platforms=Array.isArray(v.platforms)?v.platforms:[];platformSignatures=Array.isArray(v.platformSignatures)?v.platformSignatures:[];identityReviews=Array.isArray(v.identityReviews)?v.identityReviews:[];
    renderPlatformControls();renderAll();
    const when=v.saved_at?new Date(v.saved_at).toLocaleString('ar-DZ'):'';
    msg('Offline — تعرض آخر نسخة محفوظة'+(when?' ('+when+')':'')+'.','warn');
    return true;
  }catch(_){return false}
}
function renderConnectivity(){
  const off=!navigator.onLine;
  $('offlineNote').hidden=!off;
  $('importBtn').disabled=off||importBusy;
  $('smartBtn').disabled=off||importBusy;
  if($('approveImportsBtn'))$('approveImportsBtn').disabled=off||importBusy||!importQueue.some(x=>x.status==='ready'||(x.status==='duplicate'&&x.forceRepeat));
  if($('clearImportsBtn'))$('clearImportsBtn').disabled=importBusy;
  $('manualSave').disabled=off;
  $('newPlatformBtn').disabled=off;
}
function askConfirm(title,body,okText='تأكيد'){
  if(confirmResolve){confirmResolve(false);confirmResolve=null}
  $('confirmTitle').textContent=title;
  $('confirmBody').textContent=body;
  $('confirmOk').textContent=okText;
  $('confirmDialog').hidden=false;
  return new Promise(resolve=>{confirmResolve=resolve});
}
function closeConfirm(value){
  $('confirmDialog').hidden=true;
  if(confirmResolve){const r=confirmResolve;confirmResolve=null;r(value)}
}
$('confirmCancel').onclick=()=>closeConfirm(false);
$('confirmOk').onclick=()=>closeConfirm(true);
$('confirmDialog').onclick=e=>{if(e.target===$('confirmDialog'))closeConfirm(false)};

function partyOptions(selected){
  const first='<option value="">اختر العميل الموحد…</option>';
  return first+parties.map(p=>'<option value="'+p.id+'" '+(Number(selected)===Number(p.id)?'selected':'')+'>'+esc(p.display_name)+'</option>').join('');
}
function contactLine(source){
  const parts=[];
  if(source.phone)parts.push('هاتف: '+esc(source.phone));
  if(source.email)parts.push('بريد: '+esc(source.email));
  if(source.external_account_id)parts.push('ID: '+esc(source.external_account_id));
  return parts.join(' · ');
}
function sourceSearchText(s){
  return norm([s.display_name,s.first_name,s.last_name,s.username,s.phone,s.email,s.linked_party_name,s.external_account_id].filter(Boolean).join(' '));
}
function filteredSources(){
  const q=norm($('search').value);
  const pf=$('platformFilter').value;
  const sf=$('statusFilter').value;
  return sources.filter(s=>{
    if(q&&!sourceSearchText(s).includes(q))return false;
    if(pf!=='all'&&s.platform_key!==pf)return false;
    if(sf==='work'&&!['unlinked','pending_review','conflict'].includes(s.link_status))return false;
    if(sf!=='all'&&sf!=='work'&&s.link_status!==sf)return false;
    return true;
  }).sort((a,b)=>{
    const rank={conflict:0,pending_review:1,unlinked:2,linked:3};
    return (rank[a.link_status]??9)-(rank[b.link_status]??9)
      || String(a.display_name||a.username).localeCompare(String(b.display_name||b.username),'ar');
  });
}
function renderMetrics(){
  const total=sources.length;
  const unlinked=sources.filter(x=>x.link_status==='unlinked').length;
  const pending=sources.filter(x=>x.link_status==='pending_review').length;
  const registered=sources.filter(x=>x.link_status==='linked').length;
  const conflict=sources.filter(x=>x.link_status==='conflict').length;
  const crossPlatform=crossPlatformPartyCount();

  $('mSources').textContent=total;
  $('mUnlinked').textContent=unlinked;
  $('mPending').textContent=pending;
  $('mLinked').textContent=registered;
  $('mConflict').textContent=conflict;
  if($('mCrossPlatform'))$('mCrossPlatform').textContent=crossPlatform;

  const summary=$('metricsSummary');
  if(summary){
    const work=unlinked+pending+conflict;
    const parts=[total+' حساب مصدر',crossPlatform+' عميل مجمّع بين منصات'];
    if(work>0)parts.push(work+' يحتاج تدخل');
    summary.textContent=parts.join(' · ');
  }

  const visibility=[
    ['metricSources',total,true],
    ['metricLinked',registered,false],
    ['metricCrossPlatform',crossPlatform,true],
    ['metricUnlinked',unlinked,false],
    ['metricPending',pending,false],
    ['metricConflict',conflict,false]
  ];
  for(const [id,count,keepZero] of visibility){
    const el=$(id);
    if(!el)continue;
    el.hidden=!keepZero&&count===0;
  }
}
function renderBulk(){
  for(const id of [...selectedSources]){
    if(!sources.some(s=>Number(s.id)===Number(id)))selectedSources.delete(id);
  }
  const selected=sources.filter(s=>selectedSources.has(Number(s.id)));
  $('selectedCount').textContent=selected.length+' محدد';
  $('bulkBar').hidden=selected.length<2;

  const seen=new Set();
  const options=['<option value="">أول حساب محدد</option>'];
  for(const s of selected){
    const pid=Number(s.linked_party_id||0);
    if(!pid||seen.has(pid))continue;
    seen.add(pid);
    options.push('<option value="'+pid+'">'+esc(s.linked_party_name||('عميل #'+pid))+'</option>');
  }
  $('bulkTarget').innerHTML=options.join('');
}
function renderSources(){
  const list=filteredSources();
  const pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));
  if(page>pages)page=pages;
  if(page<1)page=1;
  const start=(page-1)*PAGE_SIZE;
  const chunk=list.slice(start,start+PAGE_SIZE);
  currentPageIds=chunk.map(x=>Number(x.id));
  $('pageText').textContent='صفحة '+page+' من '+pages+' · '+list.length+' حساب';
  $('prevPage').disabled=page<=1;
  $('nextPage').disabled=page>=pages;

  if(!chunk.length){
    $('sources').innerHTML='<div class="empty">'+(sources.length?'لا توجد نتائج بهذه الفلاتر.':'لا توجد حسابات مصادر بعد. استخدم «تحديث المصادر».')+'</div>';
    return;
  }

  $('sources').innerHTML=chunk.map(s=>{
    const name=s.display_name||[s.first_name,s.last_name].filter(Boolean).join(' ')||s.username;
    const linkedCount=partyAccountCount(s.linked_party_id);
    const platformCount=partyPlatformCount(s.linked_party_id);
    const linkedLine=s.link_status==='linked'
      ? '<div class="linked-line">'+(platformCount>=2
          ? 'مجمّع بين '+platformCount+' منصات تحت العميل «'+esc(s.linked_party_name||('عميل #'+s.linked_party_id))+'» · '+linkedCount+' حسابات'
          : 'مسجل في MyTool فقط: '+esc(s.linked_party_name||('عميل #'+s.linked_party_id)))+'</div>'
      : '';
    const unlink=s.link_status==='linked'&&s.link_id
      ? '<button class="btn danger" data-unlink="'+s.link_id+'" data-source="'+s.id+'" type="button">إلغاء الربط</button>'
      : '';
    const manualBox='<div class="link-controls" data-manual-link-box="'+s.id+'" hidden><div class="field"><label>اختر العميل الموحد</label><select data-party-select="'+s.id+'">'+partyOptions(s.linked_party_id)+'</select></div><button class="btn secondary" data-link="'+s.id+'" type="button">حفظ الربط</button></div>';
    const primaryActions=s.link_status==='linked'
      ? '<div class="actions"><button class="btn secondary" data-show-manual-link="'+s.id+'" type="button">تغيير الربط يدويًا</button>'+unlink+'</div>'
      : '<div class="actions"><button class="btn" data-create-source="'+s.id+'" type="button">إنشاء كعميل جديد</button><button class="btn secondary" data-show-manual-link="'+s.id+'" type="button">ربط يدوي</button></div>';
    const checked=selectedSources.has(Number(s.id));
    return '<div class="source-card'+(checked?' selected':'')+'" data-source-card="'+s.id+'">'+
      '<div class="source-top"><label class="source-select"><input type="checkbox" data-select-source="'+s.id+'" '+(checked?'checked':'')+'><span><div class="name">'+esc(name)+'</div><div class="username">'+esc(s.username)+'</div></span></label>'+
      '<div class="badges"><span class="badge platform">'+esc(platformLabel(s.platform_key))+'</span><span class="badge '+esc(s.link_status)+'">'+esc(s.link_status==='linked'&&platformCount>=2?'مجمّع بين '+platformCount+' منصات':statusLabel(s.link_status))+'</span></div></div>'+
      (contactLine(s)?'<div class="meta">'+contactLine(s)+'</div>':'')+
      linkedLine+
      primaryActions+manualBox+
      '</div>';
  }).join('');

  document.querySelectorAll('[data-select-source]').forEach(input=>input.onchange=()=>{
    const id=Number(input.dataset.selectSource);
    if(input.checked)selectedSources.add(id);else selectedSources.delete(id);
    const card=document.querySelector('[data-source-card="'+id+'"]');
    if(card)card.classList.toggle('selected',input.checked);
    renderBulk();
  });
  document.querySelectorAll('[data-show-manual-link]').forEach(b=>b.onclick=()=>{
    const box=document.querySelector('[data-manual-link-box="'+b.dataset.showManualLink+'"]');
    if(box)box.hidden=!box.hidden;
  });
  document.querySelectorAll('[data-link]').forEach(b=>b.onclick=()=>linkSource(Number(b.dataset.link)));
  document.querySelectorAll('[data-create-source]').forEach(b=>b.onclick=()=>createFromSource(Number(b.dataset.createSource)));
  document.querySelectorAll('[data-unlink]').forEach(b=>b.onclick=()=>unlinkSource(Number(b.dataset.unlink),Number(b.dataset.source)));
}
function reasonHtml(r){
  if(!r||typeof r!=='object')return '';
  const labels={phone:'نفس الهاتف',email:'نفس البريد',username:'نفس المستخدم',username_loose:'مستخدم متشابه',email_loose:'بريد متشابه',phone_near:'هاتف قريب',near_phone:'هاتف قريب',person_name_close:'اسم الشخص متشابه',name_close:'اسم قديم ملغى',identity_history:'هوية سابقة مشتركة',smart_similarity:'تشابه ذكي',exact_identity_conflict:'تعارض هوية قوي'};
  return Object.keys(r).filter(k=>r[k]!==false&&r[k]!=null).map(k=>'<span class="reason">'+esc(labels[k]||k)+'</span>').join('');
}
function suggestionSide(prefix,s){
  const person=[s[prefix+'_first_name'],s[prefix+'_last_name']].filter(Boolean).join(' ').trim();
  const name=person||s[prefix+'_username']||'بدون اسم شخص';
  const party=s[prefix+'_party_name'];
  return '<div class="suggestion-side"><b>'+esc(name)+'</b><div class="username">'+esc(s[prefix+'_username']||'')+'</div><div class="meta">'+esc(platformLabel(s[prefix+'_platform']))+(party?' · مسجل كـ '+esc(party):' · غير مسجل')+'</div></div>';
}
function renderSuggestions(){
  const active=suggestions.filter(s=>['pending','conflict'].includes(s.status));
  $('suggestionCount').textContent=active.length;
  $('suggestionsCard').hidden=false;
  if(!active.length){
    $('suggestions').innerHTML='<div class="empty">لا توجد اقتراحات معلقة. استخدم «اقتراح روابط ذكية» بعد تحديث المصادر.</div>';
    return;
  }
  $('suggestions').innerHTML=active.map(s=>{
    const conflict=s.status==='conflict';
    return '<div class="suggestion">'+
      '<div class="source-top"><div><b>اقتراح #'+s.id+'</b><div class="meta">درجة المطابقة: '+Number(s.score||0)+'</div></div><span class="badge '+(conflict?'conflict':'pending_review')+'">'+(conflict?'تعارض':'بانتظار موافقة')+'</span></div>'+
      '<div class="suggestion-pair" style="margin-top:8px">'+suggestionSide('left',s)+'<div class="arrow">⇄</div>'+suggestionSide('right',s)+'</div>'+
      '<div>'+reasonHtml(s.reasons)+'</div>'+
      '<div class="actions">'+
        (!conflict?'<button class="btn" data-approve-suggestion="'+s.id+'" type="button">موافقة وربط</button>':'')+
        '<button class="btn secondary" data-reject-suggestion="'+s.id+'" type="button">'+(conflict?'إخفاء الاقتراح':'ليس نفس العميل')+'</button>'+
      '</div></div>';
  }).join('');
  document.querySelectorAll('[data-approve-suggestion]').forEach(b=>b.onclick=()=>reviewSuggestion(Number(b.dataset.approveSuggestion),'approve'));
  document.querySelectorAll('[data-reject-suggestion]').forEach(b=>b.onclick=()=>reviewSuggestion(Number(b.dataset.rejectSuggestion),'reject'));
}
function renderIdentityReviews(){
  const box=$('identityReviews'),badge=$('identityReviewCount');
  const active=identityReviews.filter(r=>['pending','conflict'].includes(r.status));
  badge.textContent=active.length;
  if(!active.length){box.innerHTML='<div class="empty">لا توجد حالات هوية داخل المنصة تحتاج مراجعة.</div>';return}
  box.innerHTML=active.map(r=>{
    const incoming=r.incoming_payload||{};
    const candidatePerson=[r.candidate_first_name,r.candidate_last_name].filter(Boolean).join(' ').trim();
    const candidate=candidatePerson||r.candidate_username||'غير محسوم';
    const incomingName=[incoming.first_name,incoming.last_name].filter(Boolean).join(' ').trim()||incoming.username||'بيانات واردة';
    const canSame=!!r.candidate_source_account_id;
    return '<div class="identity-review"><div class="source-top"><div><b>'+esc(platformLabel(r.platform_key))+' · '+esc(incomingName)+'</b><div class="meta">درجة: '+Number(r.score||0)+' · '+(r.status==='conflict'?'تعارض':'مراجعة')+'</div></div><span class="badge '+(r.status==='conflict'?'conflict':'pending_review')+'">'+(r.status==='conflict'?'تعارض':'اقتراح')+'</span></div>'+
      '<div class="incoming"><b>الحساب الأقرب:</b> '+esc(candidate)+'<div class="meta">'+esc([r.candidate_phone,r.candidate_email].filter(Boolean).join(' · '))+'</div></div>'+
      '<div>'+reasonHtml(r.reasons)+'</div><div class="actions">'+
      (canSame?'<button class="btn" data-identity-same="'+r.id+'">نفس الحساب</button>':'')+
      (r.status!=='conflict'?'<button class="btn secondary" data-identity-new="'+r.id+'">حساب جديد فعلاً</button>':'')+
      '<button class="btn secondary" data-identity-ignore="'+r.id+'">تجاهل</button></div></div>';
  }).join('');
  document.querySelectorAll('[data-identity-same]').forEach(b=>b.onclick=()=>reviewIdentity(Number(b.dataset.identitySame),'same'));
  document.querySelectorAll('[data-identity-new]').forEach(b=>b.onclick=()=>reviewIdentity(Number(b.dataset.identityNew),'new'));
  document.querySelectorAll('[data-identity-ignore]').forEach(b=>b.onclick=()=>reviewIdentity(Number(b.dataset.identityIgnore),'ignore'));
}
function partyMatrix(p){
  return '<div class="platform-matrix">'+platforms.map(pl=>{
    const rows=sources.filter(s=>Number(s.linked_party_id||0)===Number(p.id)&&s.platform_key===pl.platform_key);
    if(!rows.length)return '<div class="platform-slot missing"><b>'+esc(pl.display_name)+'</b>غير موجود</div>';
    return '<div class="platform-slot"><b>'+esc(pl.display_name)+'</b>'+rows.map(s=>esc(s.display_name||s.username)+' · '+esc(s.username)).join('<br>')+'</div>';
  }).join('')+'</div>';
}
function renderParties(){
  if(!parties.length){
    $('parties').innerHTML='<div class="empty">لا يوجد عميل موحد بعد. أنشئ واحدًا يدويًا أو من حساب مصدر.</div>';
    return;
  }
  $('parties').innerHTML=parties.map(p=>'<div class="party-card"><div><b>#'+p.id+' · '+esc(p.display_name)+'</b></div>'+
    partyMatrix(p)+
    '<div class="party-edit"><div class="field"><label>الاسم</label><input data-party-name="'+p.id+'" value="'+esc(p.display_name)+'"></div>'+
    '<div class="field"><label>الهاتف</label><input data-party-phone="'+p.id+'" value="'+esc(p.primary_phone||'')+'" inputmode="tel"></div>'+
    '<div class="field"><label>البريد</label><input data-party-email="'+p.id+'" value="'+esc(p.primary_email||'')+'" inputmode="email"></div>'+
    '<button class="btn secondary" data-party-save="'+p.id+'" type="button">حفظ</button></div></div>').join('');
  document.querySelectorAll('[data-party-save]').forEach(b=>b.onclick=()=>saveParty(Number(b.dataset.partySave)));
}
function updateSourceVisibilityButton(){
  const b=$('showAllSourcesBtn');if(!b)return;
  const showingAll=$('statusFilter').value==='all';
  b.textContent=showingAll?'إخفاء الحسابات السليمة':'عرض كل حسابات المصادر';
}
function renderAll(){
  renderMetrics();renderIdentityReviews();renderSuggestions();renderSources();renderParties();renderConnectivity();renderBulk();updateSourceVisibilityButton();
}
async function identify(){
  const now=Date.now();
  workspaceToken=localStorage.getItem(WORKER_TOKEN)||'';
  const workerExp=Number(localStorage.getItem(WORKER_EXPIRES)||0);
  const workspaceRole=localStorage.getItem(WORKSPACE_ROLE)||'';
  if(workspaceToken&&workerExp>now&&workspaceRole==='workspace_admin'){
    if(!navigator.onLine){
      adminMode='local';
      me={account_role:'workspace_admin',nickname:localStorage.getItem('mytool_shop_worker_nickname')||'مدير محلي'};
      ShopShell.mountRoleNavigation({role:'admin',permissions:{can_record_money:true}},'customer-links');
      return;
    }
    const st=await supabase.rpc('workspace_session_status',{p_session_token:workspaceToken});
    if(!st.error&&st.data?.length&&st.data[0].account_role==='workspace_admin'){
      adminMode='local';
      me=st.data[0];
      ShopShell.mountRoleNavigation({role:'admin',permissions:{can_record_money:true}},'customer-links');
      document.querySelectorAll('.shell-identity').forEach(el=>el.textContent=(me.nickname||'مدير محلي')+' · ربط العملاء');
      return;
    }
  }

  if(!navigator.onLine)throw new Error('NO_SESSION');

  const {data,error}=await supabase.auth.getSession();
  if(error)throw error;
  const adminExp=Number(localStorage.getItem(ADMIN_EXPIRES)||0);
  if(data?.session&&adminExp>now){
    adminMode='owner';
    me={account_role:'workspace_admin',nickname:'المالك'};
    ShopShell.mountRoleNavigation({role:'admin',permissions:{can_record_money:true}},'customer-links');
    document.querySelectorAll('.shell-identity').forEach(el=>el.textContent='المالك · ربط العملاء');
    return;
  }

  throw new Error('NO_SESSION');
}
async function load(){
  if(!navigator.onLine){
    if(!loadCache())msg('لا يوجد اتصال ولا توجد نسخة محفوظة لهذه الصفحة.','error');
    return;
  }
  msg('جاري تحميل دليل الربط…');
  const [a,b,c,d,e]=await Promise.all([
    adminRpc('admin_customer_list_linking','workspace_admin_list_customer_linking'),
    adminRpc('admin_customer_list_link_suggestions','workspace_admin_list_link_suggestions',{p_status:null}),
    adminRpc('admin_customer_list_platforms','workspace_admin_list_platforms'),
    adminRpc('admin_customer_list_identity_reviews','workspace_admin_list_identity_reviews'),
    adminRpc('admin_customer_list_schema_signatures','workspace_admin_list_schema_signatures')
  ]);
  if(a.error)throw a.error;if(b.error)throw b.error;if(c.error)throw c.error;if(d.error)throw d.error;if(e.error)throw e.error;
  sources=Array.isArray(a.data?.sources)?a.data.sources:[];
  parties=Array.isArray(a.data?.parties)?a.data.parties:[];
  suggestions=Array.isArray(b.data)?b.data:[];
  platforms=Array.isArray(c.data)?c.data:[];
  identityReviews=Array.isArray(d.data)?d.data:[];
  platformSignatures=Array.isArray(e.data)?e.data:[];
  renderPlatformControls();saveCache();renderAll();
  msg('تم تحديث دليل العملاء والروابط.','ok');
}
async function mergeSelectedSources(){
  if(!navigator.onLine)return msg('الدمج يحتاج اتصالًا.','warn');
  const ids=[...selectedSources];
  if(ids.length<2)return msg('حدد حسابين على الأقل.','error');
  const target=Number($('bulkTarget').value||0)||null;
  const selected=sources.filter(s=>selectedSources.has(Number(s.id)));
  const names=selected.slice(0,4).map(s=>s.display_name||s.username).join('، ');
  const more=selected.length>4?' +'+(selected.length-4)+' أخرى':'';
  const ok=await askConfirm(
    'دمج '+selected.length+' حساب',
    'سيتم اعتبار الحسابات المحددة لنفس العميل. '+names+more+'. يمكن تعديل الروابط لاحقًا من سجل الربط.',
    'دمج المحدد'
  );
  if(!ok)return;

  $('mergeSelected').disabled=true;
  const {data,error}=await adminRpc('admin_customer_merge_selected_sources','workspace_admin_merge_selected_sources',{
    p_source_account_ids:ids,
    p_target_party_id:target
  });
  $('mergeSelected').disabled=false;
  if(error)return msg('تعذر الدمج: '+safeError(error),'error');

  selectedSources.clear();
  await generateSuggestions({silent:true});
  await load();
  msg('تم دمج '+Number(data?.selected||ids.length)+' حساب تحت «'+(data?.target_party_name||'العميل الموحد')+'».','ok');
}

async function autoBootstrap(platform=null){
  if(!navigator.onLine)return null;
  const {data,error}=await adminRpc('admin_customer_auto_bootstrap_sources','workspace_admin_auto_bootstrap_sources',{p_platform_key:platform});
  if(error){
    console.warn('customer auto bootstrap skipped:', safeError(error));
    return {created:0,skipped:0,error:safeError(error)};
  }
  return data;
}

async function linkSource(sourceId){
  if(!navigator.onLine)return msg('الربط يحتاج اتصالًا.','warn');
  const sel=document.querySelector('[data-party-select="'+sourceId+'"]');
  const partyId=Number(sel?.value||0);
  if(!partyId)return msg('اختر العميل الموحد أولًا.','error');
  msg('جاري حفظ الربط…');
  let {data,error}=await adminRpc('admin_customer_link_source_account_safe','workspace_admin_link_source_account_safe',{
    p_source_account_id:sourceId,p_party_id:partyId,p_allow_move:false,p_reason:null
  });
  if(error)return msg('تعذر الربط: '+safeError(error),'error');
  if(data?.status==='conflict'){
    const ok=await askConfirm(
      'هذا المستخدم مربوط مسبقًا',
      'المستخدم مربوط حاليًا بـ «'+(data.existing_party_name||('عميل #'+data.existing_party_id))+'». هل تريد إلغاء الربط السابق ونقله للعميل المختار؟',
      'فك ونقل الربط'
    );
    if(!ok)return msg('لم يتم تغيير الربط.','info');
    ({data,error}=await adminRpc('admin_customer_link_source_account_safe','workspace_admin_link_source_account_safe',{
      p_source_account_id:sourceId,p_party_id:partyId,p_allow_move:true,p_reason:'نقل الربط من شاشة إدارة ربط العملاء'
    }));
    if(error)return msg('تعذر نقل الربط: '+safeError(error),'error');
  }
  await load();msg('تم حفظ الربط.','ok');
}
async function createFromSource(sourceId){
  if(!navigator.onLine)return msg('إنشاء العميل يحتاج اتصالًا.','warn');
  const source=sources.find(x=>Number(x.id)===Number(sourceId));
  const ok=await askConfirm('إنشاء عميل موحد','إنشاء عميل MyTool باسم «'+(source?.display_name||source?.username||'الحساب')+'» وربط هذا الحساب به؟','إنشاء وربط');
  if(!ok)return;
  const {error}=await adminRpc('admin_customer_create_party_from_source','workspace_admin_create_party_from_source',{
    p_source_account_id:sourceId,p_display_name:null
  });
  if(error)return msg('تعذر إنشاء العميل: '+safeError(error),'error');
  await load();msg('تم إنشاء العميل وربط الحساب.','ok');
}
async function unlinkSource(linkId){
  if(!navigator.onLine)return msg('إلغاء الربط يحتاج اتصالًا.','warn');
  const ok=await askConfirm('إلغاء الربط','سيبقى تاريخ الربط محفوظًا ويمكن إعادة الربط لاحقًا. هل تريد المتابعة؟','إلغاء الربط');
  if(!ok)return;
  const {error}=await adminRpc('admin_customer_unlink_platform_account_safe','workspace_admin_unlink_platform_account_safe',{
    p_link_id:linkId,p_reason:'فك من شاشة إدارة ربط العملاء'
  });
  if(error)return msg('تعذر إلغاء الربط: '+safeError(error),'error');
  await load();msg('تم إلغاء الربط مع الاحتفاظ بالتاريخ.','ok');
}
async function saveParty(id){
  if(!navigator.onLine)return msg('تعديل العميل يحتاج اتصالًا.','warn');
  const name=document.querySelector('[data-party-name="'+id+'"]')?.value.trim()||'';
  const phone=document.querySelector('[data-party-phone="'+id+'"]')?.value.trim()||null;
  const email=document.querySelector('[data-party-email="'+id+'"]')?.value.trim()||null;
  if(!name)return msg('اسم العميل مطلوب.','error');
  const {error}=await adminRpc('admin_customer_update_canonical','workspace_admin_update_canonical_party',{
    p_party_id:id,p_display_name:name,p_phone:phone,p_email:email
  });
  if(error)return msg('تعذر تعديل العميل: '+safeError(error),'error');
  await load();msg('تم تعديل العميل الموحد.','ok');
}
async function reviewSuggestion(id,action){
  if(!navigator.onLine)return msg('مراجعة الاقتراح تحتاج اتصالًا.','warn');
  const {data,error}=await adminRpc('admin_customer_review_link_suggestion','workspace_admin_review_link_suggestion',{
    p_suggestion_id:id,p_action:action
  });
  if(error)return msg('تعذر مراجعة الاقتراح: '+safeError(error),'error');
  if(data?.status==='conflict'){
    await load();
    return msg('الحسابان مربوطان بعميلين مختلفين. راجع الربط من البطاقات قبل الدمج.','warn');
  }
  await load();msg(action==='approve'?'تمت الموافقة على الربط.':'تم رفض الاقتراح.','ok');
}
async function generateSuggestions({silent=false}={}){
  if(!navigator.onLine)return null;
  if($('smartBtn'))$('smartBtn').disabled=true;
  if(!silent)msg('جاري إعادة فحص الروابط…');
  const {data,error}=await adminRpc('admin_customer_generate_link_suggestions','workspace_admin_generate_link_suggestions');
  if($('smartBtn'))$('smartBtn').disabled=false;
  if(error){
    if(!silent)msg('تعذر فحص الروابط: '+safeError(error),'error');
    return null;
  }
  if(!silent){
    await load();
    msg('تم الفحص: '+Number(data?.pending||0)+' بانتظار الموافقة، '+Number(data?.conflicts||0)+' تعارض.','ok');
  }
  return data;
}
function parseCsv(text){
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){
      if(ch==='"'&&text[i+1]==='"'){field+='"';i++}
      else if(ch==='"')quoted=false;
      else field+=ch;
    }else{
      if(ch==='"')quoted=true;
      else if(ch===','){row.push(field);field=''}
      else if(ch==='\n'){row.push(field);rows.push(row);row=[];field=''}
      else if(ch!=='\r')field+=ch;
    }
  }
  if(field.length||row.length){row.push(field);rows.push(row)}
  return rows;
}
function firstValue(obj,names){
  for(const name of names){
    const key=Object.keys(obj).find(k=>norm(k)===norm(name));
    if(key&&String(obj[key]??'').trim()!=='')return String(obj[key]).trim();
  }
  return '';
}
function hasColumn(headers,names){
  const keys=new Set(headers.map(norm));
  return names.some(name=>keys.has(norm(name)));
}
function numericValue(value){
  if(value===null||value===undefined||String(value).trim()==='')return null;
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  let s=String(value).trim().replace(/\s+/g,'').replace(/[^0-9,\.\-]/g,'');
  if(!s)return null;
  if(s.includes(',')&&s.includes('.'))s=s.replace(/,/g,'');
  else if(s.includes(',')){
    const parts=s.split(',');
    s=(parts.length===2&&parts[1].length<=2)?parts[0]+'.'+parts[1]:parts.join('');
  }
  const n=Number(s);
  return Number.isFinite(n)?n:null;
}
function headerSignature(headers){return headers.map(norm).filter(Boolean).join('|')}
function detectPlatformFromMatrix(matrix,headerIndex,headers){
  const h=new Set(headers.map(norm));
  const roleIndex=headers.findIndex(v=>norm(v)==='الدور'||norm(v)==='role');
  const sampleRoles=roleIndex>=0
    ? matrix.slice(headerIndex+1,Math.min(matrix.length,headerIndex+20)).map(r=>String(r?.[roleIndex]??'').trim()).filter(Boolean)
    : [];

  const haniiMarkers=['معرف الشبكة','اسم المحل','الحد الأقصى للديون','تاريخ الإنشاء'];
  const haniiHits=haniiMarkers.filter(x=>h.has(norm(x))).length;
  if(haniiHits>=2)return 'hanii_rohek';

  const tehnaCore=['اسم المستخدم','الدور','حالة الحساب','رصيد','ديون','ارباح'];
  const tehnaHits=tehnaCore.filter(x=>h.has(norm(x))).length;
  const hasTehnaRole=sampleRoles.some(v=>/^ROLE_/i.test(v));
  if(tehnaHits>=5&&hasTehnaRole&&!h.has(norm('اسم المحل')))return 'tehna_pay';

  const waf=['uid','user','رصيد','مقترض','مقترض (المفوض)'];
  if(waf.filter(x=>h.has(norm(x))).length>=4)return 'wafarly';

  const sig=headerSignature(headers);
  const learned=platformSignatures.find(x=>x.header_signature===sig);
  return learned?.platform_key||null;
}
function rowsToAccounts(matrix){
  const headerIndex=matrix.findIndex(r=>Array.isArray(r)&&r.some(v=>['اسم المستخدم','username','user'].includes(norm(v))));
  if(headerIndex<0)throw new Error('لم أجد عمود اسم المستخدم.');
  const headers=matrix[headerIndex].map(v=>String(v??'').trim());
  const detectedPlatform=detectPlatformFromMatrix(matrix,headerIndex,headers);
  const balanceNames=['رصيد','الرصيد','balance','solde'];
  const debtNames=['ديون','الدين','debt','مقترض','مقترض (المفوض)'];
  const profitNames=['ارباح','أرباح','الارباح','الأرباح','profit'];
  const financialFields={
    balance:hasColumn(headers,balanceNames),
    debt:hasColumn(headers,debtNames),
    profit:hasColumn(headers,profitNames)
  };
  const accounts=matrix.slice(headerIndex+1).filter(r=>Array.isArray(r)&&r.some(v=>String(v??'').trim()!=='')).map(row=>{
    const obj={};headers.forEach((h,i)=>{if(h)obj[h]=row[i]??''});
    let username=firstValue(obj,['اسم المستخدم','username','user']);
    const uid=firstValue(obj,['uid']);
    if(!username&&!uid)return null;
    const first=firstValue(obj,['الاسم','first name','firstname']);
    const last=firstValue(obj,['اللقب','last name','lastname']);
    const shop=firstValue(obj,['اسم المحل','المحل','shop name','display name']);
    let phone=firstValue(obj,['الهاتف','رقم الهاتف','هاتف','phone','telephone']);
    if(detectedPlatform==='wafarly'&&username){
      const m=username.match(/(?:-|\s)?(\+?213\d{9}|0[5-7]\d{8})\s*$/);
      if(m&&!phone)phone=m[1];
      if(m)username=username.slice(0,m.index).replace(/[\s-]+$/,'').trim()||username;
    }
    let email=firstValue(obj,['بريد إلكتروني','البريد الإلكتروني','البريد الالكتروني','email']);
    if(!email&&username.includes('@')&&username.includes('.'))email=username;
    const status=firstValue(obj,['حالة الحساب','الحالة','status']);
    const external=firstValue(obj,['المعرف','معرف الحساب','account id','id']);
    const created=firstValue(obj,['تاريخ الإنشاء','created at','joined at']);
    const updated=firstValue(obj,['تاريخ التحديث','تعديل','updated at','updated_at']);
    const disabled=/معطل|disabled|inactive/i.test(status);
    const payload={
      username:uid||username,
      external_account_id:external||uid||null,
      display_name:shop||[first,last].filter(Boolean).join(' ').trim()||username,
      first_name:first||null,last_name:last||null,phone:phone||null,email:email||null,
      source_status:status||null,source_updated_at:updated||null,source_created_at:created||null,
      active:!disabled,raw_data:obj
    };
    if(financialFields.balance){
      const n=numericValue(firstValue(obj,balanceNames));if(n!==null)payload.balance=n;
    }
    if(financialFields.debt){
      const n=numericValue(firstValue(obj,debtNames));if(n!==null)payload.debt=n;
    }
    if(financialFields.profit){
      const n=numericValue(firstValue(obj,profitNames));if(n!==null)payload.profit=n;
    }
    return payload;
  }).filter(Boolean);
  return {accounts,detectedPlatform,headers,financialFields,headerSignature:headerSignature(headers)};
}
async function parseImportFile(file){
  const ext=(file.name.split('.').pop()||'').toLowerCase();
  if(ext==='csv'){
    const text=await file.text();
    return rowsToAccounts(parseCsv(text));
  }
  if(!window.XLSX)throw new Error('قارئ Excel لم يحمّل.');
  const buffer=await file.arrayBuffer();
  const wb=window.XLSX.read(buffer,{type:'array'});
  const ws=wb.Sheets[wb.SheetNames[0]];
  const matrix=window.XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
  return rowsToAccounts(matrix);
}
function platformHints(accounts){
  const scores=new Map();
  const phoneKey=v=>String(v||'').replace(/\D/g,'').replace(/^00213/,'213').replace(/^0(?=[5-7]\d{8}$)/,'213');
  for(const incoming of accounts){
    for(const old of sources){
      let pts=0;
      if(incoming.phone&&old.phone&&phoneKey(incoming.phone)===phoneKey(old.phone))pts+=5;
      if(incoming.email&&old.email&&norm(incoming.email)===norm(old.email))pts+=5;
      if(incoming.username&&old.username&&norm(incoming.username)===norm(old.username))pts+=4;
      if(pts)scores.set(old.platform_key,(scores.get(old.platform_key)||0)+pts);
    }
  }
  return [...scores.entries()].sort((a,b)=>b[1]-a[1]).map(([key,score])=>({key,score,label:platformLabel(key)}));
}
async function addPlatform(){
  const name=$('newPlatformName').value.trim();
  if(!name)return msg('اكتب اسم المنصة الجديدة.','error');
  const key=platformKeyFromName(name);
  const {data,error}=await adminRpc('admin_customer_register_platform','workspace_admin_register_platform',{p_platform_key:key,p_display_name:name});
  if(error)return msg('تعذر إضافة المنصة: '+safeError(error),'error');
  $('newPlatformName').value='';
  await load();$('importPlatform').value=data?.platform_key||key;
  msg('تمت إضافة منصة «'+name+'». يمكنك الآن نسب الملف إليها.','ok');
}
async function reviewIdentity(id,action){
  if(!navigator.onLine)return msg('مراجعة الهوية تحتاج اتصالًا.','warn');
  const {error}=await adminRpc('admin_customer_review_source_identity','workspace_admin_review_source_identity',{p_review_id:id,p_action:action});
  if(error)return msg('تعذر حفظ قرار الهوية: '+safeError(error),'error');
  if(action!=='ignore'){await autoBootstrap(null);await generateSuggestions({silent:true})}
  await load();msg(action==='same'?'تم تحديث نفس الحساب بدون إنشاء نسخة.':action==='new'?'تم إنشاء الحساب الجديد بعد تأكيدك.':'تم تجاهل الاقتراح.','ok');
}
function phoneKey(value){
  return String(value||'').replace(/\D/g,'').replace(/^00213/,'213').replace(/^0(?=[5-7]\d{8}$)/,'213');
}
function previewMatch(platform,incoming){
  if(!platform)return {source:null,conflict:false};
  const candidates=sources.filter(old=>{
    if(old.platform_key!==platform)return false;
    const user=incoming.username&&old.username&&norm(incoming.username)===norm(old.username);
    const phone=incoming.phone&&old.phone&&phoneKey(incoming.phone)===phoneKey(old.phone);
    const email=incoming.email&&old.email&&norm(incoming.email)===norm(old.email);
    return user||phone||email;
  });
  return {source:candidates.length===1?candidates[0]:null,conflict:candidates.length>1};
}
function estimateImportChanges(item){
  const out={newCount:0,matched:0,financialChanged:0,debtChanged:0,balanceChanged:0,profitChanged:0,conflicts:0,unchanged:0};
  if(!item.platform||!item.parsed?.accounts)return out;
  for(const incoming of item.parsed.accounts){
    const hit=previewMatch(item.platform,incoming);
    if(hit.conflict){out.conflicts++;continue}
    if(!hit.source){out.newCount++;continue}
    out.matched++;
    let changed=false;
    if(Object.prototype.hasOwnProperty.call(incoming,'debt')&&Number(incoming.debt)!==Number(hit.source.debt_amount||0)){out.debtChanged++;changed=true}
    if(Object.prototype.hasOwnProperty.call(incoming,'balance')&&Number(incoming.balance)!==Number(hit.source.balance_amount||0)){out.balanceChanged++;changed=true}
    if(Object.prototype.hasOwnProperty.call(incoming,'profit')&&Number(incoming.profit)!==Number(hit.source.profit_amount||0)){out.profitChanged++;changed=true}
    if(changed)out.financialChanged++;else out.unchanged++;
  }
  return out;
}
function importStatusText(item){
  if(item.status==='ready')return 'جاهز للاعتماد';
  if(item.status==='duplicate')return item.forceRepeat?'مكرر — سيعاد بعد موافقتك':'مكرر — سيُتجاهل';
  if(item.status==='duplicate_batch')return 'مكرر داخل هذه الدفعة — سيُتجاهل';
  if(item.status==='review')return 'يحتاج تحديد المنصة';
  if(item.status==='wrong_platform')return 'مرفوض: المنصة لا تطابق البصمة';
  if(item.status==='shape_conflict')return 'مرفوض: بنية الملف تخص منصة أخرى';
  if(item.status==='error')return 'تعذر قراءة الملف';
  if(item.status==='processing')return 'جاري الاعتماد…';
  if(item.status==='done')return 'تم التحديث';
  if(item.status==='skipped')return 'تم التجاهل';
  return 'قيد الفحص';
}
function importStatusClass(item){
  if(item.status==='ready')return'ready';
  if(item.status==='duplicate'||item.status==='duplicate_batch')return'duplicate';
  if(['wrong_platform','shape_conflict','error'].includes(item.status))return'blocked';
  if(item.status==='done')return'done';
  return'review';
}
function platformOptions(selected){
  return '<option value="">اختر المنصة…</option>'+platforms.map(p=>'<option value="'+esc(p.platform_key)+'" '+(p.platform_key===selected?'selected':'')+'>'+esc(p.display_name)+'</option>').join('');
}
function renderImportQueue(){
  const box=$('importPreview'),list=$('importPreviewList');
  if(!box||!list)return;
  box.hidden=!importQueue.length;
  if(!importQueue.length){list.innerHTML='';return}
  const ready=importQueue.filter(x=>x.status==='ready'||(x.status==='duplicate'&&x.forceRepeat)).length;
  const duplicate=importQueue.filter(x=>['duplicate','duplicate_batch'].includes(x.status)&&!x.forceRepeat).length;
  const blocked=importQueue.filter(x=>['wrong_platform','shape_conflict','error','review'].includes(x.status)).length;
  $('importPreviewSummary').textContent=importQueue.length+' ملف · جاهز '+ready+' · سيُتجاهل '+duplicate+' · يحتاج مراجعة/مرفوض '+blocked;
  list.innerHTML=importQueue.map((item,index)=>{
    const diff=item.diff||{};
    const finance=item.parsed?.financialFields||{};
    const finLabels=[finance.debt?'دين':'',finance.balance?'رصيد':'',finance.profit?'ربح':''].filter(Boolean).join(' + ')||'لا توجد أعمدة مالية معروفة';
    const locked=Boolean(importBusy||item.detectedPlatform||item.serverPreview?.existing_platform_key||item.status==='duplicate_batch');
    const hint=item.hintPlatform?' · ترشيح فقط: '+item.hintPlatform.label:'';
    const existing=item.serverPreview?.existing_platform_key?' · مسجل سابقًا: '+platformLabel(item.serverPreview.existing_platform_key):'';
    return '<article class="import-file '+importStatusClass(item)+'">'+
      '<div class="import-file-top"><div><div class="import-file-name">'+esc(item.file?.name||'ملف')+'</div><div class="import-file-meta">SHA-256: '+esc((item.hash||'').slice(0,12)||'—')+'…'+existing+hint+'</div></div><span class="badge '+(item.status==='ready'||item.status==='done'?'linked':item.status==='duplicate'?'pending_review':(['wrong_platform','shape_conflict','error'].includes(item.status)?'conflict':'platform'))+'">'+esc(importStatusText(item))+'</span></div>'+
      '<div class="import-file-platform"><div class="field"><label>المنصة</label><select data-import-platform-index="'+index+'" '+(locked?'disabled':'')+'>'+platformOptions(item.platform||'')+'</select></div>'+
      (item.detectedPlatform?'<div class="badge linked">كشف من البنية: '+esc(platformLabel(item.detectedPlatform))+'</div>':'<div class="badge pending_review">غير مؤكدة من البنية</div>')+'</div>'+
      '<div class="import-file-grid">'+
        '<div class="mini"><small>الحسابات</small><b>'+Number(item.parsed?.accounts?.length||0)+'</b></div>'+
        '<div class="mini"><small>أعمدة مالية</small><b>'+esc(finLabels)+'</b></div>'+
        '<div class="mini"><small>تغيرات دين متوقعة</small><b>'+Number(diff.debtChanged||0)+'</b></div>'+
        '<div class="mini"><small>حسابات جديدة متوقعة</small><b>'+Number(diff.newCount||0)+'</b></div>'+
      '</div>'+
      (item.error?'<div class="meta" style="color:#b91c1c;margin-top:7px">'+esc(item.error)+'</div>':'')+
      (item.status==='duplicate'?'<div class="import-file-actions"><button class="btn secondary" data-import-reprocess="'+index+'" type="button" '+(importBusy?'disabled':'')+'>'+(item.forceRepeat?'إلغاء إعادة المعالجة':'إعادة المعالجة رغم التكرار')+'</button></div>':'')+
      '</article>';
  }).join('');
  list.querySelectorAll('[data-import-platform-index]').forEach(select=>select.onchange=async()=>{
    const item=importQueue[Number(select.dataset.importPlatformIndex)];if(!item)return;
    item.platform=select.value||'';
    await evaluateImportItem(item);
    renderImportQueue();
  });
  list.querySelectorAll('[data-import-reprocess]').forEach(button=>button.onclick=()=>{
    const item=importQueue[Number(button.dataset.importReprocess)];if(!item)return;
    item.forceRepeat=!item.forceRepeat;
    renderImportQueue();
  });
  renderConnectivity();
}
async function evaluateImportItem(item){
  item.error='';
  if(item.detectedPlatform&&item.platform&&item.platform!==item.detectedPlatform){
    item.status='shape_conflict';
    item.error='بنية الملف تخص «'+platformLabel(item.detectedPlatform)+'» ولا يمكن نسبه إلى «'+platformLabel(item.platform)+'».';
    return;
  }
  const server=await previewSourceImport(item.platform||item.detectedPlatform||null,item.hash);
  item.serverPreview=server||{};
  if(server?.status==='duplicate_known'&&!item.platform){
    item.platform=server.existing_platform_key||'';
    item.status='duplicate';
  }else if(server?.status==='wrong_platform'){
    item.status='wrong_platform';
    item.error='هذه البصمة سبق اعتمادها لمنصة «'+platformLabel(server.existing_platform_key)+'».';
  }else if(server?.status==='same_platform'){
    item.status='duplicate';
  }else{
    if(!item.platform&&item.detectedPlatform)item.platform=item.detectedPlatform;
    item.status=item.platform?'ready':'review';
  }
  item.diff=estimateImportChanges(item);
}
async function previewImports(){
  if(!navigator.onLine)return msg('معاينة الاستيراد تحتاج اتصالًا.','warn');
  const files=[...($('sourceFile').files||[])];
  if(!files.length)return msg('اختر ملفًا واحدًا أو أكثر أولًا.','error');
  importQueue=[];
  importBusy=true;
  $('importBtn').disabled=true;
  $('approveImportsBtn').disabled=true;
  $('importPreview').hidden=false;
  msg('جاري فحص الملفات بدون كتابة أي بيانات…');
  const fallback=$('importPlatform').value||'';
  for(const file of files){
    const item={file,hash:'',parsed:null,detectedPlatform:'',platform:'',status:'checking',forceRepeat:false,error:'',diff:null,hintPlatform:null,serverPreview:null};
    importQueue.push(item);renderImportQueue();
    try{
      item.parsed=await parseImportFile(file);
      item.hash=await sha256File(file);
      item.detectedPlatform=item.parsed.detectedPlatform||'';
      item.platform=item.detectedPlatform||'';
      if(!item.detectedPlatform&&fallback){
        item.hintPlatform={key:fallback,label:platformLabel(fallback),score:null,manual_hint:true};
      }
      const prior=importQueue.find(x=>x!==item&&x.hash&&x.hash===item.hash);
      if(prior){
        item.platform=prior.platform||item.platform;
        item.status='duplicate_batch';
        item.serverPreview={existing_platform_key:prior.platform||null};
        item.diff=estimateImportChanges(item);
      }else{
        if(!item.detectedPlatform&&!item.platform&&!item.hintPlatform){
          const hints=platformHints(item.parsed.accounts);
          item.hintPlatform=hints[0]||null;
        }
        await evaluateImportItem(item);
      }
    }catch(error){
      item.status='error';item.error=safeError(error);
    }
    renderImportQueue();
  }
  importBusy=false;
  renderImportQueue();
  msg('المعاينة جاهزة. لم تُكتب أي بيانات بعد. راجع كل ملف ثم اضغط «اعتماد الملفات السليمة».','ok');
}
async function processImportItem(item){
  if(item.status==='duplicate'&&!item.forceRepeat){item.status='skipped';return {skipped:true,reason:'duplicate'}}
  if(item.status!=='ready'&&!(item.status==='duplicate'&&item.forceRepeat))return {skipped:true,reason:'not_ready'};
  if(!item.platform)throw new Error('PLATFORM_REQUIRED');
  if(item.detectedPlatform&&item.detectedPlatform!==item.platform)throw new Error('FILE_PLATFORM_MISMATCH');
  item.status='processing';renderImportQueue();
  const registration=await registerSourceImport(item.platform,item.file,item.hash);
  if(registration?.status==='wrong_platform')throw new Error('هذا الملف مسجل لمنصة أخرى: '+platformLabel(registration.existing_platform_key));
  if(registration?.status==='same_platform'&&!item.forceRepeat){
    item.status='skipped';return {skipped:true,reason:'duplicate_race'};
  }
  const accounts=item.parsed.accounts||[];
  if(!accounts.length)throw new Error('لم أجد حسابات صالحة في الملف.');
  const result={processed:0,inserted:0,updated:0,reviews:0,conflicts:0,stale:0,unchanged:0};
  for(let i=0;i<accounts.length;i+=150){
    const chunk=accounts.slice(i,i+150);
    const {data,error}=await adminRpc('admin_customer_upsert_source_accounts','workspace_admin_upsert_source_accounts',{
      p_platform_key:item.platform,p_accounts:chunk
    });
    if(error)throw error;
    result.processed+=Number(data?.processed||chunk.length);
    result.inserted+=Number(data?.inserted||0);
    result.updated+=Number(data?.updated||0);
    result.unchanged+=Number(data?.unchanged||0);
    result.reviews+=Number(data?.identity_reviews||0);
    result.conflicts+=Number(data?.identity_conflicts||0);
    result.stale+=Number(data?.stale_skipped||0);
  }
  if(item.parsed.headerSignature){
    const {error}=await adminRpc('admin_customer_register_schema_signature','workspace_admin_register_schema_signature',{
      p_platform_key:item.platform,p_header_signature:item.parsed.headerSignature
    });
    if(error)console.warn('schema signature not saved:',safeError(error));
  }
  item.result=result;item.status='done';renderImportQueue();return result;
}
async function approveImports(){
  if(!navigator.onLine)return msg('الاعتماد يحتاج اتصالًا.','warn');
  if(importBusy)return;
  const eligible=importQueue.filter(x=>x.status==='ready'||(x.status==='duplicate'&&x.forceRepeat));
  if(!eligible.length)return msg('لا يوجد ملف سليم جاهز للاعتماد.','warn');
  const ok=await askConfirm(
    'اعتماد '+eligible.length+' ملف',
    'سيتم تحديث نفس حسابات المنصات بالقيم الحالية. الدين/الرصيد/الربح لا تُجمع؛ تستبدل لقطة نفس الحساب. الملفات المكررة غير المختارة لإعادة المعالجة ستبقى متجاهلة.',
    'اعتماد السليمة'
  );
  if(!ok)return;
  importBusy=true;renderImportQueue();
  let done=0,failed=0,skipped=0,totalProcessed=0,totalUpdated=0,totalInserted=0;
  try{
    for(const item of importQueue){
      if(!eligible.includes(item)){
        if(['duplicate','duplicate_batch'].includes(item.status)){item.status='skipped';skipped++}
        continue;
      }
      try{
        const r=await processImportItem(item);
        if(r?.skipped){skipped++;continue}
        done++;totalProcessed+=Number(r.processed||0);totalUpdated+=Number(r.updated||0);totalInserted+=Number(r.inserted||0);
      }catch(error){
        failed++;item.status='error';item.error=safeError(error);renderImportQueue();
      }
    }
    if(done){
      const boot=await autoBootstrap(null);
      await generateSuggestions({silent:true});
      await load();
      if(boot?.error)console.warn('bootstrap warning:',boot.error);
    }
    $('sourceFile').value='';
    msg('انتهى الاعتماد: ملفات ناجحة '+done+' · متجاهلة '+skipped+' · فشلت '+failed+' · حسابات معالجة '+totalProcessed+' · جديدة '+totalInserted+' · محدثة '+totalUpdated+'.',failed?'warn':'ok');
  }catch(error){
    msg('اكتملت بعض الملفات لكن تعذر إنهاء المراجعة: '+safeError(error),'warn');
  }finally{
    importBusy=false;renderImportQueue();renderConnectivity();
  }
}
function clearImportQueue(){
  if(importBusy)return;
  importQueue=[];$('sourceFile').value='';$('importPreview').hidden=true;$('importPreviewList').innerHTML='';$('importPreviewSummary').textContent='';renderConnectivity();
}

async function createManual(){
  if(!navigator.onLine)return msg('إنشاء العميل يحتاج اتصالًا.','warn');
  const name=$('manualName').value.trim(),phone=$('manualPhone').value.trim()||null,email=$('manualEmail').value.trim()||null;
  if(!name)return msg('اكتب اسم العميل.','error');
  const {error}=await adminRpc('admin_customer_create_canonical','workspace_admin_create_canonical_party_v2',{
    p_display_name:name,p_phone:phone,p_email:email,p_party_type:'shop'
  });
  if(error)return msg('تعذر إنشاء العميل: '+safeError(error),'error');
  $('manualName').value='';$('manualPhone').value='';$('manualEmail').value='';$('manualBox').hidden=true;
  await load();msg('تم إنشاء العميل الموحد.','ok');
}

$('toggleManual').onclick=()=>{$('manualBox').hidden=!$('manualBox').hidden};
$('selectPage').onclick=()=>{currentPageIds.forEach(id=>selectedSources.add(id));renderSources();renderBulk()};
$('clearSelected').onclick=()=>{selectedSources.clear();renderSources();renderBulk()};
$('mergeSelected').onclick=mergeSelectedSources;
$('manualSave').onclick=createManual;
$('newPlatformBtn').onclick=addPlatform;
$('importBtn').onclick=previewImports;
$('approveImportsBtn').onclick=approveImports;
$('clearImportsBtn').onclick=clearImportQueue;
$('smartBtn').onclick=generateSuggestions;
$('search').oninput=()=>{page=1;renderSources()};
$('platformFilter').onchange=()=>{page=1;renderSources()};
$('statusFilter').onchange=()=>{page=1;renderSources();updateSourceVisibilityButton()};
$('showAllSourcesBtn').onclick=()=>{
  const f=$('statusFilter');
  f.value=f.value==='all'?'work':'all';
  page=1;selectedSources.clear();renderSources();renderBulk();updateSourceVisibilityButton();
};
$('prevPage').onclick=()=>{page=Math.max(1,page-1);renderSources();window.scrollTo({top:$('sources').offsetTop-100,behavior:'smooth'})};
$('nextPage').onclick=()=>{page+=1;renderSources();window.scrollTo({top:$('sources').offsetTop-100,behavior:'smooth'})};
window.addEventListener('online',()=>{renderConnectivity();void load()});
window.addEventListener('offline',()=>{renderConnectivity();msg('انقطع الاتصال. تعرض البيانات المحفوظة، والتعديلات متوقفة مؤقتًا.','warn')});

(async()=>{
  try{
    await identify();
    let bootstrapResult=null;
    if(navigator.onLine){
      msg('جاري تجهيز الربط الأولي تلقائيًا…');
      bootstrapResult=await autoBootstrap(null);
      await generateSuggestions({silent:true});
    }
    await load();
    if(bootstrapResult?.error)msg('تم فتح الصفحة. توجد حالة ربط تحتاج مراجعة، لكن بقية البيانات متاحة.','warn');
  }catch(error){
    if(!navigator.onLine&&loadCache())return;
    if(error?.message==='ADMIN_REQUIRED')msg('هذه الصفحة للإدارة فقط.','error');
    else msg('تعذر فتح الصفحة: '+safeError(error),'error');
  }
})();
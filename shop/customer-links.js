import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabase=createClient(window.ShopApiConfig.url,window.ShopApiConfig.key);
const CACHE='mytool_customer_linking_service_cache_v1';
const DIRECTORY_CACHE='mytool_customer_directory_cache_v1';
const PAGE_SIZE=15;
const WORKER_TOKEN='mytool_shop_worker_token',WORKER_EXPIRES='mytool_shop_worker_expires_at',WORKSPACE_ROLE='mytool_workspace_role',WORKSPACE_CODE='mytool_workspace_code',ADMIN_EXPIRES='mytool_admin_expires_at';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v??'').trim().toLowerCase();

let me=null,sources=[],parties=[],suggestions=[],platforms=[],platformSignatures=[],identityReviews=[],page=1;
let adminMode='none',workspaceToken='';
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
  $('importPlatform').innerHTML='<option value="">اختر المنصة…</option>'+platforms.map(p=>'<option value="'+esc(p.platform_key)+'">'+esc(p.display_name)+'</option>').join('');
  if(platforms.some(p=>p.platform_key===current))$('importPlatform').value=current;
  const pf=$('platformFilter').value;
  $('platformFilter').innerHTML='<option value="all">كل المنصات</option>'+platforms.map(p=>'<option value="'+esc(p.platform_key)+'">'+esc(p.display_name)+'</option>').join('');
  if(pf==='all'||platforms.some(p=>p.platform_key===pf))$('platformFilter').value=pf;
}
async function sha256File(file){
  const bytes=await file.arrayBuffer();
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function registerSourceImport(platform,file){
  const hash=await sha256File(file);
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
  $('importBtn').disabled=off;
  $('smartBtn').disabled=off;
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
  $('mSources').textContent=sources.length;
  $('mUnlinked').textContent=sources.filter(x=>x.link_status==='unlinked').length;
  $('mPending').textContent=sources.filter(x=>x.link_status==='pending_review').length;
  $('mLinked').textContent=sources.filter(x=>x.link_status==='linked').length;
  $('mConflict').textContent=sources.filter(x=>x.link_status==='conflict').length;
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
    const linkedLine=s.link_status==='linked'
      ? '<div class="linked-line">'+(linkedCount>1
          ? 'مجمّع تحت العميل «'+esc(s.linked_party_name||('عميل #'+s.linked_party_id))+'» · '+linkedCount+' حسابات'
          : 'هوية MyTool: '+esc(s.linked_party_name||('عميل #'+s.linked_party_id)))+'</div>'
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
      '<div class="badges"><span class="badge platform">'+esc(platformLabel(s.platform_key))+'</span><span class="badge '+esc(s.link_status)+'">'+esc(s.link_status==='linked'&&partyAccountCount(s.linked_party_id)>1?'مجمّع '+partyAccountCount(s.linked_party_id)+' حسابات':statusLabel(s.link_status))+'</span></div></div>'+
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
  const labels={phone:'نفس الهاتف',email:'نفس البريد',username:'نفس المستخدم',username_loose:'مستخدم متشابه',email_loose:'بريد متشابه',phone_near:'هاتف قريب',near_phone:'هاتف قريب',name_close:'اسم قريب',identity_history:'هوية سابقة مشتركة',smart_similarity:'تشابه ذكي',exact_identity_conflict:'تعارض هوية قوي'};
  return Object.keys(r).filter(k=>r[k]!==false&&r[k]!=null).map(k=>'<span class="reason">'+esc(labels[k]||k)+'</span>').join('');
}
function suggestionSide(prefix,s){
  const name=s[prefix+'_display_name']||s[prefix+'_username'];
  const party=s[prefix+'_party_name'];
  return '<div class="suggestion-side"><b>'+esc(name)+'</b><div class="username">'+esc(s[prefix+'_username'])+'</div><div class="meta">'+esc(platformLabel(s[prefix+'_platform']))+(party?' · مربوط بـ '+esc(party):' · غير مربوط')+'</div></div>';
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
    const incoming=r.incoming_payload||{},candidate=r.candidate_display_name||r.candidate_username||'غير محسوم';
    const incomingName=incoming.display_name||[incoming.first_name,incoming.last_name].filter(Boolean).join(' ')||incoming.username||'بيانات واردة';
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
function renderAll(){
  renderMetrics();renderIdentityReviews();renderSuggestions();renderSources();renderParties();renderConnectivity();renderBulk();
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
    const updated=firstValue(obj,['تاريخ التحديث','تاريخ الإنشاء','created at','updated at']);
    const disabled=/معطل|disabled|inactive/i.test(status);
    return {
      username:uid||username,
      external_account_id:external||uid||null,
      display_name:shop||[first,last].filter(Boolean).join(' ').trim()||username,
      first_name:first||null,last_name:last||null,phone:phone||null,email:email||null,
      source_status:status||null,source_updated_at:updated||null,active:!disabled,raw_data:obj
    };
  }).filter(Boolean);
  return {accounts,detectedPlatform,headers,headerSignature:headerSignature(headers)};
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
async function importSources(){
  if(!navigator.onLine)return msg('الاستيراد يحتاج اتصالًا.','warn');
  const file=$('sourceFile').files?.[0];
  if(!file)return msg('اختر ملف CSV أو XLSX أولًا.','error');
  let platform=$('importPlatform').value;
  $('importBtn').disabled=true;msg('جاري التحقق من الملف…');
  try{
    const parsed=await parseImportFile(file);
    const accounts=parsed.accounts;
    if(!platform&&parsed.detectedPlatform){platform=parsed.detectedPlatform;$('importPlatform').value=platform}
    if(!platform){
      const hints=platformHints(accounts),hint=hints[0];
      throw new Error('الصيغة غير معروفة ولم أحدد لها منصة.'+(hint?' أقوى ترشيح حسب الهاتف/البريد/المستخدم: «'+hint.label+'». اختر المنصة أو أضف اسم منصة جديدة ثم أعد التحديث.':' اختر المنصة أو أضف اسم منصة جديدة ثم أعد التحديث.'));
    }
    if(parsed.detectedPlatform&&parsed.detectedPlatform!==platform){
      throw new Error(
        'شكل هذا الملف يخص «'+platformLabel(parsed.detectedPlatform)+'» وليس «'+platformLabel(platform)+'». غيّر المنصة قبل التحديث.'
      );
    }
    const registration=await registerSourceImport(platform,file);
    if(registration?.status==='wrong_platform'){
      const existing=platformLabel(registration.existing_platform_key);
      const requested=platformLabel(registration.requested_platform_key);
      throw new Error('هذا الملف سبق تحميله لمنصة «'+existing+'» ولا يمكن تحميله مرة أخرى كمنصة «'+requested+'».');
    }
    if(!accounts.length)throw new Error('لم أجد حسابات صالحة في الملف.');
    let processed=0,inserted=0,updated=0,reviews=0,conflicts=0,stale=0;
    for(let i=0;i<accounts.length;i+=150){
      const chunk=accounts.slice(i,i+150);
      const {data,error}=await adminRpc('admin_customer_upsert_source_accounts','workspace_admin_upsert_source_accounts',{
        p_platform_key:platform,p_accounts:chunk
      });
      if(error)throw error;
      processed+=Number(data?.processed||chunk.length);
      inserted+=Number(data?.inserted||0);
      updated+=Number(data?.updated||0);
      reviews+=Number(data?.identity_reviews||0);conflicts+=Number(data?.identity_conflicts||0);stale+=Number(data?.stale_skipped||0);
    }
    const sig=parsed.headerSignature;
    if(sig){
      const {error:sigError}=await adminRpc('admin_customer_register_schema_signature','workspace_admin_register_schema_signature',{p_platform_key:platform,p_header_signature:sig});
      if(sigError)console.warn('schema signature not saved:',safeError(sigError));
    }
    $('sourceFile').value='';
    const boot=await autoBootstrap(platform);
    const smart=await generateSuggestions({silent:true});
    await load();
    if(boot?.error){
      msg('تم تحديث '+processed+' حساب. بقيت بعض حالات الربط للمراجعة، ولم تتوقف الصفحة.','warn');
    }else{
      const repeat=registration?.status==='same_platform'?' · إعادة تحديث لنفس المصدر':'';
      msg('تمت معالجة '+processed+' سطر: جديد '+inserted+' · تحديث '+updated+' · مراجعة هوية '+reviews+' · تعارض '+conflicts+' · أقدم من المحفوظ '+stale+' · ربط أولي '+Number(boot?.created||0)+' · دمج تلقائي قوي '+Number(smart?.auto_merged||0)+' · اقتراحات '+Number(smart?.pending||0)+repeat+'.','ok');
    }
  }catch(error){
    msg('تعذر الاستيراد: '+safeError(error),'error');
  }finally{
    $('importBtn').disabled=!navigator.onLine;
  }
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
$('importBtn').onclick=importSources;
$('smartBtn').onclick=generateSuggestions;
$('search').oninput=()=>{page=1;renderSources()};
$('platformFilter').onchange=()=>{page=1;renderSources()};
$('statusFilter').onchange=()=>{page=1;renderSources()};
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
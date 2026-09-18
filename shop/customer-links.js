import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabase=createClient(window.ShopApiConfig.url,window.ShopApiConfig.key);
const CACHE='mytool_customer_linking_service_cache_v1';
const DIRECTORY_CACHE='mytool_customer_directory_cache_v1';
const PAGE_SIZE=15;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v??'').trim().toLowerCase();

let me=null,sources=[],parties=[],suggestions=[],page=1;
let confirmResolve=null;

function msg(text,kind='info'){
  $('message').textContent=text;
  $('message').className='message '+kind;
}
function platformLabel(v){
  return ({tehna_pay:'تهنى باي',hanii_rohek:'هني روحك',other:'منصة أخرى'}[v]||v||'مصدر');
}
function statusLabel(v){
  return ({linked:'مربوط',unlinked:'غير مربوط',pending_review:'بانتظار الموافقة',conflict:'تعارض'}[v]||v);
}
function safeError(error){
  return String(error?.message||error||'خطأ غير معروف').replace(/(eyJ[a-zA-Z0-9._-]{20,}|sb_[a-zA-Z0-9_-]{20,})/g,'[محجوب]');
}
function saveCache(){
  const payload={saved_at:Date.now(),sources,parties,suggestions};
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
    sources=v.sources;parties=v.parties;suggestions=Array.isArray(v.suggestions)?v.suggestions:[];
    renderAll();
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
function renderSources(){
  const list=filteredSources();
  const pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));
  if(page>pages)page=pages;
  if(page<1)page=1;
  const start=(page-1)*PAGE_SIZE;
  const chunk=list.slice(start,start+PAGE_SIZE);
  $('pageText').textContent='صفحة '+page+' من '+pages+' · '+list.length+' حساب';
  $('prevPage').disabled=page<=1;
  $('nextPage').disabled=page>=pages;

  if(!chunk.length){
    $('sources').innerHTML='<div class="empty">'+(sources.length?'لا توجد نتائج بهذه الفلاتر.':'لا توجد حسابات مصادر بعد. استخدم «تحديث المصادر».')+'</div>';
    return;
  }

  $('sources').innerHTML=chunk.map(s=>{
    const name=s.display_name||[s.first_name,s.last_name].filter(Boolean).join(' ')||s.username;
    const linkedLine=s.link_status==='linked'
      ? '<div class="linked-line">مربوط بـ '+esc(s.linked_party_name||('عميل #'+s.linked_party_id))+'</div>'
      : '';
    const linkButton=s.link_status==='linked'?'تغيير الربط':'ربط';
    const unlink=s.link_status==='linked'&&s.link_id
      ? '<button class="icon-btn btn danger" data-unlink="'+s.link_id+'" data-source="'+s.id+'" type="button" title="فك الربط" aria-label="فك الربط"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></svg></button>'
      : '';
    return '<div class="source-card" data-source-card="'+s.id+'">'+
      '<div class="source-top"><div><div class="name">'+esc(name)+'</div><div class="username">'+esc(s.username)+'</div></div>'+
      '<div class="badges"><span class="badge platform">'+esc(platformLabel(s.platform_key))+'</span><span class="badge '+esc(s.link_status)+'">'+esc(statusLabel(s.link_status))+'</span></div></div>'+
      (contactLine(s)?'<div class="meta">'+contactLine(s)+'</div>':'')+
      linkedLine+
      '<div class="link-controls"><div class="field"><label>العميل الموحد</label><select data-party-select="'+s.id+'">'+partyOptions(s.linked_party_id)+'</select></div>'+
      '<button class="btn secondary" data-link="'+s.id+'" type="button">'+linkButton+'</button>'+
      unlink+'</div>'+
      (s.link_status!=='linked'?'<div class="actions"><button class="btn" data-create-source="'+s.id+'" type="button">إنشاء عميل من هذا الحساب</button></div>':'')+
      '</div>';
  }).join('');

  document.querySelectorAll('[data-link]').forEach(b=>b.onclick=()=>linkSource(Number(b.dataset.link)));
  document.querySelectorAll('[data-create-source]').forEach(b=>b.onclick=()=>createFromSource(Number(b.dataset.createSource)));
  document.querySelectorAll('[data-unlink]').forEach(b=>b.onclick=()=>unlinkSource(Number(b.dataset.unlink),Number(b.dataset.source)));
}
function reasonHtml(r){
  if(!r||typeof r!=='object')return '';
  const labels={phone:'نفس الهاتف',email:'نفس البريد',username_loose:'مستخدم متشابه بعد التطبيع',email_loose:'بريد متشابه بعد التطبيع'};
  return Object.keys(r).map(k=>'<span class="reason">'+esc(labels[k]||k)+'</span>').join('');
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
function renderParties(){
  if(!parties.length){
    $('parties').innerHTML='<div class="empty">لا يوجد عميل موحد بعد. أنشئ واحدًا يدويًا أو من حساب مصدر.</div>';
    return;
  }
  $('parties').innerHTML=parties.map(p=>'<div class="party-card"><div><b>#'+p.id+' · '+esc(p.display_name)+'</b></div>'+
    '<div class="party-edit"><div class="field"><label>الاسم</label><input data-party-name="'+p.id+'" value="'+esc(p.display_name)+'"></div>'+
    '<div class="field"><label>الهاتف</label><input data-party-phone="'+p.id+'" value="'+esc(p.primary_phone||'')+'" inputmode="tel"></div>'+
    '<div class="field"><label>البريد</label><input data-party-email="'+p.id+'" value="'+esc(p.primary_email||'')+'" inputmode="email"></div>'+
    '<button class="btn secondary" data-party-save="'+p.id+'" type="button">حفظ</button></div></div>').join('');
  document.querySelectorAll('[data-party-save]').forEach(b=>b.onclick=()=>saveParty(Number(b.dataset.partySave)));
}
function renderAll(){
  renderMetrics();renderSuggestions();renderSources();renderParties();renderConnectivity();
}
async function identify(){
  if(!navigator.onLine){
    ShopShell.mountRoleNavigation({role:'admin',permissions:{}},'customer-links');
    return;
  }
  const {data,error}=await supabase.auth.getSession();
  if(error)throw error;
  if(!data?.session)throw new Error('NO_SESSION');
  me={account_role:'workspace_admin',nickname:'الإدارة'};
  ShopShell.mountRoleNavigation({role:'admin',permissions:{can_record_money:true}},'customer-links');
  document.querySelectorAll('.shell-identity').forEach(el=>el.textContent='حساب الإدارة · ربط العملاء');
}
async function load(){
  if(!navigator.onLine){
    if(!loadCache())msg('لا يوجد اتصال ولا توجد نسخة محفوظة لهذه الصفحة.','error');
    return;
  }
  msg('جاري تحميل دليل الربط…');
  const [a,b]=await Promise.all([
    supabase.rpc('admin_customer_list_linking'),
    supabase.rpc('admin_customer_list_link_suggestions',{p_status:null})
  ]);
  if(a.error)throw a.error;
  if(b.error)throw b.error;
  sources=Array.isArray(a.data?.sources)?a.data.sources:[];
  parties=Array.isArray(a.data?.parties)?a.data.parties:[];
  suggestions=Array.isArray(b.data)?b.data:[];
  saveCache();renderAll();
  msg('تم تحديث دليل العملاء والروابط.','ok');
}
async function linkSource(sourceId){
  if(!navigator.onLine)return msg('الربط يحتاج اتصالًا.','warn');
  const sel=document.querySelector('[data-party-select="'+sourceId+'"]');
  const partyId=Number(sel?.value||0);
  if(!partyId)return msg('اختر العميل الموحد أولًا.','error');
  msg('جاري حفظ الربط…');
  let {data,error}=await supabase.rpc('admin_customer_link_source_account_safe',{
    p_source_account_id:sourceId,p_party_id:partyId,p_allow_move:false,p_reason:null
  });
  if(error)return msg('تعذر الربط: '+safeError(error),'error');
  if(data?.status==='conflict'){
    const ok=await askConfirm(
      'هذا المستخدم مربوط مسبقًا',
      'المستخدم مربوط حاليًا بـ «'+(data.existing_party_name||('عميل #'+data.existing_party_id))+'». هل تريد فك الربط السابق ونقله للعميل المختار؟',
      'فك ونقل الربط'
    );
    if(!ok)return msg('لم يتم تغيير الربط.','info');
    ({data,error}=await supabase.rpc('admin_customer_link_source_account_safe',{
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
  const {error}=await supabase.rpc('admin_customer_create_party_from_source',{
    p_source_account_id:sourceId,p_display_name:null
  });
  if(error)return msg('تعذر إنشاء العميل: '+safeError(error),'error');
  await load();msg('تم إنشاء العميل وربط الحساب.','ok');
}
async function unlinkSource(linkId){
  if(!navigator.onLine)return msg('فك الربط يحتاج اتصالًا.','warn');
  const ok=await askConfirm('فك الربط','سيبقى تاريخ الربط محفوظًا ويمكن إعادة الربط لاحقًا. هل تريد المتابعة؟','فك الربط');
  if(!ok)return;
  const {error}=await supabase.rpc('admin_customer_unlink_platform_account_safe',{
    p_link_id:linkId,p_reason:'فك من شاشة إدارة ربط العملاء'
  });
  if(error)return msg('تعذر فك الربط: '+safeError(error),'error');
  await load();msg('تم فك الربط مع الاحتفاظ بالتاريخ.','ok');
}
async function saveParty(id){
  if(!navigator.onLine)return msg('تعديل العميل يحتاج اتصالًا.','warn');
  const name=document.querySelector('[data-party-name="'+id+'"]')?.value.trim()||'';
  const phone=document.querySelector('[data-party-phone="'+id+'"]')?.value.trim()||null;
  const email=document.querySelector('[data-party-email="'+id+'"]')?.value.trim()||null;
  if(!name)return msg('اسم العميل مطلوب.','error');
  const {error}=await supabase.rpc('admin_customer_update_canonical',{
    p_party_id:id,p_display_name:name,p_phone:phone,p_email:email
  });
  if(error)return msg('تعذر تعديل العميل: '+safeError(error),'error');
  await load();msg('تم تعديل العميل الموحد.','ok');
}
async function reviewSuggestion(id,action){
  if(!navigator.onLine)return msg('مراجعة الاقتراح تحتاج اتصالًا.','warn');
  const {data,error}=await supabase.rpc('admin_customer_review_link_suggestion',{
    p_suggestion_id:id,p_action:action
  });
  if(error)return msg('تعذر مراجعة الاقتراح: '+safeError(error),'error');
  if(data?.status==='conflict'){
    await load();
    return msg('الحسابان مربوطان بعميلين مختلفين. راجع الربط من البطاقات قبل الدمج.','warn');
  }
  await load();msg(action==='approve'?'تمت الموافقة على الربط.':'تم رفض الاقتراح.','ok');
}
async function generateSuggestions(){
  if(!navigator.onLine)return msg('الاقتراح الذكي يحتاج اتصالًا.','warn');
  $('smartBtn').disabled=true;msg('جاري فحص الهواتف والبريد وأسماء المستخدمين…');
  const {data,error}=await supabase.rpc('admin_customer_generate_link_suggestions');
  $('smartBtn').disabled=false;
  if(error)return msg('تعذر إنشاء الاقتراحات: '+safeError(error),'error');
  await load();
  msg('تم الفحص: '+Number(data?.pending||0)+' بانتظار الموافقة، '+Number(data?.conflicts||0)+' تعارض.','ok');
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
function rowsToAccounts(matrix){
  const headerIndex=matrix.findIndex(r=>Array.isArray(r)&&r.some(v=>norm(v)==='اسم المستخدم'||norm(v)==='username'));
  if(headerIndex<0)throw new Error('لم أجد عمود اسم المستخدم.');
  const headers=matrix[headerIndex].map(v=>String(v??'').trim());
  return matrix.slice(headerIndex+1).filter(r=>Array.isArray(r)&&r.some(v=>String(v??'').trim()!=='')).map(row=>{
    const obj={};headers.forEach((h,i)=>{if(h)obj[h]=row[i]??''});
    const username=firstValue(obj,['اسم المستخدم','username','user']);
    if(!username)return null;
    const first=firstValue(obj,['الاسم','first name','firstname']);
    const last=firstValue(obj,['اللقب','last name','lastname']);
    const shop=firstValue(obj,['اسم المحل','المحل','shop name','display name']);
    const phone=firstValue(obj,['الهاتف','رقم الهاتف','هاتف','phone','telephone']);
    let email=firstValue(obj,['بريد إلكتروني','البريد الإلكتروني','البريد الالكتروني','email']);
    if(!email&&username.includes('@')&&username.includes('.'))email=username;
    const status=firstValue(obj,['حالة الحساب','الحالة','status']);
    const external=firstValue(obj,['المعرف','معرف الحساب','account id','id']);
    const updated=firstValue(obj,['تاريخ التحديث','تاريخ الإنشاء','created at','updated at']);
    const disabled=/معطل|disabled|inactive/i.test(status);
    return {
      username,
      external_account_id:external||null,
      display_name:shop||[first,last].filter(Boolean).join(' ').trim()||username,
      first_name:first||null,last_name:last||null,phone:phone||null,email:email||null,
      source_status:status||null,source_updated_at:updated||null,active:!disabled,raw_data:obj
    };
  }).filter(Boolean);
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
async function importSources(){
  if(!navigator.onLine)return msg('الاستيراد يحتاج اتصالًا.','warn');
  const file=$('sourceFile').files?.[0];
  if(!file)return msg('اختر ملف CSV أو XLSX أولًا.','error');
  const platform=$('importPlatform').value;
  $('importBtn').disabled=true;msg('جاري قراءة الملف…');
  try{
    const accounts=await parseImportFile(file);
    if(!accounts.length)throw new Error('لم أجد حسابات صالحة في الملف.');
    let processed=0,inserted=0,updated=0;
    for(let i=0;i<accounts.length;i+=150){
      const chunk=accounts.slice(i,i+150);
      const {data,error}=await supabase.rpc('admin_customer_upsert_source_accounts',{
        p_platform_key:platform,p_accounts:chunk
      });
      if(error)throw error;
      processed+=Number(data?.processed||chunk.length);
      inserted+=Number(data?.inserted||0);
      updated+=Number(data?.updated||0);
    }
    $('sourceFile').value='';
    await load();
    msg('تم تحديث '+processed+' حساب: جديد '+inserted+'، محدث '+updated+'. لا يوجد ربط تلقائي.','ok');
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
  const {error}=await supabase.rpc('admin_customer_create_canonical',{
    p_display_name:name,p_phone:phone,p_email:email,p_party_type:'shop'
  });
  if(error)return msg('تعذر إنشاء العميل: '+safeError(error),'error');
  $('manualName').value='';$('manualPhone').value='';$('manualEmail').value='';$('manualBox').hidden=true;
  await load();msg('تم إنشاء العميل الموحد.','ok');
}

$('toggleManual').onclick=()=>{$('manualBox').hidden=!$('manualBox').hidden};
$('manualSave').onclick=createManual;
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
    await load();
  }catch(error){
    if(!navigator.onLine&&loadCache())return;
    if(error?.message==='ADMIN_REQUIRED')msg('هذه الصفحة للإدارة فقط.','error');
    else msg('تعذر فتح الصفحة: '+safeError(error),'error');
  }
})();
import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabase=createClient(window.ShopApiConfig.url,window.ShopApiConfig.key);
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number(v||0);
const money=v=>new Intl.NumberFormat('ar-DZ',{maximumFractionDigits:2}).format(num(v))+' دج';
const PAGE_SIZE=10; // exactly 10 customer rows per page
const WORKER_TOKEN='mytool_shop_worker_token',WORKER_EXPIRES='mytool_shop_worker_expires_at',WORKSPACE_ROLE='mytool_workspace_role',ADMIN_EXPIRES='mytool_admin_expires_at';

let mode='none',workspaceToken='',parties=[],sources=[],platforms=[],identityRules=[],page=1,selectedPartyId=null,usernameCheckTimer=null,usernameCheckSeq=0;

function msg(text,kind='info'){$('message').textContent=text;$('message').className='message '+kind}
function normalize(v){return String(v??'').toLowerCase().normalize('NFKD').replace(/[\u064B-\u065F\u0670]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/\s+/g,' ').trim()}
function uniq(values){const out=[];const seen=new Set();for(const raw of values){const v=String(raw??'').trim();if(!v)continue;const k=normalize(v);if(!k||seen.has(k))continue;seen.add(k);out.push(v)}return out}
function platformLabel(key){return platforms.find(p=>p.platform_key===key)?.display_name||({hanii_rohek:'هني روحك',tehna_pay:'تهنى باي',wafarly:'وفرلي'}[key]||key||'منصة')}
function accountsFor(partyId){return sources.filter(s=>Number(s.linked_party_id||0)===Number(partyId))}
function platformKeysFor(partyId){return [...new Set(accountsFor(partyId).map(s=>s.platform_key).filter(Boolean))]}
function partyBy(id){return parties.find(p=>Number(p.id)===Number(id))||null}
function sourceFullName(s){return [s.first_name,s.last_name].filter(Boolean).join(' ').trim()}
function knownNames(party){
  const a=accountsFor(party.id);
  const learned=identityRules.filter(r=>Number(r.party_id)===Number(party.id)&&r.status==='approved').map(r=>r.identity_value);
  return uniq([party.display_name,...(party.aliases||[]),...learned,...a.flatMap(s=>[s.display_name,sourceFullName(s)])]);
}
function contacts(party){
  const a=accountsFor(party.id);
  const phones=uniq([party.primary_phone,...a.map(s=>s.phone)]);
  const emails=uniq([party.primary_email,...a.map(s=>s.email)]);
  return {phones,emails};
}
function totals(partyId){
  return accountsFor(partyId).reduce((x,s)=>({
    balance:x.balance+num(s.balance_amount),
    debt:x.debt+num(s.debt_amount),
    profit:x.profit+num(s.profit_amount)
  }),{balance:0,debt:0,profit:0});
}
function lastActivity(partyId){
  const dates=accountsFor(partyId).flatMap(s=>[s.last_financial_change_at,s.last_seen_at,s.source_updated_at,s.updated_at]).filter(Boolean).map(x=>new Date(x).getTime()).filter(Number.isFinite);
  return dates.length?new Date(Math.max(...dates)):null;
}
function fmtDate(v){if(!v)return'—';const d=v instanceof Date?v:new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('ar-DZ')}
function adminRpc(ownerName,workspaceName,params={}){
  if(mode==='local')return supabase.rpc(workspaceName,{p_session_token:workspaceToken,...params});
  return supabase.rpc(ownerName,params);
}
async function identify(){
  const now=Date.now();
  workspaceToken=localStorage.getItem(WORKER_TOKEN)||'';
  const exp=Number(localStorage.getItem(WORKER_EXPIRES)||0);
  const role=localStorage.getItem(WORKSPACE_ROLE)||'';
  if(workspaceToken&&exp>now&&role==='workspace_admin'){
    const st=await supabase.rpc('workspace_session_status',{p_session_token:workspaceToken});
    if(!st.error&&st.data?.length&&st.data[0].account_role==='workspace_admin'){
      mode='local';ShopShell.mountRoleNavigation({role:'admin',permissions:{can_record_money:true}},'customers');return;
    }
  }
  const {data,error}=await supabase.auth.getSession();if(error)throw error;
  const adminExp=Number(localStorage.getItem(ADMIN_EXPIRES)||0);
  if(data?.session&&adminExp>now){mode='owner';ShopShell.mountRoleNavigation({role:'admin',permissions:{can_record_money:true}},'customers');return}
  throw new Error('NO_SESSION');
}
async function load(){
  msg('جاري تحميل سجل العملاء…');
  const [linking,plist,partyList]=await Promise.all([
    adminRpc('admin_customer_list_linking','workspace_admin_list_customer_linking'),
    adminRpc('admin_customer_list_platforms','workspace_admin_list_platforms'),
    adminRpc('admin_customer_list_canonical_parties','workspace_admin_list_canonical_parties')
  ]);
  if(linking.error)throw linking.error;
  if(plist.error)throw plist.error;
  if(partyList.error)throw partyList.error;
  parties=Array.isArray(partyList.data)?partyList.data:(Array.isArray(linking.data?.parties)?linking.data.parties:[]);
  sources=Array.isArray(linking.data?.sources)?linking.data.sources:[];
  platforms=Array.isArray(plist.data)?plist.data:[];
  identityRules=[];
  if(mode==='owner'){
    const rules=await supabase.from('mytool_customer_identity_rules')
      .select('id,source_kind,identity_value,party_id,status,confidence,source_platform_key')
      .eq('status','approved').limit(5000);
    if(!rules.error)identityRules=rules.data||[];
  }
  if(isMobile()){selectedPartyId=null;setMobileDetail(false);history.replaceState(null,'',location.pathname);}
  renderFilters();renderMetrics();renderList();
  if(!isMobile()&&selectedPartyId&&partyBy(selectedPartyId))renderDetail(selectedPartyId);
  msg('سجل العملاء محدث. كل عميل معروض كهوية مركزية واحدة.','ok');
}
function renderFilters(){
  const current=$('platformFilter').value||'all';
  $('platformFilter').innerHTML='<option value="all">كل المنصات</option>'+platforms.map(p=>'<option value="'+esc(p.platform_key)+'">'+esc(p.display_name)+'</option>').join('');
  if(current==='all'||platforms.some(p=>p.platform_key===current))$('platformFilter').value=current;
}
function renderMetrics(){
  const multi=parties.filter(p=>platformKeysFor(p.id).length>1).length;
  const unlinked=sources.filter(s=>!s.linked_party_id).length;
  $('mCustomers').textContent=parties.length;
  $('mMulti').textContent=multi;
  $('mAccounts').textContent=sources.length;
  $('mUnlinked').textContent=unlinked;
}
function haystack(p){
  const a=accountsFor(p.id),c=contacts(p);
  return normalize([
    p.mt_number,p.mytool_username,p.display_name,...(p.aliases||[]),...c.phones,...c.emails,
    ...a.flatMap(s=>[s.username,s.display_name,s.first_name,s.last_name,s.phone,s.email,s.external_account_id,platformLabel(s.platform_key)])
  ].filter(Boolean).join(' '));
}
function filtered(){
  const q=normalize($('search').value),pf=$('platformFilter').value,kf=$('kindFilter').value,af=$('activeFilter')?.value||'active';
  return parties.filter(p=>{
    const pks=platformKeysFor(p.id);
    if(af==='active'&&p.active===false)return false;
    if(af==='hidden'&&p.active!==false)return false;
    if(q&&!haystack(p).includes(q))return false;
    if(pf!=='all'&&!pks.includes(pf))return false;
    if(kf==='multi'&&pks.length<2)return false;
    if(kf==='single'&&pks.length!==1)return false;
    if(kf==='no_source'&&accountsFor(p.id).length!==0)return false;
    return true;
  }).sort((a,b)=>{
    const ad=totals(a.id).debt,bd=totals(b.id).debt;
    if(bd!==ad)return bd-ad;
    return String(a.display_name).localeCompare(String(b.display_name),'ar');
  });
}
function renderList(){
  const rows=filtered(),pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
  page=Math.min(Math.max(page,1),pages);
  const chunk=rows.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);
  $('count').textContent=rows.length+' عميل';
  $('pageText').textContent='صفحة '+page+' من '+pages;
  $('prevPage').disabled=page<=1;$('nextPage').disabled=page>=pages;
  if(!chunk.length){$('customers').innerHTML='<div class="empty">لا توجد نتائج.</div>';return}
  $('customers').innerHTML=chunk.map(p=>{
    const a=accountsFor(p.id),pks=platformKeysFor(p.id),t=totals(p.id),names=knownNames(p),activity=lastActivity(p.id);
    return '<article class="customer-card'+(Number(selectedPartyId)===Number(p.id)?' selected':'')+'" data-party-card="'+p.id+'">'+
      '<div class="customer-top"><div><div class="customer-name">'+esc(p.display_name)+'</div><div class="customer-id">'+esc('MT-'+String(p.mt_number||'').padStart(5,'0'))+(p.mytool_username?' · '+esc(p.mytool_username):' · بدون Username')+'</div></div>'+
      '<div class="badges"><span class="badge ok">مؤكد</span><span class="badge platform">'+pks.length+' منصة</span><span class="badge">'+a.length+' حساب</span><span class="badge mobile-debt">'+money(t.debt)+'</span></div></div>'+
      '<div class="customer-summary">'+
        '<div class="mini"><b>'+esc(p.primary_phone||'—')+'</b><small>الهاتف الأساسي</small></div>'+
        '<div class="mini"><b>'+money(t.debt)+'</b><small>ديون المصادر</small></div>'+
        '<div class="mini"><b>'+money(t.balance)+'</b><small>أرصدة المصادر</small></div>'+
        '<div class="mini"><b>'+esc(fmtDate(activity))+'</b><small>آخر نشاط معروف</small></div>'+
      '</div>'+
      '<div class="names-line">الأسماء: '+esc(names.slice(0,5).join(' · ')||p.display_name)+(names.length>5?' · +'+(names.length-5):'')+'</div>'+
      '<div class="badges" style="margin-top:7px">'+pks.map(k=>'<span class="badge platform">'+esc(platformLabel(k))+' · '+a.filter(x=>x.platform_key===k).length+'</span>').join('')+'</div>'+
      '<div class="card-actions"><button class="btn secondary" data-open-party="'+p.id+'" type="button">فتح ملف العميل</button></div>'+
      '</article>';
  }).join('');
  document.querySelectorAll('[data-party-card]').forEach(card=>card.onclick=e=>{if(e.target.closest('button,a,input,select'))return;selectedPartyId=Number(card.dataset.partyCard);renderDetail(selectedPartyId);renderList();});
  document.querySelectorAll('[data-open-party]').forEach(b=>b.onclick=e=>{e.stopPropagation();selectedPartyId=Number(b.dataset.openParty);renderDetail(selectedPartyId);renderList();});
}
function chips(values,empty='لا توجد بيانات'){
  return values.length?values.map(v=>'<span class="chip">'+esc(v)+'</span>').join(''):'<span class="muted">'+esc(empty)+'</span>';
}
function isMobile(){return window.matchMedia('(max-width:760px)').matches}
function setMobileDetail(open){
  if(!isMobile())return;
  document.body.classList.toggle('mobile-detail',Boolean(open));
  $('detailCard').hidden=!open;
}
function renderDetail(id){
  const p=partyBy(id);if(!p)return;
  setMobileDetail(true);
  const a=accountsFor(id),names=knownNames(p),c=contacts(p),pks=platformKeysFor(id),t=totals(id);
  $('detailCard').hidden=false;$('detailTitle').textContent=p.display_name;$('detailIdentity').textContent='✓ '+('MT-'+String(p.mt_number||'').padStart(5,'0'))+(p.mytool_username?' · '+p.mytool_username:' · بدون Username');
  $('editName').value=p.display_name||'';$('editUsername').value=p.mytool_username||'';$('editPhone').value=p.primary_phone||'';$('editEmail').value=p.primary_email||'';
  setUsernameStatus(p.mytool_username?'اسم المستخدم الحالي محفوظ.':'اكتب Username وسيتم التحقق تلقائيًا بعد توقف الكتابة.','info');
  const learned=identityRules.filter(r=>Number(r.party_id)===Number(id)&&r.status==='approved');
  $('detailNames').innerHTML=chips(names)+
    (learned.length?'<div class="muted" style="width:100%;margin-top:6px">أسماء متعلمة: '+learned.map(r=>esc((r.source_kind==='whatsapp'?'WhatsApp · ':'')+r.identity_value)).join(' · ')+'</div>':'');
  $('detailContacts').innerHTML=chips([...c.phones.map(x=>'☎ '+x),...c.emails.map(x=>'✉ '+x)],'لا توجد أرقام أو إيميلات');
  $('detailPlatforms').innerHTML=chips(pks.map(k=>platformLabel(k)+' · '+a.filter(x=>x.platform_key===k).length+' حساب'));
  $('detailFinancial').innerHTML=chips(['الرصيد: '+money(t.balance),'الدين: '+money(t.debt),'الربح: '+money(t.profit)]);
  $('detailAccounts').innerHTML=pks.map(k=>renderPlatformGroup(k,a.filter(x=>x.platform_key===k))).join('')+(a.length?'':'<div class="empty" style="margin-top:10px">هذا العميل لا يملك حساب منصة مرتبطًا حاليًا.</div>');
  history.replaceState(null,'',location.pathname+'?party='+p.id);
  setTimeout(()=>{if(isMobile())scrollTo({top:0,behavior:'auto'});else $('detailCard').scrollIntoView({behavior:'smooth',block:'start'})},20);
}
function renderPlatformGroup(key,rows){
  const total=rows.reduce((x,s)=>({balance:x.balance+num(s.balance_amount),debt:x.debt+num(s.debt_amount),profit:x.profit+num(s.profit_amount)}),{balance:0,debt:0,profit:0});
  return '<section class="panel platform-group"><div class="platform-group-head"><h3>'+esc(platformLabel(key))+' · '+rows.length+' حساب</h3><div class="badges"><span class="badge">رصيد '+money(total.balance)+'</span><span class="badge warn">دين '+money(total.debt)+'</span></div></div>'+
    '<div class="account-grid">'+rows.map(s=>renderAccount(s)).join('')+'</div></section>';
}
function renderAccount(s){
  const title=s.display_name||sourceFullName(s)||s.username||('حساب #'+s.id);
  const contact=[s.phone?'☎ '+s.phone:'',s.email?'✉ '+s.email:''].filter(Boolean).join(' · ');
  return '<div class="account"><div class="account-title">'+esc(title)+'</div>'+
    '<div class="username">'+esc(s.username||'بدون username')+'</div>'+
    '<div class="account-meta">'+
      (sourceFullName(s)?'الاسم في المصدر: '+esc(sourceFullName(s))+'<br>':'')+
      (contact?esc(contact)+'<br>':'')+
      (s.external_account_id?'External ID: '+esc(s.external_account_id)+'<br>':'')+
      'الحالة: '+esc(s.source_status||'—')+' · آخر ظهور: '+esc(fmtDate(s.last_seen_at||s.source_updated_at))+
    '</div>'+
    '<div class="money-row"><div class="money"><small>الرصيد</small><b>'+money(s.balance_amount)+'</b></div><div class="money"><small>الدين</small><b>'+money(s.debt_amount)+'</b></div><div class="money"><small>الربح</small><b>'+money(s.profit_amount)+'</b></div></div></div>';
}
function setUsernameStatus(text,kind='info'){
  const el=$('usernameStatus');if(!el)return;
  el.textContent=text||'';
  el.className='field-status '+(text?kind:'');
  $('editUsername')?.setAttribute('aria-invalid',kind==='error'?'true':'false');
}
async function checkUsernameAvailability(){
  const p=partyBy(selectedPartyId);if(!p)return true;
  const username=$('editUsername').value.trim().replace(/\s+/g,' ');
  const seq=++usernameCheckSeq;
  if(!username){setUsernameStatus('بدون Username حاليًا.','info');return true}
  if(!/\p{L}/u.test(username)||username.length<2||username.length>60){
    setUsernameStatus('غير صالح: يجب أن يحتوي حرفًا واحدًا على الأقل وألا يكون أرقامًا فقط.','error');return false;
  }
  setUsernameStatus('جاري التحقق…','info');
  const r=await adminRpc('admin_check_mytool_username','workspace_admin_check_mytool_username',{p_party_id:p.id,p_username:username});
  if(seq!==usernameCheckSeq)return false;
  if(r.error){setUsernameStatus('تعذر التحقق الآن؛ سيتم التحقق عند الحفظ.','error');return false}
  if(r.data?.available){setUsernameStatus('متاح ✓','ok');return true}
  if(r.data?.reason==='taken'){setUsernameStatus('محجوز لشخص آخر ✕','error');return false}
  setUsernameStatus('Username غير صالح.','error');return false;
}
function scheduleUsernameCheck(){
  clearTimeout(usernameCheckTimer);
  setUsernameStatus('…','info');
  usernameCheckTimer=setTimeout(()=>checkUsernameAvailability(),650);
}

async function saveIdentity(){
  const p=partyBy(selectedPartyId);if(!p)return;
  const name=$('editName').value.trim(),username=$('editUsername').value.trim().replace(/\s+/g,' '),phone=$('editPhone').value.trim(),email=$('editEmail').value.trim();
  if(name.length<2)return msg('الاسم الرئيسي قصير جدًا.','error');
  if(username&&(!/\p{L}/u.test(username)||username.length<2||username.length>60))return msg('Username يجب أن يحتوي حرفًا واحدًا على الأقل، ويمكن أن يحتوي حروفًا وأرقامًا ومسافات.','error');
  if(username&&!(await checkUsernameAvailability())){ $('editUsername').focus(); return; }
  $('saveIdentity').disabled=true;
  const r=await adminRpc('admin_customer_update_identity_v2','workspace_admin_update_identity_v2',{
    p_party_id:p.id,p_display_name:name,p_username:username||null,p_phone:phone||null,p_email:email||null
  });
  $('saveIdentity').disabled=false;
  if(r.error){
    const e=String(r.error.message||r.error);
    if(e.includes('MYTOOL_USERNAME_ALREADY_USED'))return msg('اسم المستخدم هذا مستعمل لشخص آخر.','error');
    if(e.includes('PHONE_ALREADY_USED'))return msg('رقم الهاتف هذا مربوط بشخص آخر.','error');
    if(e.includes('MYTOOL_USERNAME_MUST_CONTAIN_LETTER'))return msg('اسم المستخدم لا يمكن أن يكون أرقامًا فقط.','error');
    return msg('تعذر حفظ هوية العميل: '+e,'error');
  }
  await load();selectedPartyId=p.id;renderDetail(p.id);msg('تم تحديث هوية MyTool. Username والهاتف وMT مفاتيح مستقلة؛ حسابات المنصات لم تتغير.','ok');
}

$('refreshBtn').onclick=()=>load().catch(e=>msg('تعذر التحديث: '+(e.message||e),'error'));
$('search').oninput=()=>{page=1;renderList()};
$('editUsername').oninput=scheduleUsernameCheck;
$('editUsername').onblur=()=>{clearTimeout(usernameCheckTimer);checkUsernameAvailability()};
$('platformFilter').onchange=()=>{page=1;renderList()};
$('kindFilter').onchange=()=>{page=1;renderList()};
$('activeFilter').onchange=()=>{page=1;renderList()};
$('prevPage').onclick=()=>{page--;renderList();scrollTo({top:$('customers').offsetTop-80,behavior:'smooth'})};
$('nextPage').onclick=()=>{page++;renderList();scrollTo({top:$('customers').offsetTop-80,behavior:'smooth'})};
$('closeDetail').onclick=()=>{selectedPartyId=null;$('detailCard').hidden=true;setMobileDetail(false);history.replaceState(null,'',location.pathname);renderList();if(isMobile())scrollTo({top:0,behavior:'auto'})};
$('saveIdentity').onclick=saveIdentity;

(async()=>{
  try{
    await identify();
    const requested=Number(new URLSearchParams(location.search).get('party')||0);
    if(requested&&!isMobile())selectedPartyId=requested;
    else if(isMobile())selectedPartyId=null;
    await load();
  }catch(e){
    msg(e?.message==='NO_SESSION'?'هذه الصفحة للإدارة. افتح MyTool بحساب الإدارة ثم ادخل من جديد.':'تعذر تشغيل سجل العملاء: '+(e.message||e),'error');
  }
})();
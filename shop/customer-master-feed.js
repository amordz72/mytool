import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabase=createClient(window.ShopApiConfig.url,window.ShopApiConfig.key);
const WORKER_TOKEN='mytool_shop_worker_token',WORKER_EXPIRES='mytool_shop_worker_expires_at',WORKSPACE_ROLE='mytool_workspace_role',ADMIN_EXPIRES='mytool_admin_expires_at';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v??'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
const masterRef=id=>'CUST-'+String(Number(id)||0).padStart(6,'0');

let adminMode='none',workspaceToken='',sources=[],parties=[],platforms=[];
let selectedMasterId=null,mode='existing',saving=false;
const selectedByPlatform=new Map();

function msg(text,kind='info'){
  $('message').textContent=text;
  $('message').className='message '+kind;
}
function labelPlatform(key){
  return platforms.find(p=>p.platform_key===key)?.display_name||key||'منصة';
}
async function adminRpc(ownerName,workspaceName,params={}){
  if(adminMode==='local')return supabase.rpc(workspaceName,{p_session_token:workspaceToken,...params});
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
      adminMode='local';
      ShopShell.mountRoleNavigation({role:'admin',permissions:{can_record_money:true}},'customer-master-feed');
      return;
    }
  }
  const {data,error}=await supabase.auth.getSession();
  if(error)throw error;
  if(data?.session&&Number(localStorage.getItem(ADMIN_EXPIRES)||0)>now){
    adminMode='owner';
    ShopShell.mountRoleNavigation({role:'admin',permissions:{can_record_money:true}},'customer-master-feed');
    return;
  }
  throw new Error('ADMIN_REQUIRED');
}
async function load(){
  msg('جاري تحميل حسابات المنصات وماستر العملاء…');
  const [a,b]=await Promise.all([
    adminRpc('admin_customer_list_linking','workspace_admin_list_customer_linking'),
    adminRpc('admin_customer_list_platforms','workspace_admin_list_platforms')
  ]);
  if(a.error)throw a.error;
  if(b.error)throw b.error;
  sources=Array.isArray(a.data?.sources)?a.data.sources:[];
  parties=Array.isArray(a.data?.parties)?a.data.parties.filter(p=>p.active!==false):[];
  platforms=Array.isArray(b.data)?b.data.filter(p=>p.active!==false):[];
  renderPlatforms();
  renderMasterResults();
  renderSimilarMasters();
  updateSummary();
  msg('جاهز. اختر عميل الماستر ثم حساباته في المنصات.','ok');
}
function setMode(next){
  mode=next;
  $('existingBox').hidden=mode!=='existing';
  $('newBox').hidden=mode!=='new';
  $('modeExisting').classList.toggle('active',mode==='existing');
  $('modeNew').classList.toggle('active',mode==='new');
  if(mode==='new')selectedMasterId=null;
  renderChosenMaster();
  updateSummary();
}
function masterSearchText(p){
  return norm([p.display_name,p.primary_phone,p.primary_email,masterRef(p.id),p.id].filter(Boolean).join(' '));
}
function renderMasterResults(){
  const q=norm($('masterSearch').value);
  const list=parties
    .filter(p=>!q||masterSearchText(p).includes(q))
    .slice(0,12);
  $('masterResults').innerHTML=list.length?list.map(p=>{
    const sel=Number(selectedMasterId)===Number(p.id);
    const contacts=[p.primary_phone,p.primary_email].filter(Boolean).join(' · ');
    return '<div class="master-result'+(sel?' selected':'')+'" data-master="'+p.id+'">'+
      '<div class="master-key">'+masterRef(p.id)+'</div>'+
      '<div class="master-name">'+esc(p.display_name)+'</div>'+
      (contacts?'<div class="muted">'+esc(contacts)+'</div>':'')+
      '</div>';
  }).join(''):'<div class="muted">لا يوجد عميل بهذا البحث.</div>';
  document.querySelectorAll('[data-master]').forEach(el=>el.onclick=()=>{
    selectedMasterId=Number(el.dataset.master);
    setMode('existing');
    renderMasterResults();
    renderChosenMaster();
    updateSummary();
  });
}
function similarScore(a,b){
  a=norm(a);b=norm(b);
  if(!a||!b)return 0;
  if(a===b)return 100;
  if(a.includes(b)||b.includes(a))return 92;
  const aa=new Set(a.replace(/[^\p{L}\p{N}]+/gu,'').split(''));
  const bb=new Set(b.replace(/[^\p{L}\p{N}]+/gu,'').split(''));
  if(!aa.size||!bb.size)return 0;
  let same=0;aa.forEach(x=>{if(bb.has(x))same++});
  return Math.round(200*same/(aa.size+bb.size));
}
function renderSimilarMasters(){
  const name=$('newMasterName').value.trim();
  if(!name){$('similarMasters').innerHTML='';return}
  const exact=parties.find(p=>norm(p.display_name)===norm(name));
  const near=parties.map(p=>({p,score:similarScore(name,p.display_name)}))
    .filter(x=>x.score>=80)
    .sort((a,b)=>b.score-a.score)
    .slice(0,5);
  $('similarMasters').innerHTML=(exact?'<div class="message warn" style="margin:8px 0 0">يوجد اسم مطابق في الماستر. الأفضل اختياره بدل إنشاء نسخة جديدة.</div>':'')+
    near.map(x=>'<div class="master-result" data-use-near="'+x.p.id+'"><div class="master-key">'+masterRef(x.p.id)+' · تشابه '+x.score+'%</div><div class="master-name">'+esc(x.p.display_name)+'</div></div>').join('');
  document.querySelectorAll('[data-use-near]').forEach(el=>el.onclick=()=>{
    selectedMasterId=Number(el.dataset.useNear);
    setMode('existing');
    $('masterSearch').value=parties.find(p=>Number(p.id)===selectedMasterId)?.display_name||'';
    renderMasterResults();renderChosenMaster();updateSummary();
  });
}
function renderChosenMaster(){
  const p=parties.find(x=>Number(x.id)===Number(selectedMasterId));
  if(mode==='existing'&&p){
    $('chosenMaster').innerHTML='<div class="master-key">'+masterRef(p.id)+' · معرف ثابت</div><div class="master-name">'+esc(p.display_name)+'</div><div class="muted">اسم الماستر لا يتغير من بيانات المنصات في هذه الصفحة.</div>';
  }else if(mode==='new'){
    const n=$('newMasterName').value.trim();
    $('chosenMaster').innerHTML=n?'<div class="master-key">عميل جديد — سيأخذ معرف CUST ثابت بعد الحفظ</div><div class="master-name">'+esc(n)+'</div><div class="muted">هذا الاسم هو اسم الماستر المحجوز.</div>':'';
  }else $('chosenMaster').innerHTML='';
}
function sourceText(s){
  return norm([s.username,s.display_name,s.first_name,s.last_name,s.phone,s.email,s.external_account_id].filter(Boolean).join(' '));
}
function selectedSource(platformKey){
  const id=Number(selectedByPlatform.get(platformKey)||0);
  return sources.find(s=>Number(s.id)===id)||null;
}
function sourceCard(s,platformKey){
  const selected=Number(selectedByPlatform.get(platformKey)||0)===Number(s.id);
  const name=s.display_name||[s.first_name,s.last_name].filter(Boolean).join(' ').trim()||s.username;
  const meta=[s.phone,s.email].filter(Boolean).join(' · ');
  const current=s.linked_party_id?('مرتبط حاليًا بـ '+(s.linked_party_name||masterRef(s.linked_party_id))):'غير مربوط';
  return '<div class="candidate'+(selected?' selected':'')+'" data-source="'+s.id+'" data-platform="'+esc(platformKey)+'">'+
    '<div class="user">'+esc(s.username)+'</div>'+
    '<div class="name">'+esc(name||'بدون اسم ظاهر')+'</div>'+
    (meta?'<div class="meta">'+esc(meta)+'</div>':'')+
    '<div class="linked-note">'+esc(current)+'</div>'+
    '</div>';
}
function renderOnePlatform(p){
  const key=p.platform_key;
  const card=$('platform-'+CSS.escape(key));
  if(!card)return;
  const q=norm(card.querySelector('[data-platform-search]').value);
  const selected=selectedSource(key);
  const list=sources.filter(s=>s.platform_key===key&&(!q||sourceText(s).includes(q))).slice(0,20);
  card.querySelector('[data-selected-box]').innerHTML=selected?
    '<b>المختار:</b> <span dir="ltr">'+esc(selected.username)+'</span> <button class="btn secondary" data-clear-one="'+esc(key)+'" type="button" style="width:auto;padding:5px 8px;margin-right:6px">إلغاء</button>':'';
  card.querySelector('[data-results]').innerHTML=q||selected
    ? (list.length?list.map(s=>sourceCard(s,key)).join(''):'<div class="muted">لا توجد نتائج.</div>')
    : '<div class="muted">اكتب جزءًا من username أو الاسم أو الهاتف أو الإيميل.</div>';
  card.querySelectorAll('[data-source]').forEach(el=>el.onclick=()=>{
    const id=Number(el.dataset.source);
    if(Number(selectedByPlatform.get(key)||0)===id)selectedByPlatform.delete(key);else selectedByPlatform.set(key,id);
    renderOnePlatform(p);updateSummary();
  });
  card.querySelectorAll('[data-clear-one]').forEach(el=>el.onclick=()=>{
    selectedByPlatform.delete(key);renderOnePlatform(p);updateSummary();
  });
}
function renderPlatforms(){
  $('platforms').innerHTML=platforms.map(p=>{
    const count=sources.filter(s=>s.platform_key===p.platform_key).length;
    return '<article id="platform-'+esc(p.platform_key)+'" class="platform-card">'+
      '<div class="platform-head"><h3>'+esc(p.display_name)+'</h3><span class="count">'+count+' حساب</span></div>'+
      '<input class="search" data-platform-search="'+esc(p.platform_key)+'" placeholder="ابحث داخل '+esc(p.display_name)+'…">'+
      '<div class="selected-box" data-selected-box></div>'+
      '<div class="results" data-results><div class="muted">اكتب جزءًا من الحساب.</div></div>'+
      '</article>';
  }).join('');
  platforms.forEach(p=>{
    const card=$('platform-'+CSS.escape(p.platform_key));
    card?.querySelector('[data-platform-search]')?.addEventListener('input',()=>renderOnePlatform(p));
  });
}
function updateSummary(){
  const ids=[...selectedByPlatform.values()].filter(Boolean);
  $('selectionText').textContent=ids.length+' حساب محدد من '+selectedByPlatform.size+' منصة';
  const p=parties.find(x=>Number(x.id)===Number(selectedMasterId));
  $('targetText').textContent=mode==='existing'&&p
    ? masterRef(p.id)+' · '+p.display_name
    : mode==='new'&&$('newMasterName').value.trim()
      ? 'عميل جديد: '+$('newMasterName').value.trim()
      : 'اختر عميل ماستر أو اكتب اسم عميل جديد.';
  $('saveFeed').disabled=saving||!ids.length||(mode==='existing'&&!selectedMasterId)||(mode==='new'&&!$('newMasterName').value.trim());
}
async function createMaster(){
  const name=$('newMasterName').value.trim();
  if(name.length<2)throw new Error('اكتب اسم الماستر.');
  const exact=parties.find(p=>norm(p.display_name)===norm(name));
  if(exact)throw new Error('يوجد عميل بنفس الاسم في الماستر. اختره من القائمة بدل إنشاء نسخة.');
  const params={p_display_name:name,p_phone:$('newMasterPhone').value.trim()||null,p_email:$('newMasterEmail').value.trim()||null,p_party_type:'shop'};
  const {data,error}=await adminRpc('admin_customer_create_or_discover','workspace_admin_customer_create_or_discover',params);
  if(error)throw error;
  if(data?.decision==='existing')return Number(data.party_id);
  if(data?.decision==='created')return Number(data.party_id);
  if(data?.decision==='review')throw new Error('وجدنا هوية مشابهة تحتاج مراجعة قبل إنشاء MT جديد.');
  if(data?.decision==='conflict')throw new Error('بيانات الهوية تشير إلى أكثر من MT. راجعها قبل الإنشاء.');
  throw new Error('تعذر تحديد هوية العميل.');
}
async function linkOne(sourceId,targetId){
  const {data,error}=await adminRpc('admin_customer_link_source_account_safe','workspace_admin_link_source_account_safe',{
    p_source_account_id:sourceId,p_party_id:targetId,p_allow_move:true,p_reason:'تغذية ماستر العملاء'
  });
  if(error)throw error;
  return data;
}
async function saveFeed(){
  if(saving)return;
  const ids=[...selectedByPlatform.values()].map(Number).filter(Boolean);
  if(!ids.length)return msg('اختر حسابًا واحدًا على الأقل.','warn');
  const moving=sources.filter(s=>ids.includes(Number(s.id))&&s.linked_party_id&&Number(s.linked_party_id)!==Number(selectedMasterId||0));
  const desc=moving.length?'\n\nتنبيه: '+moving.length+' حساب مرتبط حاليًا بماستر آخر وسيُنقل بعد التأكيد.':'';
  if(!confirm('سيتم ربط '+ids.length+' حساب بالعميل المختار. بيانات وأسماء المنصات ستبقى كما هي ولن تستبدل اسم الماستر.'+desc))return;
  saving=true;updateSummary();msg('جاري تغذية ماستر العملاء…');
  try{
    let targetId=Number(selectedMasterId||0);
    if(mode==='new')targetId=await createMaster();
    if(!targetId)throw new Error('لم يتم تحديد عميل الماستر.');
    if(ids.length===1)await linkOne(ids[0],targetId);
    else{
      const {error}=await adminRpc('admin_customer_merge_selected_sources','workspace_admin_merge_selected_sources',{p_source_account_ids:ids,p_target_party_id:targetId});
      if(error)throw error;
    }
    selectedByPlatform.clear();
    selectedMasterId=targetId;
    mode='existing';
    await load();
    $('masterSearch').value=parties.find(p=>Number(p.id)===targetId)?.display_name||'';
    renderMasterResults();renderChosenMaster();
    msg('تمت تغذية الماستر بنجاح. '+masterRef(targetId)+' بقي هو المرجع الثابت للعميل.','ok');
  }catch(e){
    msg('تعذر الحفظ: '+String(e?.message||e),'error');
  }finally{
    saving=false;updateSummary();
  }
}
$('modeExisting').onclick=()=>setMode('existing');
$('modeNew').onclick=()=>setMode('new');
$('masterSearch').oninput=renderMasterResults;
$('newMasterName').oninput=()=>{renderSimilarMasters();renderChosenMaster();updateSummary()};
$('newMasterPhone').oninput=updateSummary;
$('newMasterEmail').oninput=updateSummary;
$('clearSelection').onclick=()=>{selectedByPlatform.clear();platforms.forEach(renderOnePlatform);updateSummary()};
$('saveFeed').onclick=saveFeed;

try{
  await identify();
  await load();
}catch(e){
  msg(e?.message==='ADMIN_REQUIRED'?'هذه الصفحة للإدارة فقط.':'تعذر فتح الصفحة: '+String(e?.message||e),'error');
}
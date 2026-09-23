import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL='https://wqyebqzbbpohbnznqdjj.supabase.co';
const SUPABASE_KEY='sb_publishable_gO4umNBMJ0AWRk19HtKd7A_9X4DibYj';
const DB_NAME='mytool-accounts-review',DB_VERSION=2;
const PLATFORM_BY_SOURCE={
  'builtin:hanii-rouhek':'hanii_rohek',
  'builtin:tehna-pay':'tehna_pay',
  'builtin:wafarly':'wafarly'
};
const SOURCE_BY_PLATFORM={
  hanii_rohek:{id:'builtin:hanii-rouhek',name:'هني روحك'},
  tehna_pay:{id:'builtin:tehna-pay',name:'تهنى باي'},
  wafarly:{id:'builtin:wafarly',name:'وفرلي'}
};
let supabase=null,queue=Promise.resolve();

function status(text,kind='ok'){
  const el=document.getElementById('accountsCloudStatus');
  if(el){el.textContent=text;el.dataset.kind=kind}
}
function norm(v){return String(v??'').trim().toLowerCase().normalize('NFKC').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/ة/g,'ه').replace(/\s+/g,' ')}
function plain(v){return JSON.parse(JSON.stringify(v))}
function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function allSources(){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction('sources','readonly'),req=tx.objectStore('sources').getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close()})}
async function getSource(id){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction('sources','readonly'),req=tx.objectStore('sources').get(id);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close()})}
async function putSource(value){const db=await openDb(),stored=plain(value);return new Promise((resolve,reject)=>{const tx=db.transaction('sources','readwrite');tx.objectStore('sources').put(stored);tx.oncomplete=()=>{db.close();resolve(stored)};tx.onerror=tx.onabort=()=>{const e=tx.error||new Error('LOCAL_SAVE_FAILED');db.close();reject(e)}})}
function access(){return window.MyToolAccessContext||window.MyToolAccess?.resolve?.()||{}}
function canSync(){const a=access();return navigator.onLine&&(a.ownerActive||a.workspaceAdminActive)}
function sourcePlatform(source){
  if(PLATFORM_BY_SOURCE[source?.id])return PLATFORM_BY_SOURCE[source.id];
  const name=norm(source?.name);
  if(name.includes('هني')&&name.includes('روحك'))return'hanii_rohek';
  if(name.includes('تهني')&&name.includes('باي'))return'tehna_pay';
  if(name.includes('وفرلي')||name.includes('wafarly'))return'wafarly';
  return null;
}
async function client(){if(!supabase)supabase=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{detectSessionInUrl:false}});return supabase}
async function rpc(ownerName,workspaceName,params={}){
  const a=access(),s=await client();
  if(a.workspaceAdminActive){
    const token=localStorage.getItem('mytool_shop_worker_token')||'';
    if(!token)return{data:null,error:new Error('WORKSPACE_SESSION_REQUIRED')};
    return s.rpc(workspaceName,{p_session_token:token,...params});
  }
  if(a.ownerActive)return s.rpc(ownerName,params);
  return{data:null,error:new Error('ADMIN_SESSION_REQUIRED')};
}
function displayName(r){return String(r?.store||[r?.first,r?.last].filter(Boolean).join(' ').trim()||r?.username||'').trim()}
function rowPayload(r){
  const username=String(r?.username||'').trim();
  if(!username)return null;
  return{
    username,
    external_account_id:String(r?.externalId||'').trim()||null,
    display_name:displayName(r)||username,
    first_name:String(r?.first||'').trim()||null,
    last_name:String(r?.last||'').trim()||null,
    phone:String(r?.phone||'').trim()||null,
    email:String(r?.email||'').trim()||null,
    source_status:String(r?.sourceStatus||'').trim()||null,
    source_updated_at:r?.sourceUpdatedAt||null,
    source_created_at:r?.sourceCreatedAt||null,
    active:r?.active!==false,
    balance:Number(r?.balance)||0,
    debt:Number(r?.debt)||0,
    profit:Number(r?.profit)||0,
    raw_data:{
      username,
      display_name:displayName(r)||username,
      phone:String(r?.phone||'').trim()||null,
      email:String(r?.email||'').trim()||null,
      balance:Number(r?.balance)||0,
      debt:Number(r?.debt)||0,
      profit:Number(r?.profit)||0,
      source_created_at:r?.sourceCreatedAt||null
    }
  };
}
async function syncOne(source){
  if(!canSync())return null;
  const platform=sourcePlatform(source);
  if(!platform||!Array.isArray(source?.rows))return null;
  const accounts=source.rows.map(rowPayload).filter(Boolean);
  if(!accounts.length)return null;
  let total={processed:0,inserted:0,updated:0,unchanged:0,identity_reviews:0,identity_conflicts:0,stale_skipped:0};
  status('Supabase: جاري حفظ نتائج '+source.name+'…','busy');
  for(let i=0;i<accounts.length;i+=150){
    const chunk=accounts.slice(i,i+150);
    const {data,error}=await rpc('admin_customer_upsert_source_accounts','workspace_admin_upsert_source_accounts',{p_platform_key:platform,p_accounts:chunk});
    if(error)throw error;
    for(const k of Object.keys(total))total[k]+=Number(data?.[k]||0);
  }
  if(source.signature){
    const {error}=await rpc('admin_customer_register_schema_signature','workspace_admin_register_schema_signature',{p_platform_key:platform,p_header_signature:source.signature});
    if(error)console.warn('schema signature sync skipped',error);
  }
  const current=await getSource(source.id)||source;
  current.remoteSyncPending=false;
  current.remoteSyncedAt=new Date().toISOString();
  current.remoteSyncHash=current.contentHash||null;
  current.remoteSyncSummary=total;
  delete current.remoteSyncError;
  await putSource(current);
  status('Supabase: محفوظ '+total.processed+' · جديد '+total.inserted+' · تغيّر '+total.updated+' · بدون تغيير '+total.unchanged,'ok');
  return total;
}
function identityKeys(r){
  const u=norm(r?.username);
  return u?['u:'+u]:[];
}
function remoteToRow(r){
  return{
    key:String(r.external_account_id||r.username||('remote-'+r.id)),
    username:r.username||'',
    first:r.first_name||'',
    last:r.last_name||'',
    store:r.display_name||'',
    phone:r.phone||'',
    email:r.email||'',
    externalId:r.external_account_id||'',
    sourceStatus:r.source_status||'',
    sourceUpdatedAt:r.source_updated_at||null,
    sourceCreatedAt:r.source_created_at||null,
    balance:Number(r.balance_amount)||0,
    debt:Number(r.debt_amount)||0,
    profit:Number(r.profit_amount)||0,
    firstSeenAt:r.first_seen_at||null,
    lastSeenAt:r.last_seen_at||null,
    lastFinancialChangeAt:r.last_financial_change_at||null,
    missingFromLatestSnapshot:Boolean(r.missing_from_latest_snapshot),
    missingSinceAt:r.missing_since_at||null,
    cloudSourceAccountId:r.id
  };
}
function mergeRemoteRows(localRows,remoteRows){
  const rows=(localRows||[]).map(x=>({...x}));
  const index=new Map();
  const rebuild=()=>{index.clear();rows.forEach((r,i)=>identityKeys(r).forEach(k=>{if(!index.has(k))index.set(k,i)}))};
  rebuild();
  for(const rr of remoteRows){
    const remote=remoteToRow(rr);let at=-1;
    for(const k of identityKeys(remote)){if(index.has(k)){at=index.get(k);break}}
    if(at>=0)rows[at]={...rows[at],...remote,key:rows[at].key||remote.key};
    else{rows.push(remote);rebuild()}
  }
  return rows.map((r,i)=>({...r,index:i}));
}
async function pullRemote(){
  if(!canSync())return false;
  const {data,error}=await rpc('admin_customer_list_linking','workspace_admin_list_customer_linking',{});
  if(error)throw error;
  const remote=Array.isArray(data?.sources)?data.sources:[];
  if(!remote.length)return false;
  const local=await allSources();
  const byPlatform=new Map();
  for(const r of remote){const arr=byPlatform.get(r.platform_key)||[];arr.push(r);byPlatform.set(r.platform_key,arr)}
  let changed=false;
  for(const [platform,remoteRows] of byPlatform){
    const meta=SOURCE_BY_PLATFORM[platform];if(!meta)continue;
    const existing=local.find(s=>s.id===meta.id);
    const source=existing?{...existing}:{id:meta.id,name:meta.name,readerId:'supabase:'+platform,readerKind:'remote',signature:'',fileName:'Supabase',fileFamily:'supabase',fileType:'remote',sheetName:'',headerRow:0,imports:[],identityReviews:[],updatedAt:new Date().toISOString()};
    source.rows=mergeRemoteRows(source.rows||[],remoteRows);
    source.cloudRestoredAt=new Date().toISOString();
    if(!source.updatedAt)source.updatedAt=source.cloudRestoredAt;
    await putSource(source);changed=true;
  }
  if(changed)window.dispatchEvent(new Event('accounts-remote-data-updated'));
  return changed;
}
async function syncPending(){
  if(!canSync()){status(navigator.onLine?'Supabase: يلزم دخول إدارة صالح':'Supabase: بدون اتصال — النسخة المحلية تعمل','warn');return}
  const sources=await allSources();
  for(const source of sources){
    if(!sourcePlatform(source))continue;
    if(source.remoteSyncPending||!source.remoteSyncedAt||source.remoteSyncHash!==source.contentHash){
      try{await syncOne(source)}catch(error){
        const current=await getSource(source.id)||source;
        current.remoteSyncPending=true;current.remoteSyncError=String(error?.message||error||'SYNC_FAILED');
        await putSource(current);
        status('Supabase: تعذر الحفظ الآن، سيُعاد تلقائيًا','err');
      }
    }
  }
  try{await pullRemote()}catch(error){console.warn('accounts cloud restore skipped',error)}
}
function enqueue(fn){queue=queue.then(fn).catch(error=>{console.warn('accounts cloud sync',error);status('Supabase: تعذر التزامن مؤقتًا','err')});return queue}

window.addEventListener('accounts-source-updated',event=>enqueue(async()=>{
  const source=await getSource(event.detail?.sourceId);if(!source)return;
  source.remoteSyncPending=true;await putSource(source);await syncOne(source);await pullRemote();
}));
window.addEventListener('online',()=>enqueue(syncPending));

const start=()=>enqueue(syncPending);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();

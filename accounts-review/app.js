import {createApp,ref,computed,watch,nextTick,onMounted} from 'https://cdn.jsdelivr.net/npm/vue@3/dist/vue.esm-browser.prod.js';

const DB_NAME='mytool-accounts-review';
const DB_VERSION=2;
const STORES=['sources','profiles','unknown'];
const REQUIRED_FIELDS=['username','balance','debt','profit'];
const FIELD_ALIASES={
  username:['اسم المستخدم','username','user','login','utilisateur','المستخدم'],
  first:['الاسم','first name','firstname','prenom','prénom','name'],
  last:['اللقب','last name','lastname','surname','nom'],
  store:['اسم المحل','المحل','store','shop','magasin','commerce'],
  balance:['رصيد','الرصيد','balance','solde','account balance'],
  debt:['ديون','الدين','debt','debts','dette','dettes','creance','créance','creances','créances'],
  profit:['ارباح','أرباح','الارباح','الأرباح','profit','profits','benefice','bénéfice','benefices','bénéfices'],
  phone:['الهاتف','رقم الهاتف','هاتف','phone','telephone','téléphone'],
  email:['البريد الإلكتروني','البريد الالكتروني','بريد إلكتروني','email','e-mail'],
  externalId:['المعرف','معرف الحساب','account id','external id','uid'],
  sourceCreatedAt:['تاريخ الإنشاء','تاريخ الانشاء','joined at','created at','date creation','date de création'],
  sourceUpdatedAt:['تاريخ التحديث','updated at','last updated','modified at'],
  sourceStatus:['حالة الحساب','الحالة','status','account status']
};
const HANI_MARKERS=['bfs hanii rohek','hanii rohek','هني روحك','هاني روحك'];
const HANI_UNIQUE=['معرف الشبكة','اسم المحل','الحد الأقصى للديون'];
const TEHNA_CANONICAL=['اسم المستخدم','الاسم','اللقب','الدور','حالة الحساب','رصيد','ديون','ارباح'];
const WAFARLY_HEADERS=['uid','joined at','user','رصيد','مقترض','مقترض (المفوض)'];

function normalizeText(v){return String(v??'').replace(/^\uFEFF/,'').trim().toLowerCase().normalize('NFKC').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/ة/g,'ه').replace(/\s+/g,' ')}
function cleanHeader(v){return normalizeText(v).replace(/[.:؛،]+$/g,'')}
function numeric(v){const s=String(v??'').trim().replace(/[\s\u00a0]/g,'').replace(/,/g,'').replace(/٫/g,'.');const n=Number(s);return Number.isFinite(n)?n:0}
function parseSourceDate(value){
  const raw=String(value??'').replace(/[\u200e\u200f]/g,'').trim();if(!raw)return null;
  const iso=raw.match(/^(20\d{2})[-\/]([01]?\d)[-\/]([0-3]?\d)(?:[ T]([0-2]?\d):([0-5]\d))?/);
  if(iso){const d=new Date(Number(iso[1]),Number(iso[2])-1,Number(iso[3]),Number(iso[4]||0),Number(iso[5]||0));return Number.isNaN(d.getTime())?null:d.toISOString()}
  const ar=raw.match(/(\d{1,2})\/(\d{1,2})\/(20\d{2})[^\d]*(\d{1,2}):(\d{2})\s*([صم])/);
  if(ar){let h=Number(ar[4]);if(ar[6]==='م'&&h<12)h+=12;if(ar[6]==='ص'&&h===12)h=0;const d=new Date(Number(ar[3]),Number(ar[2])-1,Number(ar[1]),h,Number(ar[5]));return Number.isNaN(d.getTime())?null:d.toISOString()}
  const d=new Date(raw);return Number.isNaN(d.getTime())?null:d.toISOString();
}
function displayNumber(value){return new Intl.NumberFormat('ar-DZ',{minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(value)||0)}
function simpleHash(text){let h=2166136261;for(const ch of String(text||'')){h^=ch.codePointAt(0);h=Math.imul(h,16777619)}return (h>>>0).toString(36)}
function headerSignature(headers){return [...new Set(headers.map(cleanHeader).filter(Boolean))].sort().join('|')}
function normalizeFileFamily(name){return normalizeText(String(name||'').replace(/\.[^.]+$/,'').replace(/\s*\(\d+\)\s*$/,'').replace(/[_-]?20\d{2}[-_.]?\d{1,2}[-_.]?\d{1,2}/g,'').replace(/\s+/g,' '))}
function inferCellType(v){const s=String(v??'').trim();if(!s)return'empty';if(Number.isFinite(Number(s.replace(/[\s,]/g,''))))return'number';if(/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s))return'date';return'text'}
function detectDelimiter(text){
  const lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim()).slice(0,12);
  const choices=[',',';','\t','|'];let best=',',bestScore=-1;
  for(const d of choices){let score=0;for(const line of lines){let c=0,q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){i++;continue}q=!q}else if(ch===d&&!q)c++}score=Math.max(score,c)}if(score>bestScore){bestScore=score;best=d}}
  return best;
}
function parseDelimited(text){
  const delimiter=detectDelimiter(text);const rows=[];let row=[],field='',quoted=false;const input=String(text||'').replace(/^\uFEFF/,'');
  for(let i=0;i<input.length;i++){const ch=input[i];if(ch==='"'){if(quoted&&input[i+1]==='"'){field+='"';i++}else quoted=!quoted;continue}if(ch===delimiter&&!quoted){row.push(field);field='';continue}if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&input[i+1]==='\n')i++;row.push(field);field='';if(row.some(v=>String(v??'').trim()!==''))rows.push(row);row=[];continue}field+=ch}
  row.push(field);if(row.some(v=>String(v??'').trim()!==''))rows.push(row);return rows;
}
function jsonTables(data){
  const tables=[];
  const add=(name,arr)=>{if(!Array.isArray(arr)||!arr.length)return;const objs=arr.filter(v=>v&&typeof v==='object'&&!Array.isArray(v));if(objs.length!==arr.length)return;const keys=[...new Set(objs.flatMap(o=>Object.keys(o)))];if(!keys.length)return;tables.push({sheetName:name,matrix:[keys,...objs.map(o=>keys.map(k=>o[k]??''))]})};
  if(Array.isArray(data))add('JSON',data);else if(data&&typeof data==='object'){for(const [k,v] of Object.entries(data))add(k,v);if(!tables.length){const keys=Object.keys(data);if(keys.length)tables.push({sheetName:'JSON',matrix:[keys,keys.map(k=>data[k])]})}}
  return tables;
}
async function extractTables(file){
  const ext=(file.name.split('.').pop()||'').toLowerCase();
  if(ext==='json'){const text=await file.text();return jsonTables(JSON.parse(text))}
  if(['xlsx','xls'].includes(ext)){
    if(!window.XLSX)throw new Error('قارئ Excel غير متاح حاليًا. أعد فتح الصفحة مع الإنترنت.');
    const buf=await file.arrayBuffer();const wb=window.XLSX.read(buf,{type:'array',cellDates:false});
    return wb.SheetNames.map(name=>({sheetName:name,matrix:window.XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:false,defval:''})})).filter(t=>t.matrix.some(r=>Array.isArray(r)&&r.some(v=>String(v??'').trim())));
  }
  const text=await file.text();
  if(ext==='txt'&&String(text).trim().startsWith('{')){try{return jsonTables(JSON.parse(text))}catch{}}
  return[{sheetName:ext==='csv'?'CSV':'TEXT',matrix:parseDelimited(text)}];
}
function findAliasIndex(headers,aliases){const hs=headers.map(cleanHeader);for(const alias of aliases){const i=hs.indexOf(cleanHeader(alias));if(i>=0)return i}return-1}
function detectMapping(headers){const out={};for(const [field,aliases] of Object.entries(FIELD_ALIASES)){const i=findAliasIndex(headers,aliases);if(i>=0)out[field]={index:i,header:String(headers[i]??'').trim()}}return out}
function rowShapeScore(row){const vals=(row||[]).filter(v=>String(v??'').trim()!=='');if(vals.length<3)return 0;return Math.min(5,vals.length/2)}
function candidateForTable(table){
  const matrix=(table.matrix||[]).filter(r=>Array.isArray(r));if(matrix.length<2)return null;let best=null;
  for(let i=0;i<Math.min(matrix.length,30);i++){
    const headers=matrix[i].map(v=>String(v??'').trim());const nonEmpty=headers.filter(Boolean).length;if(nonEmpty<3)continue;
    const mapping=detectMapping(headers);const known=Object.keys(mapping).length;const required=REQUIRED_FIELDS.filter(k=>mapping[k]).length;
    let continuity=0;for(let j=i+1;j<Math.min(matrix.length,i+6);j++)continuity+=rowShapeScore(matrix[j]);
    const score=required*25+known*7+Math.min(nonEmpty,12)+continuity;
    if(!best||score>best.score)best={score,headerRow:i,headers,mapping};
  }
  if(!best)return null;
  const marker=matrix.slice(Math.max(0,best.headerRow-3),best.headerRow).flat().map(normalizeText).filter(Boolean).join(' | ');
  const dataRows=matrix.slice(best.headerRow+1).filter(r=>r.some(v=>String(v??'').trim()!==''));
  const types=best.headers.map((h,idx)=>{const counts={number:0,text:0,date:0,empty:0};for(const row of dataRows.slice(0,25))counts[inferCellType(row[idx])]++;const type=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0]||'empty';return{header:h,type}});
  const numericCols=types.filter(x=>x.type==='number').length;const textCols=types.filter(x=>x.type==='text').length;
  const requiredCount=REQUIRED_FIELDS.filter(k=>best.mapping[k]).length;
  const likelihood=Math.min(1,requiredCount*0.18+(Object.keys(best.mapping).length-requiredCount)*0.06+(numericCols>=2?0.16:0)+(textCols>=1?0.08:0));
  return{...table,...best,marker,signature:headerSignature(best.headers),dataRowsCount:dataRows.length,types,likelihood};
}
async function analyzeFile(file){const tables=await extractTables(file);const candidates=tables.map(candidateForTable).filter(Boolean).sort((a,b)=>b.score-a.score);if(!candidates.length)throw new Error('لم أجد جدول بيانات واضحًا داخل الملف.');return{file,fileType:(file.name.split('.').pop()||'').toLowerCase(),candidate:candidates[0],tablesCount:tables.length}}
function isHanii(c){const marker=normalizeText(c.marker);const unique=c.headers.map(cleanHeader);const markerHit=HANI_MARKERS.some(x=>marker.includes(normalizeText(x)));const uniqueHits=HANI_UNIQUE.filter(x=>unique.includes(cleanHeader(x))).length;return markerHit||uniqueHits>=2}
function isTehna(c){if(isHanii(c))return false;const hs=c.headers.map(cleanHeader);const hits=TEHNA_CANONICAL.filter(x=>hs.includes(cleanHeader(x))).length;return hits>=7&&REQUIRED_FIELDS.every(k=>c.mapping[k])}
function isWafarly(c){const hs=c.headers.map(cleanHeader),hits=WAFARLY_HEADERS.filter(x=>hs.includes(cleanHeader(x))).length;return hits>=5&&hs.includes(cleanHeader('User'))&&hs.includes(cleanHeader('رصيد'))&&(hs.includes(cleanHeader('مقترض'))||hs.includes(cleanHeader('مقترض (المفوض)')))}
function builtinProfile(c){
  if(isHanii(c))return{id:'builtin:hanii-rouhek',name:'هني روحك',kind:'builtin',mapping:Object.fromEntries(Object.entries(c.mapping).map(([k,v])=>[k,v.header]))};
  if(isTehna(c))return{id:'builtin:tehna-pay',name:'تهنى باي',kind:'builtin',mapping:Object.fromEntries(Object.entries(c.mapping).map(([k,v])=>[k,v.header]))};
  if(isWafarly(c))return{id:'builtin:wafarly',name:'وفرلي',kind:'builtin-wafarly',mapping:{}};
  return null;
}
function customProfileMatch(c,profiles,fileFamily){
  const matches=profiles.filter(p=>p.signature===c.signature).map(p=>{let score=5;if(p.marker&&c.marker&&normalizeText(c.marker).includes(normalizeText(p.marker)))score+=3;if(p.fileFamily&&p.fileFamily===fileFamily)score+=2;return{p,score}}).sort((a,b)=>b.score-a.score);
  if(!matches.length)return null;if(matches.length>1&&matches[0].score===matches[1].score)return null;return matches[0].p;
}
function mappingIndexes(headers,mapping){const hs=headers.map(cleanHeader);const out={};for(const [field,header] of Object.entries(mapping||{})){const i=hs.indexOf(cleanHeader(header));if(i>=0)out[field]=i}return out}
function rowsFromCandidate(c,mapping){
  const idx=mappingIndexes(c.headers,mapping);const missing=REQUIRED_FIELDS.filter(k=>idx[k]===undefined);if(missing.length)throw new Error('لا يمكن القراءة قبل تعريف: '+missing.join('، '));
  const dedup=new Map();let auto=0;
  for(const r of c.matrix.slice(c.headerRow+1)){
    const username=String(r[idx.username]??'').trim();const first=idx.first!==undefined?String(r[idx.first]??'').trim():'';const last=idx.last!==undefined?String(r[idx.last]??'').trim():'';const store=idx.store!==undefined?String(r[idx.store]??'').trim():'';
    const phone=idx.phone!==undefined?String(r[idx.phone]??'').trim():'';const email=idx.email!==undefined?String(r[idx.email]??'').trim():'';const externalId=idx.externalId!==undefined?String(r[idx.externalId]??'').trim():'';
    const sourceCreatedAt=idx.sourceCreatedAt!==undefined?parseSourceDate(r[idx.sourceCreatedAt]):null;const sourceUpdatedAt=idx.sourceUpdatedAt!==undefined?parseSourceDate(r[idx.sourceUpdatedAt]):null;
    const sourceStatus=idx.sourceStatus!==undefined?String(r[idx.sourceStatus]??'').trim():'';
    const balance=numeric(r[idx.balance]),debt=numeric(r[idx.debt]),profit=numeric(r[idx.profit]);
    if(!username&&!first&&!last&&!store&&!phone&&!email&&!externalId&&!balance&&!debt&&!profit)continue;
    const key=normalizeText(username)||externalId||('row-'+(++auto));dedup.set(key,{key,username,first,last,store,phone,email,externalId,sourceCreatedAt,sourceUpdatedAt,sourceStatus,balance,debt,profit});
  }
  return[...dedup.values()].map((x,index)=>({...x,index}));
}
function rowsFromWafarly(c){
  const hs=c.headers.map(cleanHeader),at=h=>hs.indexOf(cleanHeader(h)),uidI=at('UID'),joinedI=at('Joined At'),userI=at('User'),balanceI=at('رصيد'),debtI=at('مقترض'),authDebtI=at('مقترض (المفوض)');
  if(userI<0||balanceI<0||(debtI<0&&authDebtI<0))throw new Error('صيغة وفرلي ناقصة الحقول المطلوبة.');
  const out=[];let auto=0;
  for(const r of c.matrix.slice(c.headerRow+1)){
    const rawUser=String(r[userI]??'').trim(),uid=uidI>=0?String(r[uidI]??'').trim():'';
    if(!rawUser&&!uid)continue;
    const pm=rawUser.match(/(?:-|\s)?(\+?213\d{9}|0[5-7]\d{8})\s*$/),phone=pm?pm[1].trim():'';
    const name=(pm?rawUser.slice(0,pm.index):rawUser).replace(/[\s-]+$/,'').trim()||rawUser;
    const balance=numeric(r[balanceI]),debt=(debtI>=0?numeric(r[debtI]):0)+(authDebtI>=0?numeric(r[authDebtI]):0),profit=0;
    const sourceCreatedAt=joinedI>=0?parseSourceDate(r[joinedI]):null;
    const key=uid||phone||normalizeText(name)||('row-'+(++auto));
    out.push({key,username:name,first:name,last:'',store:'',phone,externalId:uid,sourceCreatedAt,balance,debt,profit,profitKnown:false,index:out.length});
  }
  return out;
}
async function hashRows(rows){const stable=rows.map(r=>[normalizeText(r.username),r.first,r.last,r.store,r.phone,r.email,r.externalId,r.sourceCreatedAt,r.sourceUpdatedAt,r.balance,r.debt,r.profit]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));const text=JSON.stringify(stable);if(crypto?.subtle){const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return[...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('')}return simpleHash(text)}
function strongIdentityKeys(r){
  const out=[];
  const key=String(r?.key??'').trim();if(key)out.push('k:'+normalizeText(key));
  const u=normalizeText(r?.username);if(u)out.push('u:'+u);
  const p=String(r?.phone||'').replace(/\D/g,'');if(p)out.push('p:'+p.replace(/^00213/,'213').replace(/^0(?=[5-7]\d{8}$)/,'213'));
  const e=normalizeText(r?.email);if(e)out.push('e:'+e);
  return [...new Set(out)];
}
function rowDisplayKey(r){return normalizeText([r?.first,r?.last].filter(Boolean).join(' ').trim()||r?.store||r?.username||'')}
function mergeRowsCumulative(oldRows,incomingRows){
  const rows=(oldRows||[]).map((r,i)=>({...r,index:i}));
  const reviews=[];let added=0,updated=0,unchanged=0;
  const rebuild=()=>{
    const m=new Map();
    rows.forEach((r,i)=>strongIdentityKeys(r).forEach(k=>{const a=m.get(k)||[];a.push(i);m.set(k,a)}));
    return m;
  };
  let byKey=rebuild();
  for(const incoming of incomingRows||[]){
    const hits=new Set();
    strongIdentityKeys(incoming).forEach(k=>(byKey.get(k)||[]).forEach(i=>hits.add(i)));
    if(hits.size===1){
      const i=[...hits][0],old=rows[i];
      const next={...old,...incoming,key:old.key||incoming.key,firstSeenAt:old.firstSeenAt||new Date().toISOString(),lastSeenAt:new Date().toISOString(),index:i};
      const same=JSON.stringify([old.username,old.first,old.last,old.store,old.phone,old.email,old.balance,old.debt,old.profit])===JSON.stringify([next.username,next.first,next.last,next.store,next.phone,next.email,next.balance,next.debt,next.profit]);
      rows[i]=next;if(same)unchanged++;else updated++;
      byKey=rebuild();continue;
    }
    if(hits.size>1){
      reviews.push({kind:'strong_conflict',incoming,candidates:[...hits].map(i=>rows[i])});continue;
    }
    const nameKey=rowDisplayKey(incoming);
    const nameHits=nameKey?rows.map((r,i)=>rowDisplayKey(r)===nameKey?i:-1).filter(i=>i>=0):[];
    if(nameHits.length){
      reviews.push({kind:'name_candidate',incoming,candidates:nameHits.map(i=>rows[i])});continue;
    }
    rows.push({...incoming,firstSeenAt:new Date().toISOString(),lastSeenAt:new Date().toISOString(),index:rows.length});
    added++;byKey=rebuild();
  }
  return{rows:rows.map((r,i)=>({...r,index:i})),added,updated,unchanged,reviews};
}
function overlapRatio(a,b){const A=new Set((a||[]).map(x=>normalizeText(x.username)).filter(Boolean));const B=new Set((b||[]).map(x=>normalizeText(x.username)).filter(Boolean));if(!A.size||!B.size)return 0;let n=0;for(const x of B)if(A.has(x))n++;return n/Math.min(A.size,B.size)}
function dbOpen(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const db=req.result;for(const s of STORES)if(!db.objectStoreNames.contains(s))db.createObjectStore(s,{keyPath:'id'})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function dbAll(store){const db=await dbOpen();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly');const req=tx.objectStore(store).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close()})}
function plainStorageValue(value){
  if(value===undefined)return null;
  try{return JSON.parse(JSON.stringify(value))}
  catch(error){throw new Error('تعذر تجهيز البيانات للحفظ المحلي: '+(error?.message||'بيانات غير قابلة للحفظ'))}
}
async function dbPut(store,value){
  const db=await dbOpen(),stored=plainStorageValue(value);
  return new Promise((resolve,reject)=>{
    let tx;
    try{
      tx=db.transaction(store,'readwrite');
      tx.objectStore(store).put(stored);
    }catch(error){
      db.close();
      reject(error);
      return;
    }
    tx.oncomplete=()=>{db.close();resolve(stored)};
    tx.onabort=tx.onerror=()=>{const error=tx.error||new Error('تعذر حفظ البيانات محليًا');db.close();reject(error)};
  });
}
async function dbDelete(store,id){const db=await dbOpen();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).delete(id);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)}})}
async function copyText(text){try{await navigator.clipboard.writeText(text)}catch{const t=document.createElement('textarea');t.value=text;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove()}}
function diagnosticText(u){return[
  'تشخيص نوع حسابات جديد',
  'الملف: '+u.fileName,
  'النوع: '+u.fileType,
  'Sheet/Section: '+u.sheetName,
  'سطر العناوين: '+(u.headerRow+1),
  'عدد السجلات التقريبي: '+u.dataRowsCount,
  'بصمة Schema: '+u.signature,
  'الأعمدة: '+u.headers.join(' | '),
  'أنواع الأعمدة: '+u.types.map(x=>x.header+'='+x.type).join(' | '),
  'ما تم فهمه: '+Object.entries(u.detectedMapping||{}).map(([k,v])=>k+'→'+v).join('، '),
  'السبب: '+(u.reason||'صيغة جديدة غير معرفة'),
  'درجة احتمال بيانات حسابات: '+Math.round((u.likelihood||0)*100)+'%'
].join('\n')}
function aiPromptText(u){return[
  'أريد إضافة Reader/Profile جديد لأداة حسابات ذكية.',
  'اسم التطبيق/المصدر: '+(u.aiAppName||'غير محدد'),
  'مسار الأداة: '+(u.aiPath||'accounts-review/'),
  'نوع الملف: '+u.fileType,
  'Sheet/Section: '+u.sheetName,
  'سطر العناوين: '+(u.headerRow+1),
  'Schema: '+u.headers.join(' | '),
  'أنواع الأعمدة: '+u.types.map(x=>x.header+'='+x.type).join(' | '),
  'الحقول التي اكتشفها القارئ العام: '+Object.entries(u.detectedMapping||{}).map(([k,v])=>k+'→'+v).join('، '),
  'المشكلة/السبب: '+(u.reason||'لم يطابق Reader معروفًا'),
  'المطلوب: أنشئ Reader جديدًا داخل Registry الحالي، مع قواعد تعرف آمنة وMapping وتحقق، بدون كسر Readers الموجودة وبدون تضمين بيانات عملاء حقيقية.'
].join('\n')}

createApp({
  setup(){
    const fileInput=ref(null),sources=ref([]),profiles=ref([]),unknowns=ref([]),activeTabId=ref(''),viewMode=ref('summary'),message=ref(''),messageType=ref('ok'),limit=ref('10'),goalText=ref(''),goalTarget=ref(0),mappingOpen=ref(false),mappingDraft=ref({});
    let externalTabMode=false;
    const allTabs=computed(()=>[
      ...sources.value.map(x=>({id:x.id,kind:'source',name:x.name,updatedAt:x.updatedAt,count:x.rows?.length||0})),
      ...unknowns.value.map(x=>({id:x.id,kind:'unknown',name:x.aiAppName?('⚠ '+x.aiAppName):'⚠ نوع جديد',updatedAt:x.updatedAt,count:x.dataRowsCount||0}))
    ].sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))));
    const activeSource=computed(()=>sources.value.find(x=>x.id===activeTabId.value)||null);
    const activeUnknown=computed(()=>unknowns.value.find(x=>x.id===activeTabId.value)||null);
    const rows=computed(()=>activeSource.value?.rows||[]);
    const sourceAccounts=computed(()=>rows.value.slice().sort((a,b)=>(Number(b.debt)||0)-(Number(a.debt)||0)||String(displayName(a)).localeCompare(String(displayName(b)),'ar')));
    const debtors=computed(()=>rows.value.filter(x=>x.debt>0).slice().sort((a,b)=>b.debt-a.debt));
    const totalDebt=computed(()=>rows.value.reduce((s,x)=>s+x.debt,0));
    const totalBalance=computed(()=>rows.value.reduce((s,x)=>s+x.balance,0));
    const totalProfit=computed(()=>rows.value.reduce((s,x)=>s+x.profit,0));
    const visibleDebtors=computed(()=>limit.value==='all'?debtors.value:debtors.value.slice(0,Number(limit.value)||10));
    const goalPlan=computed(()=>{const customers=[];let total=0;const target=goalTarget.value;if(target<=0)return{customers,total};for(const c of debtors.value){if(total>=target)break;customers.push(c);total+=c.debt}return{customers,total}});
    const unknownPreview=computed(()=>activeUnknown.value?.previewRows||[]);
    const unknownTotals=computed(()=>({debt:unknownPreview.value.reduce((s,x)=>s+x.debt,0),balance:unknownPreview.value.reduce((s,x)=>s+x.balance,0),profit:unknownPreview.value.reduce((s,x)=>s+x.profit,0)}));
    function setMessage(text,type='ok'){message.value=text;messageType.value=type}
    function pickFile(){fileInput.value?.click()}
    function selectTab(tab){externalTabMode=false;activeTabId.value=tab.id;viewMode.value=tab.kind==='source'?'accounts':'unknown';goalTarget.value=0;goalText.value='';window.dispatchEvent(new CustomEvent('accounts-source-selected',{detail:{id:tab.id,kind:tab.kind}}))}
    function linkOrAdd(customer){const s=activeSource.value;if(!s||!customer)return;window.dispatchEvent(new CustomEvent('accounts-link-request',{detail:{sourceId:s.id,rowKey:String(customer.key)}}))}
    function displayName(c){return[c.first,c.last].filter(Boolean).join(' ').trim()||c.store||'بدون اسم'}
    function normalizeGoal(){goalTarget.value=Math.max(0,numeric(goalText.value));goalText.value=goalTarget.value?String(goalTarget.value):''}
    function summaryText(){const s=activeSource.value;if(!s)return'';let out=s.name+' — مراجعة الحسابات\nإجمالي الديون: '+displayNumber(totalDebt.value)+'\nإجمالي الأرصدة: '+displayNumber(totalBalance.value)+'\nإجمالي الأرباح: '+displayNumber(totalProfit.value);if(goalTarget.value>0){out+='\n\nهدف التحصيل: '+displayNumber(goalTarget.value)+'\nالمجموع المقترح: '+displayNumber(goalPlan.value.total)+'\nالعملاء:';goalPlan.value.customers.forEach((c,i)=>{out+='\n'+(i+1)+'. '+displayName(c)+' | '+(c.username||'—')+' | '+displayNumber(c.debt)})}return out}
    async function copySummary(){if(!activeSource.value)return;await copyText(summaryText());window.MyToolBottomNav?.toast('تم نسخ الملخص')}
    async function copyDiagnostic(){const u=activeUnknown.value;if(!u)return;await copyText(diagnosticText(u));window.MyToolBottomNav?.toast('تم نسخ التشخيص')}
    async function copyAiPrompt(){const u=activeUnknown.value;if(!u)return;await saveUnknownMeta();await copyText(aiPromptText(u));window.MyToolBottomNav?.toast('تم نسخ أمر الذكاء الاصطناعي')}
    function isWafarlyName(value){const n=normalizeText(value).replace(/\s+/g,'');return n.includes('وفرلي')||n.includes('وفريلي')||n.includes('wafarly')||n.includes('wafrly')||n.includes('wafri')}
    async function promoteWafarlyUnknowns(){
      const candidates=unknowns.value.filter(u=>isWafarlyName(u.aiAppName)||isWafarlyName(u.fileFamily)||isWafarlyName(u.fileName)||isWafarly({headers:u.headers||[]}));let changed=false;
      for(const u of candidates){
        let parsed=[];try{parsed=rowsFromWafarly({matrix:u.matrix,headerRow:u.headerRow,headers:u.headers})}catch{parsed=[]}
        if(!parsed.length)continue;
        const sourceName='وفرلي',id='builtin:wafarly',now=new Date().toISOString(),hash=await hashRows(parsed);
        const source={id,name:sourceName,readerId:id,readerKind:'builtin-wafarly',signature:u.signature,fileName:u.fileName,fileFamily:u.fileFamily,fileType:u.fileType,sheetName:u.sheetName,headerRow:u.headerRow,contentHash:hash,rows:parsed,updatedAt:now};
        await dbPut('sources',source);window.dispatchEvent(new CustomEvent('accounts-source-updated',{detail:{sourceId:source.id}}));await dbDelete('unknown',u.id);changed=true;
      }
      return changed;
    }
    async function refreshState(){
      sources.value=await dbAll('sources');profiles.value=await dbAll('profiles');unknowns.value=await dbAll('unknown');
      if(await promoteWafarlyUnknowns()){sources.value=await dbAll('sources');profiles.value=await dbAll('profiles');unknowns.value=await dbAll('unknown');window.dispatchEvent(new Event('accounts-identities-updated'))}
      if(activeTabId.value&&!allTabs.value.some(x=>x.id===activeTabId.value))activeTabId.value='';
      if(!externalTabMode&&!activeTabId.value&&allTabs.value.length)activeTabId.value=allTabs.value[0].id
    }
    async function saveUnknownMeta(){const u=activeUnknown.value;if(!u)return;u.updatedAt=new Date().toISOString();await dbPut('unknown',JSON.parse(JSON.stringify(u)))}
    async function reanalyzeUnknown(){const u=activeUnknown.value;if(!u)return;const c=candidateForTable({sheetName:u.sheetName,matrix:u.matrix});if(!c){setMessage('تعذر إعادة تحليل البيانات المحفوظة.','err');return}await processAnalysis({file:{name:u.fileName},fileType:u.fileType,candidate:c,tablesCount:1})}
    function detectedMappingHeaders(c){return Object.fromEntries(Object.entries(c.mapping||{}).map(([k,v])=>[k,v.header]))}
    function unknownRecord(analysis,reason,previewRows=[]){const c=analysis.candidate;const id='unknown:'+simpleHash(c.signature+'|'+normalizeText(c.marker)+'|'+normalizeFileFamily(analysis.file.name));return{id,fileName:analysis.file.name,fileFamily:normalizeFileFamily(analysis.file.name),fileType:analysis.fileType,sheetName:c.sheetName||'',headerRow:c.headerRow,headers:c.headers,signature:c.signature,marker:c.marker,types:c.types,dataRowsCount:c.dataRowsCount,likelihood:c.likelihood,detectedMapping:detectedMappingHeaders(c),matrix:c.matrix,reason,previewRows,aiAppName:'',aiPath:'accounts-review/',updatedAt:new Date().toISOString()}}
    async function saveUnknown(rec){const existing=unknowns.value.find(x=>x.id===rec.id);if(existing){rec.aiAppName=existing.aiAppName||rec.aiAppName;rec.aiPath=existing.aiPath||rec.aiPath}await dbPut('unknown',rec);await refreshState();activeTabId.value=rec.id;viewMode.value='unknown'}
    async function processAnalysis(analysis){
      const c=analysis.candidate;const family=normalizeFileFamily(analysis.file.name);let profile=builtinProfile(c)||customProfileMatch(c,profiles.value,family);let mapping=profile?.mapping||detectedMappingHeaders(c);let parsed=[];
      const complete=REQUIRED_FIELDS.every(k=>mapping[k]);
      if(profile?.kind==='builtin-wafarly'){try{parsed=rowsFromWafarly(c)}catch{parsed=[]}}
      else if(complete){try{parsed=rowsFromCandidate(c,mapping)}catch{parsed=[]}}
      if(!profile){const reason=complete?'صيغة حسابات قابلة للقراءة لكنها غير معرفة كمصدر بعد.':'صيغة جديدة وتحتاج تعريف بعض الأعمدة.';await saveUnknown(unknownRecord(analysis,reason,parsed));setMessage(complete?'تم فهم البيانات تلقائيًا. أعطِ النوع اسمًا من «تعريف» ليُحفظ كقارئ دائم.':'تم تسجيل نوع جديد ويحتاج تعريفًا.','ok');return}
      if(!parsed.length)throw new Error('Reader معروف لكن لم ينتج سجلات صالحة.');
      const hash=await hashRows(parsed);const existing=sources.value.find(x=>x.id===profile.id);
      if(existing&&existing.contentHash===hash){activeTabId.value=existing.id;setMessage('هذا الملف مطابق لآخر دفعة محفوظة؛ لم يتم إنشاء نسخة مكررة.');if(!existing.remoteSyncedAt||existing.remoteSyncHash!==hash)window.dispatchEvent(new CustomEvent('accounts-source-updated',{detail:{sourceId:existing.id}}));return}
      const merged=mergeRowsCumulative(existing?.rows||[],parsed);
      const now=new Date().toISOString();
      const imports=[...(existing?.imports||[]),{fileName:analysis.file.name,fileFamily:family,contentHash:hash,importedAt:now,rows:parsed.length,added:merged.added,updated:merged.updated,unchanged:merged.unchanged,needsReview:merged.reviews.length}].slice(-200);
      const source={...(existing||{}),id:profile.id,name:profile.name,readerId:profile.id,readerKind:profile.kind||'custom',signature:c.signature,fileName:analysis.file.name,fileFamily:family,fileType:analysis.fileType,sheetName:c.sheetName||'',headerRow:c.headerRow,contentHash:hash,rows:merged.rows,identityReviews:merged.reviews,imports,updatedAt:now};
      await dbPut('sources',source);window.dispatchEvent(new CustomEvent('accounts-source-updated',{detail:{sourceId:source.id}}));await refreshState();activeTabId.value=source.id;viewMode.value='summary';
      setMessage((existing?'تم دمج التحديث داخل ':'تم إنشاء ')+source.name+': جديد '+merged.added+' · تحديث '+merged.updated+' · بدون تغيير '+merged.unchanged+(merged.reviews.length?' · يحتاج مراجعة هوية '+merged.reviews.length:'')+'. الحسابات الغائبة من الملف لم تُحذف.');
    }
    async function readFiles(event){const files=[...(event.target.files||[])];if(!files.length)return;let ok=0;const detected=[],failed=[];for(const file of files){try{const analysis=await analyzeFile(file),family=normalizeFileFamily(file.name),profile=builtinProfile(analysis.candidate)||customProfileMatch(analysis.candidate,profiles.value,family),label=profile?.name||'نوع جديد يحتاج تعريف';await processAnalysis(analysis);ok++;detected.push(file.name+' → '+label)}catch(error){failed.push(file.name+': '+(error?.message||'تعذر قراءة الملف.'))}}event.target.value='';if(failed.length)setMessage('تمت معالجة '+ok+' من '+files.length+' ملفات. تعذر: '+failed.join(' | '),'err');else setMessage('تمت معالجة '+ok+' ملفات وحفظها محليًا: '+detected.join(' | '));await nextTick();configureNav()}
    function openMapping(){const u=activeUnknown.value;if(!u)return;mappingDraft.value={sourceName:u.aiAppName||'',sourcePath:u.aiPath||'accounts-review/',username:u.detectedMapping?.username||'',first:u.detectedMapping?.first||'',last:u.detectedMapping?.last||'',store:u.detectedMapping?.store||'',balance:u.detectedMapping?.balance||'',debt:u.detectedMapping?.debt||'',profit:u.detectedMapping?.profit||''};mappingOpen.value=true}
    async function saveMapping(){const u=activeUnknown.value;if(!u)return;const d=mappingDraft.value;const sourceName=String(d.sourceName||'').trim();if(!sourceName){setMessage('اكتب اسم التطبيق أو المصدر أولًا.','err');return}const mapping={};for(const k of ['username','first','last','store','balance','debt','profit'])if(d[k])mapping[k]=d[k];const missing=REQUIRED_FIELDS.filter(k=>!mapping[k]);if(missing.length){setMessage('عرّف الحقول المطلوبة: '+missing.join('، '),'err');return}const id='custom:'+simpleHash(normalizeText(sourceName)+'|'+u.signature+'|'+u.fileFamily);const profile={id,name:sourceName,kind:'custom',signature:u.signature,marker:u.marker||'',fileFamily:u.fileFamily,mapping,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};const c={matrix:u.matrix,headerRow:u.headerRow,headers:u.headers};const parsed=rowsFromCandidate(c,mapping);if(!parsed.length){setMessage('لم ينتج التعريف أي حسابات.','err');return}const hash=await hashRows(parsed);const source={id,name:sourceName,readerId:id,readerKind:'custom',signature:u.signature,fileName:u.fileName,fileFamily:u.fileFamily,fileType:u.fileType,sheetName:u.sheetName,headerRow:u.headerRow,contentHash:hash,rows:parsed,updatedAt:new Date().toISOString()};await dbPut('profiles',profile);await dbPut('sources',source);window.dispatchEvent(new CustomEvent('accounts-source-updated',{detail:{sourceId:source.id}}));await dbDelete('unknown',u.id);mappingOpen.value=false;await refreshState();activeTabId.value=id;viewMode.value='summary';setMessage('تم حفظ Reader جديد باسم «'+sourceName+'». الملفات القادمة من نفس الصيغة ستُقرأ تلقائيًا.')}
    async function deleteActive(){const s=activeSource.value,u=activeUnknown.value;if(!s&&!u)return;const name=s?.name||u?.fileName||'هذا العنصر';if(!confirm('حذف البيانات المحلية لـ «'+name+'» من هذا الجهاز؟'))return;if(s)await dbDelete('sources',s.id);else await dbDelete('unknown',u.id);activeTabId.value='';await refreshState();setMessage('تم حذف البيانات المحلية.')}
    function configureNav(){
      const actions=[{slot:2,icon:'📂',label:'ملفات',title:'اختيار عدة ملفات وتحديث المصادر تلقائيًا',onClick:pickFile}];
      if(activeSource.value)actions.push({slot:4,icon:'📋',label:'نسخ',title:'نسخ ملخص المصدر الحالي',onClick:copySummary});
      if(activeUnknown.value){actions.push({slot:1,icon:'🧩',label:'تعريف',title:'تعريف النوع وربط الأعمدة',onClick:openMapping},{slot:4,icon:'📋',label:'تشخيص',title:'نسخ تشخيص النوع الجديد',onClick:copyDiagnostic},{slot:5,icon:'🤖',label:'AI',title:'نسخ أمر جاهز للذكاء الاصطناعي',onClick:copyAiPrompt})}
      const apply=()=>window.MyToolBottomNav?.setActions(actions);if(window.MyToolBottomNav)apply();else window.addEventListener('mytool-bottom-nav-ready',apply,{once:true});
    }
    watch([activeTabId,()=>activeSource.value?.id,()=>activeUnknown.value?.id],()=>nextTick(configureNav));
    onMounted(async()=>{window.addEventListener('accounts-total-selected',()=>{externalTabMode=true;activeTabId.value=''});window.addEventListener('accounts-shared-selected',()=>{externalTabMode=true;activeTabId.value=''});window.addEventListener('accounts-remote-data-updated',async()=>{await refreshState();await nextTick();configureNav()});try{await refreshState();setMessage(allTabs.value.length?'تم تحميل البيانات المحفوظة من هذا الجهاز.':'اختر ملفات المنصات من زر «اختيار عدة ملفات».');configureNav()}catch(error){setMessage('تعذر فتح التخزين المحلي: '+(error?.message||''),'err')}});
    return{fileInput,sources,profiles,unknowns,allTabs,activeTabId,activeSource,activeUnknown,viewMode,message,messageType,limit,goalText,goalTarget,rows,sourceAccounts,totalDebt,totalBalance,totalProfit,visibleDebtors,goalPlan,unknownPreview,unknownTotals,mappingOpen,mappingDraft,pickFile,readFiles,selectTab,linkOrAdd,displayName,displayNumber,normalizeGoal,copySummary,copyDiagnostic,copyAiPrompt,openMapping,saveMapping,saveUnknownMeta,reanalyzeUnknown,deleteActive};
  }
}).mount('#app');
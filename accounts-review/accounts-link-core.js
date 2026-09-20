(() => {
'use strict';
const MDB='mytool-accounts-review',MVER=2,LDB='mytool-accounts-links',LVER=1;
const norm=v=>String(v??'').trim().toLowerCase().normalize('NFKC').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/ة/g,'ه').replace(/[_-]+/g,' ').replace(/\s+/g,' ');
const email=v=>String(v??'').trim().toLowerCase();
const phone=v=>{let d=String(v??'').replace(/\D/g,'');if(d.startsWith('00213'))d=d.slice(2);if(d.startsWith('0')&&d.length===10)d='213'+d.slice(1);if(d.length===9&&/^[5-7]/.test(d))d='213'+d;return d};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>new Intl.NumberFormat('ar-DZ',{maximumFractionDigits:2}).format(Number(v)||0);
const name=r=>[r?.first,r?.last].filter(Boolean).join(' ').trim()||r?.store||r?.username||'بدون اسم';
const rid=(sid,r)=>sid+'::'+String(r?.key??(norm(r?.username)||(r?.index??'')));
const uid=()=>crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);
function open(db,v,upgrade){return new Promise((res,rej)=>{const q=indexedDB.open(db,v);if(upgrade)q.onupgradeneeded=()=>upgrade(q.result);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}
async function mall(){const db=await open(MDB,MVER);return new Promise((res,rej)=>{const tx=db.transaction('sources','readonly'),q=tx.objectStore('sources').getAll();q.onsuccess=()=>res(q.result||[]);q.onerror=()=>rej(q.error);tx.oncomplete=()=>db.close()})}
async function ldb(){return open(LDB,LVER,db=>{if(!db.objectStoreNames.contains('links'))db.createObjectStore('links',{keyPath:'id'});if(!db.objectStoreNames.contains('dismissed'))db.createObjectStore('dismissed',{keyPath:'id'})})}
async function lall(store){const db=await ldb();return new Promise((res,rej)=>{const tx=db.transaction(store,'readonly'),q=tx.objectStore(store).getAll();q.onsuccess=()=>res(q.result||[]);q.onerror=()=>rej(q.error);tx.oncomplete=()=>db.close()})}
async function lput(store,v){const db=await ldb();return new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(v);tx.oncomplete=()=>{db.close();res(v)};tx.onerror=()=>{db.close();rej(tx.error)}})}
async function ldel(store,id){const db=await ldb();return new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).delete(id);tx.oncomplete=()=>{db.close();res()};tx.onerror=()=>{db.close();rej(tx.error)}})}
const member=(s,r)=>({sourceId:s.id,sourceName:s.name,rowKey:String(r.key),username:r.username||'',phone:r.phone||'',email:r.email||''});
function resolve(m,ss){const s=ss.find(x=>x.id===m.sourceId);if(!s)return{m,s:null,r:null};let r=(s.rows||[]).find(x=>String(x.key)===String(m.rowKey));if(!r&&m.username)r=(s.rows||[]).find(x=>norm(x.username)===norm(m.username));if(!r&&m.phone)r=(s.rows||[]).find(x=>phone(x.phone)===phone(m.phone));if(!r&&m.email)r=(s.rows||[]).find(x=>email(x.email)===email(m.email));return{m,s,r}}
async function state(){const [ss,ls,ds]=await Promise.all([mall(),lall('links'),lall('dismissed')]),map=new Map();ls.forEach(l=>(l.members||[]).forEach(m=>map.set(m.sourceId+'::'+m.rowKey,l.id)));return{ss,ls,ds:new Set(ds.map(x=>x.id)),map}}
function candidate(a,b,st){if(a.s.id===b.s.id)return null;const ar=rid(a.s.id,a.r),br=rid(b.s.id,b.r),la=st.map.get(ar),lb=st.map.get(br);if(la&&lb&&la===lb)return null;const ap=phone(a.r.phone),bp=phone(b.r.phone),ae=email(a.r.email),be=email(b.r.email),au=norm(a.r.username),bu=norm(b.r.username);let by='',score=0;if(ap&&bp&&ap===bp){by='الهاتف';score=100}else if(ae&&be&&ae===be){by='الإيميل';score=95}else if(au&&bu&&au===bu&&au.length>2){by='اسم المستخدم';score=80}else return null;const bad=[];if(ap&&bp&&ap!==bp)bad.push('الهاتف مختلف');if(ae&&be&&ae!==be)bad.push('الإيميل مختلف');const id='s:'+ [ar,br].sort().join('|');if(st.ds.has(id))return null;return{id,a,b,by,score,bad,review:!!bad.length}}
function suggestions(st){const rs=[];st.ss.forEach(s=>(s.rows||[]).forEach(r=>rs.push({s,r})));const out=[];for(let i=0;i<rs.length;i++)for(let j=i+1;j<rs.length;j++){const c=candidate(rs[i],rs[j],st);if(c)out.push(c)}return out.sort((x,y)=>y.score-x.score)}
async function pair(a,b){const st=await state(),ar=rid(a.s.id,a.r),br=rid(b.s.id,b.r),la=st.map.get(ar),lb=st.map.get(br);if(la&&lb&&la===lb)return;const ls=await lall('links');let t=la?ls.find(x=>x.id===la):lb?ls.find(x=>x.id===lb):null;if(!t)t={id:'link:'+uid(),displayName:name(a.r)!=='بدون اسم'?name(a.r):name(b.r),members:[],createdAt:new Date().toISOString()};const seen=new Set(t.members.map(m=>m.sourceId+'::'+m.rowKey));for(const x of [a,b]){const m=member(x.s,x.r),k=m.sourceId+'::'+m.rowKey;if(!seen.has(k)){t.members.push(m);seen.add(k)}}if(la&&lb&&la!==lb){const other=ls.find(x=>x.id===(t.id===la?lb:la));if(other){for(const m of other.members){const k=m.sourceId+'::'+m.rowKey;if(!seen.has(k)){t.members.push(m);seen.add(k)}}await ldel('links',other.id)}}t.updatedAt=new Date().toISOString();await lput('links',t)}
async function approve(id){const st=await state(),c=suggestions(st).find(x=>x.id===id);if(c){await pair(c.a,c.b);await ldel('dismissed',id).catch(()=>{})}}
const dismiss=id=>lput('dismissed',{id,at:new Date().toISOString()});
async function addMember(id,sid,key){const st=await state(),l=st.ls.find(x=>x.id===id),s=st.ss.find(x=>x.id===sid);if(!l||!s)return{ok:false,reason:'not_found'};const r=(s.rows||[]).find(x=>String(x.key)===String(key));if(!r)return{ok:false,reason:'row_not_found'};const rk=rid(s,r),linked=st.map.get(rk);if(linked&&linked!==id)return{ok:false,reason:'linked_elsewhere'};if((l.members||[]).some(m=>m.sourceId===sid&&String(m.rowKey)===String(key)))return{ok:true,reason:'already'};l.members.push(member(s,r));l.updatedAt=new Date().toISOString();await lput('links',l);return{ok:true,reason:'added'}}
async function group(items){
  const st=await state(),clean=[],seenRows=new Set(),seenSources=new Set();
  for(const x of (items||[])){
    if(!x?.s||!x?.r)continue;
    const rowId=rid(x.s.id,x.r),sourceId=String(x.s.id);
    if(seenRows.has(rowId))continue;
    if(st.map.get(rowId))return{ok:false,reason:'linked_elsewhere'};
    if(seenSources.has(sourceId))return{ok:false,reason:'same_source'};
    seenRows.add(rowId);seenSources.add(sourceId);clean.push(x);
  }
  if(clean.length<2||seenSources.size<2)return{ok:false,reason:'need_two_sources'};
  const display=clean.map(x=>name(x.r)).find(x=>x&&x!=='بدون اسم')||'عميل مشترك',now=new Date().toISOString();
  const link={id:'link:'+uid(),displayName:display,members:clean.map(x=>member(x.s,x.r)),createdAt:now,updatedAt:now};
  await lput('links',link);
  return{ok:true,id:link.id,count:link.members.length};
}
async function unlinkMember(id,sid,key){const ls=await lall('links'),l=ls.find(x=>x.id===id);if(!l)return;l.members=l.members.filter(m=>!(m.sourceId===sid&&String(m.rowKey)===String(key)));if(l.members.length<2)await ldel('links',id);else{l.updatedAt=new Date().toISOString();await lput('links',l)}}
const unlinkAll=id=>ldel('links',id);
async function rename(id,n){const ls=await lall('links'),l=ls.find(x=>x.id===id);if(!l)return;l.displayName=String(n||'').trim()||l.displayName;l.updatedAt=new Date().toISOString();await lput('links',l)}
function unlinked(s,st){const set=new Set();st.ls.forEach(l=>l.members.forEach(m=>set.add(m.sourceId+'::'+m.rowKey)));return(s?.rows||[]).filter(r=>!set.has(rid(s.id,r)))}
window.MyToolAccountLinks={norm,email,phone,esc,num,name,rid,resolve,state,suggestions,pair,approve,dismiss,addMember,group,unlinkMember,unlinkAll,rename,unlinked};
window.dispatchEvent(new Event('mytool-account-links-core-ready'));
})();

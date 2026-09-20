(() => {
  'use strict';

  const DB_NAME='mytool-accounts-review';
  const DB_VERSION=2;
  const USER_ALIASES=['اسم المستخدم','username','user','login','utilisateur','المستخدم'];
  const LAST_LOGIN_ALIASES=['آخر دخول','اخر دخول','تاريخ آخر دخول','تاريخ اخر دخول','last login','last_login','lastlogin','last seen','last activity','last_activity','derniere connexion','dernière connexion','date connexion','date de connexion'];
  let totalMode=false;
  let totalSortMode='debt';
  let totalAutoEntered=false;
  let observer=null;

  function normalize(v){return String(v??'').replace(/^\uFEFF/,'').trim().toLowerCase().normalize('NFKC').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/ة/g,'ه').replace(/[_-]+/g,' ').replace(/\s+/g,' ')}
  function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function displayNumber(value){return new Intl.NumberFormat('ar-DZ',{minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(value)||0)}
  function headerIndex(headers,aliases){const hs=headers.map(normalize);for(const alias of aliases){const i=hs.indexOf(normalize(alias));if(i>=0)return i}return-1}
  function parseDateValue(value){
    if(value==null||value==='')return 0;
    if(value instanceof Date&&!Number.isNaN(value.getTime()))return value.getTime();
    if(typeof value==='number'&&Number.isFinite(value)){
      if(value>100000000000)return value;
      if(value>1000000000)return value*1000;
      if(value>20000&&value<90000)return Math.round((value-25569)*86400000);
    }
    const s=String(value).trim();if(!s)return 0;
    if(/^\d{13}$/.test(s))return Number(s);
    if(/^\d{10}$/.test(s))return Number(s)*1000;
    let m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if(m){const d=new Date(Number(m[3]),Number(m[2])-1,Number(m[1]),Number(m[4]||0),Number(m[5]||0),Number(m[6]||0));if(!Number.isNaN(d.getTime()))return d.getTime()}
    m=s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if(m){const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),Number(m[4]||0),Number(m[5]||0),Number(m[6]||0));if(!Number.isNaN(d.getTime()))return d.getTime()}
    const parsed=Date.parse(s);return Number.isNaN(parsed)?0:parsed;
  }

  function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
  async function dbAll(store){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly');const req=tx.objectStore(store).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close()})}
  async function dbPut(store,value){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value);tx.oncomplete=()=>{db.close();resolve(value)};tx.onerror=()=>{db.close();reject(tx.error)}})}
  async function dbDelete(store,id){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).delete(id);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)}})}

  function detectDelimiter(text){const lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim()).slice(0,10);const choices=[',',';','\t','|'];let best=',',score=-1;for(const d of choices){let s=0;for(const line of lines)s=Math.max(s,(line.split(d).length-1));if(s>score){score=s;best=d}}return best}
  function parseDelimited(text){const delimiter=detectDelimiter(text);const rows=[];let row=[],field='',quoted=false;const input=String(text||'').replace(/^\uFEFF/,'');for(let i=0;i<input.length;i++){const ch=input[i];if(ch==='"'){if(quoted&&input[i+1]==='"'){field+='"';i++}else quoted=!quoted;continue}if(ch===delimiter&&!quoted){row.push(field);field='';continue}if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&input[i+1]==='\n')i++;row.push(field);field='';if(row.some(v=>String(v??'').trim()))rows.push(row);row=[];continue}field+=ch}row.push(field);if(row.some(v=>String(v??'').trim()))rows.push(row);return rows}
  function jsonMatrices(data){const out=[];const add=(name,arr)=>{if(!Array.isArray(arr)||!arr.length)return;const objs=arr.filter(v=>v&&typeof v==='object'&&!Array.isArray(v));if(objs.length!==arr.length)return;const keys=[...new Set(objs.flatMap(o=>Object.keys(o)))];if(keys.length)out.push({name,matrix:[keys,...objs.map(o=>keys.map(k=>o[k]??''))]})};if(Array.isArray(data))add('JSON',data);else if(data&&typeof data==='object'){for(const [k,v] of Object.entries(data))add(k,v)}return out}
  async function fileMatrices(file){
    const ext=(file.name.split('.').pop()||'').toLowerCase();
    if(['xlsx','xls'].includes(ext)&&window.XLSX){const buf=await file.arrayBuffer();const wb=window.XLSX.read(buf,{type:'array',cellDates:true});return wb.SheetNames.map(name=>({name,matrix:window.XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:''})}))}
    const text=await file.text();if(ext==='json'||(ext==='txt'&&text.trim().startsWith('{'))){try{return jsonMatrices(JSON.parse(text))}catch{}}
    return[{name:ext==='csv'?'CSV':'TEXT',matrix:parseDelimited(text)}];
  }
  function activityCandidate(table){const matrix=(table.matrix||[]).filter(Array.isArray);let best=null;for(let i=0;i<Math.min(30,matrix.length);i++){const headers=matrix[i].map(v=>String(v??'').trim());const user=headerIndex(headers,USER_ALIASES),last=headerIndex(headers,LAST_LOGIN_ALIASES);if(user<0||last<0)continue;let valid=0;for(const row of matrix.slice(i+1,i+31)){if(String(row[user]??'').trim()&&parseDateValue(row[last]))valid++}if(!best||valid>best.valid)best={headers,user,last,headerRow:i,valid,matrix,field:headers[last]}}return best}
  async function activityFromFile(file){const tables=await fileMatrices(file);const candidates=tables.map(activityCandidate).filter(Boolean).sort((a,b)=>b.valid-a.valid);const c=candidates[0];if(!c||!c.valid)return null;const map=new Map();for(const row of c.matrix.slice(c.headerRow+1)){const username=String(row[c.user]??'').trim();if(!username)continue;const raw=row[c.last]??'',at=parseDateValue(raw);if(at)map.set(normalize(username),{raw:String(raw??'').trim(),at})}return map.size?{map,field:c.field}:null}
  async function enrichSource(file,activity){
    const sources=await dbAll('sources');if(!sources.length)return false;
    let source=sources.find(x=>String(x.fileName||'')===file.name)||null;
    if(!source){let best=null,bestRatio=0;for(const s of sources){const users=(s.rows||[]).map(r=>normalize(r.username)).filter(Boolean);if(!users.length)continue;let hit=0;for(const u of users)if(activity.map.has(u))hit++;const ratio=hit/Math.min(users.length,activity.map.size);if(ratio>bestRatio){bestRatio=ratio;best=s}}if(bestRatio>=0.25)source=best}
    if(!source)return false;
    let matched=0;source.rows=(source.rows||[]).map(row=>{const item=activity.map.get(normalize(row.username));if(!item)return row;matched++;return{...row,lastLoginRaw:item.raw,lastLoginAt:item.at}});
    if(!matched)return false;source.hasLastLogin=true;source.lastLoginField=activity.field;source.activityEnrichedAt=new Date().toISOString();await dbPut('sources',source);window.dispatchEvent(new CustomEvent('accounts-activity-updated',{detail:{sourceId:source.id,count:matched,field:activity.field}}));window.MyToolBottomNav?.toast('تم اكتشاف آخر دخول لـ '+matched+' حساب');return true;
  }
  async function enrichFiles(files){for(const file of files){try{const activity=await activityFromFile(file);if(!activity)continue;for(const delay of [650,1400,2600]){setTimeout(()=>enrichSource(file,activity).catch(()=>{}),delay)}}catch(_e){}}
  }

  function invalidUnknown(u){const m=u?.detectedMapping||{};const financial=['balance','debt','profit'].filter(k=>m[k]).length;const identity=['username','first','last','store'].filter(k=>m[k]).length;return financial===0&&identity<=1&&Number(u?.likelihood||0)<0.3}
  async function cleanupFalseUnknowns(){try{const unknowns=await dbAll('unknown');const bad=unknowns.filter(invalidUnknown);if(!bad.length)return;for(const u of bad)await dbDelete('unknown',u.id);if(document.querySelector('.unknown-box')){const guard='accounts_cleanup_reload_done';if(sessionStorage.getItem(guard)!=='1'){sessionStorage.setItem(guard,'1');location.reload();return}}window.MyToolBottomNav?.toast('تم تجاهل ملف لا يبدو ملف حسابات')}catch(_e){}
  }

  async function totalsData(){const sources=await dbAll('sources');const bySource=sources.map(s=>({id:s.id,name:s.name,count:(s.rows||[]).length,balance:(s.rows||[]).reduce((a,r)=>a+(Number(r.balance)||0),0),debt:(s.rows||[]).reduce((a,r)=>a+(Number(r.debt)||0),0),profit:(s.rows||[]).reduce((a,r)=>a+(Number(r.profit)||0),0),updatedAt:s.updatedAt})).sort((a,b)=>String(a.name).localeCompare(String(b.name),'ar'));return{rawSources:sources,sources:bySource,count:bySource.reduce((a,s)=>a+s.count,0),balance:bySource.reduce((a,s)=>a+s.balance,0),debt:bySource.reduce((a,s)=>a+s.debt,0),profit:bySource.reduce((a,s)=>a+s.profit,0)}}
  function customerName(r){return [r?.first,r?.last].filter(Boolean).join(' ').trim()||r?.store||r?.username||'بدون اسم'}
  function customerTotals(members){return{balance:members.reduce((a,x)=>a+(Number(x.row.balance)||0),0),debt:members.reduce((a,x)=>a+(Number(x.row.debt)||0),0),profit:members.reduce((a,x)=>a+(Number(x.row.profit)||0),0)}}
  function groupTotals(groups){return(groups||[]).reduce((out,g)=>{out.balance+=Number(g.balance)||0;out.debt+=Number(g.debt)||0;out.profit+=Number(g.profit)||0;return out},{balance:0,debt:0,profit:0})}
  function totalIntegrity(data,groups){const grouped=groupTotals(groups),delta={balance:grouped.balance-data.balance,debt:grouped.debt-data.debt,profit:grouped.profit-data.profit},eps=.009;return{ok:Math.abs(delta.balance)<eps&&Math.abs(delta.debt)<eps&&Math.abs(delta.profit)<eps,grouped,delta}}
  function sortLabel(){return totalSortMode==='debt'?'الدين':totalSortMode==='balance'?'الرصيد':'الأرباح'}
  function netBadge(balance,debt){const n=(Number(balance)||0)-(Number(debt)||0),cls=n<0?'negative':n>0?'positive':'zero',sign=n>0?'+':n<0?'−':'';return '<span class="customer-net '+cls+'">صافي '+sign+displayNumber(Math.abs(n))+'</span>'}
  async function customerGroups(data){
    const sources=data.rawSources||[],groups=[],used=new Set(),core=window.MyToolAccountLinks;
    if(core){try{const st=await core.state();for(const l of st.ls){const members=(l.members||[]).map(m=>core.resolve(m,st.ss)).filter(x=>x?.s&&x?.r).map(x=>({source:x.s,row:x.r}));const distinctSources=new Set(members.map(x=>x.source.id));if(members.length<2||distinctSources.size<2)continue;members.forEach(x=>used.add(core.rid(x.source.id,x.row)));groups.push({id:l.id,name:l.displayName||customerName(members[0].row),shared:true,members,...customerTotals(members)})}}catch(_e){}}
    for(const source of sources){for(const row of (source.rows||[])){const key=core?core.rid(source.id,row):source.id+'::'+String(row.key);if(used.has(key))continue;const members=[{source,row}];groups.push({id:'single:'+key,name:customerName(row),shared:false,members,...customerTotals(members)})}}
    return groups.sort((a,b)=>{const av=Number(a[totalSortMode])||0,bv=Number(b[totalSortMode])||0;if(bv!==av)return bv-av;return String(a.name||'').localeCompare(String(b.name||''),'ar')})
  }
  function customerMemberHtml(x){return '<div class="accounts-customer-member"><div><div class="accounts-name-row"><strong>'+escapeHtml(customerName(x.row))+'</strong>'+netBadge(x.row.balance,x.row.debt)+'</div><small>'+escapeHtml(x.row.username||'—')+' · '+escapeHtml(x.source.name||'—')+'</small></div><div class="accounts-member-money"><span class="metric debt">دين <b>'+displayNumber(x.row.debt)+'</b></span><span class="metric balance">رصيد <b>'+displayNumber(x.row.balance)+'</b></span><span class="metric profit">أرباح <b>'+displayNumber(x.row.profit)+'</b></span></div></div>'}
  function customerCardHtml(g){const sourceNames=[...new Set((g.members||[]).map(x=>x.source?.name).filter(Boolean))],members=g.shared?'<div class="accounts-customer-members">'+g.members.map(customerMemberHtml).join('')+'</div>':'';return '<article class="accounts-customer-card'+(g.shared?' is-shared':'')+'"><header><div><div class="accounts-name-row"><strong>'+escapeHtml(g.name)+'</strong>'+netBadge(g.balance,g.debt)+'</div><small>'+(g.shared?'مشترك في: '+sourceNames.map(escapeHtml).join('، '):'غير مشترك')+'</small></div>'+(g.shared?'<span class="shared-badge">مشترك</span>':'')+'</header>'+members+'<footer><span class="metric debt">الدين <b>'+displayNumber(g.debt)+'</b></span><span class="metric balance">الرصيد <b>'+displayNumber(g.balance)+'</b></span><span class="metric profit">الأرباح <b>'+displayNumber(g.profit)+'</b></span></footer></article>'}
  function totalText(data){const lines=['المجموع الكلي — مراجعة الحسابات','عدد المصادر: '+data.sources.length,'عدد السجلات: '+data.count,'إجمالي الديون: '+displayNumber(data.debt),'إجمالي الأرصدة: '+displayNumber(data.balance),'إجمالي الأرباح: '+displayNumber(data.profit),''];for(const s of data.sources)lines.push(s.name+' | '+s.count+' حساب | الرصيد '+displayNumber(s.balance)+' | الدين '+displayNumber(s.debt)+' | الأرباح '+displayNumber(s.profit));return lines.join('\n')}
  async function copyText(text){try{await navigator.clipboard.writeText(text);return true}catch{try{const a=document.createElement('textarea');a.value=text;a.style.position='fixed';a.style.opacity='0';document.body.appendChild(a);a.select();const ok=document.execCommand('copy');a.remove();return ok}catch{return false}}}
  async function renderTotal(){
    const data=await totalsData(),groups=await customerGroups(data),integrity=totalIntegrity(data,groups),tabs=document.querySelector('.tabs');if(!tabs)return;
    let tab=document.getElementById('accountsTotalTab');if(!tab){tab=document.createElement('button');tab.id='accountsTotalTab';tab.type='button';tab.className='tab accounts-total-tab';tab.addEventListener('click',enterTotal);tabs.prepend(tab)}
    const tabHtml='الكل <small>('+groups.length+')</small>';if(tab.innerHTML!==tabHtml)tab.innerHTML=tabHtml;
    let panel=document.getElementById('accountsTotalPanel');if(!panel){panel=document.createElement('section');panel.id='accountsTotalPanel';panel.className='panel accounts-total-panel';tabs.closest('section.panel')?.insertAdjacentElement('afterend',panel)}
    const fingerprint=JSON.stringify([totalSortMode,data.sources.map(s=>[s.id,s.count,s.balance,s.debt,s.profit]),groups.map(g=>[g.id,g.balance,g.debt,g.profit,g.members.length]),integrity.ok,integrity.delta.balance,integrity.delta.debt,integrity.delta.profit]);
    const integrityHtml=integrity.ok
      ?'<div class="accounts-total-integrity ok"><b>✓ الإجمالي مطابق للمصادر</b><span>الربط يجمّع هوية العميل فقط؛ لا يضيف ولا يحذف من الدين أو الرصيد أو الأرباح.</span></div>'
      :'<div class="accounts-total-integrity warn"><b>⚠ يوجد فرق بعد تجميع الحسابات</b><span>الدين '+displayNumber(integrity.grouped.debt)+' مقابل '+displayNumber(data.debt)+' · الرصيد '+displayNumber(integrity.grouped.balance)+' مقابل '+displayNumber(data.balance)+' · الأرباح '+displayNumber(integrity.grouped.profit)+' مقابل '+displayNumber(data.profit)+'. لا تعتمد التجميع قبل مراجعة الروابط.</span></div>';
    if(panel.dataset.totalFingerprint!==fingerprint){panel.dataset.totalFingerprint=fingerprint;panel.innerHTML='<div class="accounts-all-head"><div><h2>المجموع الكلي</h2><div class="meta">كل العملاء؛ الحسابات المشتركة تظهر كعميل واحد وباقي العملاء يظهرون أيضًا.</div></div><button type="button" class="accounts-all-sort sort-'+totalSortMode+'" data-total-sort>ترتيب: '+sortLabel()+' ↓</button></div><div class="summary accounts-total-summary"><div class="stat debt"><span>إجمالي الديون</span><strong>'+displayNumber(data.debt)+'</strong></div><div class="stat balance"><span>إجمالي الأرصدة</span><strong>'+displayNumber(data.balance)+'</strong></div><div class="stat profit"><span>إجمالي الأرباح</span><strong>'+displayNumber(data.profit)+'</strong></div></div>'+integrityHtml+'<div class="accounts-customers-list">'+(groups.length?groups.map(customerCardHtml).join(''):'<div class="empty">لا توجد حسابات.</div>')+'</div>';panel.querySelector('[data-total-sort]')?.addEventListener('click',()=>{totalSortMode=totalSortMode==='debt'?'balance':totalSortMode==='balance'?'profit':'debt';renderTotal();});}
    panel.hidden=!(totalMode&&document.getElementById('accountsTotalTab')?.classList.contains('active'));
  }
  function hideForTotal(){const app=document.getElementById('app'),tabsPanel=document.querySelector('.tabs')?.closest('section.panel'),total=document.getElementById('accountsTotalPanel');if(!app||!tabsPanel||!total)return;for(const el of [...app.children]){if(el===tabsPanel||el===total||el.classList?.contains('hero')||el.classList?.contains('msg'))continue;if(el.tagName==='SECTION'&&!el.dataset.accountsTotalHidden){el.dataset.accountsTotalHidden=el.hidden?'1':'0';el.hidden=true}}}
  function restoreAfterTotal(){document.querySelectorAll('[data-accounts-total-hidden]').forEach(el=>{el.hidden=el.dataset.accountsTotalHidden==='1';delete el.dataset.accountsTotalHidden})}
  async function enterTotal(){totalAutoEntered=true;totalMode=true;window.dispatchEvent(new Event('accounts-total-selected'));const shared=document.getElementById('accountsSharedPanel');if(shared){shared.hidden=true;shared.style.display='none'}document.querySelectorAll('.tabs .tab').forEach(x=>x.classList.remove('active'));document.getElementById('accountsTotalTab')?.classList.add('active');const total=document.getElementById('accountsTotalPanel');if(total){total.hidden=false;total.style.removeProperty('display')}await renderTotal();hideForTotal();const data=await totalsData();window.MyToolBottomNav?.setActions([{slot:2,icon:'📂',label:'ملف',title:'إضافة أو تحديث ملف',onClick:()=>document.querySelector('input[type="file"][multiple]')?.click()},{slot:4,icon:'📋',label:'نسخ الكلي',title:'نسخ المجموع الكلي',onClick:async()=>{const ok=await copyText(totalText(data));window.MyToolBottomNav?.toast(ok?'تم نسخ المجموع الكلي':'تعذر النسخ',!ok)}}])}
  function exitTotal(){const wasActive=totalMode;totalMode=false;const total=document.getElementById('accountsTotalPanel');if(total){total.hidden=true;total.style.display='none'}document.getElementById('accountsTotalTab')?.classList.remove('active');restoreAfterTotal();if(wasActive)setTimeout(()=>window.dispatchEvent(new Event('accounts-total-exit')),60)}
  async function ensureTotal(){try{const sources=await dbAll('sources');const tabs=document.querySelector('.tabs');if(!tabs)return;if(!sources.length){document.getElementById('accountsTotalTab')?.remove();document.getElementById('accountsTotalPanel')?.remove();return}await renderTotal();if(totalMode)hideForTotal()}catch(_e){}
  }

  function bind(){
    const app=document.getElementById('app');if(!app)return;
    app.addEventListener('click',event=>{const tab=event.target.closest('.tabs .tab');if(tab&&!tab.classList.contains('accounts-total-tab'))exitTotal()},true);
    window.addEventListener('accounts-source-selected',()=>{totalAutoEntered=true;exitTotal();const total=document.getElementById('accountsTotalPanel');if(total){total.hidden=true;total.style.display='none'}});
    window.addEventListener('accounts-shared-selected',()=>{totalAutoEntered=true;exitTotal();const total=document.getElementById('accountsTotalPanel');if(total){total.hidden=true;total.style.display='none'}});
    const input=app.querySelector('input[type="file"][multiple]');if(input)input.addEventListener('change',event=>{const files=[...(event.target.files||[])];if(files.length)enrichFiles(files);setTimeout(cleanupFalseUnknowns,1800)},true);
    window.addEventListener('accounts-activity-updated',()=>setTimeout(ensureTotal,100));
    observer=new MutationObserver(()=>{clearTimeout(observer._t);observer._t=setTimeout(()=>{ensureTotal();if(totalMode)hideForTotal()},120)});observer.observe(app,{childList:true,subtree:true});
    window.addEventListener('mytool-account-links-core-ready',()=>setTimeout(ensureTotal,60));
    window.addEventListener('accounts-identities-updated',()=>setTimeout(ensureTotal,80));
    setTimeout(cleanupFalseUnknowns,800);setTimeout(()=>ensureTotal(),500);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();

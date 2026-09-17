/* MyTool Notes local-first app — IndexedDB first, Supabase sync when an authenticated admin session is available. */
(() => {
  'use strict';

  const SUPABASE_URL='https://wqyebqzbbpohbnznqdjj.supabase.co';
  const SUPABASE_KEY='sb_publishable_gO4umNBMJ0AWRk19HtKd7A_9X4DibYj';
  const SUPABASE_MODULE='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
  const TYPES={BUG:'خطأ',NEEDS_CONFIRMATION:'يحتاج تأكيد عمر',AI_REQUEST:'طلب للذكاء الاصطناعي',TASK:'مهمة',IDEA:'فكرة',PRODUCT_INVENTORY:'منتج أو مخزون',REFERENCE:'مرجع',UNCATEGORIZED:'بدون تصنيف'};
  const PRIORITIES={URGENT:'عاجل',HIGH:'مرتفع',NORMAL:'عادي',LOW:'منخفض'};
  const STATUSES={NEW:'جديدة',TRIAGED:'صُنفت',NEEDS_OMAR:'تحتاج عمر',READY:'جاهزة',IN_PROGRESS:'قيد العمل',DONE:'منتهية',ARCHIVED:'مؤرشفة'};
  const AREAS={MYTOOL:'MyTool',TEHNA_CONNECT:'Tehna Connect',SHOP:'المحل',PRODUCT:'منتج',GENERAL:'عام'};
  const $=id=>document.getElementById(id);
  const store=window.MyToolNotesLocal;
  let supabase=null,user=null,hasSupabaseSession=false,remoteAvailable=false;
  let notes=[],images=[],remoteImages=[];
  let localObjectUrls=[];
  let syncRunning=false;

  if(!store){console.error('MyToolNotesLocal missing');return}

  $('typeFilter').innerHTML='<option value="">كل الأنواع</option>'+Object.entries(TYPES).map(([v,l])=>'<option value="'+v+'">'+l+'</option>').join('');

  function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function notify(text,error=false){const m=$('message');m.textContent=text;m.className='msg '+(error?'err':'ok');m.scrollIntoView({behavior:'smooth',block:'nearest'})}
  function extFromMime(type){return type==='image/png'?'png':type==='image/webp'?'webp':'jpg'}
  function displayId(n){return n.remote_id||n.id||('محلي-'+String(n.client_uuid||'').slice(0,8))}
  function syncLabel(state){
    if(state==='pending_images')return '⏳ النص مرفوع — صور بانتظار المزامنة';
    if(state==='conflict')return '⚠ تعارض — لم تتم الكتابة فوق نسخة القاعدة';
    if(state==='sync_error')return '⚠ محفوظ محليًا — تعذر الرفع';
    if(state==='pending'||state==='pending_update')return '⏳ محلي فقط — لم يُرفع بعد';
    return '✓ محفوظ في قاعدة البيانات';
  }
  function isPendingState(state){return ['pending','pending_update','pending_images','sync_error'].includes(state)}
  function noteKeyFromRemote(n){return store.noteKey(n.client_uuid||null,n.id)}
  function noteFields(n){return {body:n.body,note_type:n.note_type,priority:n.priority,status:n.status,ai_request:n.ai_request||null,project_area:n.project_area,created_at:n.created_at,updated_at:n.updated_at}}

  async function getSupabase(){
    if(supabase)return supabase;
    const mod=await import(SUPABASE_MODULE);
    supabase=mod.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{detectSessionInUrl:false}});
    return supabase;
  }

  async function detectSession(){
    try{
      const c=await getSupabase();
      const {data:{session}}=await c.auth.getSession();
      user=session?.user||null;
      hasSupabaseSession=Boolean(user);
    }catch(_e){
      user=null;hasSupabaseSession=false;
    }
  }

  async function cacheRemoteNotes(rows){
    for(const r of rows||[]){
      const key=noteKeyFromRemote(r);
      const existing=await store.getNote(key);
      if(existing&&isPendingState(existing.sync_state))continue;
      await store.putNote({
        key,
        client_uuid:r.client_uuid||null,
        remote_id:r.id,
        ...noteFields(r),
        sync_state:'synced',
        sync_error:null,
        last_remote_updated_at:r.updated_at,
        cached_at:new Date().toISOString()
      });
    }
  }

  async function loadRemote(){
    if(!hasSupabaseSession)return {ok:false,notes:[],images:[]};
    try{
      const c=await getSupabase();
      const [n,i]=await Promise.all([
        c.from('mytool_notes').select('*').order('created_at',{ascending:false}),
        c.from('mytool_note_images').select('*').order('created_at')
      ]);
      if(n.error||i.error)throw (n.error||i.error);
      let imgs=i.data||[];
      const paths=imgs.map(x=>x.object_path);
      if(paths.length){
        const {data,error}=await c.storage.from('mytool-note-images').createSignedUrls(paths,3600);
        if(!error){
          const urls=Object.fromEntries((data||[]).map((x,k)=>[paths[k],x.signedUrl]));
          imgs=imgs.map(x=>({...x,url:urls[x.object_path]||''}));
        }
      }
      remoteAvailable=true;
      await cacheRemoteNotes(n.data||[]);
      return {ok:true,notes:n.data||[],images:imgs};
    }catch(error){
      console.warn('MyTool notes remote unavailable',error);
      remoteAvailable=false;
      return {ok:false,notes:[],images:[]};
    }
  }

  async function localDisplayImages(displayNotes,remoteRows){
    localObjectUrls.forEach(url=>URL.revokeObjectURL(url));localObjectUrls=[];
    const local=await store.getImages();
    const result=[];
    const remoteByClient=new Set((remoteRows||[]).map(x=>x.client_uuid).filter(Boolean));
    for(const img of local){
      const noteExists=displayNotes.some(n=>n._key===img.note_key);
      if(!noteExists)continue;
      if(img.client_uuid&&remoteByClient.has(img.client_uuid)&&img.sync_state==='synced')continue;
      if(img.blob instanceof Blob){
        const url=URL.createObjectURL(img.blob);localObjectUrls.push(url);
        result.push({...img,url,_local:true});
      }
    }
    return result;
  }

  async function buildDisplay(remoteRows=[],remoteImageRows=[]){
    const localRows=await store.getNotes();
    const localMap=new Map(localRows.map(x=>[x.key,x]));
    const outMap=new Map();

    if(remoteAvailable){
      for(const r of remoteRows){
        const key=noteKeyFromRemote(r);
        const local=localMap.get(key);
        const base={...r,remote_id:r.id,_key:key,_mode:'remote',sync_state:'synced'};
        if(local&&isPendingState(local.sync_state))outMap.set(key,{...local,_key:key,_mode:'local'});
        else outMap.set(key,base);
      }
      for(const local of localRows){
        if(outMap.has(local.key))continue;
        if(local.sync_state==='synced')continue;
        outMap.set(local.key,{...local,_key:local.key,_mode:'local'});
      }
    }else{
      for(const local of localRows)outMap.set(local.key,{...local,_key:local.key,_mode:'local'});
    }

    notes=[...outMap.values()].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
    remoteImages=remoteImageRows||[];
    const localImgs=await localDisplayImages(notes,remoteImages);
    images=[...remoteImages.map(x=>({...x,_local:false})),...localImgs];
  }

  function noteImages(n){
    return images.filter(img=>{
      if(img._local)return img.note_key===n._key;
      return Number(img.note_id)===Number(n.remote_id||n.id);
    });
  }

  function filtered(){
    const q=$('search').value.trim().toLowerCase(),s=$('statusFilter').value,t=$('typeFilter').value;
    return notes.filter(n=>{
      const statusOk=s==='ALL'||(s==='ACTIVE'&&n.status!=='ARCHIVED')||(s!=='ACTIVE'&&s!=='ALL'&&n.status===s);
      return (!q||(String(n.body||'')+' '+String(n.ai_request||'')).toLowerCase().includes(q))&&statusOk&&(!t||n.note_type===t);
    });
  }
  function statusOptions(current){return Object.entries(STATUSES).map(([v,l])=>'<option value="'+v+'" '+(v===current?'selected':'')+'>'+l+'</option>').join('')}

  function render(){
    const rows=filtered();
    const pending=notes.filter(n=>isPendingState(n.sync_state)||n.sync_state==='conflict').length;
    $('summary').textContent='الظاهر الآن: '+rows.length+' من '+notes.length+' ملاحظة.'+(pending?' • محلي/بانتظار المزامنة: '+pending:'');
    $('list').innerHTML=rows.length?rows.map(n=>{
      const pics=noteImages(n),long=(n.body||'').length>480||((n.body||'').match(/\n/g)||[]).length>7;
      const key=esc(n._key);
      const pickValue=n._mode==='remote'&&n.remote_id?String(n.remote_id):n._key;
      const localMode=n._mode!=='remote';
      const syncBadge='<span class="badge sync '+esc(n.sync_state||'synced')+'">'+esc(syncLabel(n.sync_state||'synced'))+'</span>';
      return '<article class="note" data-note-key="'+key+'" data-note-mode="'+(localMode?'local':'remote')+'"><div class="note-head"><div class="selectline"><input class="pick" type="checkbox" value="'+esc(pickValue)+'"><strong>#'+esc(displayId(n))+'</strong></div><div class="badges"><span class="badge">'+esc(TYPES[n.note_type]||n.note_type)+'</span><span class="badge '+esc(String(n.priority||'').toLowerCase())+'">'+esc(PRIORITIES[n.priority]||n.priority)+'</span><span class="badge">'+esc(AREAS[n.project_area]||n.project_area)+'</span>'+syncBadge+'</div></div><div class="note-body '+(long?'collapsed':'')+'" data-body="'+key+'">'+esc(n.body)+'</div>'+(long?'<button class="outline more" data-key="'+key+'">عرض المزيد</button>':'')+(n.ai_request?'<div class="ai"><b>المطلوب من الذكاء الاصطناعي:</b><br>'+esc(n.ai_request)+'</div>':'')+(pics.length?'<div class="images">'+pics.map(p=>'<img src="'+esc(p.url||'')+'" data-url="'+esc(p.url||'')+'" alt="'+esc(p.original_name||'صورة ملاحظة')+'">').join('')+'</div>':'')+'<div class="actions"><select class="status" data-key="'+key+'">'+statusOptions(n.status)+'</select><button class="outline archive" data-key="'+key+'">أرشفة</button></div><div class="meta">'+new Date(n.created_at).toLocaleString('ar-DZ')+(pics.length?' • '+pics.length+' صور':'')+(localMode?' • النسخة المحلية محفوظة على هذا الجهاز':'')+'</div></article>';
    }).join(''):'<div class="empty">لا توجد ملاحظات مطابقة.</div>';

    document.querySelectorAll('.status').forEach(x=>x.onchange=()=>updateStatus(x.dataset.key,x.value));
    document.querySelectorAll('.archive').forEach(x=>x.onclick=()=>updateStatus(x.dataset.key,'ARCHIVED'));
    document.querySelectorAll('.more').forEach(x=>x.onclick=()=>{const b=document.querySelector('[data-body="'+CSS.escape(x.dataset.key)+'"]'),collapsed=b?.classList.toggle('collapsed');x.textContent=collapsed?'عرض المزيد':'إخفاء'});
    document.querySelectorAll('.images img').forEach(x=>x.onclick=()=>{$('#viewer img').src=x.dataset.url;$('viewer').classList.add('open')});
    renderSyncState();
  }

  async function renderSyncState(){
    const localRows=await store.getNotes();
    const pending=localRows.filter(n=>isPendingState(n.sync_state)).length;
    const conflicts=localRows.filter(n=>n.sync_state==='conflict').length;
    const box=$('syncState'),btn=$('syncNow');
    btn.hidden=true;
    btn.disabled=syncRunning;
    if(!hasSupabaseSession){
      box.className='sync-state local';
      box.textContent='وضع الاستمرارية: الحفظ يتم على هذا الجهاز داخل IndexedDB. هذه الملاحظات ليست في قاعدة البيانات حتى تدخل لاحقًا بحساب المالك في النظام الرئيسي.'+(pending?' بانتظار المزامنة: '+pending+'.':'');
      return;
    }
    if(conflicts){
      box.className='sync-state warn';
      box.textContent='يوجد '+conflicts+' تعارض. لم يكتب MyTool فوق نسخة القاعدة تلقائيًا.';
      return;
    }
    if(pending){
      box.className='sync-state pending';
      box.textContent='محفوظ محليًا بأمان. بانتظار المزامنة مع قاعدة البيانات: '+pending+'.';
      btn.hidden=false;
      return;
    }
    box.className='sync-state synced';
    box.textContent=remoteAvailable?'متصل بقاعدة البيانات — لا توجد ملاحظات محلية معلقة.':'جلسة الإدارة موجودة، لكن قاعدة البيانات غير متاحة الآن. سيبقى الحفظ محليًا.';
  }

  function validateFiles(files){
    if(files.length>6)return 'الحد الأقصى 6 صور للملاحظة.';
    for(const f of files)if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>10485760)return 'الصورة '+f.name+' غير مدعومة أو أكبر من 10MB.';
    return '';
  }

  async function save(){
    const body=$('body').value.trim(),files=[...$('files').files];
    if(!body)return notify('اكتب الملاحظة أولًا.',true);
    const fileError=validateFiles(files);if(fileError)return notify(fileError,true);
    $('save').disabled=true;notify('جاري الحفظ المحلي…');
    try{
      const uuid=crypto.randomUUID(),key=store.noteKey(uuid,null),now=new Date().toISOString();
      await store.putNote({key,client_uuid:uuid,remote_id:null,body,note_type:$('type').value,priority:$('priority').value,status:'NEW',project_area:$('area').value,ai_request:$('ai').value.trim()||null,created_at:now,updated_at:now,sync_state:'pending',sync_error:null,last_remote_updated_at:null});
      for(const file of files){
        const imageUuid=crypto.randomUUID();
        await store.putImage({key:store.imageKey(imageUuid,null),client_uuid:imageUuid,remote_id:null,note_key:key,blob:file,original_name:file.name,mime_type:file.type,byte_size:file.size,object_path:null,sync_state:'pending',sync_error:null,created_at:now});
      }
      clearForm();
      if(hasSupabaseSession){await syncPending({quiet:true})}
      await reload();
      const saved=await store.getNote(key);
      if(saved?.sync_state==='synced')notify('تم حفظ الملاحظة ومزامنتها مع قاعدة البيانات.');
      else notify('تم حفظ الملاحظة على هذا الجهاز. ستتم مزامنتها عند توفر قاعدة البيانات ودخول الإدارة.');
    }catch(error){notify('تعذر الحفظ المحلي: '+(error?.message||error),true)}finally{$('save').disabled=false}
  }

  function clearForm(){$('body').value='';$('ai').value='';$('files').value='';$('type').value='UNCATEGORIZED';$('priority').value='NORMAL';$('area').value='MYTOOL';window.VisualChoices?.syncAll()}

  async function checkConflict(rec){
    if(!rec.remote_id||!rec.last_remote_updated_at||rec.sync_state!=='pending_update')return false;
    try{
      const c=await getSupabase();
      const {data,error}=await c.from('mytool_notes').select('updated_at').eq('id',rec.remote_id).single();
      if(error||!data)return false;
      return new Date(data.updated_at).getTime()>new Date(rec.last_remote_updated_at).getTime()+1000;
    }catch(_e){return false}
  }

  async function syncImages(rec,remoteNote){
    const localImages=await store.getImagesForNote(rec.key);
    let allOk=true;
    const c=await getSupabase();
    for(const img of localImages){
      if(img.sync_state==='synced')continue;
      try{
        let existing=null;
        if(img.client_uuid){
          const found=await c.from('mytool_note_images').select('id,object_path').eq('client_uuid',img.client_uuid).maybeSingle();
          if(!found.error)existing=found.data||null;
        }
        if(existing){
          await store.patchImage(img.key,{remote_id:existing.id,object_path:existing.object_path,sync_state:'synced',sync_error:null});
          continue;
        }
        const path=user.id+'/'+remoteNote.id+'/'+img.client_uuid+'.'+extFromMime(img.mime_type);
        const up=await c.storage.from('mytool-note-images').upload(path,img.blob,{contentType:img.mime_type,upsert:false});
        if(up.error&&!/already exists|duplicate/i.test(String(up.error.message||up.error)))throw up.error;
        const meta=await c.from('mytool_note_images').upsert({client_uuid:img.client_uuid,note_id:remoteNote.id,object_path:path,original_name:img.original_name,mime_type:img.mime_type,byte_size:img.byte_size,created_by:user.id},{onConflict:'client_uuid'}).select('id,object_path').single();
        if(meta.error)throw meta.error;
        await store.patchImage(img.key,{remote_id:meta.data.id,object_path:meta.data.object_path,sync_state:'synced',sync_error:null});
      }catch(error){
        allOk=false;await store.patchImage(img.key,{sync_state:'sync_error',sync_error:String(error?.message||error)});
      }
    }
    return allOk;
  }

  async function syncOne(rec){
    if(!user||rec.sync_state==='conflict')return false;
    const c=await getSupabase();
    try{
      if(await checkConflict(rec)){
        await store.patchNote(rec.key,{sync_state:'conflict',sync_error:'REMOTE_CHANGED'});return false;
      }
      const payload={body:rec.body,note_type:rec.note_type,priority:rec.priority,status:rec.status,project_area:rec.project_area,ai_request:rec.ai_request||null,updated_at:rec.updated_at};
      let result;
      if(rec.remote_id){
        result=await c.from('mytool_notes').update(payload).eq('id',rec.remote_id).select('*').single();
      }else{
        result=await c.from('mytool_notes').upsert({...payload,client_uuid:rec.client_uuid,created_by:user.id,created_at:rec.created_at},{onConflict:'client_uuid'}).select('*').single();
      }
      if(result.error)throw result.error;
      const remoteNote=result.data;
      await store.patchNote(rec.key,{remote_id:remoteNote.id,last_remote_updated_at:remoteNote.updated_at,sync_state:'pending_images',sync_error:null});
      const imagesOk=await syncImages({...rec,remote_id:remoteNote.id},remoteNote);
      await store.patchNote(rec.key,{remote_id:remoteNote.id,last_remote_updated_at:remoteNote.updated_at,sync_state:imagesOk?'synced':'pending_images',sync_error:imagesOk?null:'IMAGE_SYNC_PENDING'});
      return imagesOk;
    }catch(error){
      await store.patchNote(rec.key,{sync_state:'sync_error',sync_error:String(error?.message||error)});return false;
    }
  }

  async function syncPending({quiet=false}={}){
    if(syncRunning||!hasSupabaseSession)return;
    syncRunning=true;renderSyncState();
    try{
      const rows=await store.getNotes();
      const pending=rows.filter(n=>isPendingState(n.sync_state));
      for(const rec of pending)await syncOne(rec);
      if(!quiet)notify(pending.length?'انتهت محاولة المزامنة. الملاحظات التي تعذر رفعها بقيت محفوظة محليًا.':'لا توجد ملاحظات معلقة للمزامنة.');
    }finally{syncRunning=false;renderSyncState()}
  }

  async function updateStatus(key,status){
    let rec=await store.getNote(key);
    if(!rec){
      const current=notes.find(n=>n._key===key);if(!current)return;
      rec={...current,key};
    }
    const now=new Date().toISOString();
    const nextState=rec.sync_state==='pending'?'pending':'pending_update';
    await store.putNote({...rec,key,status,updated_at:now,sync_state:nextState,sync_error:null});
    if(hasSupabaseSession)await syncPending({quiet:true});
    await reload();
    notify(status==='ARCHIVED'?'تمت الأرشفة. إذا كانت محلية ستتزامن لاحقًا.':'تم تحديث الحالة محليًا'+(hasSupabaseSession?' ومحاولة مزامنتها.':'.'));
  }

  function selected(){
    const values=[...document.querySelectorAll('.pick:checked')].map(x=>x.value);
    return notes.filter(n=>values.includes(String(n.remote_id||n.id||''))||values.includes(n._key));
  }
  function exportText(rows){return rows.map(n=>'#'+displayId(n)+' | '+(TYPES[n.note_type]||n.note_type)+' | '+(PRIORITIES[n.priority]||n.priority)+' | '+(STATUSES[n.status]||n.status)+'\nالقسم: '+(AREAS[n.project_area]||n.project_area)+'\n'+n.body+(n.ai_request?'\nالمطلوب من الذكاء الاصطناعي: '+n.ai_request:'')+(n._mode==='local'?'\n[محفوظ محليًا / حالة المزامنة: '+syncLabel(n.sync_state)+']':'')).join('\n\n---\n\n')}
  async function copySelected(){const rows=selected();if(!rows.length)return notify('حدد ملاحظة واحدة على الأقل.',true);await navigator.clipboard.writeText(exportText(rows));notify('تم نسخ الملاحظات المحددة.')}
  function download(name,type,content){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

  async function reload(){
    let remote={ok:false,notes:[],images:[]};
    if(hasSupabaseSession){
      await syncPending({quiet:true});
      remote=await loadRemote();
    }else remoteAvailable=false;
    await buildDisplay(remote.notes,remote.images);
    render();
  }

  async function init(){
    try{await store.open()}catch(error){notify('تعذر فتح التخزين المحلي: '+(error?.message||error),true);return}
    await detectSession();
    await reload();
    window.addEventListener('online',async()=>{if(hasSupabaseSession){await syncPending({quiet:true});await reload()}});
  }

  $('save').onclick=save;
  $('clear').onclick=clearForm;
  $('copy').onclick=copySelected;
  $('txt').onclick=()=>{const r=selected();if(!r.length)return notify('حدد ملاحظة واحدة على الأقل.',true);download('mytool-notes.txt','text/plain;charset=utf-8','\ufeff'+exportText(r))};
  $('json').onclick=()=>{const r=selected();if(!r.length)return notify('حدد ملاحظة واحدة على الأقل.',true);download('mytool-notes.json','application/json',JSON.stringify(r.map(n=>({...n,images:noteImages(n).map(i=>({object_path:i.object_path||null,original_name:i.original_name,mime_type:i.mime_type,byte_size:i.byte_size,sync_state:i.sync_state||'synced'}))})),null,2))};
  $('syncNow').onclick=async()=>{await syncPending();await reload()};
  ['search','statusFilter','typeFilter'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',render));
  $('viewer').onclick=()=>$('viewer').classList.remove('open');
  init();
})();
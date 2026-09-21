/* MyTool Notes #22 — edit an existing note without changing its ID or images. Local-first compatible. */
(() => {
  'use strict';

  const SUPABASE_URL='https://wqyebqzbbpohbnznqdjj.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY='sb_publishable_gO4umNBMJ0AWRk19HtKd7A_9X4DibYj';
  const TYPES={UNCATEGORIZED:'بدون تصنيف',BUG:'خطأ',NEEDS_CONFIRMATION:'يحتاج تأكيد عمر',AI_REQUEST:'طلب للذكاء الاصطناعي',TASK:'مهمة',IDEA:'فكرة',PRODUCT_INVENTORY:'منتج أو مخزون',REFERENCE:'مرجع'};
  const PRIORITIES={NORMAL:'عادي',URGENT:'عاجل',HIGH:'مرتفع',LOW:'منخفض'};
  const BASE_AREAS={MYTOOL:'MyTool',NOTES:'الملاحظات',CARDS:'معالج البطاقات',ACCOUNTS:'الحسابات',FLEXY:'فليكسي',TEHNA_CONNECT:'Tehna Connect',SHOP:'المحل',PRODUCT:'المنتج والمخزون',GENERAL:'عام',UNCLASSIFIED:'غير مصنف'};
  const AREAS={...BASE_AREAS};
  let client=null;
  let areasReady=false;

  function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function options(map,current){return Object.entries(map).map(([value,label])=>'<option value="'+esc(value)+'" '+(value===current?'selected':'')+'>'+esc(label)+'</option>').join('')}
  function localStore(){return window.MyToolNotesLocal||null}
  function displayId(note){return note?.remote_id||note?.id||('محلي-'+String(note?.client_uuid||'').slice(0,8))}

  function ensureStyles(){
    if(document.getElementById('mytool-note-edit-style'))return;
    const style=document.createElement('style');
    style.id='mytool-note-edit-style';
    style.textContent=`
.note-edit-panel{margin:12px 0;padding:12px;border:1px solid #b7d8d4;border-radius:14px;background:#f5fffd}
.note-edit-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.note-edit-grid .full{grid-column:1/-1}
.note-edit-panel label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:800;color:#475569}
.note-edit-panel textarea,.note-edit-panel input,.note-edit-panel select{width:100%;border:1px solid #cfd8df;border-radius:11px;padding:9px;background:#fff;font:inherit}
.note-edit-panel textarea{min-height:130px;resize:vertical}.note-edit-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.note-edit-actions button{min-height:40px}
.note-edit-message{margin-top:8px;font-size:12px;font-weight:800;color:#0f766e}.note-edit-message.error{color:#b42318}.note-edit-help{font-size:11px;color:#64748b;margin-top:6px}.note-head-tools{display:flex;gap:6px;align-items:center}.note-head-tools button{min-width:38px;height:38px;padding:0;border-radius:11px}.note-delete-trigger{color:#b42318!important;border-color:#fecaca!important;background:#fff7f7!important}
@media(max-width:560px){.note-edit-grid{grid-template-columns:1fr}}
`;
    document.head.appendChild(style);
  }

  async function loadAreas(){
    try{
      const c=await getClient();
      const {data,error}=await c.from('mytool_note_area_options').select('value,label').eq('enabled',true).order('label');
      if(error)throw error;
      for(const row of data||[]){const value=String(row.value||'').trim();if(value)AREAS[value]=String(row.label||value)}
    }catch(error){console.warn('MyTool note edit areas unavailable',error)}
  }

  async function getClient(){
    if(client)return client;
    const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    client=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{detectSessionInUrl:false}});
    return client;
  }

  function setMessage(panel,text,error=false){
    const el=panel.querySelector('.note-edit-message');
    if(!el)return;
    el.textContent=text||'';
    el.classList.toggle('error',!!error);
  }

  async function loadNote(ref){
    const store=localStore();
    if(store&&ref.key){
      const local=await store.getNote(ref.key);
      if(local)return {note:local,mode:'local',key:ref.key};
    }
    if(!ref.remoteId)throw new Error('NOTE_NOT_FOUND');
    const c=await getClient();
    const {data,error}=await c.from('mytool_notes').select('id,client_uuid,body,note_type,priority,status,project_area,ai_request,created_at,updated_at').eq('id',ref.remoteId).single();
    if(error||!data)throw new Error(error?.message||'NOTE_NOT_FOUND');
    return {note:data,mode:'remote',key:ref.key||null};
  }

  async function saveLocal(existing,key,payload){
    const store=localStore();
    if(!store||!key)return false;
    const nextState=existing.remote_id?'pending_update':'pending';
    await store.putNote({...existing,...payload,key,updated_at:new Date().toISOString(),sync_state:nextState,sync_error:null});
    return true;
  }

  async function deleteCurrent(article,ref,button){
    if(!confirm('حذف هذه الملاحظة نهائيًا؟'))return;
    button.disabled=true;
    try{
      const loaded=await loadNote(ref),data=loaded.note,store=localStore();
      const remoteId=Number(data.remote_id||data.id||ref.remoteId||0);
      if(remoteId){
        const c=await getClient();
        const images=await c.from('mytool_note_images').select('object_path').eq('note_id',remoteId);
        if(images.error)throw images.error;
        const paths=(images.data||[]).map(x=>x.object_path).filter(Boolean);
        if(paths.length){
          const removed=await c.storage.from('mytool-note-images').remove(paths);
          if(removed.error)throw removed.error;
        }
        const deleted=await c.from('mytool_notes').delete().eq('id',remoteId);
        if(deleted.error)throw deleted.error;
      }
      if(store&&loaded.key){
        const localImages=await store.getImagesForNote(loaded.key);
        for(const image of localImages)await store.deleteImage(image.key);
        await store.deleteNote(loaded.key);
      }
      article.remove();
      const msg=document.getElementById('message');
      if(msg){msg.textContent='تم حذف الملاحظة.';msg.className='msg ok'}
    }catch(error){
      button.disabled=false;
      const msg=document.getElementById('message');
      if(msg){msg.textContent='تعذر حذف الملاحظة: '+(error?.message||error);msg.className='msg err'}
    }
  }

  async function saveRemote(id,payload){
    if(!id)throw new Error('NOTE_ID_MISSING');
    const c=await getClient();
    const {error}=await c.from('mytool_notes').update({...payload,updated_at:new Date().toISOString()}).eq('id',id);
    if(error)throw error;
  }

  async function openEditor(article,ref,trigger){
    const existingPanel=article.querySelector('.note-edit-panel');
    if(existingPanel){existingPanel.remove();trigger.textContent='تعديل';return}
    trigger.disabled=true;trigger.textContent='…';
    try{
      const loaded=await loadNote(ref);
      const data=loaded.note;
      if(data.project_area&&!AREAS[data.project_area])AREAS[data.project_area]=data.project_area;
      const panel=document.createElement('div');
      panel.className='note-edit-panel';
      panel.innerHTML='<div class="note-edit-grid">'+
        '<label class="full">نص الملاحظة<textarea class="edit-body" maxlength="10000">'+esc(data.body||'')+'</textarea></label>'+
        '<label>النوع<select class="edit-type">'+options(TYPES,data.note_type)+'</select></label>'+
        '<label>الأولوية<select class="edit-priority">'+options(PRIORITIES,data.priority)+'</select></label>'+
        '<label>القسم<select class="edit-area">'+options(AREAS,data.project_area)+'</select></label>'+
        '<label>المطلوب من الذكاء الاصطناعي<input class="edit-ai" maxlength="2000" value="'+esc(data.ai_request||'')+'"></label>'+
        '</div><div class="note-edit-help">يبقى رقم الملاحظة نفسه، والصور الحالية لا تُحذف ولا تُعاد إنشاؤها. في وضع Local‑First يُحفظ التعديل على الجهاز أولًا ثم تتم مزامنته.</div>'+
        '<div class="note-edit-actions"><button type="button" class="primary note-edit-save">حفظ التعديل</button><button type="button" class="outline note-edit-cancel">إلغاء</button></div><div class="note-edit-message"></div>';
      const actions=article.querySelector('.actions');
      if(actions)article.insertBefore(panel,actions);else article.appendChild(panel);
      panel.querySelector('.note-edit-cancel').onclick=()=>{panel.remove();trigger.textContent='تعديل'};
      panel.querySelector('.note-edit-save').onclick=async()=>{
        const body=panel.querySelector('.edit-body').value.trim();
        if(!body){setMessage(panel,'نص الملاحظة لا يمكن أن يكون فارغًا.',true);return}
        const save=panel.querySelector('.note-edit-save');
        save.disabled=true;setMessage(panel,'جاري حفظ التعديل…');
        const payload={
          body,
          note_type:panel.querySelector('.edit-type').value,
          priority:panel.querySelector('.edit-priority').value,
          project_area:panel.querySelector('.edit-area').value,
          ai_request:panel.querySelector('.edit-ai').value.trim()||null
        };
        try{
          const savedLocally=loaded.mode==='local'&&loaded.key?await saveLocal(data,loaded.key,payload):false;
          if(!savedLocally)await saveRemote(data.remote_id||data.id||ref.remoteId,payload);
          const label=displayId(data);
          setMessage(panel,'تم حفظ الملاحظة #'+label+'.');
          try{sessionStorage.setItem('mytool_notes_edit_flash','#'+label+' تم تعديله')}catch(_e){}
          setTimeout(()=>location.reload(),350);
        }catch(error){save.disabled=false;setMessage(panel,'تعذر حفظ التعديل: '+(error?.message||error),true)}
      };
      panel.querySelector('.edit-body')?.focus();
    }catch(error){
      const msg=document.getElementById('message');
      if(msg){msg.textContent='تعذر فتح التعديل: '+(error?.message||error);msg.className='msg err'}
    }finally{
      trigger.disabled=false;
      if(!article.querySelector('.note-edit-panel'))trigger.textContent='تعديل';
      else trigger.textContent='إغلاق التعديل';
    }
  }

  function enhanceArticle(article){
    if(article.dataset.noteEditReady==='1')return;
    const pick=article.querySelector('.pick');
    const key=article.dataset.noteKey||'';
    const numericValue=Number(pick?.value||0);
    const remoteId=Number.isFinite(numericValue)&&numericValue>0?numericValue:0;
    const actions=article.querySelector('.actions');
    const head=article.querySelector('.note-head');
    if((!key&&!remoteId)||!actions||!head)return;
    article.dataset.noteEditReady='1';
    const tools=document.createElement('div');tools.className='note-head-tools';
    const button=document.createElement('button');
    button.type='button';button.className='outline note-edit-trigger note-tool';button.textContent='✎';button.title='تعديل الملاحظة';button.setAttribute('aria-label','تعديل الملاحظة');
    if(remoteId)button.dataset.id=String(remoteId);if(key)button.dataset.key=key;
    button.onclick=()=>openEditor(article,{key,remoteId},button);
    const del=document.createElement('button');
    del.type='button';del.className='outline note-delete-trigger';del.textContent='×';del.title='حذف الملاحظة';del.setAttribute('aria-label','حذف الملاحظة');
    del.onclick=()=>deleteCurrent(article,{key,remoteId},del);
    tools.append(button,del);
    head.prepend(tools);
  }

  function enhanceAll(){if(!areasReady)return;document.querySelectorAll('#list > .note').forEach(enhanceArticle)}

  function showFlash(){
    let text='';
    try{text=sessionStorage.getItem('mytool_notes_edit_flash')||'';sessionStorage.removeItem('mytool_notes_edit_flash')}catch(_e){}
    if(!text)return;
    const msg=document.getElementById('message');
    if(msg){msg.textContent=text;msg.className='msg ok'}
  }

  function start(){
    ensureStyles();
    showFlash();
    loadAreas().finally(()=>{areasReady=true;enhanceAll()});
    const list=document.getElementById('list');
    if(list)new MutationObserver(()=>enhanceAll()).observe(list,{childList:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
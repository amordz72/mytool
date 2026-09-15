/* MyTool Notes #22 — edit an existing note without changing its ID or images. */
(() => {
  'use strict';

  const SUPABASE_URL='https://wqyebqzbbpohbnznqdjj.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY='sb_publishable_gO4umNBMJ0AWRk19HtKd7A_9X4DibYj';
  const TYPES={UNCATEGORIZED:'بدون تصنيف',BUG:'خطأ',NEEDS_CONFIRMATION:'يحتاج تأكيد عمر',AI_REQUEST:'طلب للذكاء الاصطناعي',TASK:'مهمة',IDEA:'فكرة',PRODUCT_INVENTORY:'منتج أو مخزون',REFERENCE:'مرجع'};
  const PRIORITIES={NORMAL:'عادي',URGENT:'عاجل',HIGH:'مرتفع',LOW:'منخفض'};
  const AREAS={MYTOOL:'MyTool',TEHNA_CONNECT:'Tehna Connect',SHOP:'المحل',PRODUCT:'منتج',GENERAL:'عام'};
  let client=null;

  function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function options(map,current){return Object.entries(map).map(([value,label])=>'<option value="'+esc(value)+'" '+(value===current?'selected':'')+'>'+esc(label)+'</option>').join('')}

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
.note-edit-message{margin-top:8px;font-size:12px;font-weight:800;color:#0f766e}.note-edit-message.error{color:#b42318}.note-edit-help{font-size:11px;color:#64748b;margin-top:6px}
@media(max-width:560px){.note-edit-grid{grid-template-columns:1fr}}
`;
    document.head.appendChild(style);
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

  async function openEditor(article,id,trigger){
    const existing=article.querySelector('.note-edit-panel');
    if(existing){existing.remove();trigger.textContent='تعديل';return}
    trigger.disabled=true;trigger.textContent='…';
    try{
      const c=await getClient();
      const {data,error}=await c.from('mytool_notes').select('id,body,note_type,priority,project_area,ai_request').eq('id',id).single();
      if(error||!data)throw new Error(error?.message||'NOTE_NOT_FOUND');
      const panel=document.createElement('div');
      panel.className='note-edit-panel';
      panel.innerHTML='<div class="note-edit-grid">'+
        '<label class="full">نص الملاحظة<textarea class="edit-body" maxlength="10000">'+esc(data.body||'')+'</textarea></label>'+
        '<label>النوع<select class="edit-type">'+options(TYPES,data.note_type)+'</select></label>'+
        '<label>الأولوية<select class="edit-priority">'+options(PRIORITIES,data.priority)+'</select></label>'+
        '<label>القسم<select class="edit-area">'+options(AREAS,data.project_area)+'</select></label>'+
        '<label>المطلوب من الذكاء الاصطناعي<input class="edit-ai" maxlength="2000" value="'+esc(data.ai_request||'')+'"></label>'+
        '</div><div class="note-edit-help">يبقى رقم الملاحظة نفسه، والصور الحالية لا تُحذف ولا تُعاد إنشاؤها.</div>'+
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
          ai_request:panel.querySelector('.edit-ai').value.trim()||null,
          updated_at:new Date().toISOString()
        };
        const {error:updateError}=await c.from('mytool_notes').update(payload).eq('id',id);
        if(updateError){save.disabled=false;setMessage(panel,'تعذر حفظ التعديل: '+updateError.message,true);return}
        setMessage(panel,'تم حفظ الملاحظة #'+id+'.');
        try{sessionStorage.setItem('mytool_notes_edit_flash','#'+id+' تم تعديله')}catch(_e){}
        setTimeout(()=>location.reload(),350);
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
    const id=Number(pick?.value||0);
    const actions=article.querySelector('.actions');
    if(!id||!actions)return;
    article.dataset.noteEditReady='1';
    const button=document.createElement('button');
    button.type='button';
    button.className='outline note-edit-trigger note-tool';
    button.textContent='تعديل';
    button.dataset.id=String(id);
    button.onclick=()=>openEditor(article,id,button);
    const archive=actions.querySelector('.archive');
    if(archive)actions.insertBefore(button,archive);else actions.appendChild(button);
  }

  function enhanceAll(){document.querySelectorAll('#list > .note').forEach(enhanceArticle)}

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
    enhanceAll();
    const list=document.getElementById('list');
    if(list)new MutationObserver(()=>enhanceAll()).observe(list,{childList:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

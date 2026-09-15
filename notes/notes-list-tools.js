/* MyTool notes Tasks #82/#91/#92/#95/#102/#104/#107 — pagination, persistent page size, bulk actions, export filenames, image downloads, fixed contextual nav and tabs. */
(function(){
  'use strict';

  const notesToolsScript=document.currentScript;
  const myToolRoot=new URL('../',notesToolsScript?.src||location.href);
  const NAV_VERSION='20260916-context-nav-1';
  function loadBottomNav(){
    if(!document.querySelector('link[data-mytool-bottom-nav]')){
      const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('mytool-bottom-nav.css?v='+NAV_VERSION,myToolRoot).href;link.dataset.mytoolBottomNav='1';document.head.appendChild(link);
    }
    if(!document.querySelector('script[data-mytool-bottom-nav]')){
      const nav=document.createElement('script');nav.src=new URL('mytool-bottom-nav.js?v='+NAV_VERSION,myToolRoot).href;nav.defer=true;nav.dataset.mytoolBottomNav='1';nav.dataset.root=myToolRoot.href;nav.dataset.app='notes';document.head.appendChild(nav);
    }
  }

  const PAGE_SIZE_KEY='mytool.notes.pageSize';
  const PAGE_SIZES=[3,5,10,20];
  const DEFAULT_PAGE_SIZE=3;
  let page=1;
  let pageSize=readPageSize();
  let queued=false;

  function readPageSize(){
    try{const saved=Number(localStorage.getItem(PAGE_SIZE_KEY));return PAGE_SIZES.includes(saved)?saved:DEFAULT_PAGE_SIZE}catch{return DEFAULT_PAGE_SIZE}
  }
  function savePageSize(value){try{localStorage.setItem(PAGE_SIZE_KEY,String(value))}catch{}}
  function stamp(){const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'_'+p(d.getHours())+'-'+p(d.getMinutes())+'-'+p(d.getSeconds())}
  function selectedPicks(){return [...document.querySelectorAll('.pick:checked')]}
  function selectedIds(){return selectedPicks().map(x=>Number(x.value)).filter(Number.isFinite).sort((a,b)=>a-b)}
  function filenameWords(){
    const first=selectedPicks()[0]?.closest('.note')?.querySelector('.note-body')?.textContent||'';
    return first.trim().split(/\s+/).filter(Boolean).slice(0,4).join('-').replace(/[\\/:*?"<>|#%&{}$!'@+=`~^;,]+/g,'').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,48);
  }
  function exportFilename(ext){const ids=selectedIds();const idPart=ids.length===1?'note-'+ids[0]:(ids.length?'notes-'+ids.join('-'):'notes');const words=filenameWords();return 'mytool-'+idPart+(words?'-'+words:'')+'-'+stamp()+'.'+ext}
  function patchLegacyDownloadNames(){
    if(HTMLAnchorElement.prototype.__mytoolNotesPatched)return;
    const nativeClick=HTMLAnchorElement.prototype.click;Object.defineProperty(HTMLAnchorElement.prototype,'__mytoolNotesPatched',{value:true});
    HTMLAnchorElement.prototype.click=function(){if(this.download==='mytool-notes.txt')this.download=exportFilename('txt');else if(this.download==='mytool-notes.json')this.download=exportFilename('json');return nativeClick.call(this)};
  }
  function runLocalWithoutJump(action){
    const y=window.scrollY,x=window.scrollX;const message=document.getElementById('message');let restoreMessage=null;
    if(message){const hadOwn=Object.prototype.hasOwnProperty.call(message,'scrollIntoView');const previous=message.scrollIntoView;try{message.scrollIntoView=()=>{};restoreMessage=()=>{try{if(hadOwn)message.scrollIntoView=previous;else delete message.scrollIntoView}catch{}}}catch{}}
    action();[0,80,220,500].forEach(delay=>setTimeout(()=>window.scrollTo({top:y,left:x,behavior:'auto'}),delay));if(restoreMessage)setTimeout(restoreMessage,1200);
  }
  function ensureStyles(){
    if(document.getElementById('notes-list-tools-style'))return;
    const style=document.createElement('style');style.id='notes-list-tools-style';style.textContent=`
.note .selectline .pick{display:inline-block!important;width:22px!important;height:22px!important;min-width:22px;accent-color:var(--teal,#117f78);cursor:pointer}
.note .selectline{min-height:30px}.note .selectline:has(.pick:checked){color:var(--teal,#117f78)}
.notes-pager{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;background:#fff;border:1px solid var(--line,#d9e1e7);border-radius:16px;padding:10px 12px;margin:2px 0 150px;box-shadow:0 5px 18px #102a4310}
.notes-pager[hidden]{display:none!important}.notes-pager button{min-width:88px;padding:9px 12px}.notes-page-info{font-weight:800;color:#334155}.notes-page-size{display:flex;align-items:center;gap:7px;font-size:13px;color:#64748b}.notes-page-size select{width:auto!important;min-width:68px;padding:8px!important;border-radius:10px!important}
.mytool-notes-fixed-pagination .notes-pager .notes-prev,.mytool-notes-fixed-pagination .notes-pager .notes-next{display:none!important}
.notes-selection-bar{position:fixed;z-index:96;left:50%;bottom:calc(86px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);width:min(720px,calc(100vw - 24px));display:none;grid-template-columns:auto repeat(3,minmax(0,1fr)) auto;gap:7px;align-items:center;padding:9px;background:#0f2f35f2;color:#fff;border:1px solid #ffffff2b;border-radius:18px;box-shadow:0 16px 40px #0f172a45;backdrop-filter:blur(10px)}
.notes-selection-bar.open{display:grid}.notes-selection-count{min-width:36px;text-align:center;font-weight:900}.notes-selection-bar button{min-height:42px;padding:8px 10px!important;border-radius:11px!important;background:#fff!important;color:#0f6f69!important;border:0!important}.notes-selection-bar .clear-selection{background:#ffffff18!important;color:#fff!important;border:1px solid #ffffff40!important}
.note-image-item{position:relative;flex:0 0 auto;display:inline-block}.note-image-item img{display:block}.note-image-download{position:absolute;left:5px;bottom:5px;width:30px;height:30px;min-width:30px!important;padding:0!important;border-radius:9px!important;background:#102a43db!important;color:#fff!important;border:1px solid #ffffff55!important;box-shadow:0 3px 9px #0003;font-size:15px;line-height:1}
.note-image-download:disabled{opacity:.65;cursor:wait}
@media(max-width:560px){.notes-selection-bar{grid-template-columns:repeat(4,minmax(0,1fr));}.notes-selection-count{grid-column:1/-1}.notes-selection-bar .clear-selection{grid-column:1/-1}.notes-pager{margin-bottom:190px}.notes-pager button{min-width:74px}}
`;document.head.appendChild(style);
  }
  function ensurePager(){let pager=document.getElementById('notesPager');if(pager)return pager;const list=document.getElementById('list');if(!list)return null;pager=document.createElement('div');pager.id='notesPager';pager.className='notes-pager';list.insertAdjacentElement('afterend',pager);return pager}
  function renderPager(total){
    const pager=ensurePager();if(!pager)return;if(!total){pager.hidden=true;return}pager.hidden=false;
    const pages=Math.max(1,Math.ceil(total/pageSize));page=Math.min(Math.max(1,page),pages);const from=(page-1)*pageSize+1,to=Math.min(total,page*pageSize);
    pager.innerHTML='<button type="button" class="outline notes-prev" '+(page<=1?'disabled':'')+'>السابق</button>'+'<span class="notes-page-info">'+from+'–'+to+' من '+total+' • صفحة '+page+'/'+pages+'</span>'+'<button type="button" class="outline notes-next" '+(page>=pages?'disabled':'')+'>التالي</button>'+'<label class="notes-page-size">عدد الملاحظات <select data-visual-choice="off">'+PAGE_SIZES.map(n=>'<option value="'+n+'" '+(n===pageSize?'selected':'')+'>'+n+'</option>').join('')+'</select></label>';
    pager.querySelector('.notes-prev').onclick=()=>{if(page>1){page--;refresh()}};pager.querySelector('.notes-next').onclick=()=>{if(page<pages){page++;refresh()}};
    pager.querySelector('select').onchange=e=>{const value=Number(e.target.value);if(!PAGE_SIZES.includes(value))return;pageSize=value;page=1;savePageSize(value);refresh()};
  }
  function ensureSelectionBar(){
    let bar=document.getElementById('notesSelectionBar');if(bar)return bar;bar=document.createElement('div');bar.id='notesSelectionBar';bar.className='notes-selection-bar';bar.setAttribute('role','region');bar.setAttribute('aria-label','إجراءات الملاحظات المحددة');
    bar.innerHTML='<span class="notes-selection-count">0</span><button type="button" data-bulk="copy">🤖 AI</button><button type="button" data-bulk="txt">TXT</button><button type="button" data-bulk="json">JSON</button><button type="button" class="clear-selection">إلغاء التحديد</button>';
    bar.querySelectorAll('[data-bulk]').forEach(button=>button.onclick=()=>runLocalWithoutJump(()=>document.getElementById(button.dataset.bulk)?.click()));bar.querySelector('.clear-selection').onclick=()=>{document.querySelectorAll('.pick:checked').forEach(x=>x.checked=false);updateSelectionBar()};document.body.appendChild(bar);return bar;
  }
  function updateSelectionBar(){const bar=ensureSelectionBar();const count=selectedPicks().length;bar.querySelector('.notes-selection-count').textContent=count+' محدد';bar.classList.toggle('open',count>0)}
  function extensionFromBlob(blob,fallback='jpg'){if(blob.type==='image/png')return 'png';if(blob.type==='image/webp')return 'webp';if(blob.type==='image/gif')return 'gif';if(blob.type==='image/jpeg')return 'jpg';return fallback}
  async function downloadImage(img,button,index){
    const article=img.closest('.note');const noteId=article?.querySelector('.pick')?.value||'note';const url=img.dataset.url||img.src;const original=(img.alt||'').trim();const originalExt=(original.match(/\.([a-zA-Z0-9]{2,5})$/)||[])[1]?.toLowerCase()||'jpg';button.disabled=true;const old=button.textContent;button.textContent='…';
    try{const response=await fetch(url,{credentials:'omit'});if(!response.ok)throw new Error('HTTP '+response.status);const blob=await response.blob();const objectUrl=URL.createObjectURL(blob);const a=document.createElement('a');a.href=objectUrl;a.download='mytool-note-'+noteId+'-image-'+index+'-'+stamp()+'.'+extensionFromBlob(blob,originalExt);a.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),1500)}catch(error){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener';a.download='mytool-note-'+noteId+'-image-'+index+'-'+stamp()+'.'+originalExt;a.click();console.warn('MyTool note image fallback download',error)}finally{button.disabled=false;button.textContent=old}
  }
  function enhanceImages(article){[...article.querySelectorAll('.images img')].forEach((img,index)=>{if(img.dataset.downloadReady)return;img.dataset.downloadReady='1';const wrapper=document.createElement('span');wrapper.className='note-image-item';img.parentNode.insertBefore(wrapper,img);wrapper.appendChild(img);const button=document.createElement('button');button.type='button';button.className='note-image-download';button.textContent='⬇';button.title='تحميل الصورة';button.setAttribute('aria-label','تحميل الصورة '+(index+1));button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();downloadImage(img,button,index+1)});wrapper.appendChild(button)})}
  function refresh(){queued=false;const notes=[...document.querySelectorAll('#list > .note')];const pages=Math.max(1,Math.ceil(notes.length/pageSize));page=Math.min(Math.max(1,page),pages);const start=(page-1)*pageSize,end=start+pageSize;notes.forEach((article,index)=>{article.hidden=index<start||index>=end;const pick=article.querySelector('.pick');if(pick){pick.title='تحديد الملاحظة #'+pick.value;pick.setAttribute('aria-label','تحديد الملاحظة #'+pick.value)}enhanceImages(article)});renderPager(notes.length);updateSelectionBar()}
  function scheduleRefresh(){if(queued)return;queued=true;queueMicrotask(refresh)}
  function preserveBulkSelectionAroundNoteTool(event){const tool=event.target.closest?.('.note-tool');if(!tool)return;const ids=new Set(selectedIds());setTimeout(()=>{document.querySelectorAll('.pick').forEach(x=>x.checked=ids.has(Number(x.value)));updateSelectionBar()},0)}
  function start(){loadBottomNav();ensureStyles();patchLegacyDownloadNames();ensureSelectionBar();['search','statusFilter','typeFilter'].forEach(id=>{const element=document.getElementById(id);if(!element)return;const event=id==='search'?'input':'change';element.addEventListener(event,()=>{page=1;setTimeout(scheduleRefresh,0)})});document.addEventListener('change',event=>{if(event.target.matches?.('.pick'))updateSelectionBar()});document.addEventListener('click',preserveBulkSelectionAroundNoteTool,true);const list=document.getElementById('list');if(list)new MutationObserver(scheduleRefresh).observe(list,{childList:true});scheduleRefresh()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
(()=>{
  // Quick options are created only when enabled; they are not part of the base HTML markup.
  const KEYS={
    trim:'mytool.cards.trim',
    detect:'mytool.cards.autoDetect',
    process:'mytool.cards.autoProcess',
    showMainOptions:'mytool.cards.showMainOptions'
  };
  const SESSION={
    text:'mytool.cards.session.text',
    filename:'mytool.cards.session.filename',
    type:'mytool.cards.session.type'
  };
  const text=document.getElementById('text'),file=document.getElementById('file'),processBtn=document.getElementById('process'),result=document.getElementById('result'),status=document.getElementById('status'),hint=document.getElementById('hint'),fname=document.getElementById('fname'),tabs=document.getElementById('tabs');
  if(!text||!file||!processBtn)return;

  function loadScript(src,next){
    if(document.querySelector(`script[data-helper="${src}"]`)){if(next)next();return}
    const s=document.createElement('script');s.src=src;s.dataset.helper=src;s.onload=()=>next&&next();document.body.appendChild(s);
  }
  loadScript('./whatsapp-cleanup.js',()=>loadScript('./result-ui.js'));

  const read=(key,def=true)=>{try{const v=localStorage.getItem(key);return v===null?def:v!=='0'}catch(e){return def}};
  const write=(key,value)=>{try{localStorage.setItem(key,value?'1':'0')}catch(e){}};
  const sessionGet=key=>{try{return sessionStorage.getItem(key)||''}catch(e){return''}};
  const sessionSet=(key,value)=>{try{sessionStorage.setItem(key,String(value??''))}catch(e){}};
  const optionState=window.cardOptionState||{
    trim:{checked:read(KEYS.trim,true)},
    autoDetect:{checked:read(KEYS.detect,true)}
  };
  window.cardOptionState=optionState;
  let autoProcess=true,timer=null;

  // Token Store filename format: intentionally isolated as editable variables.
  const TOKEN_FILE_FORMAT=window.tokenFileFormat||{
    prefix:'TokenStore',
    freeFire:'FreeFire',
    diamond:'Diamond',
    freeFireCode:'VFF',
    count:'Count'
  };
  window.tokenFileFormat=TOKEN_FILE_FORMAT;
  const pad=n=>String(n).padStart(2,'0');
  const safeLabel=value=>String(value||'Product').trim().replace(/[/\\?%*:|"<>]/g,'-').replace(/\s+/g,'-').replace(/-+/g,'-');
  function tokenStamp(){const d=new Date();return{date:`${pad(d.getDate())}-${pad(d.getMonth()+1)}-${d.getFullYear()}`,time:`${pad(d.getHours())}-${pad(d.getMinutes())}`}}
  function tokenProductLabel(product){
    const raw=String(product||'');
    const isFreeFire=/free\s*fire|فري\s*فاير/i.test(raw);
    if(!isFreeFire)return safeLabel(raw);
    const amount=(raw.match(/(\d{1,5})\s*(?:diamond|diamonds|دياموند|دايموند)/i)||[])[1];
    return [TOKEN_FILE_FORMAT.freeFire,amount?TOKEN_FILE_FORMAT.diamond+amount:null,TOKEN_FILE_FORMAT.freeFireCode].filter(Boolean).join('_');
  }
  window.nameToken=function(product,count,part,total){
    const s=tokenStamp(),p=part?`_P${part}-${total}`:'';
    return `${TOKEN_FILE_FORMAT.prefix}_${tokenProductLabel(product)}_${TOKEN_FILE_FORMAT.count}${count}${p}_${s.date}_${s.time}.txt`;
  };

  function ensureMount(){
    let mount=document.getElementById('mainOptionsMount');
    if(mount)return mount;
    mount=document.createElement('div');
    mount.id='mainOptionsMount';
    mount.hidden=true;
    const row=processBtn.closest('.row');
    if(row)row.insertBefore(mount,row.firstChild);else processBtn.insertAdjacentElement('beforebegin',mount);
    return mount;
  }

  function saveSessionText(){sessionSet(SESSION.text,text.value)}

  function tabFor(type){return tabs?[...tabs.querySelectorAll('.tab[data-type]')].find(x=>x.dataset.type===type):null}
  function routeCurrentContent(processAfter=false,attempt=0){
    const plainTab=tabFor('plain');
    const selectFn=typeof window.selectType==='function'?window.selectType:null;
    if(!plainTab||!selectFn){if(attempt<40)setTimeout(()=>routeCurrentContent(processAfter,attempt+1),75);return false}

    let target='plain';
    if(text.value.trim()){
      if(optionState.autoDetect.checked&&typeof window.detectContentType==='function')target=window.detectContentType(text.value)||'plain';
      else target=sessionGet(SESSION.type)||'plain';
    }
    if(!tabFor(target))target='plain';
    selectFn(target);
    sessionSet(SESSION.type,target);
    if(processAfter&&text.value.trim()&&autoProcess)setTimeout(()=>processBtn.click(),0);
    return true;
  }

  function clearCurrentWork(){
    clearTimeout(timer);
    text.value='';
    try{file.value=''}catch(e){}
    try{if(typeof uploaded!=='undefined')uploaded=''}catch(e){}
    sessionSet(SESSION.text,'');
    sessionSet(SESSION.filename,'');
    sessionSet(SESSION.type,'plain');
    if(fname)fname.textContent='لم يتم اختيار ملف.';
    if(result)result.innerHTML='';
    routeCurrentContent(false);
    setTimeout(()=>{if(status)status.textContent='تم تنظيف النص والنتائج. جاهز كنص عادي.'},0);
    text.focus();
  }

  function ensureActionBar(){
    const row=processBtn.closest('.row');
    let bar=document.getElementById('cardsActionBar');
    if(!bar){
      bar=document.createElement('div');
      bar.id='cardsActionBar';
      bar.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%';
      if(row)row.insertBefore(bar,processBtn);else processBtn.insertAdjacentElement('beforebegin',bar);
    }
    if(processBtn.parentElement!==bar)bar.appendChild(processBtn);
    let clearBtn=document.getElementById('clearCurrentWork');
    if(!clearBtn){
      clearBtn=document.createElement('button');
      clearBtn.id='clearCurrentWork';
      clearBtn.type='button';
      clearBtn.className='btn';
      clearBtn.textContent='🧹 تنظيف';
      clearBtn.style.cssText='width:100%;background:#6b7c89';
      bar.appendChild(clearBtn);
    }
    clearBtn.onclick=clearCurrentWork;
    processBtn.style.width='100%';
    return bar;
  }

  function renderMainOptions(){
    const row=processBtn.closest('.row');
    const show=read(KEYS.showMainOptions,false);
    const legacy=document.querySelector('.options');
    if(legacy&&legacy.parentElement!==ensureMount())legacy.remove();
    const mount=ensureMount();
    mount.innerHTML='';
    mount.hidden=!show;
    mount.style.marginBottom=show?'8px':'0';
    if(show){
      mount.innerHTML='<div class="options"><label class="opt"><input id="quickTrim" type="checkbox"> إزالة الفراغات من أول وآخر كل سطر</label><label class="opt"><input id="quickAutoDetect" type="checkbox"> التعرف التلقائي على النوع عند اللصق أو رفع الملف</label></div>';
      const quickTrim=document.getElementById('quickTrim'),quickDetect=document.getElementById('quickAutoDetect');
      quickTrim.checked=optionState.trim.checked;
      quickDetect.checked=optionState.autoDetect.checked;
      quickTrim.onchange=()=>{optionState.trim.checked=quickTrim.checked;write(KEYS.trim,quickTrim.checked)};
      quickDetect.onchange=()=>{optionState.autoDetect.checked=quickDetect.checked;write(KEYS.detect,quickDetect.checked);routeCurrentContent(Boolean(text.value.trim()))};
    }
    if(row){row.style.display='block';row.style.marginTop='8px'}
    ensureActionBar();
  }

  function syncSettings(){
    optionState.trim.checked=read(KEYS.trim,true);
    optionState.autoDetect.checked=read(KEYS.detect,true);
    autoProcess=read(KEYS.process,true);
    renderMainOptions();
  }

  function restoreSession(){
    const savedText=sessionGet(SESSION.text);
    if(!text.value&&savedText)text.value=savedText;
    const savedFile=sessionGet(SESSION.filename);
    if(savedFile){
      if(fname)fname.textContent='الملف: '+savedFile;
      try{if(typeof uploaded!=='undefined')uploaded=savedFile}catch(e){}
    }
  }

  processBtn.textContent='↻ تحديث';
  ensureActionBar();
  syncSettings();
  restoreSession();
  routeCurrentContent(true);

  if(hint&&!document.getElementById('cardsSettingsLink')){
    const bar=document.createElement('div');
    bar.style.cssText='display:flex;justify-content:flex-start;margin:0 0 8px';
    const link=document.createElement('a');
    link.id='cardsSettingsLink';
    link.href='./settings.html';
    link.textContent='⚙️ الإعدادات';
    link.style.cssText='display:inline-block;text-decoration:none;color:#163047;font-weight:bold;background:#fff;border:1px solid #d7e5ee;border-radius:10px;padding:8px 12px';
    link.addEventListener('click',saveSessionText);
    bar.appendChild(link);
    hint.insertAdjacentElement('afterend',bar);
  }

  if(tabs)tabs.addEventListener('click',e=>{
    const tab=e.target.closest('.tab[data-type]');
    if(tab)sessionSet(SESSION.type,tab.dataset.type);
  });

  function runAutomatic(){
    syncSettings();
    if(!text.value.trim()){routeCurrentContent(false);return}
    routeCurrentContent(true);
  }

  text.addEventListener('input',()=>{
    saveSessionText();
    clearTimeout(timer);
    if(!text.value.trim()){
      if(result)result.innerHTML='';
      if(status)status.textContent='';
      sessionSet(SESSION.type,'plain');
      routeCurrentContent(false);
      return;
    }
    if(!read(KEYS.process,true))return;
    timer=setTimeout(runAutomatic,220);
  });

  file.addEventListener('change',async()=>{
    const selected=file.files&&file.files[0];
    if(!selected)return;
    sessionSet(SESSION.filename,selected.name);
    try{text.value=await selected.text();saveSessionText()}catch(e){}
    setTimeout(runAutomatic,0);
  });

  window.addEventListener('pageshow',()=>{
    syncSettings();
    restoreSession();
    routeCurrentContent(true);
  });
  window.addEventListener('beforeunload',saveSessionText);
  window.addEventListener('storage',()=>{syncSettings();routeCurrentContent(false)});
})();

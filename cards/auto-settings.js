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
  const legacyTrim=document.getElementById('trim'),legacyDetect=document.getElementById('autoDetect');
  const optionState=window.cardOptionState||{
    trim:legacyTrim||{checked:read(KEYS.trim,true)},
    autoDetect:legacyDetect||{checked:read(KEYS.detect,true)}
  };
  window.cardOptionState=optionState;
  let autoProcess=true,timer=null;

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

  function clearCurrentWork(){
    clearTimeout(timer);
    text.value='';
    try{file.value=''}catch(e){}
    try{if(typeof uploaded!=='undefined')uploaded=''}catch(e){}
    sessionSet(SESSION.text,'');
    sessionSet(SESSION.filename,'');
    if(fname)fname.textContent='لم يتم اختيار ملف.';
    if(result)result.innerHTML='';
    if(status)status.textContent='تم تنظيف النص والنتائج.';
    text.focus();
  }

  function ensureActionBar(){
    let bar=document.getElementById('cardsActionBar');
    if(bar)return bar;
    const row=processBtn.closest('.row');
    bar=document.createElement('div');
    bar.id='cardsActionBar';
    bar.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%';
    if(row)processBtn.insertAdjacentElement('beforebegin',bar);else processBtn.parentElement?.insertBefore(bar,processBtn);
    bar.appendChild(processBtn);
    const clearBtn=document.createElement('button');
    clearBtn.id='clearCurrentWork';
    clearBtn.type='button';
    clearBtn.className='btn';
    clearBtn.textContent='🧹 تنظيف';
    clearBtn.style.cssText='width:100%;background:#6b7c89';
    clearBtn.addEventListener('click',clearCurrentWork);
    bar.appendChild(clearBtn);
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
      quickTrim.addEventListener('change',()=>{optionState.trim.checked=quickTrim.checked;write(KEYS.trim,quickTrim.checked)});
      quickDetect.addEventListener('change',()=>{optionState.autoDetect.checked=quickDetect.checked;write(KEYS.detect,quickDetect.checked)});
    }

    if(row){
      row.style.display='block';
      row.style.marginTop='8px';
    }
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

  function restoreTypeWhenReady(){
    const savedType=sessionGet(SESSION.type);
    if(!savedType||!tabs)return;
    let done=false;
    const apply=()=>{
      if(done)return true;
      const target=tabs.querySelector(`.tab[data-type="${CSS.escape(savedType)}"]`);
      if(!target)return false;
      try{if(typeof selectType==='function')selectType(savedType);else target.click()}catch(e){target.click()}
      done=true;
      return true;
    };
    if(apply())return;
    const observer=new MutationObserver(()=>{if(apply())observer.disconnect()});
    observer.observe(tabs,{childList:true,subtree:true});
    setTimeout(()=>observer.disconnect(),3000);
  }

  ensureActionBar();
  syncSettings();
  restoreSession();
  restoreTypeWhenReady();

  processBtn.textContent='↻ تحديث';

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
    if(!text.value.trim()){
      if(result)result.innerHTML='';
      if(status)status.textContent='';
      return;
    }
    if(autoProcess)processBtn.click();
  }

  text.addEventListener('input',()=>{
    saveSessionText();
    clearTimeout(timer);
    if(!text.value.trim()){
      if(result)result.innerHTML='';
      if(status)status.textContent='';
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
    if(text.value.trim()&&autoProcess)setTimeout(()=>processBtn.click(),0);
  });
  window.addEventListener('beforeunload',saveSessionText);
  window.addEventListener('storage',syncSettings);
})();

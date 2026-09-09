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
    processBtn.insertAdjacentElement('beforebegin',mount);
    return mount;
  }

  function renderMainOptions(){
    const row=processBtn.closest('.row');
    const show=read(KEYS.showMainOptions,false);
    const legacy=document.querySelector('.options');
    if(legacy&&legacy.parentElement!==ensureMount())legacy.remove();
    const mount=ensureMount();
    mount.innerHTML='';
    mount.hidden=!show;

    if(show){
      mount.innerHTML='<div class="options"><label class="opt"><input id="quickTrim" type="checkbox"> إزالة الفراغات من أول وآخر كل سطر</label><label class="opt"><input id="quickAutoDetect" type="checkbox"> التعرف التلقائي على النوع عند اللصق أو رفع الملف</label></div>';
      const quickTrim=document.getElementById('quickTrim'),quickDetect=document.getElementById('quickAutoDetect');
      quickTrim.checked=optionState.trim.checked;
      quickDetect.checked=optionState.autoDetect.checked;
      quickTrim.addEventListener('change',()=>{optionState.trim.checked=quickTrim.checked;write(KEYS.trim,quickTrim.checked)});
      quickDetect.addEventListener('change',()=>{optionState.autoDetect.checked=quickDetect.checked;write(KEYS.detect,quickDetect.checked)});
    }

    if(row){
      row.style.display=show?'grid':'block';
      row.style.marginTop='8px';
    }
    processBtn.style.width='100%';
  }

  function syncSettings(){
    optionState.trim.checked=read(KEYS.trim,true);
    optionState.autoDetect.checked=read(KEYS.detect,true);
    autoProcess=read(KEYS.process,true);
    renderMainOptions();
  }

  function saveSessionText(){sessionSet(SESSION.text,text.value)}
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

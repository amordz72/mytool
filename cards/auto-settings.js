(()=>{
  const KEYS={trim:'mytool.cards.trim',detect:'mytool.cards.autoDetect',process:'mytool.cards.autoProcess'};
  const text=document.getElementById('text'),file=document.getElementById('file'),trim=document.getElementById('trim'),detect=document.getElementById('autoDetect'),processBtn=document.getElementById('process'),result=document.getElementById('result'),status=document.getElementById('status'),hint=document.getElementById('hint');
  if(!text||!file||!trim||!detect||!processBtn)return;

  const read=key=>{try{return localStorage.getItem(key)!=='0'}catch(e){return true}};
  let autoProcess=true,timer=null;

  function syncSettings(){
    trim.checked=read(KEYS.trim);
    detect.checked=read(KEYS.detect);
    autoProcess=read(KEYS.process);
  }

  syncSettings();

  const options=document.querySelector('.options');
  if(options)options.hidden=true;
  const row=processBtn.closest('.row');
  if(row){row.style.display='block';row.style.marginTop='8px'}
  processBtn.textContent='↻ تحديث';
  processBtn.style.width='100%';

  if(hint&&!document.getElementById('cardsSettingsLink')){
    const bar=document.createElement('div');
    bar.style.cssText='display:flex;justify-content:flex-start;margin:0 0 8px';
    const link=document.createElement('a');
    link.id='cardsSettingsLink';
    link.href='./settings.html';
    link.textContent='⚙️ الإعدادات';
    link.style.cssText='display:inline-block;text-decoration:none;color:#163047;font-weight:bold;background:#fff;border:1px solid #d7e5ee;border-radius:10px;padding:8px 12px';
    bar.appendChild(link);
    hint.insertAdjacentElement('afterend',bar);
  }

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
    clearTimeout(timer);
    if(!text.value.trim()){
      if(result)result.innerHTML='';
      if(status)status.textContent='';
      return;
    }
    if(!read(KEYS.process))return;
    timer=setTimeout(runAutomatic,220);
  });

  file.addEventListener('change',async()=>{
    const selected=file.files&&file.files[0];
    if(!selected)return;
    try{text.value=await selected.text()}catch(e){}
    setTimeout(runAutomatic,0);
  });

  window.addEventListener('pageshow',()=>{
    syncSettings();
    if(text.value.trim()&&autoProcess)setTimeout(()=>processBtn.click(),0);
  });
})();

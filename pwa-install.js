(()=>{
  'use strict';
  let deferredPrompt=null;
  let installButton=null;

  const standalone=()=>window.matchMedia?.('(display-mode: standalone)').matches||window.navigator.standalone===true;

  function ensureButton(){
    if(installButton||standalone())return;
    const host=document.querySelector('.dashboard-controls')||document.querySelector('.sessionbar')||document.getElementById('dashboard');
    if(!host)return;
    const button=document.createElement('button');
    button.id='pwaInstallBtn';
    button.type='button';
    button.className='btn secondary';
    button.textContent='📲 تثبيت MyTool';
    button.hidden=!deferredPrompt;
    button.addEventListener('click',async()=>{
      if(!deferredPrompt)return;
      button.disabled=true;
      try{
        await deferredPrompt.prompt();
        await deferredPrompt.userChoice;
      }catch(_e){}
      deferredPrompt=null;
      button.hidden=true;
      button.disabled=false;
    });
    host.appendChild(button);
    installButton=button;
  }

  function sync(){
    ensureButton();
    if(installButton)installButton.hidden=standalone()||!deferredPrompt;
  }

  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    deferredPrompt=event;
    sync();
  });

  window.addEventListener('appinstalled',()=>{
    deferredPrompt=null;
    if(installButton)installButton.hidden=true;
  });

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});
  else sync();

  if('serviceWorker' in navigator){
    window.addEventListener('load',()=>{
      navigator.serviceWorker.register('./sw.js?v=20260921-pwa1',{scope:'./'}).catch(()=>{});
    },{once:true});
  }
})();
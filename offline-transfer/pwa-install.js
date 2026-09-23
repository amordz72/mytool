(()=>{
  'use strict';
  let deferredPrompt=null;

  const standalone=()=>window.matchMedia?.('(display-mode: standalone)').matches||window.navigator.standalone===true;
  const buttons=()=>[document.getElementById('setupInstallBtn'),document.getElementById('installBtn')].filter(Boolean);

  function sync(){
    const canInstall=Boolean(deferredPrompt)&&!standalone();
    buttons().forEach(btn=>btn.classList.toggle('hidden',!canInstall));
  }

  async function install(){
    if(!deferredPrompt)return;
    const prompt=deferredPrompt;
    deferredPrompt=null;
    sync();
    try{
      await prompt.prompt();
      await prompt.userChoice;
    }catch(_e){}
  }

  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    deferredPrompt=event;
    sync();
  });

  window.addEventListener('appinstalled',()=>{
    deferredPrompt=null;
    sync();
  });

  document.addEventListener('DOMContentLoaded',()=>{
    buttons().forEach(btn=>btn.addEventListener('click',install));
    sync();
  },{once:true});

  if('serviceWorker' in navigator){
    window.addEventListener('load',()=>{
      navigator.serviceWorker.register('./sw.js?v=20260923-m2-auth1',{scope:'./'}).catch(()=>{});
    },{once:true});
  }
})();
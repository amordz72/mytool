/* Adds the worker cash-receipt shortcut to the main dashboard when permitted. */
(function(){
  'use strict';
  const token=localStorage.getItem('mytool_shop_worker_token')||'';
  if(!token||!window.ShopApiConfig)return;
  async function canRecord(){
    try{
      const r=await fetch(window.ShopApiConfig.url+'/rest/v1/rpc/worker_get_context',{method:'POST',headers:{apikey:window.ShopApiConfig.key,Authorization:'Bearer '+window.ShopApiConfig.key,'Content-Type':'application/json'},body:JSON.stringify({p_session_token:token})});
      if(!r.ok)return false;const data=await r.json();return !!data?.[0]?.can_record_money;
    }catch(_e){return false}
  }
  function mount(){
    const box=document.querySelector('.quick-actions');if(!box)return false;
    if(box.querySelector('[data-worker-money-shortcut]'))return true;
    const a=document.createElement('a');a.href='cash-receipts.html';a.dataset.workerMoneyShortcut='1';a.textContent='⇩ تسجيل استلام مال';box.appendChild(a);return true;
  }
  canRecord().then(ok=>{if(!ok)return;if(mount())return;const observer=new MutationObserver(()=>{if(mount())observer.disconnect()});observer.observe(document.documentElement,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),12000)});
})();
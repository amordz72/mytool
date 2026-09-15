/* MyTool — shared admin notifications for Shop. */
(() => {
  'use strict';

  if (document.querySelector('[data-mytool-admin-notifications-mounted]')) return;
  const marker=document.createElement('meta');
  marker.dataset.mytoolAdminNotificationsMounted='1';
  document.head.appendChild(marker);

  const WORKER_TOKEN='mytool_shop_worker_token';
  if(localStorage.getItem(WORKER_TOKEN)) return;

  const style=document.createElement('style');
  style.textContent=`
    .mytool-admin-bell{position:relative;display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;flex:0 0 38px;border:1px solid #dbe3ea;border-radius:12px;background:#fff;color:#475569;text-decoration:none;font-size:18px;box-shadow:0 2px 8px rgba(15,23,42,.05)}
    .mytool-admin-bell.has-alerts{background:#fff7ed;border-color:#fdba74;color:#9a3412}
    .mytool-admin-bell-count{position:absolute;top:-6px;left:-6px;min-width:19px;height:19px;padding:0 5px;border-radius:999px;background:#dc2626;color:#fff;font-size:10px;font-weight:900;display:none;align-items:center;justify-content:center;border:2px solid #fff}
    .mytool-admin-bell.has-alerts .mytool-admin-bell-count{display:inline-flex}
  `;
  document.head.appendChild(style);

  let bell=null,client=null,refreshTimer=null;

  function ensureBell(){
    if(bell?.isConnected)return bell;
    const header=document.querySelector('.shell-canonical-header .topbar-title');
    if(!header)return null;
    bell=document.createElement('a');
    bell.className='mytool-admin-bell';
    bell.href='cash-receipts.html';
    bell.setAttribute('aria-label','إشعارات الإدارة');
    bell.innerHTML='<span aria-hidden="true">🔔</span><span class="mytool-admin-bell-count">0</span>';
    const menu=header.querySelector('.menu-toggle');
    if(menu)header.insertBefore(bell,menu);else header.appendChild(bell);
    return bell;
  }

  function render(row){
    const target=ensureBell();if(!target)return;
    const held=Number(row?.worker_held_count||0),cash=Number(row?.worker_handover_count||0),pending=Number(row?.pending_party_count||0),total=Number(row?.total_count||0);
    target.classList.toggle('has-alerts',total>0);
    const count=target.querySelector('.mytool-admin-bell-count');if(count)count.textContent=total>99?'99+':String(total);
    const details=[];
    if(held)details.push(held+' مبلغ مسجل عند الخدام');
    if(cash)details.push(cash+' مبلغ بانتظار المراجعة');
    if(pending)details.push(pending+' اسم مؤقت بانتظار الاعتماد');
    target.title=details.length?details.join(' — '):'لا توجد إشعارات معلقة';
    target.setAttribute('aria-label',target.title);
  }

  async function getClient(){
    if(client)return client;
    if(!window.ShopApiConfig?.url||!window.ShopApiConfig?.key)return null;
    const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    client=createClient(window.ShopApiConfig.url,window.ShopApiConfig.key,{auth:{detectSessionInUrl:false}});
    return client;
  }

  async function refresh(){
    try{
      const c=await getClient();if(!c)return;
      const {data:sessionData}=await c.auth.getSession();
      if(!sessionData?.session)return;
      ensureBell();
      const {data,error}=await c.rpc('admin_get_notification_summary');
      if(error)return;
      render((data||[])[0]||{});
    }catch(_error){}
  }

  function start(){
    let attempts=0;
    const wait=()=>{attempts+=1;if(ensureBell()){refresh();return}if(attempts<40)setTimeout(wait,150)};
    wait();
    refreshTimer=setInterval(refresh,60000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

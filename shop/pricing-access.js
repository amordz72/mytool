/* Role-aware pricing display for MyTool.
 * Worker: sale/minimum/reference only; never accounting cost/profit.
 * Admin stock all-branches: show real purchase/sale prices per branch.
 */
(function(){
  'use strict';
  const URL='https://wqyebqzbbpohbnznqdjj.supabase.co';
  const KEY='sb_publishable_gO4umNBMJ0AWRk19HtKd7A_9X4DibYj';
  const screen=document.body?.dataset?.screen||'';
  if(!['sale','stock'].includes(screen))return;

  const workerToken=()=>localStorage.getItem('mytool_shop_worker_token')||'';
  function accessToken(){
    if(workerToken())return KEY;
    try{
      const key=Object.keys(localStorage).find(k=>k.startsWith('sb-')&&k.endsWith('-auth-token'));
      const value=key?JSON.parse(localStorage.getItem(key)||'null'):null;
      return value?.access_token||KEY;
    }catch(_e){return KEY;}
  }
  async function rpc(name,args){
    const response=await fetch(URL+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+accessToken(),'Content-Type':'application/json'},body:JSON.stringify(args||{})});
    const data=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(data?.message||('HTTP '+response.status));
    return data;
  }
  async function rest(path){
    const response=await fetch(URL+'/rest/v1/'+path,{headers:{apikey:KEY,Authorization:'Bearer '+accessToken()}});
    const data=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(data?.message||('HTTP '+response.status));
    return data;
  }
  const money=value=>value===null||value===undefined?'—':Number(value).toLocaleString('ar-DZ',{maximumFractionDigits:2})+' دج';
  const productIdFromCard=card=>Number((card.querySelector('.stock-name small')?.textContent||'').replace(/[^0-9]/g,''))||0;

  let workerCache={branch:0,rows:[]};
  async function workerPolicies(branch){
    const token=workerToken();if(!token||!branch)return [];
    if(workerCache.branch===branch)return workerCache.rows;
    const rows=await rpc('worker_get_branch_product_sale_policy',{p_session_token:token,p_branch_id:branch});
    workerCache={branch,rows:rows||[]};return workerCache.rows;
  }
  function workerPolicy(rows,product){return (rows||[]).find(x=>Number(x.product_id)===Number(product))||null;}

  async function updateWorkerSale(){
    const token=workerToken();if(!token||screen!=='sale')return;
    const product=Number(document.getElementById('saleProduct')?.value||0);
    const branch=Number(document.getElementById('saleBranch')?.value||0);
    const info=document.getElementById('salePricingInfo');
    if(!info)return;
    if(!product||!branch){if(info.textContent!=='اختر المنتج لعرض سعر البيع.')info.textContent='اختر المنتج لعرض سعر البيع.';return;}
    try{
      const rows=await workerPolicies(branch),policy=workerPolicy(rows,product);
      const parts=[];
      if(policy?.sale_price!=null)parts.push('سعر البيع: '+money(policy.sale_price));
      if(policy?.minimum_sale_price!=null)parts.push('الحد الأدنى: '+money(policy.minimum_sale_price));
      if(policy?.worker_reference_purchase_price!=null)parts.push('مرجع شراء تشغيلي: '+money(policy.worker_reference_purchase_price));
      const text=parts.length?parts.join(' — '):'لا يوجد سعر بيع معتمد لهذا المنتج؛ أدخل السعر ضمن الحد المسموح.';
      if(info.textContent!==text){info.className='hint '+(policy?.sale_price!=null?'ok':'warn');info.textContent=text;}
      const hint=document.getElementById('salePriceHint');
      if(hint){const hintText=policy?.minimum_sale_price!=null?'يمكن تعديل السعر بشرط ألا يقل عن الحد الأدنى المسموح.':'راجع السعر قبل الحفظ.';if(hint.textContent!==hintText)hint.textContent=hintText;}
    }catch(_e){
      if(info.textContent.includes('متوسط الشراء'))info.textContent='تعذر تحميل سياسة سعر البيع.';
    }
  }

  async function updateWorkerStock(){
    const token=workerToken();if(!token||screen!=='stock')return;
    const branch=Number(document.getElementById('stockBranch')?.value||0);if(!branch)return;
    try{
      const rows=await workerPolicies(branch);
      document.querySelectorAll('#stockList .stock-item').forEach(card=>{
        const product=productIdFromCard(card);if(!product)return;
        const policy=workerPolicy(rows,product);if(!policy)return;
        let hint=card.querySelector('.hint');
        if(!hint){hint=document.createElement('div');hint.className='hint';card.appendChild(hint);}
        const parts=[];
        if(policy.sale_price!=null)parts.push('<strong>سعر البيع:</strong> '+money(policy.sale_price));
        if(policy.minimum_sale_price!=null)parts.push('<strong>الحد الأدنى:</strong> '+money(policy.minimum_sale_price));
        if(policy.worker_reference_purchase_price!=null)parts.push('<strong>مرجع شراء تشغيلي:</strong> '+money(policy.worker_reference_purchase_price));
        const html=parts.length?parts.join(' — '):'<strong>سعر البيع:</strong> غير محدد';
        if(hint.innerHTML!==html)hint.innerHTML=html;
      });
    }catch(_e){}
  }

  let adminCache=null;
  async function adminPricing(){
    if(adminCache)return adminCache;
    const branches=await rest('branches?select=id,name&active=eq.true&order=id');
    const pricingByBranch={};
    await Promise.all((branches||[]).map(async branch=>{pricingByBranch[branch.id]=await rpc('admin_get_branch_product_prices',{p_branch_id:Number(branch.id)});}));
    adminCache={branches:branches||[],pricingByBranch};return adminCache;
  }
  async function updateAdminAllStock(){
    if(workerToken()||screen!=='stock')return;
    const allButton=document.querySelector('.branch-buttons [data-branch="all"].active');
    if(!allButton)return;
    try{
      const data=await adminPricing();
      const byName=new Map((data.branches||[]).map(b=>[String(b.name).trim(),b]));
      document.querySelectorAll('#stockList .stock-item').forEach(card=>{
        const product=productIdFromCard(card);if(!product)return;
        card.querySelectorAll('.stock-details .branch-pill').forEach(pill=>{
          const clean=(pill.childNodes[0]?.textContent||pill.textContent||'').split(':')[0].trim();
          const branch=byName.get(clean);if(!branch)return;
          const row=(data.pricingByBranch[branch.id]||[]).find(x=>Number(x.product_id)===product);
          let detail=pill.querySelector('[data-pricing-detail]');
          if(!detail){detail=document.createElement('small');detail.dataset.pricingDetail='1';detail.style.display='block';detail.style.marginTop='4px';detail.style.fontWeight='700';pill.appendChild(detail);}
          const text='شراء: '+money(row?.last_purchase_price)+' — بيع: '+money(row?.last_sale_price);
          if(detail.textContent!==text)detail.textContent=text;
        });
      });
    }catch(_e){}
  }

  let timer=0;
  function schedule(){clearTimeout(timer);timer=setTimeout(()=>{updateWorkerSale();updateWorkerStock();updateAdminAllStock();},180);}
  function start(){
    ['saleProduct','saleBranch','stockBranch'].forEach(id=>document.getElementById(id)?.addEventListener('change',()=>{workerCache={branch:0,rows:[]};schedule();}));
    document.addEventListener('click',event=>{if(event.target.closest('[data-branch]'))schedule();},true);
    const target=document.getElementById('stockList')||document.getElementById('salePricingInfo');
    if(target)new MutationObserver(schedule).observe(target,{childList:true,subtree:true,characterData:true});
    schedule();setTimeout(schedule,700);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
/* PRELAUNCH home role/branch adapter. Keeps the shared shop UI but fixes workspace_admin behavior. */
(function(){
  'use strict';
  if(document.body?.dataset?.screen!=='index')return;
  const token=localStorage.getItem('mytool_shop_worker_token')||'';
  if(!token||!window.ShopApiConfig)return;
  const {url,key}=window.ShopApiConfig;
  const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
  const rpc=async(name,body)=>{const r=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(body||{})});if(!r.ok)throw new Error(await r.text()||name);return r.status===204?null:r.json()};
  const $=id=>document.getElementById(id);
  const money=v=>new Intl.NumberFormat('ar-DZ',{maximumFractionDigits:2}).format(Number(v||0));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const addRouteButton=(isAdmin)=>{const box=document.querySelector('.home-actions');if(!box||box.querySelector('[data-today-route]'))return;const a=document.createElement('a');a.href='today-route.html';a.dataset.todayRoute='1';a.textContent=isAdmin?'إدارة جولة اليوم':'جولة اليوم';box.appendChild(a)};
  const setCommon=(ctx,branch,isAdmin)=>{
    localStorage.setItem('mytool_workspace_role',branch.account_role||'worker');
    document.documentElement.classList.toggle('mt-worker-mode',!isAdmin);
    document.documentElement.classList.toggle('mt-prelaunch-admin',isAdmin);
    document.querySelectorAll('.shell-role-badge').forEach(el=>el.textContent=isAdmin?'إدارة':'عامل');
    document.querySelectorAll('.shell-identity').forEach(el=>el.textContent=(ctx.nickname||(isAdmin?'مدير':'عامل'))+' · وضع الاستمرارية');
    const heading=document.querySelector('.mt-page-heading h1');if(heading)heading.textContent=isAdmin?'الرئيسية':'رئيسية العامل';
    const sub=document.querySelector('.mt-page-heading p');if(sub)sub.textContent=isAdmin?'مدير وضع الاستمرارية؛ اختر المخزن وتابع العمل من نفس الواجهة.':'أهم عمليات المحل أمامك مباشرة، والباقي من «المزيد».';
    $('modeBadge')&&( $('modeBadge').textContent=isAdmin?'مدير · وضع الاستمرارية':'عامل · وضع الاستمرارية' );
    $('heroSub')&&( $('heroSub').textContent=isAdmin?'مدير · وضع الاستمرارية — اختر المخزن وتابع العمل.':'أهم معلومات محلّك أمامك، وبقية العمليات من التشغيل اليومي.' );
    addRouteButton(isAdmin);
    if(window.ShopShell?.mountRoleNavigation)window.ShopShell.mountRoleNavigation({role:isAdmin?'admin':'worker',permissions:{sell:!!ctx.can_sell,purchase:!!ctx.can_purchase,view_stock:!!ctx.can_view_stock,inventory:!!ctx.can_inventory,manage_products:!!ctx.can_manage_products,view_sales:!!ctx.can_view_sales,record_money:!!ctx.can_record_money,transfer:!!branch.can_transfer}},'index');
  };
  const renderAdminBranch=async(branches,branchId)=>{
    const data=await rpc('workspace_admin_get_branch_dashboard',{p_session_token:token,p_branch_id:Number(branchId)});
    if(!data)return;
    $('branchName')&&($('branchName').textContent=data.branch_name||'المخزن الحالي');
    const products=Array.isArray(data.products)?data.products:[],inventory=Array.isArray(data.inventory)?data.inventory:[];
    $('productsCount')&&($('productsCount').textContent=String(products.length));
    $('stockUnits')&&($('stockUnits').textContent=money(inventory.reduce((a,x)=>a+Number(x.stock_quantity||0),0)));
    $('salesCount')&&($('salesCount').textContent=money(data.sales_count||0));
    $('revenue')&&($('revenue').textContent=money(data.revenue||0));
    const out=inventory.filter(x=>x.is_verified!==false&&Number(x.stock_quantity||0)<=0).length;
    $('outCount')&&($('outCount').textContent=String(out));
    $('outAlert')?.classList.toggle('hidden',out===0);
    $('dailyReportLink')?.classList.add('hidden');
    localStorage.setItem('mytool_admin_branch_id',String(branchId));
  };
  async function run(){
    try{
      const [ctxRows,branch]=await Promise.all([rpc('worker_get_context',{p_session_token:token}),rpc('worker_get_branch_context',{p_session_token:token})]);
      const ctx=Array.isArray(ctxRows)?ctxRows[0]:null;if(!ctx||!branch||branch.workspace_code!=='PRELAUNCH')return;
      localStorage.setItem('mytool_workspace_code',branch.workspace_code);
      localStorage.setItem('mytool_workspace_role',branch.account_role||'worker');
      const isAdmin=branch.account_role==='workspace_admin';setCommon(ctx,branch,isAdmin);
      if(!isAdmin)return;
      const branches=Array.isArray(branch.branches)?branch.branches:[];if(!branches.length)return;
      const saved=Number(localStorage.getItem('mytool_admin_branch_id')||0);let branchId=branches.some(x=>Number(x.id)===saved)?saved:Number(branch.default_branch_id||branches[0].id);
      const select=$('branchSelect');if(select){select.innerHTML=branches.map(b=>'<option value="'+Number(b.id)+'">'+esc(b.name)+'</option>').join('');select.value=String(branchId);select.classList.remove('hidden');select.onchange=async()=>{branchId=Number(select.value);await renderAdminBranch(branches,branchId)}}
      await renderAdminBranch(branches,branchId);
    }catch(_e){}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(run,80),{once:true});else setTimeout(run,80);
})();
/* MyTool route registry — the only source for shared navigation. */
(function(){
  'use strict';
  const groups=Object.freeze({general:'عام',operations:'التشغيل اليومي',inventory:'المخزون والجرد',money:'الأموال',admin:'الإدارة'});
  const routes=[
    {id:'index',group:'general',label:'لوحة التحكم',shortLabel:'الرئيسية',path:'index.html',type:'shared',roles:['admin','worker'],placement:['drawer','top'],icon:'⌂'},
    {id:'daily',group:'general',label:'التشغيل اليومي',shortLabel:'التشغيل',path:'daily.html',type:'shared',roles:['admin','worker'],placement:['drawer'],icon:'▤'},
    {id:'sale',group:'operations',label:'تسجيل بيع',shortLabel:'بيع',path:'sale.html',type:'worker',roles:['admin','worker'],permission:'sell',placement:['drawer','top'],icon:'＋'},
    {id:'purchase',group:'operations',label:'المشتريات',shortLabel:'مشتريات',path:'purchase.html',type:'worker',roles:['admin','worker'],permission:'purchase',placement:['drawer','top'],icon:'⇩'},
    {id:'stock',group:'inventory',label:'المخزون',shortLabel:'المخزون',path:'stock.html',type:'worker',roles:['admin','worker'],permission:'view_stock',placement:['drawer','top'],icon:'▦'},
    {id:'products',group:'inventory',label:'المنتجات',shortLabel:'المنتجات',path:'products.html',type:'admin',roles:['admin'],placement:['drawer','top'],icon:'◇'},
    {id:'inventory',group:'inventory',label:'الجرد',shortLabel:'الجرد',path:'inventory-count.html',type:'worker',roles:['admin','worker'],permission:'inventory',placement:['drawer'],icon:'✓'},
    {id:'physical',group:'inventory',label:'الجرد الفعلي',shortLabel:'جرد فعلي',path:'physical-inventory.html',type:'admin',roles:['admin'],placement:['drawer'],icon:'✓'},
    {id:'opening',group:'inventory',label:'الجرد الافتتاحي',shortLabel:'جرد افتتاحي',path:'opening-stock.html',type:'admin',roles:['admin'],placement:['drawer'],icon:'◉'},
    {id:'transfers',group:'operations',label:'التحويلات',shortLabel:'تحويلات',path:'transfers.html',type:'worker',roles:['admin','worker'],permission:'transfer',placement:['drawer'],icon:'⇄'},
    {id:'money',group:'money',label:'أماكن الأموال',shortLabel:'الأموال',path:'money.html',type:'worker',roles:['admin','worker'],permission:'record_money',placement:['drawer'],icon:'دج'},
    {id:'cash',group:'money',label:'الصندوق',shortLabel:'الصندوق',path:'cash.html',type:'admin',roles:['admin'],placement:['drawer'],icon:'▣'},
    {id:'users',group:'admin',label:'المستخدمون',shortLabel:'المستخدمون',path:'users.html',type:'admin',roles:['admin'],placement:['drawer','top'],icon:'♙'},
    {id:'settings',group:'admin',label:'الإعدادات',shortLabel:'الإعدادات',path:'settings.html',type:'admin',roles:['admin'],placement:['drawer','top'],icon:'⚙'},
    {id:'notes',group:'general',label:'صندوق الملاحظات',shortLabel:'الملاحظات',path:'../notes/',type:'shared',roles:['admin','worker'],placement:['drawer'],icon:'📝'},
    {id:'mytool',group:'general',label:'رئيسية MyTool',shortLabel:'MyTool',path:'../',type:'external',roles:['admin'],placement:['drawer'],icon:'↩'}
  ];
  function allowed(route,context){
    const role=context?.role||'admin';
    if(!route.roles.includes(role))return false;
    if(role==='admin'||!route.permission)return true;
    const permissions=context?.permissions||{};
    return permissions[route.permission]===true||permissions['can_'+route.permission]===true;
  }
  function list(context,placement){
    return routes.filter(route=>(!placement||route.placement.includes(placement))&&allowed(route,context));
  }
  function get(id){return routes.find(route=>route.id===id)||null}

  const ADMIN_BRANCH_KEY='mytool_admin_branch_id';
  const BRANCH_SELECT_IDS=['saleBranch','purchaseBranch','stockBranch','inventoryBranch','transferSource','branchSelect'];
  function workerOwnsBranchContext(){
    return !!localStorage.getItem('mytool_shop_worker_token')&&!localStorage.getItem('mytool_admin_expires_at');
  }
  function isAdminBranchSelect(target){
    if(!target||target.tagName!=='SELECT')return false;
    if(BRANCH_SELECT_IDS.includes(target.id))return true;
    return target.id==='branch'&&document.body?.dataset?.screen==='physical-inventory';
  }
  function saveAdminBranch(target){
    if(workerOwnsBranchContext()||!isAdminBranchSelect(target))return;
    const branchId=Number(target.value);
    if(Number.isInteger(branchId)&&branchId>0)localStorage.setItem(ADMIN_BRANCH_KEY,String(branchId));
  }
  function adminBranchSelects(){
    const result=BRANCH_SELECT_IDS.map(id=>document.getElementById(id)).filter(Boolean);
    if(document.body?.dataset?.screen==='physical-inventory'){
      const physical=document.getElementById('branch');if(physical)result.push(physical);
    }
    return result;
  }
  function applySavedAdminBranch(){
    if(workerOwnsBranchContext())return false;
    const savedBranchId=Number(localStorage.getItem(ADMIN_BRANCH_KEY)||0);
    if(!savedBranchId)return false;
    let found=false;
    for(const select of adminBranchSelects()){
      if(select.dataset.adminBranchApplied==='1')continue;
      found=true;
      const available=Array.from(select.options||[]).some(option=>Number(option.value)===savedBranchId);
      if(!available)continue;
      select.dataset.adminBranchApplied='1';
      if(Number(select.value)!==savedBranchId){
        select.value=String(savedBranchId);
        select.dispatchEvent(new Event('change',{bubbles:true}));
      }
    }
    return found;
  }
  function watchAdminBranchContext(){
    if(workerOwnsBranchContext())return;
    document.addEventListener('change',event=>saveAdminBranch(event.target),true);
    let attempts=0;
    const tick=()=>{
      attempts+=1;applySavedAdminBranch();
      if(attempts<40)setTimeout(tick,150);
    };
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',tick,{once:true});
    else tick();
  }
  watchAdminBranchContext();

  window.ShopRoutes=Object.freeze({groups,all:Object.freeze(routes.map(Object.freeze)),list,get,allowed,applySavedAdminBranch});
})();
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
  window.ShopRoutes=Object.freeze({groups,all:Object.freeze(routes.map(Object.freeze)),list,get,allowed});
})();
/* Inventory pricing helper.
 * Inventory saves quantity only. Pricing is handled separately by quick-pricing.js.
 */
(function(){
'use strict';
if(document.body?.dataset?.screen!=='inventory'||localStorage.getItem('mytool_shop_worker_token'))return;
const URL='https://wqyebqzbbpohbnznqdjj.supabase.co/rest/v1/rpc/';
const KEY='sb_publishable_gO4umNBMJ0AWRk19HtKd7A_9X4DibYj';
function access(){try{const k=Object.keys(localStorage).find(x=>x.startsWith('sb-')&&x.endsWith('-auth-token'));const v=k?JSON.parse(localStorage.getItem(k)||'null'):null;return v?.access_token||KEY;}catch(_e){return KEY;}}
async function rpc(name,args){const r=await fetch(URL+name,{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+access(),'Content-Type':'application/json'},body:JSON.stringify(args||{})});const data=await r.json().catch(()=>null);if(!r.ok)throw new Error(data?.message||('HTTP '+r.status));return data;}
function ensure(){let box=document.getElementById('inventoryPriceSetup');if(box)return box;const anchor=document.getElementById('inventoryCurrent');if(!anchor)return null;box=document.createElement('div');box.id='inventoryPriceSetup';box.className='hint warn';box.hidden=true;box.innerHTML='<strong id="inventoryPriceStatus">السعر يحتاج مراجعة.</strong><div style="margin-top:7px">الجرد يحفظ الكمية فقط. عدّل السعر بشكل مستقل حتى لا تختلط العمليتان.</div><button id="inventoryQuickPrice" type="button" class="btn secondary" style="width:auto;margin-top:8px">تسعير هذا المنتج</button>';anchor.insertAdjacentElement('afterend',box);document.getElementById('inventoryQuickPrice').onclick=()=>window.MyToolQuickPricing?.open();return box;}
async function load(){const box=ensure(),p=document.getElementById('inventoryProduct'),b=document.getElementById('inventoryBranch');if(!box||!p||!b)return;const product=Number(p.value||0),branch=Number(b.value||0);box.hidden=true;if(!product||!branch)return;try{const rows=await rpc('admin_get_branch_product_sale_policy',{p_branch_id:branch});const row=(rows||[]).find(x=>Number(x.product_id)===product)||null;const needs=!row||row.target_sale_price==null||row.review_required;if(!needs)return;box.hidden=false;document.getElementById('inventoryPriceStatus').textContent=!row||row.target_sale_price==null?'هذا المنتج بلا سعر بيع معتمد في هذا الفرع.':'تكلفة المنتج تغيرت ويحتاج السعر إلى مراجعة.';}catch(e){box.hidden=false;document.getElementById('inventoryPriceStatus').textContent='تعذر التحقق من السعر: '+e.message;}}
function start(attempt=0){const p=document.getElementById('inventoryProduct'),b=document.getElementById('inventoryBranch');if(!p||!b){if(attempt<60)setTimeout(()=>start(attempt+1),180);return}ensure();const later=()=>setTimeout(load,160);p.addEventListener('change',later);b.addEventListener('change',later);window.addEventListener('shop:pricing-refresh',later);later();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>start(),{once:true});else start();
})();

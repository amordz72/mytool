/* Keep exactly one quick-pricing button inside the inventory warning. */
(function(){
'use strict';
if(document.body?.dataset?.screen!=='inventory')return;
function removeExtra(){document.getElementById('quickPricingBar')?.remove()}
function loadQuick(){if(window.MyToolQuickPricing)return;let s=document.querySelector('script[data-inventory-quick-pricing]');if(!s){s=document.createElement('script');s.src='quick-pricing.js?v=20260913-2022';s.defer=true;s.dataset.inventoryQuickPricing='1';document.head.appendChild(s)}}
async function openQuick(){loadQuick();for(let i=0;i<20;i++){removeExtra();if(window.MyToolQuickPricing?.open){window.MyToolQuickPricing.open();return}await new Promise(r=>setTimeout(r,80))}}
function mount(){removeExtra();const box=document.getElementById('inventoryPriceSetup');if(!box)return false;let button=document.getElementById('inventoryQuickPrice');if(!button){button=document.createElement('button');button.id='inventoryQuickPrice';button.type='button';button.className='btn secondary';button.style.cssText='width:auto;margin-top:8px';button.textContent='تسعير هذا المنتج';box.appendChild(button)}button.onclick=openQuick;return true}
function start(){loadQuick();let tries=0;const tick=()=>{tries++;mount();if(tries<60)setTimeout(tick,150)};tick();new MutationObserver(()=>mount()).observe(document.body,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
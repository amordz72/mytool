/* Purchase screen UX enhancer.
 * Keeps purchase-specific behavior outside the shared shell/template.
 */
(function(){
  'use strict';

  function normalizeDigits(value){
    const arabic='٠١٢٣٤٥٦٧٨٩',persian='۰۱۲۳۴۵۶۷۸۹';
    return String(value||'')
      .replace(/[٠-٩]/g,d=>String(arabic.indexOf(d)))
      .replace(/[۰-۹]/g,d=>String(persian.indexOf(d)));
  }

  function parseLocalizedNumber(value){
    let text=normalizeDigits(value).replace(/\s+/g,'').replace(/٬/g,',').replace(/٫/g,'.');
    text=text.replace(/[^0-9.,-]/g,'');
    const dot=text.lastIndexOf('.'),comma=text.lastIndexOf(',');
    if(dot>=0&&comma>=0){
      const decimal=dot>comma?'.':',';
      const group=decimal==='.'?',':'.';
      text=text.split(group).join('').replace(decimal,'.');
    }else{
      const separator=dot>=0?'.':comma>=0?',':null;
      if(separator){
        const parts=text.split(separator);
        const grouped=parts.length>2||(parts.length===2&&parts[1].length===3);
        text=grouped?parts.join(''):parts.join('.');
      }
    }
    const number=Number(text);
    return Number.isFinite(number)?number:null;
  }

  function start(){
    if(document.body?.dataset?.screen!=='purchase')return;
    const cost=document.getElementById('purchaseCost');
    const hint=document.getElementById('purchaseCostHint');
    const product=document.getElementById('purchaseProduct');
    const branch=document.getElementById('purchaseBranch');
    if(!cost||!hint||!product||!branch)return;

    const markSelectionChanged=()=>{cost.dataset.autofillPending='1'};
    product.addEventListener('change',markSelectionChanged);
    branch.addEventListener('change',markSelectionChanged);
    cost.addEventListener('input',()=>{
      cost.dataset.autofillPending='0';
      cost.dataset.autofilled='0';
    });

    const apply=()=>{
      const text=hint.textContent||'';
      const match=text.match(/آخر سعر شراء في هذا الفرع:\s*(.*?)\s*دج/u);
      if(!match)return;
      const price=parseLocalizedNumber(match[1]);
      if(price===null||price<=0)return;
      const shouldFill=cost.value.trim()===''||cost.dataset.autofillPending==='1'||cost.dataset.autofilled==='1';
      if(!shouldFill)return;
      cost.value=String(price);
      cost.dataset.autofilled='1';
      cost.dataset.autofillPending='0';
      if(text.includes('سيُستخدم إذا تركت الحقل فارغًا.')){
        hint.textContent='آخر سعر شراء في هذا الفرع: '+match[1].trim()+' دج — تم تحميله تلقائيًا ويمكن تعديله.';
      }
    };

    const observer=new MutationObserver(apply);
    observer.observe(hint,{childList:true,subtree:true,characterData:true});
    apply();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
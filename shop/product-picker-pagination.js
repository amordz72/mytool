/* Purchase product picker pagination: keep the chooser short on mobile. */
(function(){
  'use strict';
  const pageSize=5;
  let page=1;

  function start(){
    if(document.body?.dataset?.screen!=='purchase')return;
    const select=document.getElementById('purchaseProduct');
    if(!select)return;
    const parent=select.parentNode;
    const input=select.previousElementSibling;
    const results=select.nextElementSibling;
    if(!input||input.tagName!=='INPUT'||!results||!results.classList.contains('product-search-results'))return;
    if(input.dataset.pagedPicker==='1')return;
    input.dataset.pagedPicker='1';

    const rows=()=>Array.from(select.options||[]).filter(o=>o.value).map(o=>({id:o.value,name:o.textContent||''}));
    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const filtered=()=>{const q=(input.value||'').trim().toLocaleLowerCase('ar');return rows().filter(x=>!q||x.name.toLocaleLowerCase('ar').includes(q)||String(x.id).includes(q));};

    function render(){
      const all=filtered();
      const pages=Math.max(1,Math.ceil(all.length/pageSize));
      page=Math.min(Math.max(1,page),pages);
      const visible=all.slice((page-1)*pageSize,page*pageSize);
      const items=visible.map(p=>'<button type="button" class="product-result" data-product="'+esc(p.id)+'"><span>'+esc(p.name)+'</span><small>#'+esc(p.id)+'</small></button>').join('');
      const pager=all.length>pageSize?'<div class="product-picker-pager" style="display:flex;align-items:center;justify-content:space-between;gap:7px"><button type="button" class="btn secondary" data-pick-page="prev" style="width:auto" '+(page<=1?'disabled':'')+'>السابق</button><span class="muted">'+page+' / '+pages+' · '+all.length+'</span><button type="button" class="btn secondary" data-pick-page="next" style="width:auto" '+(page>=pages?'disabled':'')+'>التالي</button></div>':'';
      results.innerHTML=items||'<div class="empty">لا توجد نتيجة.</div>';
      results.insertAdjacentHTML('beforeend',pager);
    }

    input.addEventListener('focus',()=>{page=1;setTimeout(render,0)});
    input.addEventListener('input',()=>{page=1;setTimeout(render,0)});
    results.addEventListener('click',e=>{
      const b=e.target.closest('[data-pick-page]');
      if(!b)return;
      e.preventDefault();e.stopPropagation();
      page+=b.dataset.pickPage==='next'?1:-1;
      render();
    },true);
  }

  function boot(){
    let tries=0;
    const timer=setInterval(()=>{
      tries+=1;
      const select=document.getElementById('purchaseProduct');
      if(select?.dataset?.enhanced==='1'||tries>50){clearInterval(timer);start();}
    },120);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
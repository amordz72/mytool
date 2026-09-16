/* Shared MyTool product picker.
 * Search by name/ID/barcode + category filter + current-branch stock status.
 * Replaces only the visual picker; native select remains the source used by each page.
 */
(function(){
  'use strict';
  const URL='https://wqyebqzbbpohbnznqdjj.supabase.co';
  const KEY='sb_publishable_gO4umNBMJ0AWRk19HtKd7A_9X4DibYj';
  const screen=document.body?.dataset?.screen||'';
  const config={
    sale:{select:'saleProduct',branch:'saleBranch',context:'sale'},
    purchase:{select:'purchaseProduct',branch:'purchaseBranch',context:'purchase'},
    inventory:{select:'inventoryProduct',branch:'inventoryBranch',context:'inventory'}
  }[screen];
  if(!config)return;

  let supabase=null,rows=[],page=1,busy=false,scannerBuffer='',scannerLast=0,inventoryGuardStarted=false;
  const PAGE_SIZE=10;
  const workerToken=()=>localStorage.getItem('mytool_shop_worker_token')||'';
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function ensureSingleInventoryDom(){
    if(screen!=='inventory')return;
    ['inventoryCard','inventoryForm','message'].forEach(id=>{
      const nodes=[...document.querySelectorAll('[id="'+id+'"]')];
      nodes.slice(1).forEach(node=>{
        const duplicateCard=node.closest?.('[id="inventoryCard"]');
        if(duplicateCard&&duplicateCard!==nodes[0]?.closest?.('[id="inventoryCard"]'))duplicateCard.remove();
        else node.remove();
      });
    });
  }

  function startInventoryGuard(){
    if(screen!=='inventory'||inventoryGuardStarted)return;
    inventoryGuardStarted=true;
    ensureSingleInventoryDom();
    const root=document.getElementById('app')||document.body;
    new MutationObserver(ensureSingleInventoryDom).observe(root,{childList:true,subtree:true});
  }

  async function db(){
    if(supabase)return supabase;
    const mod=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    supabase=mod.createClient(URL,KEY);
    return supabase;
  }

  function stockText(row){
    if(row.item_type==='service')return 'خدمة';
    if(!row.is_verified)return 'غير مجرود';
    const qty=Number(row.stock_quantity||0);
    return qty<=0?'نفد 0':'📦 '+qty;
  }
  function stockClass(row){
    if(!row.is_verified)return'unverified';
    return Number(row.stock_quantity||0)<=0?'out':'available';
  }

  async function loadRows(){
    const branch=Number(document.getElementById(config.branch)?.value||0);
    if(!branch)return null;
    const client=await db();
    let res;
    if(workerToken()){
      res=await client.rpc('worker_get_product_picker_catalog',{p_session_token:workerToken(),p_branch_id:branch,p_context:config.context});
    }else{
      const isTest=localStorage.getItem('mytool_admin_data_mode')==='test';
      res=await client.rpc('admin_get_product_picker_catalog',{p_branch_id:branch,p_context:config.context,p_is_test:isTest});
    }
    if(res.error)throw res.error;
    rows=res.data||[];
    return rows;
  }

  async function lookupBarcode(code){
    const value=String(code||'').trim();
    if(!value)return null;
    const branch=Number(document.getElementById(config.branch)?.value||0);if(!branch)return null;
    const client=await db();
    let res;
    if(workerToken())res=await client.rpc('worker_lookup_product_by_barcode',{p_session_token:workerToken(),p_barcode:value,p_branch_id:branch,p_context:config.context});
    else res=await client.rpc('admin_lookup_product_by_barcode',{p_barcode:value,p_is_test:localStorage.getItem('mytool_admin_data_mode')==='test'});
    if(res.error)throw res.error;
    return Array.isArray(res.data)?res.data[0]||null:null;
  }

  function mount(select){
    if(select.dataset.catalogPickerMounted==='1')return select.parentElement.querySelector('[data-catalog-picker]');
    const parent=select.parentElement;
    select.dataset.enhanced='1';
    select.classList.add('native-product-select');
    const legacy=[...parent.children].filter(el=>el!==select&&(el.matches?.('input[type="search"]')||el.classList?.contains('product-search-results')||el.classList?.contains('product-selected')));
    legacy.forEach(el=>el.remove());

    const root=document.createElement('div');root.dataset.catalogPicker='1';root.dataset.collapsed='0';root.className='catalog-picker';
    const search='<input class="catalog-search" type="search" inputmode="search" autocomplete="off" placeholder="ابحث بالاسم أو Product ID أو الباركود">';
    const category='<select class="catalog-category" aria-label="فلتر التصنيف"><option value="all">كل التصنيفات</option><option value="uncategorized">غير مصنف</option></select>';
    root.innerHTML=`
      <div class="catalog-tools">${screen==='inventory'?category+search:search+category}</div>
      <div class="catalog-results"></div>
      <div class="catalog-page"><button type="button" class="catalog-prev">السابق</button><span class="catalog-page-info"></span><button type="button" class="catalog-next">التالي</button></div>
      <div class="catalog-selected hidden"></div>
      <div class="catalog-note"></div>`;
    parent.insertBefore(root,select);
    select.dataset.catalogPickerMounted='1';
    injectStyle();

    const searchEl=root.querySelector('.catalog-search');
    const categoryEl=root.querySelector('.catalog-category');
    const expand=()=>{root.dataset.collapsed='0'};
    searchEl.addEventListener('input',()=>{expand();page=1;render(root,select)});
    searchEl.addEventListener('focus',()=>{expand();render(root,select)});
    searchEl.addEventListener('keydown',async event=>{
      if(event.key!=='Enter')return;
      event.preventDefault();
      await chooseFromCode(searchEl.value,select,root);
    });
    categoryEl.addEventListener('change',()=>{expand();page=1;render(root,select)});
    root.querySelector('.catalog-prev').addEventListener('click',()=>{if(page>1){page-=1;render(root,select)}});
    root.querySelector('.catalog-next').addEventListener('click',()=>{const pages=Math.max(1,Math.ceil(filtered(root).length/PAGE_SIZE));if(page<pages){page+=1;render(root,select)}});
    root.querySelector('.catalog-results').addEventListener('click',event=>{const button=event.target.closest('[data-product-id]');if(!button)return;const row=rows.find(x=>Number(x.product_id)===Number(button.dataset.productId));if(row)choose(select,root,row)});
    select.addEventListener('change',()=>syncSelected(select,root));
    return root;
  }

  function updateCategoryOptions(root){
    const select=root.querySelector('.catalog-category');
    const current=select.value||'all';
    const categories=[...new Map(rows.filter(r=>r.category_id&&r.category_name).map(r=>[String(r.category_id),{id:String(r.category_id),name:r.category_name}])).values()]
      .sort((a,b)=>String(a.name).localeCompare(String(b.name),'ar'));
    select.innerHTML='<option value="all">كل التصنيفات</option><option value="uncategorized">غير مصنف</option>'+categories.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('');
    select.value=[...select.options].some(o=>o.value===current)?current:'all';
  }

  function filtered(root){
    const q=root.querySelector('.catalog-search').value.trim().toLowerCase();
    const category=root.querySelector('.catalog-category').value;
    return rows.filter(row=>{
      const matchesQuery=!q||String(row.product_name||'').toLowerCase().includes(q)||String(row.product_id).includes(q);
      const matchesCategory=category==='all'||(category==='uncategorized'?!row.category_id:String(row.category_id)===category);
      return matchesQuery&&matchesCategory;
    });
  }

  function render(root,select){
    const list=filtered(root),pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));
    page=Math.min(Math.max(1,page),pages);
    const start=(page-1)*PAGE_SIZE,visible=list.slice(start,start+PAGE_SIZE),collapsed=root.dataset.collapsed==='1';
    const results=root.querySelector('.catalog-results'),pager=root.querySelector('.catalog-page');
    results.classList.toggle('hidden',collapsed);pager.classList.toggle('hidden',collapsed||pages<=1);
    results.innerHTML=visible.length?visible.map(row=>{
      const category=row.category_name?'<small class="catalog-cat">'+esc(row.category_name)+'</small>':'';
      return '<button type="button" class="catalog-row" data-product-id="'+esc(row.product_id)+'"><span class="catalog-main"><strong>'+esc(row.product_name)+'</strong><small>#'+esc(row.product_id)+'</small>'+category+'</span><span class="catalog-stock '+stockClass(row)+'">'+esc(stockText(row))+'</span></button>';
    }).join(''):'<div class="catalog-empty">لا توجد منتجات مطابقة.</div>';
    root.querySelector('.catalog-page-info').textContent=list.length?'صفحة '+page+' من '+pages+' — '+list.length+' منتج':'0 منتج';
    root.querySelector('.catalog-prev').disabled=page<=1;root.querySelector('.catalog-next').disabled=page>=pages;
    syncSelected(select,root);
  }

  function choose(select,root,row){
    if(![...select.options].some(option=>Number(option.value)===Number(row.product_id))){const option=document.createElement('option');option.value=String(row.product_id);option.textContent=row.product_name;select.appendChild(option)}
    select.value=String(row.product_id);select.dispatchEvent(new Event('change',{bubbles:true}));
    root.querySelector('.catalog-search').value='';root.dataset.collapsed='1';page=1;render(root,select);
  }

  async function chooseFromCode(raw,select,root){
    const q=String(raw||'').trim();if(!q)return;
    const exact=/^\d+$/.test(q)?rows.find(x=>Number(x.product_id)===Number(q)):null;
    if(exact){choose(select,root,exact);return}
    const visible=filtered(root);if(visible.length===1){choose(select,root,visible[0]);return}
    const note=root.querySelector('.catalog-note');
    try{
      const found=await lookupBarcode(q);
      if(!found){note.textContent='لم يتم العثور على منتج بهذا الباركود.';return}
      const row=rows.find(x=>Number(x.product_id)===Number(found.product_id));
      if(!row){note.textContent='الباركود معروف لكن المنتج غير متاح في هذا السياق.';return}
      choose(select,root,row);note.textContent='تم اختيار المنتج بواسطة الباركود.';
    }catch(error){note.textContent='تعذر قراءة الباركود: '+(error?.message||error)}
  }

  function syncSelected(select,root){
    const box=root.querySelector('.catalog-selected');const row=rows.find(x=>Number(x.product_id)===Number(select.value));
    if(!row){box.classList.add('hidden');box.textContent='';return}
    box.classList.remove('hidden');box.textContent='المحدد: '+row.product_name+' (#'+row.product_id+') — '+stockText(row);
  }

  async function refresh(select,root){
    if(busy)return;busy=true;const note=root.querySelector('.catalog-note');note.textContent='جاري تحميل الكمية حسب الفرع…';
    try{await loadRows();updateCategoryOptions(root);page=1;root.dataset.collapsed='0';render(root,select);note.textContent='الكمية والحالة حسب الفرع المختار.'}
    catch(error){note.textContent='تعذر تحديث قائمة المنتجات: '+(error?.message||error)}finally{busy=false}
  }

  function bindGlobalScanner(select,root){
    document.addEventListener('keydown',event=>{
      const t=event.target,interactive=t&&(['INPUT','TEXTAREA','SELECT'].includes(t.tagName)||t.isContentEditable);if(interactive)return;
      const now=Date.now();if(now-scannerLast>120)scannerBuffer='';scannerLast=now;
      if(event.key==='Enter'){
        const code=scannerBuffer;scannerBuffer='';if(!code)return;
        event.preventDefault();chooseFromCode(code,select,root);return;
      }
      if(event.key.length===1&&!event.ctrlKey&&!event.altKey&&!event.metaKey)scannerBuffer+=event.key;
    },true);
  }

  function injectStyle(){
    if(document.getElementById('catalogPickerStyle'))return;
    const style=document.createElement('style');style.id='catalogPickerStyle';style.textContent=`
      .catalog-picker{margin-top:6px}.catalog-tools{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(135px,.8fr);gap:7px}.catalog-tools input,.catalog-tools select{margin:0}.catalog-results{display:grid;gap:6px;margin-top:7px;max-height:390px;overflow:auto}.catalog-results.hidden{display:none!important}.catalog-row{display:flex;justify-content:space-between;align-items:center;gap:10px;text-align:right;background:#f8fafc!important;border:1px solid var(--line,#e5e7eb)!important;color:var(--text,#172033)!important;font-weight:800!important;padding:10px!important}.catalog-main{display:grid;gap:2px;min-width:0}.catalog-main strong{overflow:hidden;text-overflow:ellipsis}.catalog-main small{color:#6b7280}.catalog-cat{font-weight:600!important}.catalog-stock{flex:0 0 auto;padding:5px 8px;border-radius:999px;font-size:12px;font-weight:900}.catalog-stock.available{background:#ecfdf5;color:#047857}.catalog-stock.out{background:#fff1f2;color:#b91c1c}.catalog-stock.unverified{background:#fff7ed;color:#9a3412}.catalog-selected{margin-top:7px;padding:9px;border-radius:10px;background:#ecfdf5;color:#047857;font-weight:800;font-size:12px}.catalog-note{margin-top:5px;color:#6b7280;font-size:11px}.catalog-empty{padding:12px;text-align:center;color:#6b7280;border:1px dashed #e5e7eb;border-radius:10px}.catalog-page{display:flex;align-items:center;justify-content:space-between;gap:7px;margin-top:7px}.catalog-page button{width:auto;padding:7px 12px;background:#fff;color:#0f766e;border:1px solid #0f766e}.catalog-page-info{font-size:11px;color:#6b7280}.catalog-page.hidden,.catalog-selected.hidden{display:none!important}@media(max-width:600px){.catalog-tools{grid-template-columns:1fr}.catalog-results{max-height:360px}}`;
    document.head.appendChild(style);
  }

  async function tryStart(attempt=0){
    startInventoryGuard();
    const select=document.getElementById(config.select),branch=document.getElementById(config.branch);
    if(!select||!branch||!branch.value){if(attempt<60)setTimeout(()=>tryStart(attempt+1),180);return}
    const root=mount(select);
    root.querySelector('.catalog-note').textContent='جاري تحميل المنتجات…';
    let initial;try{initial=await loadRows()}catch(_e){initial=null}
    if(initial===null){root.querySelector('.catalog-note').textContent='تعذر التحميل الآن؛ ستتم إعادة المحاولة.';if(attempt<60)setTimeout(()=>tryStart(attempt+1),300);return}
    updateCategoryOptions(root);render(root,select);root.querySelector('.catalog-note').textContent='الكمية والحالة حسب الفرع المختار. قارئ USB يعمل كلوحة مفاتيح ويمكن المسح مباشرة.';
    branch.addEventListener('change',()=>refresh(select,root));window.addEventListener('shop:catalog-refresh',()=>refresh(select,root));bindGlobalScanner(select,root);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>tryStart(),{once:true});else tryStart();
})();
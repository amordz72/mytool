/* MyTool — reusable customer/shop picker for money workflows. */
(function(){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function create(options){
    const supabase=options.supabase,input=typeof options.input==='string'?document.getElementById(options.input):options.input,results=typeof options.results==='string'?document.getElementById(options.results):options.results;
    if(!supabase||!input||!results)throw new Error('MoneyPartyPicker: missing required options');
    const role=options.role||'admin',token=options.token||'',limit=options.limit||50;
    let selected=null,timer=null,seq=0,rows=[];
    const emit=()=>{if(typeof options.onSelect==='function')options.onSelect(selected)};
    function badges(row){const bits=[];if(row.favorite)bits.push('<span class="mpp-badge favorite">★ مفضلة</span>');if(row.financial_open)bits.push('<span class="mpp-badge financial">له رصيد/دين</span>');if(!row.active)bits.push('<span class="mpp-badge inactive">غير نشط</span>');return bits.join('')}
    function render(){if(!rows.length){results.innerHTML='<div class="mpp-empty">لا توجد نتائج.</div>';return}results.innerHTML=rows.map(r=>'<button class="mpp-item" type="button" data-party-id="'+r.id+'"><span class="mpp-name">'+esc(r.display_name)+'</span><span class="mpp-tags">'+badges(r)+'</span></button>').join('');results.querySelectorAll('[data-party-id]').forEach(btn=>btn.addEventListener('click',()=>{const row=rows.find(r=>String(r.id)===String(btn.dataset.partyId));if(!row)return;selected={id:Number(row.id),name:row.display_name,row};input.value=row.display_name;results.innerHTML='';emit()}))}
    async function search(){const mySeq=++seq,q=input.value.trim(),rpc=role==='worker'?'worker_search_money_parties':'admin_search_money_parties',args=role==='worker'?{p_session_token:token,p_query:q||null,p_limit:limit}:{p_query:q||null,p_limit:limit};const {data,error}=await supabase.rpc(rpc,args);if(mySeq!==seq)return;if(error){results.innerHTML='<div class="mpp-empty error">تعذر تحميل القائمة.</div>';if(typeof options.onError==='function')options.onError(error);return}rows=data||[];render()}
    function schedule(){selected=null;emit();clearTimeout(timer);timer=setTimeout(search,180)}
    input.addEventListener('input',schedule);input.addEventListener('focus',()=>{if(!results.innerHTML)search()});
    function clear(){selected=null;input.value='';results.innerHTML='';emit()}
    search();return{search,clear,getSelected:()=>selected,setSelected(row){selected=row?{id:Number(row.id),name:row.display_name||row.name||'',row}:null;if(selected)input.value=selected.name;emit()}};
  }
  window.MoneyPartyPicker=Object.freeze({create});
})();
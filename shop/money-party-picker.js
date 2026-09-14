/* MyTool — reusable customer/shop picker for money workflows. */
(function(){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=value=>String(value??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ar');
  function create(options){
    const supabase=options.supabase,input=typeof options.input==='string'?document.getElementById(options.input):options.input,results=typeof options.results==='string'?document.getElementById(options.results):options.results;
    if(!supabase||!input||!results)throw new Error('MoneyPartyPicker: missing required options');
    const role=options.role||'admin',token=options.token||'',limit=options.limit||50,allowCreate=role==='admin'&&options.allowCreate===true,partyType=options.partyType||'customer';
    let selected=null,timer=null,seq=0,rows=[];
    const emit=()=>{if(typeof options.onSelect==='function')options.onSelect(selected)};
    function badges(row){const bits=[];if(row.favorite)bits.push('<span class="mpp-badge favorite">★ مفضلة</span>');if(row.financial_open)bits.push('<span class="mpp-badge financial">له رصيد/دين</span>');if(!row.active)bits.push('<span class="mpp-badge inactive">غير نشط</span>');return bits.join('')}
    async function createMissing(name){
      const clean=String(name||'').trim().replace(/\s+/g,' ');if(clean.length<2)return;
      if(!confirm('إضافة «'+clean+'» إلى دليل العملاء؟'))return;
      const {data,error}=await supabase.rpc('admin_create_money_party',{p_display_name:clean,p_party_type:partyType});
      if(error){results.innerHTML='<div class="mpp-empty error">تعذر إضافة الاسم.</div>';if(typeof options.onError==='function')options.onError(error);return}
      selected={id:Number(data),name:clean,row:{id:Number(data),display_name:clean,active:true,financial_open:false,favorite:false}};input.value=clean;results.innerHTML='';emit();if(typeof options.onCreate==='function')options.onCreate(selected);
    }
    function render(query){
      const q=String(query||'').trim().replace(/\s+/g,' '),exact=rows.some(r=>norm(r.display_name)===norm(q));
      const createButton=allowCreate&&q.length>=2&&!exact?'<button class="mpp-item" type="button" data-create-party="1"><span class="mpp-name">＋ إضافة «'+esc(q)+'»</span><span class="mpp-tags"><span class="mpp-badge favorite">اسم جديد</span></span></button>':'';
      const items=rows.map(r=>'<button class="mpp-item" type="button" data-party-id="'+r.id+'"><span class="mpp-name">'+esc(r.display_name)+'</span><span class="mpp-tags">'+badges(r)+'</span></button>').join('');
      results.innerHTML=createButton+items+(!items&&!createButton?'<div class="mpp-empty">لا توجد نتائج.</div>':'');
      results.querySelector('[data-create-party]')?.addEventListener('click',()=>createMissing(q));
      results.querySelectorAll('[data-party-id]').forEach(btn=>btn.addEventListener('click',()=>{const row=rows.find(r=>String(r.id)===String(btn.dataset.partyId));if(!row)return;selected={id:Number(row.id),name:row.display_name,row};input.value=row.display_name;results.innerHTML='';emit()}));
    }
    async function search(){const mySeq=++seq,q=input.value.trim(),rpc=role==='worker'?'worker_search_money_parties':'admin_search_money_parties',args=role==='worker'?{p_session_token:token,p_query:q||null,p_limit:limit}:{p_query:q||null,p_limit:limit};const {data,error}=await supabase.rpc(rpc,args);if(mySeq!==seq)return;if(error){results.innerHTML='<div class="mpp-empty error">تعذر تحميل القائمة.</div>';if(typeof options.onError==='function')options.onError(error);return}rows=data||[];render(q)}
    function schedule(){selected=null;emit();clearTimeout(timer);timer=setTimeout(search,180)}
    input.addEventListener('input',schedule);input.addEventListener('focus',()=>{if(!results.innerHTML)search()});
    function clear(){selected=null;input.value='';results.innerHTML='';emit()}
    search();return{search,clear,getSelected:()=>selected,setSelected(row){selected=row?{id:Number(row.id),name:row.display_name||row.name||'',row}:null;if(selected)input.value=selected.name;emit()}};
  }
  window.MoneyPartyPicker=Object.freeze({create});
})();
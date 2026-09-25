/* MyTool — reusable customer/shop picker for money workflows. */
(function(){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=value=>String(value??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ar');
  const mtCode=row=>row?.mt_number?('MT-'+String(row.mt_number).padStart(5,'0')):'';
  const selectedLabel=row=>row?.mytool_username?(String(row.mytool_username)+' · '+String(row.display_name||'')):(row?.mt_number?(mtCode(row)+' · '+String(row.display_name||'')):String(row?.display_name||''));
  const shortHint=value=>{const v=String(value||'').trim();return v.length>72?v.slice(0,69)+'…':v};
  function create(options){
    const supabase=options.supabase,input=typeof options.input==='string'?document.getElementById(options.input):options.input,results=typeof options.results==='string'?document.getElementById(options.results):options.results;
    if(!supabase||!input||!results)throw new Error('MoneyPartyPicker: missing required options');
    const role=options.role||'admin',token=options.token||'',limit=options.limit||50,allowCreate=role==='admin'&&options.allowCreate===true,partyType=options.partyType||'customer',manageFavorites=options.manageFavorites!==false;
    let selected=null,timer=null,seq=0,rows=[];
    const emit=()=>{if(typeof options.onSelect==='function')options.onSelect(selected)};
    function badges(row){const bits=[];if(row.favorite)bits.push('<span class="mpp-badge favorite">★ مفضلة</span>');if(row.financial_open)bits.push('<span class="mpp-badge financial">له رصيد/دين</span>');if(!row.active)bits.push('<span class="mpp-badge inactive">غير نشط</span>');return bits.join('')}
    function rowHtml(row){
      const star=manageFavorites?'<button class="mpp-favorite-toggle'+(row.favorite?' on':'')+'" type="button" data-favorite-party="'+row.id+'" aria-label="'+(row.favorite?'إزالة من المفضلة':'إضافة إلى المفضلة')+'">'+(row.favorite?'★':'☆')+'</button>':'';
      const code=mtCode(row),hint=shortHint(row.identity_hint),username=row.mytool_username?(row.mytool_username):'';
      return '<div class="mpp-row">'+star+'<button class="mpp-item" type="button" data-party-id="'+row.id+'"><span class="mpp-main"><span class="mpp-id">'+esc([username,code].filter(Boolean).join(' · '))+'</span><span class="mpp-name">'+esc(row.display_name)+'</span>'+(hint?'<span class="mpp-hint">'+esc(hint)+'</span>':'')+'</span><span class="mpp-tags">'+badges(row)+'</span></button></div>';
    }
    async function createMissing(name){
      const clean=String(name||'').trim().replace(/\s+/g,' ');if(clean.length<2)return;
      if(!confirm('إضافة «'+clean+'» إلى دليل العملاء؟'))return;
      const {data,error}=await supabase.rpc('admin_create_money_party',{p_display_name:clean,p_party_type:partyType});
      if(error){results.innerHTML='<div class="mpp-empty error">تعذر إضافة الاسم.</div>';if(typeof options.onError==='function')options.onError(error);return}
      selected={id:Number(data),name:clean,row:{id:Number(data),display_name:clean,active:true,financial_open:false,favorite:false}};input.value=clean;results.innerHTML='';emit();if(typeof options.onCreate==='function')options.onCreate(selected);
    }
    async function toggleFavorite(id){
      const row=rows.find(r=>String(r.id)===String(id));if(!row)return;
      const next=!row.favorite;
      results.querySelectorAll('[data-favorite-party="'+id+'"]').forEach(btn=>btn.disabled=true);
      const rpc=role==='worker'?'worker_set_money_party_favorite':'admin_set_money_party_favorite';
      const args=role==='worker'?{p_session_token:token,p_party_id:Number(id),p_favorite:next}:{p_party_id:Number(id),p_favorite:next};
      const {error}=await supabase.rpc(rpc,args);
      if(error){results.insertAdjacentHTML('afterbegin','<div class="mpp-empty error">تعذر تحديث المفضلة.</div>');if(typeof options.onError==='function')options.onError(error);return}
      row.favorite=next;
      if(typeof options.onFavoriteChange==='function')options.onFavoriteChange(row);
      await search();
    }
    function render(query){
      const q=String(query||'').trim().replace(/\s+/g,' ');
      const createButton=allowCreate&&q.length>=2?'<button class="mpp-item" type="button" data-create-party="1"><span class="mpp-name">＋ إنشاء شخص جديد «'+esc(q)+'»</span><span class="mpp-tags"><span class="mpp-badge favorite">حتى لو تشابه الاسم</span></span></button>':'';
      let items='';
      if(!q){
        const favorites=rows.filter(r=>r.favorite),others=rows.filter(r=>!r.favorite);
        if(favorites.length)items+='<div class="mpp-section-title">★ المفضلة</div>'+favorites.map(rowHtml).join('');
        if(others.length)items+='<div class="mpp-section-title">باقي الحسابات</div>'+others.map(rowHtml).join('');
      }else items=rows.map(rowHtml).join('');
      results.innerHTML=createButton+items+(!items&&!createButton?'<div class="mpp-empty">لا توجد نتائج.</div>':'');
      results.querySelector('[data-create-party]')?.addEventListener('click',()=>createMissing(q));
      results.querySelectorAll('[data-party-id]').forEach(btn=>btn.addEventListener('click',()=>{const row=rows.find(r=>String(r.id)===String(btn.dataset.partyId));if(!row)return;selected={id:Number(row.id),name:row.display_name,row};input.value=selectedLabel(row);results.innerHTML='';emit()}));
      results.querySelectorAll('[data-favorite-party]').forEach(btn=>btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();toggleFavorite(btn.dataset.favoriteParty)}));
    }
    async function search(){const mySeq=++seq,q=input.value.trim(),rpc=role==='worker'?'worker_search_money_parties':'admin_search_money_parties',args=role==='worker'?{p_session_token:token,p_query:q||null,p_limit:limit}:{p_query:q||null,p_limit:limit};const {data,error}=await supabase.rpc(rpc,args);if(mySeq!==seq)return;if(error){results.innerHTML='<div class="mpp-empty error">تعذر تحميل القائمة.</div>';if(typeof options.onError==='function')options.onError(error);return}rows=data||[];render(q)}
    function schedule(){selected=null;emit();clearTimeout(timer);timer=setTimeout(search,180)}
    input.addEventListener('input',schedule);input.addEventListener('focus',()=>{if(!results.innerHTML)search()});
    function clear(){selected=null;input.value='';results.innerHTML='';emit()}
    search();return{search,clear,getSelected:()=>selected,getRows:()=>rows.slice(),setSelected(row){selected=row?{id:Number(row.id),name:row.display_name||row.name||'',row}:null;if(selected)input.value=selectedLabel(row);emit()}};
  }
  window.MoneyPartyPicker=Object.freeze({create});
})();
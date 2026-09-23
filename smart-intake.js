(() => {
  'use strict';
  const STORAGE_KEY='mytool_smart_intake_draft_v1';
  let mounted=false,overlay=null,input=null;

  function injectStyle(){
    if(document.getElementById('mytoolSmartIntakeStyle'))return;
    const style=document.createElement('style');
    style.id='mytoolSmartIntakeStyle';
    style.textContent=`
      .smart-intake-card{font:inherit;text-align:right;cursor:pointer;width:100%}
      .smart-intake-overlay{position:fixed;inset:0;z-index:5000;background:#0f172a80;display:flex;align-items:center;justify-content:center;padding:14px}
      .smart-intake-overlay[hidden]{display:none!important}
      .smart-intake-panel{width:min(100%,620px);background:#fff;border-radius:20px;padding:16px;box-shadow:0 24px 70px #0f172a45;text-align:right}
      .smart-intake-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}
      .smart-intake-head h2{margin:0;font-size:19px}
      .smart-intake-head p{margin:5px 0 0;color:#61778a;font-size:12px;line-height:1.6}
      .smart-intake-close{width:42px!important;height:42px;padding:0!important;border:1px solid #dbe7f0!important;border-radius:12px!important;background:#fff!important;color:#163047!important;font-size:22px!important}
      .smart-intake-text{width:100%;min-height:180px;resize:vertical;border:1px solid #dbe7f0;border-radius:14px;padding:12px;font:inherit;line-height:1.65;background:#fff}
      .smart-intake-note{margin-top:8px;padding:9px 10px;border-radius:11px;background:#eff6ff;color:#1d4ed8;font-size:12px;line-height:1.6}
      .smart-intake-actions{display:flex;gap:8px;margin-top:12px}
      .smart-intake-actions button{flex:1}
      @media(max-width:620px){
        .smart-intake-overlay{align-items:flex-end;padding:0}
        .smart-intake-panel{border-radius:22px 22px 0 0;padding:14px 12px calc(14px + env(safe-area-inset-bottom))}
        .smart-intake-text{min-height:150px}
      }
    `;
    document.head.appendChild(style);
  }

  function close(){
    if(!overlay)return;
    overlay.hidden=true;
    document.documentElement.style.overflow='';
  }

  function open(){
    if(!overlay)return;
    overlay.hidden=false;
    document.documentElement.style.overflow='hidden';
    setTimeout(()=>input?.focus(),30);
  }

  function continueToOrders(){
    const raw=input?.value??'';
    if(!raw.trim()){input?.focus();return}
    sessionStorage.setItem(STORAGE_KEY,JSON.stringify({
      version:1,
      raw_input:raw,
      captured_at:new Date().toISOString(),
      source_kind:'paste',
      origin:'mytool_home'
    }));
    location.href='orders/?intake=1&v=20260923-editable-autofill1';
  }

  function mount(){
    if(mounted)return true;
    const dashboard=document.getElementById('dashboard');
    const core=document.querySelector('[data-dashboard-section="core"]');
    if(!dashboard||dashboard.hidden||!core)return false;
    mounted=true;
    injectStyle();

    const card=document.createElement('button');
    card.type='button';
    card.id='smartIntakeCard';
    card.className='card smart-intake-card';
    card.innerHTML='<div class="icon">✚</div><h2>لصق وتسجيل</h2><p>الصق محادثة أو طلبًا؛ MyTool يحللها ثم يحولك للخدمة أو شاشة البيع المناسبة.</p><span class="badge">يحفظ النص والوقت</span>';
    const ordersCard=core.querySelector('a[href^="orders/"]');
    if(ordersCard)core.insertBefore(card,ordersCard);else core.prepend(card);

    overlay=document.createElement('div');
    overlay.className='smart-intake-overlay';
    overlay.hidden=true;
    overlay.innerHTML='<section class="smart-intake-panel" role="dialog" aria-modal="true" aria-labelledby="smartIntakeTitle">'+
      '<div class="smart-intake-head"><div><h2 id="smartIntakeTitle">لصق طلب أو محادثة</h2><p>الصق النص كما وصل. لا تعدله؛ التحليل منفصل عن الأصل.</p></div><button class="smart-intake-close" type="button" aria-label="إغلاق">×</button></div>'+
      '<textarea class="smart-intake-text" placeholder="[22/9، 23:25] العميل: 2621128481\n[22/9، 23:25] العميل: 200 جوهرة"></textarea>'+
      '<div class="smart-intake-note">سيُحفظ النص الأصلي كما لصقته، ووقت الرسالة إذا كان موجودًا داخل المحادثة، إضافة إلى وقت إدخال الطلب في MyTool.</div>'+
      '<div class="smart-intake-actions"><button class="btn secondary smart-intake-cancel" type="button">إلغاء</button><button class="btn smart-intake-go" type="button">تحليل ومتابعة</button></div>'+
      '</section>';
    document.body.appendChild(overlay);
    input=overlay.querySelector('.smart-intake-text');

    card.addEventListener('click',open);
    overlay.querySelector('.smart-intake-close').addEventListener('click',close);
    overlay.querySelector('.smart-intake-cancel').addEventListener('click',close);
    overlay.querySelector('.smart-intake-go').addEventListener('click',continueToOrders);
    overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!overlay.hidden)close()});
    return true;
  }

  if(!mount()){
    const observer=new MutationObserver(()=>{if(mount())observer.disconnect()});
    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});
  }
})();
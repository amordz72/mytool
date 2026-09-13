/* Camera barcode binding for the admin barcode page.
 * Phase 1: scan a factory barcode, place it in the selected product's external barcode field,
 * then require the existing explicit Save button to persist the link.
 */
(function(){
  'use strict';
  if(document.body?.dataset?.screen!=='barcodes')return;

  const $=id=>document.getElementById(id);
  let scanner=null,running=false,lastCode='';

  function injectStyle(){
    if($('barcodeCameraBindStyle'))return;
    const style=document.createElement('style');
    style.id='barcodeCameraBindStyle';
    style.textContent=`
      .camera-bind-wrap{margin-top:8px}.camera-bind-btn{margin-top:7px;background:#fff!important;color:#0f766e!important;border:1px solid #0f766e!important;font-weight:900!important}.camera-bind-panel{margin-top:10px;padding:10px;border:1px solid #d1fae5;border-radius:12px;background:#f0fdfa}.camera-bind-panel.hidden{display:none!important}.camera-bind-reader{margin-top:8px;border-radius:12px;overflow:hidden;background:#0f172a}.camera-bind-status{margin-top:8px;font-size:12px;line-height:1.7;color:#475569}.camera-bind-code{direction:ltr;text-align:center;font-family:monospace;font-size:18px;font-weight:900;margin-top:6px}.camera-bind-actions{display:flex;gap:7px;margin-top:8px}.camera-bind-actions button{width:auto}.camera-bind-stop{background:#fff!important;color:#b91c1c!important;border:1px solid #fecaca!important}@media(max-width:600px){.camera-bind-actions{display:grid;grid-template-columns:1fr}.camera-bind-actions button{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function loadLibrary(){
    if(window.Html5Qrcode)return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const existing=document.querySelector('script[data-html5-qrcode]');
      if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return;}
      const script=document.createElement('script');
      script.src='https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
      script.defer=true;
      script.dataset.html5Qrcode='1';
      script.onload=resolve;
      script.onerror=()=>reject(new Error('تعذر تحميل مكتبة الكاميرا'));
      document.head.appendChild(script);
    });
  }

  function selectedProductLabel(){
    const select=$('productSelect');
    if(!select?.value)return '';
    return select.selectedOptions?.[0]?.textContent?.trim()||('منتج #'+select.value);
  }

  function setStatus(text,code=''){
    const status=$('cameraBindStatus');
    const codeBox=$('cameraBindCode');
    if(status)status.textContent=text;
    if(codeBox){codeBox.textContent=code||'';codeBox.hidden=!code;}
  }

  async function stopCamera(){
    if(scanner&&running){try{await scanner.stop()}catch(_e){}}
    running=false;
    const stop=$('cameraBindStop');if(stop)stop.disabled=true;
    const start=$('cameraBindStart');if(start)start.disabled=false;
  }

  async function onDecoded(decodedText){
    const code=String(decodedText||'').trim();
    if(!code||code===lastCode)return;
    lastCode=code;
    await stopCamera();
    const input=$('externalBarcode');
    if(input){input.value=code;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
    const product=selectedProductLabel();
    if(product){
      setStatus('تمت القراءة. الباركود جاهز للربط مع '+product+'. راجع الرقم ثم اضغط «حفظ الباركود الخارجي».',code);
      $('saveExternal')?.scrollIntoView({behavior:'smooth',block:'center'});
    }else{
      setStatus('تمت القراءة، لكن لم يتم اختيار منتج. اختر المنتج أولًا ثم اضغط «حفظ الباركود الخارجي».',code);
    }
  }

  async function startCamera(){
    if(running)return;
    const product=selectedProductLabel();
    if(!product){setStatus('اختر المنتج أولًا حتى نربط الباركود بالمنتج الصحيح.');$('productSelect')?.focus();return;}
    setStatus('جاري تشغيل الكاميرا…');
    try{
      await loadLibrary();
      scanner=scanner||new Html5Qrcode('cameraBindReader');
      lastCode='';
      await scanner.start({facingMode:'environment'},{fps:10,qrbox:{width:280,height:150},aspectRatio:1.777778},onDecoded,()=>{});
      running=true;
      $('cameraBindStart').disabled=true;
      $('cameraBindStop').disabled=false;
      setStatus('الكاميرا تعمل. وجّهها إلى باركود المصنع الموجود على المنتج.');
    }catch(error){
      running=false;
      setStatus('تعذر تشغيل الكاميرا: '+(error?.message||error)+'. تأكد من السماح بإذن الكاميرا.');
    }
  }

  function mount(){
    const external=$('externalBarcode'),save=$('saveExternal');
    if(!external||!save||$('cameraBindWrap'))return false;
    injectStyle();
    const wrap=document.createElement('div');
    wrap.id='cameraBindWrap';
    wrap.className='camera-bind-wrap';
    wrap.innerHTML=`
      <button id="cameraBindStart" class="camera-bind-btn" type="button">📷 مسح باركود المصنع بالكاميرا</button>
      <div id="cameraBindPanel" class="camera-bind-panel">
        <div style="font-weight:900">ربط باركود موجود بالمنتج</div>
        <div class="camera-bind-status">اختر المنتج، ثم امسح باركود العلبة. لن يتم الحفظ تلقائيًا؛ الحفظ يبقى بزر «حفظ الباركود الخارجي».</div>
        <div id="cameraBindReader" class="camera-bind-reader"></div>
        <div id="cameraBindCode" class="camera-bind-code" hidden></div>
        <div id="cameraBindStatus" class="camera-bind-status">جاهز.</div>
        <div class="camera-bind-actions"><button id="cameraBindStop" class="camera-bind-stop" type="button" disabled>إيقاف الكاميرا</button></div>
      </div>`;
    save.insertAdjacentElement('afterend',wrap);
    $('cameraBindStart').onclick=startCamera;
    $('cameraBindStop').onclick=stopCamera;
    window.addEventListener('beforeunload',()=>{if(scanner&&running)scanner.stop().catch(()=>{})});
    return true;
  }

  function start(attempt=0){
    if(mount())return;
    if(attempt<60)setTimeout(()=>start(attempt+1),150);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>start(),{once:true});else start();
})();
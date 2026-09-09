(()=>{
  function cleanWhatsAppEnvelope(raw){
    const src=String(raw||'').replace(/\r\n?/g,'\n');
    const out=[];
    for(const original of src.split('\n')){
      let line=original;

      // شكل النسخ المباشر من واتساب: [9/9، 20:23] الاسم: الرسالة
      line=line.replace(/^\s*\[[^\]]{3,40}\]\s*[^:\n]{1,80}:\s*/, '');

      // شكل التصدير الشائع: 09/09/2026, 20:23 - الاسم: الرسالة
      line=line.replace(/^\s*\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?\s*[,،]\s*\d{1,2}:\d{2}(?:\s*[APap][Mm])?\s*[-–—]\s*[^:\n]{1,80}:\s*/, '');

      // لا نحذف أي سطر آخر ولا نربط التنظيف باسم مستخدم معيّن.
      out.push(line);
    }
    return out.join('\n');
  }

  window.cleanWhatsAppEnvelope=cleanWhatsAppEnvelope;

  // نلفّ المعالجات الحالية بدل تغيير الـRaw Source داخل مربع النص.
  if(typeof window.validateCardSource==='function'){
    const original=window.validateCardSource;
    window.validateCardSource=(raw,rule)=>original(cleanWhatsAppEnvelope(raw),rule);
  }
  if(typeof window.validateWaffarlySource==='function'){
    const original=window.validateWaffarlySource;
    window.validateWaffarlySource=raw=>original(cleanWhatsAppEnvelope(raw));
  }
  if(typeof window.validateTokenSource==='function'){
    const original=window.validateTokenSource;
    window.validateTokenSource=raw=>original(cleanWhatsAppEnvelope(raw));
  }
  if(typeof window.processPlain==='function'){
    const original=window.processPlain;
    window.processPlain=function(){
      const box=document.getElementById('text');
      if(!box)return original();
      const raw=box.value,cleaned=cleanWhatsAppEnvelope(raw);
      if(cleaned===raw)return original();
      try{box.value=cleaned;return original()}finally{box.value=raw}
    };
  }
})();

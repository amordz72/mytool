(()=>{
  const previousProcess=typeof window.processPlain==='function'?window.processPlain:null;
  const previousAnalyze=typeof window.smartExtractCodes==='function'?window.smartExtractCodes:null;
  const text=document.getElementById('text'),hint=document.getElementById('hint');
  if(!previousProcess||!previousAnalyze||!text)return;

  const INVISIBLE=/[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;
  const NBSP=/[\u00A0\u202F]/g;
  const normalize=value=>String(value??'').replace(INVISIBLE,'').replace(NBSP,' ').trim();

  function expandCopiedText(raw){
    const out=[];
    String(raw||'').replace(/\r\n?/g,'\n').split('\n').forEach(original=>{
      const line=normalize(original);
      if(!line)return;
      const seen=new Set();
      const add=value=>{const v=normalize(value);if(v&&!seen.has(v)){seen.add(v);out.push(v)}};
      add(line);

      // خلايا الجداول المنسوخة من المواقع غالبًا تصل مفصولة بـ Tab أو | أو ;
      line.split(/\t+|\s*\|\s*|;+\s*/).forEach(add);

      // استخراج الأرقام الطويلة من سطر مركب، مع تجنب تكرار السطر إذا كان هو الكود نفسه.
      (line.match(/\d{5,96}/g)||[]).forEach(run=>{if(run!==line)add(run)});
    });
    return out.join('\n');
  }

  function detectedType(){
    try{return typeof window.detectContentType==='function'?window.detectContentType(text.value):'plain'}catch(e){return'plain'}
  }

  function processEnhancedPlain(){
    const detected=detectedType();
    if(detected&&detected!=='plain')return previousProcess();
    const raw=text.value,expanded=expandCopiedText(raw);
    if(expanded===raw)return previousProcess();
    try{text.value=expanded;return previousProcess()}finally{text.value=raw}
  }

  window.smartExtractCodes=raw=>previousAnalyze(expandCopiedText(raw));
  window.processPlain=processEnhancedPlain;
  window.expandCopiedTableText=expandCopiedText;

  if(hint&&document.querySelector('.tab.on[data-type="plain"]')){
    hint.textContent='استخراج الأكواد من الأسطر وخلايا الجداول والنصوص المنسوخة من المواقع، مع تنظيف العلامات المخفية حول الأرقام.';
  }

  setTimeout(()=>{
    if(!text.value.trim()||detectedType()!=='plain')return;
    processEnhancedPlain();
  },0);
})();

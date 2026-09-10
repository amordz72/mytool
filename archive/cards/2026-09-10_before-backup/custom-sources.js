(()=>{
  const STORAGE_KEY='mytool.cards.customSources.v1';
  const TYPE_PREFIX='custom:';
  const asText=v=>String(v??'').trim();
  const lines=v=>String(v??'').split(/\r\n|\n|\r/).map(x=>x.trim()).filter(Boolean);
  const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeName=v=>String(v||'SOURCE').trim().replace(/[/\\?%*:|"<>]/g,'-').replace(/\s+/g,'-').replace(/-+/g,'-');
  const pad=n=>String(n).padStart(2,'0');

  function normalizeRule(raw={}){
    return{
      id:asText(raw.id)||('src-'+Date.now().toString(36)),
      name:asText(raw.name)||'مصدر مخصص',
      enabled:raw.enabled!==false,
      markers:Array.isArray(raw.markers)?raw.markers.map(asText).filter(Boolean):lines(raw.markers),
      detectMode:raw.detectMode==='any'?'any':'all',
      productLabel:asText(raw.productLabel),
      quantityLabels:Array.isArray(raw.quantityLabels)?raw.quantityLabels.map(asText).filter(Boolean):lines(raw.quantityLabels),
      startAfter:asText(raw.startAfter),
      stopBefore:asText(raw.stopBefore),
      codeKind:['digits','alnum','mixed','any'].includes(raw.codeKind)?raw.codeKind:'digits',
      codeLength:Number.isInteger(Number(raw.codeLength))&&Number(raw.codeLength)>0?Number(raw.codeLength):null,
      removeSpaces:raw.removeSpaces!==false,
      removeHyphens:raw.removeHyphens===true,
      filePrefix:asText(raw.filePrefix)||safeName(raw.name||'SOURCE').toUpperCase()
    };
  }

  function readRules(){
    try{
      const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
      return Array.isArray(raw)?raw.map(normalizeRule):[];
    }catch(e){return[]}
  }

  function writeRules(rules){
    const normalized=(Array.isArray(rules)?rules:[]).map(normalizeRule);
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(normalized))}catch(e){return false}
    try{window.dispatchEvent(new CustomEvent('mytool:custom-sources-changed'))}catch(e){}
    return true;
  }

  function fieldAfterLabel(raw,label){
    if(!label)return'';
    const wanted=label.toLowerCase();
    for(const original of String(raw||'').replace(/\r\n?/g,'\n').split('\n')){
      const line=original.trim();
      if(line.toLowerCase().startsWith(wanted))return line.slice(label.length).trim().replace(/^[:：\-\s]+/,'').trim();
    }
    return'';
  }

  function selectArea(raw,rule){
    const source=String(raw||'');
    const lower=source.toLowerCase();
    let start=0,end=source.length;
    if(rule.startAfter){
      const i=lower.indexOf(rule.startAfter.toLowerCase());
      if(i<0)return'';
      start=i+rule.startAfter.length;
    }
    if(rule.stopBefore){
      const i=lower.indexOf(rule.stopBefore.toLowerCase(),start);
      if(i>=0)end=i;
    }
    return source.slice(start,end);
  }

  function cleanCandidate(value,rule){
    let v=String(value||'').trim();
    if(rule.removeSpaces)v=v.replace(/\s+/g,'');
    if(rule.removeHyphens)v=v.replace(/-/g,'');
    return v;
  }

  function validCode(value,rule){
    if(!value)return false;
    if(rule.codeLength&&value.length!==rule.codeLength)return false;
    if(!rule.codeLength&&(value.length<5||value.length>128))return false;
    if(rule.codeKind==='digits')return /^\d+$/.test(value);
    if(rule.codeKind==='alnum')return /^[A-Za-z0-9]+$/.test(value)&&/[A-Za-z]/.test(value)&&/\d/.test(value);
    if(rule.codeKind==='mixed')return /^[A-Za-z0-9_-]+$/.test(value)&&/\d/.test(value);
    return /^[A-Za-z0-9._:+\/-]+$/.test(value)&&/\d/.test(value);
  }

  function extract(ruleInput,raw){
    const rule=normalizeRule(ruleInput),area=selectArea(raw,rule),codes=[];
    area.replace(/\r\n?/g,'\n').split('\n').forEach(original=>{
      const candidate=cleanCandidate(original,rule);
      if(validCode(candidate,rule))codes.push(candidate);
    });
    let quantity='';
    for(const label of rule.quantityLabels){quantity=fieldAfterLabel(raw,label);if(quantity)break}
    const product=fieldAfterLabel(raw,rule.productLabel);
    const counts=new Map();codes.forEach(code=>counts.set(code,(counts.get(code)||0)+1));
    const duplicateCount=[...counts.values()].reduce((sum,n)=>sum+Math.max(0,n-1),0);
    return{rule,codes,product,quantity,duplicateCount};
  }

  function markersMatch(ruleInput,raw){
    const rule=normalizeRule(ruleInput),source=String(raw||'').toLowerCase();
    if(!rule.enabled||!rule.markers.length)return false;
    const hits=rule.markers.map(marker=>source.includes(marker.toLowerCase()));
    return rule.detectMode==='any'?hits.some(Boolean):hits.every(Boolean);
  }

  function matches(rule,raw){
    if(!markersMatch(rule,raw))return false;
    return extract(rule,raw).codes.length>0;
  }

  function findMatchingRule(raw){return readRules().find(rule=>matches(rule,raw))||null}
  function getRuleByType(type){
    if(!String(type||'').startsWith(TYPE_PREFIX))return null;
    const id=String(type).slice(TYPE_PREFIX.length);
    return readRules().find(rule=>rule.id===id&&rule.enabled)||null;
  }

  window.mytoolCustomSources={STORAGE_KEY,readRules,writeRules,normalizeRule,extract,matches,findMatchingRule,typeFor:rule=>TYPE_PREFIX+normalizeRule(rule).id};

  const text=document.getElementById('text'),result=document.getElementById('result'),status=document.getElementById('status'),hint=document.getElementById('hint'),tabs=document.getElementById('tabs');
  if(!text||!result||!tabs)return;

  const baseDetect=typeof window.detectContentType==='function'?window.detectContentType:null;
  const baseSelect=typeof window.selectType==='function'?window.selectType:null;
  const baseTypeName=typeof window.typeName==='function'?window.typeName:null;
  const baseProcessPlain=typeof window.processPlain==='function'?window.processPlain:null;
  let activeCustomId=null,tabRefreshTimer=null;

  function typeOf(rule){return TYPE_PREFIX+rule.id}

  function refreshTabs(){
    clearTimeout(tabRefreshTimer);
    tabs.querySelectorAll('.tab[data-custom-source="1"]').forEach(el=>el.remove());
    const plain=tabs.querySelector('.tab[data-type="plain"]');
    readRules().filter(r=>r.enabled).forEach(rule=>{
      const button=document.createElement('button');
      button.className='tab';button.type='button';button.dataset.type=typeOf(rule);button.dataset.customSource='1';button.textContent=rule.name;
      button.onclick=()=>window.selectType(typeOf(rule));
      if(plain)tabs.insertBefore(button,plain);else tabs.appendChild(button);
    });
  }

  function scheduleRefresh(){tabRefreshTimer=setTimeout(refreshTabs,30)}

  window.detectContentType=function(raw){
    const known=baseDetect?baseDetect(raw):null;
    if(known&&known!=='plain')return known;
    const custom=findMatchingRule(raw);
    return custom?typeOf(custom):(known||'plain');
  };

  window.typeName=function(id){
    const custom=getRuleByType(id);
    return custom?custom.name:(baseTypeName?baseTypeName(id):id);
  };

  window.selectType=function(next){
    const out=baseSelect?baseSelect(next):undefined;
    const custom=getRuleByType(next);
    activeCustomId=custom?custom.id:null;
    if(custom){
      document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('on',x.dataset.type===next));
      if(hint)hint.textContent=`صيغة محفوظة للمصدر «${custom.name}». سيتم استخراج الأكواد حسب العلامات والطول والنوع المسجلين.`;
      text.placeholder=`ألصق نص ${custom.name} هنا...`;
      if(status)status.textContent=`صيغة مخصصة: ${custom.name}`;
    }
    return out;
  };

  function stamp(){const d=new Date();return `${pad(d.getDate())}${pad(d.getMonth()+1)}${String(d.getFullYear()).slice(-2)}_${pad(d.getHours())}${pad(d.getMinutes())}`}
  function fileName(data){
    const product=data.product?`_${safeName(data.product)}`:'';
    return `${safeName(data.rule.filePrefix).toUpperCase()}${product}_Count${data.codes.length}_${stamp()}.txt`;
  }
  function copyCodes(codes){
    const value=codes.join('\n');
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(value).then(()=>{if(status)status.textContent='تم نسخ الأكواد.'}).catch(()=>{});
  }
  function downloadCodes(codes,name){
    if(typeof window.download==='function'){window.download(codes.join('\n'),name,true);return}
    const blob=new Blob([codes.join('\n')],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),800);
  }
  function renderCustom(rule,raw){
    const data=extract(rule,raw);
    if(!data.codes.length){
      result.innerHTML='<div class="group validationBox"><div class="error">⚠️ الصيغة معروفة لكن لم يتم العثور على أكواد مطابقة</div><div class="hint">راجع إعداد طول/نوع الكود أو علامات بداية ونهاية منطقة الأكواد.</div></div>';
      if(status)status.textContent=`${rule.name}: لم يتم العثور على أكواد مطابقة.`;
      return data;
    }
    const meta=[data.product?`المنتج: ${escapeHtml(data.product)}`:'',data.quantity?`الكمية: ${escapeHtml(data.quantity)}`:''].filter(Boolean).join(' • ');
    result.innerHTML=`<div class="group"><div class="title"><span>🧩 ${escapeHtml(rule.name)}</span><span class="badge">${data.codes.length} كود</span></div>${meta?`<div class="hint">${meta}</div>`:''}<div class="actions"><button class="btn green" id="customCopy">نسخ</button><button class="btn gold" id="customDownload">تحميل TXT</button></div><div class="codes" id="customCodes"></div></div>`;
    document.getElementById('customCodes').textContent=data.codes.join('\n');
    document.getElementById('customCopy').onclick=()=>copyCodes(data.codes);
    document.getElementById('customDownload').onclick=()=>downloadCodes(data.codes,fileName(data));
    if(status)status.textContent=`تم التعرف على ${rule.name}: ${data.codes.length} كود${data.duplicateCount?` • يوجد ${data.duplicateCount} تكرار ولم يتم حذفه.`:''}`;
    return data;
  }

  window.processPlain=function(){
    const custom=activeCustomId?readRules().find(r=>r.id===activeCustomId&&r.enabled):null;
    if(custom)return renderCustom(custom,text.value);
    return baseProcessPlain?baseProcessPlain():undefined;
  };

  function addManagerLink(){
    if(document.getElementById('customSourcesLink'))return;
    const settings=document.getElementById('cardsSettingsLink');
    if(!settings)return;
    const link=document.createElement('a');
    link.id='customSourcesLink';link.href='./source-formats.html';link.textContent='🧩 صيغ المصادر';
    link.style.cssText=settings.style.cssText+';margin-inline-start:6px';
    settings.insertAdjacentElement('afterend',link);
  }

  refreshTabs();addManagerLink();
  if(tabs)new MutationObserver(()=>scheduleRefresh()).observe(tabs,{childList:true});
  window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY){refreshTabs();scheduleRefresh()}});
  window.addEventListener('mytool:custom-sources-changed',()=>refreshTabs());
  setTimeout(()=>{refreshTabs();addManagerLink()},250);
})();
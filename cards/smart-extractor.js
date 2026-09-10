(()=>{
  const IGNORE_KEY='mytool.cards.smartIgnoreRules';
  const DEDUPE_KEY='mytool.cards.smartDedupe';
  const DEFAULT_IGNORE=['DATE','TIME','IP','URL','EMAIL'];
  const text=document.getElementById('text'),result=document.getElementById('result'),status=document.getElementById('status'),hint=document.getElementById('hint'),tabs=document.getElementById('tabs'),subtitle=document.getElementById('subtitle'),processBtn=document.getElementById('process');
  if(!text||!result)return;

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pad=n=>String(n).padStart(2,'0');
  function stamp(){const d=new Date();return `${pad(d.getDate())}${pad(d.getMonth()+1)}${String(d.getFullYear()).slice(-2)}_${pad(d.getHours())}${pad(d.getMinutes())}`}
  function readBool(key,def=true){try{const v=localStorage.getItem(key);return v===null?def:v!=='0'}catch(e){return def}}

  function readIgnoreRules(){
    try{
      const saved=localStorage.getItem(IGNORE_KEY);
      if(saved===null)return DEFAULT_IGNORE.slice();
      return saved.split(/\r\n|\n|\r/).map(x=>x.trim()).filter(Boolean);
    }catch(e){return DEFAULT_IGNORE.slice()}
  }

  function isBuiltinIgnored(value,token){
    const t=token.toUpperCase();
    if(t==='DATE')return /^(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})$/.test(value);
    if(t==='TIME')return /^(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?(?:\s*[APap][Mm])?$/.test(value);
    if(t==='IP')return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value);
    if(t==='URL')return /^(?:https?:\/\/|www\.)\S+$/i.test(value);
    if(t==='EMAIL')return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    return false;
  }

  function matchesIgnore(value,rule){
    if(isBuiltinIgnored(value,rule))return true;
    if(/^\/.*\/[gimsuy]*$/.test(rule)){
      const last=rule.lastIndexOf('/');
      try{return new RegExp(rule.slice(1,last),rule.slice(last+1)).test(value)}catch(e){return false}
    }
    return value.toLowerCase().includes(rule.toLowerCase());
  }

  function classify(value){
    if(value.length<5||value.length>96||/\s/.test(value))return null;
    if(!/^[A-Za-z0-9_-]+$/.test(value))return null;
    if(!/\d/.test(value))return null;
    if(/^\d+$/.test(value))return{kind:'digits',label:'أرقام فقط'};
    if(/^[A-Za-z0-9]+$/.test(value))return{kind:'alnum',label:'أحرف + أرقام'};
    return{kind:'mixed',label:'أحرف/أرقام مع فواصل'};
  }

  function analyze(raw){
    const cleaned=typeof window.cleanWhatsAppEnvelope==='function'?window.cleanWhatsAppEnvelope(raw):String(raw||'');
    const rules=readIgnoreRules(),groups=new Map(),dedupe=readBool(DEDUPE_KEY,true),seen=new Set();
    let ignored=0,rejected=0,duplicates=0;
    cleaned.replace(/\r\n?/g,'\n').split('\n').forEach((original,index)=>{
      const value=original.trim();
      if(!value)return;
      if(rules.some(rule=>matchesIgnore(value,rule))){ignored++;return}
      const info=classify(value);
      if(!info){rejected++;return}
      if(dedupe){
        if(seen.has(value)){duplicates++;return}
        seen.add(value);
      }
      const key=`${info.kind}:${value.length}`;
      if(!groups.has(key))groups.set(key,{key,kind:info.kind,label:info.label,length:value.length,codes:[],firstLine:index+1});
      groups.get(key).codes.push(value);
    });
    return{groups:[...groups.values()].sort((a,b)=>a.firstLine-b.firstLine),ignored,rejected,rules,dedupe,duplicates};
  }

  function summary(a){
    if(!a.groups.length)return'لم يتم العثور على أسطر تشبه أكوادًا بعد تطبيق قواعد التجاهل.';
    return a.groups.map(g=>`${g.codes.length} ${g.label} بطول ${g.length} خانة`).join(' • ');
  }

  function filename(g){return `SMART_${g.kind.toUpperCase()}_${g.length}_Count${g.codes.length}_${stamp()}.txt`}

  function downloadCodes(codes,name){
    if(typeof window.download==='function'){window.download(codes.join('\n'),name,true);return}
    const blob=new Blob([codes.join('\n')],{type:'text/plain;charset=utf-8'}),u=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),800);
  }

  function copyCodes(codes){
    const value=codes.join('\n');
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(value).then(()=>{if(status)status.textContent='تم نسخ الأكواد.'}).catch(()=>{});
  }

  function renderSmart(){
    const a=analyze(text.value);
    if(!a.groups.length){
      result.innerHTML='<div class="group validationBox"><div class="error">⚠️ لم يتم اكتشاف أكواد واضحة</div><div class="hint">راجع قواعد التجاهل أو اختر تنسيقًا معروفًا إذا كان المصدر خاصًا به.</div></div>';
      if(status)status.textContent=summary(a);
      return a;
    }
    result.innerHTML=a.groups.map((g,i)=>`<div class="group"><div class="title"><span>🔎 ${esc(g.label)} • ${g.length} خانة</span><span class="badge">${g.codes.length} كود</span></div><div class="actions"><button class="btn green" id="smart${i}copy">نسخ</button><button class="btn gold" id="smart${i}download">تحميل TXT</button></div><div class="codes" id="smart${i}codes"></div></div>`).join('');
    a.groups.forEach((g,i)=>{
      const box=document.getElementById(`smart${i}codes`),copy=document.getElementById(`smart${i}copy`),down=document.getElementById(`smart${i}download`);
      if(box)box.textContent=g.codes.join('\n');
      if(copy)copy.onclick=()=>copyCodes(g.codes);
      if(down)down.onclick=()=>downloadCodes(g.codes,filename(g));
    });
    if(status)status.textContent=`استخراج ذكي: ${summary(a)}${a.ignored?` • تم تجاهل ${a.ignored} سطر حسب الإعدادات.`:''}${a.dedupe&&a.duplicates?` • تم استبعاد ${a.duplicates} تكرار من النتيجة.`:''}`;
    return a;
  }

  window.smartExtractCodes=analyze;
  window.processPlain=renderSmart;

  const originalTypeName=typeof window.typeName==='function'?window.typeName:null;
  if(originalTypeName)window.typeName=function(id){return id==='plain'?'استخراج ذكي':originalTypeName(id)};

  const originalSelectType=typeof window.selectType==='function'?window.selectType:null;
  if(originalSelectType)window.selectType=function(next){
    const out=originalSelectType(next);
    if(next==='plain'){
      if(hint)hint.textContent='استخراج الأسطر التي تبدو أكوادًا تلقائيًا وتجميعها حسب النوع والطول، مع تطبيق قواعد التجاهل ومنع التكرار حسب الإعدادات.';
      text.placeholder='ألصق أي نص يحتوي على أكواد هنا...';
    }
    relabel();
    return out;
  };

  function relabel(){
    const plain=tabs&&tabs.querySelector('.tab[data-type="plain"]');
    if(plain&&plain.textContent!=='استخراج ذكي')plain.textContent='استخراج ذكي';
    if(subtitle&&subtitle.textContent.includes('TXT'))subtitle.textContent=subtitle.textContent.replace('TXT','استخراج ذكي');
  }

  if(tabs)new MutationObserver(relabel).observe(tabs,{childList:true,subtree:true});
  relabel();

  window.applyAutoDetection=function(raw){
    const state=window.cardOptionState;
    if(state&&state.autoDetect&&!state.autoDetect.checked)return;
    const detected=typeof window.detectContentType==='function'?window.detectContentType(raw):null;
    if(!detected)return;
    if(typeof window.selectType==='function')window.selectType(detected);
    if(status){
      if(detected==='plain')status.textContent=`استخراج ذكي: ${summary(analyze(raw))}`;
      else status.textContent=`تم التعرف تلقائيًا: ${typeof window.typeName==='function'?window.typeName(detected):detected}.`;
    }
  };

  if(processBtn)processBtn.addEventListener('click',()=>{
    setTimeout(()=>{
      if(!text.value.trim())return;
      const detected=typeof window.detectContentType==='function'?window.detectContentType(text.value):null;
      if(detected==='plain')renderSmart();
    },0);
  });

  setTimeout(()=>{
    relabel();
    if(text.value.trim()&&typeof window.detectContentType==='function'&&window.detectContentType(text.value)==='plain')renderSmart();
  },0);
})();
(()=>{
  if(document.querySelector('script[data-helper="./custom-sources.js?v=20260910-0543"]'))return;
  const s=document.createElement('script');
  s.src='./custom-sources.js?v=20260910-0543';
  s.dataset.helper='./custom-sources.js?v=20260910-0543';
  document.body.appendChild(s);
})();
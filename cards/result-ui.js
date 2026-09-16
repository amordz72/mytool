(()=>{
  const result=document.getElementById('result'),status=document.getElementById('status');
  if(!result)return;

  const SPLIT_PREFIX='mytool.cards.split.';
  const FILE_PREFIX='mytool.cards.filePrefix.';
  const SPLIT_PARTS='mytool.cards.splitParts.';
  const SMART_SPLIT_MIGRATION_KEY='mytool.cards.smartSplitDefaultV2';
  const TRIM_KEY='mytool.cards.trim';
  const DEFAULT_PREFIX={mobilis:'MB',idoom:'ID',waffarly:'WF',token:'TS',plain:'SM'};

  const readBool=(key,def)=>{try{const v=localStorage.getItem(key);return v===null?def:v!=='0'}catch(e){return def}};
  const readText=(key,def='')=>{try{const v=localStorage.getItem(key);return v===null?def:v}catch(e){return def}};
  const cleanPrefix=(v,fallback)=>String(v||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase().slice(0,2)||fallback;
  const readPrefix=id=>cleanPrefix(readText(FILE_PREFIX+id,''),DEFAULT_PREFIX[id]||String(id||'CD').replace(/[^A-Za-z0-9]/g,'').toUpperCase().slice(0,2)||'CD');
  const readSplit=id=>readBool(SPLIT_PREFIX+id,id==='mobilis'||id==='plain');
  const readParts=(id,total)=>{const raw=Number(readText(SPLIT_PARTS+id,'2'));let n=Number.isInteger(raw)?raw:2;if(n<2)n=2;if(total&&n>total)n=total;return n};
  const useBomForType=id=>!(id==='plain'||id==='mobilis'||id==='idoom');

  try{
    if(localStorage.getItem(SMART_SPLIT_MIGRATION_KEY)===null){
      localStorage.setItem(SPLIT_PREFIX+'plain','1');
      localStorage.setItem(SMART_SPLIT_MIGRATION_KEY,'1');
    }
  }catch(e){}

  const pad=n=>String(n).padStart(2,'0');
  const timeStamp=()=>{const d=new Date();return pad(d.getHours())+pad(d.getMinutes())};
  const splitSuffix=(part,total)=>part?`_P${part}-${total}`:'';
  function shortName(type,count,part,total,extra=''){
    const x=extra?`_${String(extra).replace(/[^A-Za-z0-9_-]/g,'').slice(0,8)}`:'';
    return `${readPrefix(type)}_C${count}${x}${splitSuffix(part,total)}_${timeStamp()}.txt`;
  }
  function plainName(count,part,total){return shortName('plain',count,part,total)}
  function smartKind(kind){return kind==='DIGITS'?'D':kind==='ALNUM'?'A':'M'}
  function smartName(kind,length,count,part,total){return shortName('plain',count,part,total,`${smartKind(kind)}${length}`)}

  window.nameCard=function(rule,count,part,total){
    const id=String(rule?.id||'').toLowerCase()||'card';
    let extra='';
    if(id==='mobilis'&&rule?.detectValueFromFilename&&typeof window.mobilisValue==='function')extra=window.mobilisValue()||'';
    return shortName(id,count,part,total,extra);
  };
  window.nameWaffarly=function(prod,count,part,total){return shortName('waffarly',count,part,total)};
  window.nameToken=function(prod,count,part,total){return shortName('token',count,part,total)};
  window.namePlain=function(count,part,total){return shortName('plain',count,part,total)};

  function splitTypeFromId(id){
    id=String(id||'');
    if(id.startsWith('card-'))return id.slice(5);
    if(/^waf\d+/.test(id))return'waffarly';
    if(/^tok\d+/.test(id))return'token';
    if(/^smart\d+/.test(id)||id==='plain')return'plain';
    return'plain';
  }

  window.splitTopUI=function(id,items){
    if(items.length<2)return'';
    const type=splitTypeFromId(id),parts=readParts(type,items.length);
    return `<div class="splitQuick"><div class="splitQuickRow"><span class="splitQuickLabel">عدد الأقسام</span><input id="${id}parts" type="number" inputmode="numeric" min="2" max="${items.length}" value="${parts}"><button id="${id}prep" type="button" hidden>تحضير</button></div><div id="${id}confirm" class="splitConfirm">${parts} أقسام • ${items.length} بطاقة</div></div>`;
  };
  window.splitBottomUI=function(id,items){
    if(items.length<2)return'';
    return `<div class="splitDetails"><div class="splitDetailsHead"><b>توزيع الأقسام</b><button id="${id}reset" type="button" hidden>توزيع متساوٍ</button></div><div id="${id}counts" class="counts"></div><div id="${id}sum" class="sum">المجموع يجب أن يساوي ${items.length} دائمًا.</div><button id="${id}down" class="btn gold splitDownload" hidden>تقسيم وتحميل الملفات</button></div>`;
  };

  if(typeof window.processPlain==='function'&&!window.processPlain.__mytoolPlainSplit){
    const original=window.processPlain;
    const wrapped=function(){
      if(!readSplit('plain'))return original();
      if(typeof window.group!=='function'||typeof window.bindGroup!=='function')return original();
      const box=document.getElementById('text');
      if(!box)return original();
      let raw=box.value;
      if(typeof window.cleanWhatsAppEnvelope==='function')raw=window.cleanWhatsAppEnvelope(raw);
      let lines=String(raw||'').split(/\r\n|\n|\r/);
      if(readBool(TRIM_KEY,true))lines=lines.map(x=>x.trim());
      lines=lines.filter(x=>x!=='');
      if(!lines.length)return original();
      const nameFn=(n,a,b)=>plainName(n,a,b),filename=plainName(lines.length);
      result.innerHTML=window.group('النص جاهز',lines,filename,'plain',nameFn,true);
      window.bindGroup('plain',lines,filename,nameFn,true,false);
    };
    wrapped.__mytoolPlainSplit=true;
    window.processPlain=wrapped;
  }

  function detectGroupType(group){
    const down=group.querySelector('.actions button[id$="download"]');
    if(!down)return null;
    const id=down.id||'';
    if(id==='plaindownload'||/^smart\d+download$/.test(id))return'plain';
    if(/^waf\d+download$/.test(id))return'waffarly';
    if(/^tok\d+download$/.test(id))return'token';
    const m=id.match(/^card-(.+)download$/);
    return m?m[1]:null;
  }
  function smartMeta(group){
    const label=(group.querySelector('.title span')?.textContent||'').replace(/^🔎\s*/,'');
    const length=(label.match(/(\d+)\s*خانة/)||[])[1]||'X';
    let kind='MIXED';
    if(label.includes('أرقام فقط'))kind='DIGITS';
    else if(label.includes('أحرف + أرقام'))kind='ALNUM';
    return{kind,length};
  }
  function groupCodes(group){return String(group.querySelector('.codes')?.textContent||'').split(/\r\n|\n|\r/).map(x=>x.trim()).filter(Boolean)}
  function groupIndex(group,type){return [...result.querySelectorAll('.group')].filter(x=>detectGroupType(x)===type).indexOf(group)+1}
  function groupNameFn(group,type){
    if(type==='plain'){
      const meta=smartMeta(group);
      return(n,a,b)=>smartName(meta.kind,meta.length,n,a,b);
    }
    let extra='';
    if(type==='mobilis'&&typeof window.mobilisValue==='function')extra=window.mobilisValue()||'';
    if(type==='waffarly'||type==='token')extra='G'+groupIndex(group,type);
    return(n,a,b)=>shortName(type,n,a,b,extra);
  }

  function ensureSmartSplit(){
    result.querySelectorAll('.group').forEach(group=>{
      const down=group.querySelector('.actions button[id^="smart"][id$="download"]');
      if(!down)return;
      const id=(down.id||'').replace(/download$/,''),box=group.querySelector('.codes'),codes=groupCodes(group);
      if(!id||!box||!codes.length)return;
      const nameFn=groupNameFn(group,'plain');
      if(typeof window.download==='function')down.onclick=()=>window.download(codes.join('\n'),nameFn(codes.length),false);
      if(codes.length<2||group.querySelector('.splitQuick'))return;
      if(typeof window.initSplit!=='function')return;
      const actions=group.querySelector('.actions');if(!actions)return;
      actions.insertAdjacentHTML('afterend',window.splitTopUI(id,codes));
      box.insertAdjacentHTML('afterend',window.splitBottomUI(id,codes));
      window.initSplit(id,codes,nameFn,false);
    });
  }

  function applySettingsToSplit(group,type,codes){
    const parts=group.querySelector('input[id$="parts"]');
    if(parts&&!parts.dataset.settingsDefaultApplied){
      parts.dataset.settingsDefaultApplied='1';
      parts.value=readParts(type,codes.length);
      parts.dispatchEvent(new Event('change',{bubbles:true}));
    }
    const prep=group.querySelector('button[id$="prep"]'),reset=group.querySelector('button[id$="reset"]');
    if(prep)prep.hidden=true;if(reset)reset.hidden=true;

    const down=group.querySelector('.splitDownload');
    if(!down||!codes.length)return;
    const nameFn=groupNameFn(group,type),withBom=useBomForType(type);
    down.onclick=()=>{
      const vals=[...group.querySelectorAll('input[data-count]')].map(x=>Number(x.value));
      const valid=vals.length&&vals.every(x=>Number.isInteger(x)&&x>=1)&&vals.reduce((a,b)=>a+b,0)===codes.length;
      if(!valid){if(status)status.textContent='المجموع لا يساوي عدد البطاقات، لم يتم التحميل.';return}
      let off=0;vals.forEach((n,i)=>{const chunk=codes.slice(off,off+n);off+=n;setTimeout(()=>window.download(chunk.join('\n'),nameFn(n,i+1,vals.length),withBom),i*250)});
      if(status)status.textContent=`تم تجهيز ${vals.length} ملفات.`;
    };
  }

  function applyDirectDownloadName(group,type,codes){
    const down=group.querySelector('.actions button[id$="download"]');
    if(!down||!codes.length||typeof window.download!=='function')return;
    const nameFn=groupNameFn(group,type),withBom=useBomForType(type);
    down.onclick=()=>window.download(codes.join('\n'),nameFn(codes.length),withBom);
  }

  function applySplitVisibility(){
    result.querySelectorAll('.group').forEach(group=>{
      const type=detectGroupType(group);if(!type)return;
      const codes=groupCodes(group);
      applyDirectDownloadName(group,type,codes);
      applySettingsToSplit(group,type,codes);
      const show=readSplit(type);
      group.querySelectorAll('.splitQuick,.splitDetails').forEach(el=>el.hidden=!show);
    });
  }

  function mainDownloadButtons(){return [...result.querySelectorAll('.group .actions button[id$="download"]')].filter(x=>!x.disabled)}
  function ensureDownloadAll(){
    const existing=document.getElementById('downloadAllFiles'),buttons=mainDownloadButtons();
    if(buttons.length<2){if(existing)existing.remove();return}
    if(existing)return;
    const bar=document.createElement('div');bar.id='downloadAllFiles';bar.style.cssText='margin:8px 0;padding:9px;border:1px solid #d7e5ee;border-radius:12px;background:#f7fbfe';
    const btn=document.createElement('button');btn.className='btn gold';btn.style.width='100%';btn.textContent='⬇️ تحميل كل الملفات';
    btn.onclick=()=>{const list=mainDownloadButtons();if(!list.length)return;btn.disabled=true;const old=btn.textContent;btn.textContent='⏳ جاري التحميل...';list.forEach((b,i)=>setTimeout(()=>b.click(),i*350));if(status)status.textContent=`تم إرسال ${list.length} ملفات للتحميل.`;setTimeout(()=>{btn.disabled=false;btn.textContent=old},Math.max(2600,list.length*350+800))};
    bar.appendChild(btn);result.prepend(bar);
  }

  function refresh(){ensureSmartSplit();applySplitVisibility();ensureDownloadAll()}
  const observer=new MutationObserver(()=>setTimeout(refresh,0));observer.observe(result,{childList:true,subtree:true});
  window.addEventListener('pageshow',refresh);window.addEventListener('storage',refresh);
  document.addEventListener('click',e=>{const btn=e.target.closest('button');if(!btn)return;const isMain=/download$/.test(btn.id||'')&&btn.closest('.actions'),isSplit=btn.classList.contains('splitDownload');if(!isMain&&!isSplit)return;const old=btn.textContent;setTimeout(()=>{btn.disabled=true;btn.textContent='⏳ جاري التحميل...';setTimeout(()=>{btn.disabled=false;btn.textContent=old},2500)},0)});
  refresh();
})();
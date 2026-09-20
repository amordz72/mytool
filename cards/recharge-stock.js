import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL='https://wqyebqzbbpohbnznqdjj.supabase.co';
const SUPABASE_KEY='sb_publishable_gO4umNBMJ0AWRk19HtKd7A_9X4DibYj';
const supabase=createClient(SUPABASE_URL,SUPABASE_KEY);

const result=document.getElementById('result');
const status=document.getElementById('status');
const fname=document.getElementById('fname');
if(!result) throw new Error('CARDS_RESULT_NOT_FOUND');

const saving=new Set();
const completed=new Set();

function currentBatchKey(amount,codes){
  const batch=typeof window.getCardBatchId==='function'?window.getCardBatchId():'NO_BATCH';
  const first=codes[0]||'';
  const last=codes[codes.length-1]||'';
  return [batch,amount,codes.length,first,last].join('|');
}

function detectAmount(){
  try{
    const value=Number(typeof window.mobilisValue==='function'?window.mobilisValue():0);
    if(value===1000||value===2000)return value;
  }catch(_e){}
  const label=String(fname?.textContent||'');
  const m=label.match(/(?:^|[^0-9])(1000|2000)(?:[^0-9]|$)/u);
  return m?Number(m[1]):null;
}

function codesFromGroup(group){
  return String(group.querySelector('.codes')?.textContent||'')
    .split(/\r\n|\n|\r/u)
    .filter(line=>line!=='');
}

function validateMobilisCodes(codes){
  const clean=[];
  const bad=[];

  codes.forEach((raw,index)=>{
    let code=String(raw??'');
    if(index===0&&code.charCodeAt(0)===0xFEFF)code=code.slice(1);

    if(!code){
      bad.push('السطر '+(index+1)+': فارغ.');
      return;
    }
    if(/\s/u.test(code)){
      bad.push('السطر '+(index+1)+': يحتوي فراغًا أو Tab.');
      return;
    }
    if(!/^[0-9]{15}$/.test(code)){
      bad.push('السطر '+(index+1)+': يجب أن يكون 15 رقمًا فقط.');
      return;
    }
    clean.push(code);
  });

  return {ok:bad.length===0,codes:clean,bad};
}

function setBox(box,type,text){
  box.className='recharge-stock-state '+type;
  box.textContent=text;
}

async function saveCentral(group,amount,manual=false){
  const checked=validateMobilisCodes(codesFromGroup(group));
  const box=group.querySelector('.recharge-stock-state');
  if(!checked.ok){
    setBox(
      box,
      'error',
      '⚠️ لم يتم حفظ أي بطاقة. صيغة Mobilis المطلوبة: بطاقة واحدة في كل سطر، 15 رقمًا فقط، بدون فراغات أو BOM أو فواصل. '+checked.bad.slice(0,3).join(' ')
    );
    return;
  }
  const codes=checked.codes;
  if(!codes.length)return;
  const key=currentBatchKey(amount,codes);
  if(completed.has(key)||saving.has(key))return;

  saving.add(key);
  setBox(box,'working','⏳ جاري حفظ البطاقات في مخزون الشحن المركزي…');

  try{
    const auth=await supabase.auth.getSession();
    if(!auth.data.session){
      throw new Error('ADMIN_SESSION_REQUIRED');
    }

    const {data,error}=await supabase.rpc('station_connect_admin_bulk_add_recharge_cards',{
      p_codes:codes,
      p_amount:amount,
      p_source_code:'mytool_cards'
    });
    if(error)throw error;

    const row=Array.isArray(data)?data[0]:null;
    const inserted=Number(row?.inserted_count||0);
    const duplicates=Number(row?.duplicate_count||0);
    const invalid=Number(row?.invalid_count||0);

    completed.add(key);
    const savedText=inserted
      ?`✅ تم حفظ ${inserted} بطاقة ${amount} دج في المخزون المركزي.`
      :duplicates
        ?`✅ هذه البطاقات موجودة أصلًا في المخزون المركزي.`
        :`لم تُضف بطاقات جديدة.`;
    setBox(box,'success',savedText+(duplicates?` مكرر: ${duplicates}.`:'')+(invalid?` غير صالح: ${invalid}.`:''));

    if(status){
      status.textContent=inserted
        ?`تم ربط الدفعة بالمخزون المركزي. الهاتف والكمبيوتر يستعملان نفس المخزون الآن.`
        :`المخزون المركزي محدث؛ لم تتم إضافة نسخة ثانية من البطاقات المكررة.`;
    }

    const action=group.querySelector('.recharge-stock-save');
    if(action){
      action.disabled=true;
      action.textContent='✅ محفوظ في المخزون';
    }
  }catch(error){
    const message=String(error?.message||'تعذر الحفظ المركزي.');
    const friendly=message.includes('ADMIN_SESSION_REQUIRED')||message.includes('ADMIN_REQUIRED')
      ?'⚠️ الحفظ المركزي يحتاج جلسة الإدارة. افتح MyTool بحساب الإدارة ثم أعد المحاولة.'
      :message.includes('RECHARGE_AMOUNT_NOT_SUPPORTED')
        ?'⚠️ الشحن المركزي يدعم حاليًا 1000 و2000 دج فقط.'
        :message.includes('MOBILIS_BATCH_FORMAT_INVALID')||message.includes('MOBILIS_BATCH_EMPTY')
          ?'⚠️ تم رفض الدفعة كاملة لحمايتها: كل بطاقة Mobilis يجب أن تكون في سطر وحدها، 15 رقمًا فقط، بدون فراغات أو BOM أو فواصل.'
          :'⚠️ تعذر حفظ البطاقات مركزيًا: '+message;
    setBox(box,'error',friendly);

    const action=group.querySelector('.recharge-stock-save');
    if(action){
      action.hidden=false;
      action.disabled=false;
      action.textContent='إعادة الحفظ في المخزون';
    }
  }finally{
    saving.delete(key);
  }
}

function attach(group){
  if(group.dataset.centralStockBound==='1')return;
  const download=group.querySelector('.actions button[id="card-mobilisdownload"]');
  if(!download)return;

  group.dataset.centralStockBound='1';
  const checked=validateMobilisCodes(codesFromGroup(group));
  const codes=checked.codes;
  if(!codes.length&&!checked.bad.length)return;

  const wrap=document.createElement('div');
  wrap.className='recharge-stock-wrap';
  wrap.innerHTML=
    '<div class="recharge-stock-title">مخزون الشحن المركزي</div>'+
    '<div class="recharge-stock-state">جاري التحقق من قيمة البطاقات…</div>'+
    '<div class="recharge-stock-controls" hidden>'+
      '<select class="recharge-stock-amount" aria-label="قيمة بطاقات الشحن">'+
        '<option value="1000">1000 دج</option>'+
        '<option value="2000">2000 دج</option>'+
      '</select>'+
      '<button type="button" class="btn green recharge-stock-save">حفظ في المخزون</button>'+
    '</div>';
  group.insertBefore(wrap,group.querySelector('.codes'));

  const amount=detectAmount();
  const state=wrap.querySelector('.recharge-stock-state');
  const controls=wrap.querySelector('.recharge-stock-controls');
  const select=wrap.querySelector('.recharge-stock-amount');
  const save=wrap.querySelector('.recharge-stock-save');

  save.addEventListener('click',()=>saveCentral(group,Number(select.value),true));

  if(!checked.ok){
    controls.hidden=true;
    setBox(
      state,
      'error',
      '⚠️ الدفعة موقوفة: بطاقة واحدة في كل سطر، 15 رقمًا فقط، بدون فراغات أو BOM أو فواصل. '+checked.bad.slice(0,3).join(' ')
    );
    return;
  }

  const formatNote='الصيغة محمية: سطر لكل بطاقة • 15 رقمًا ASCII • بدون فراغات • بدون BOM. ';

  if(amount===1000||amount===2000){
    select.value=String(amount);
    save.textContent='حفظ في المخزون';
    controls.hidden=true;
    setBox(state,'working',formatNote+`تم التعرف على القيمة: ${amount} دج — سيتم الحفظ مركزيًا تلقائيًا.`);
    saveCentral(group,amount,false);
  }else{
    controls.hidden=false;
    setBox(state,'warning',formatNote+'لم أستطع تحديد هل البطاقات 1000 أو 2000 دج. اختر القيمة مرة واحدة ثم احفظ.');
  }
}

function refresh(){
  result.querySelectorAll('.group').forEach(attach);
}

const style=document.createElement('style');
style.textContent=
  '.recharge-stock-wrap{margin-top:9px;padding:10px;border:1px solid #b9d9c9;border-radius:11px;background:#f5fff9}'+
  '.recharge-stock-title{font-weight:800;font-size:13px;margin-bottom:5px}'+
  '.recharge-stock-state{font-size:12px;line-height:1.6;color:#5f7488}'+
  '.recharge-stock-state.success{color:#087a55;font-weight:700}'+
  '.recharge-stock-state.error{color:#b93838;font-weight:700}'+
  '.recharge-stock-state.warning{color:#9a6400;font-weight:700}'+
  '.recharge-stock-state.working{color:#35657e}'+
  '.recharge-stock-controls{display:grid;grid-template-columns:110px 1fr;gap:7px;margin-top:8px}'+
  '.recharge-stock-controls[hidden]{display:none!important}'+
  '.recharge-stock-amount{border:1px solid #d7e5ee;border-radius:9px;padding:9px;background:#fff;font:inherit}'+
  '@media(max-width:600px){.recharge-stock-controls{grid-template-columns:1fr}.recharge-stock-save{width:100%}}';
document.head.appendChild(style);

const observer=new MutationObserver(()=>setTimeout(refresh,0));
observer.observe(result,{childList:true,subtree:true});
window.addEventListener('pageshow',refresh);
refresh();

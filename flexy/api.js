
import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const supabase=createClient(
  'https://wqyebqzbbpohbnznqdjj.supabase.co',
  'sb_publishable_gO4umNBMJ0AWRk19HtKd7A_9X4DibYj'
);

export const PAGE_SIZE=25;

export function money(value){
  const n=Number(value||0);
  return Number.isFinite(n)?n.toLocaleString('fr-DZ',{minimumFractionDigits:0,maximumFractionDigits:2}):'0';
}

export function fmtDate(value){
  if(!value)return '—';
  try{return new Date(value).toLocaleString('ar-DZ')}catch{return '—'}
}

export function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

export function requestKey(prefix='flexy'){
  const id=crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(16).slice(2);
  return prefix+':'+id;
}

export async function requireSupabaseSession(){
  const {data}=await supabase.auth.getSession();
  if(!data?.session)throw new Error('SUPABASE_ADMIN_SESSION_REQUIRED');
  return data.session;
}

export async function rpc(name,args={}){
  await requireSupabaseSession();
  const {data,error}=await supabase.rpc(name,args);
  if(error)throw error;
  return data;
}

export function statusLabel(status){
  return ({
    active:'نشط',blocked:'موقوف',archived:'مؤرشف',
    created:'جديد',reserved:'محجوز',queued:'في الطابور',
    claimed:'استلمها المنفذ',execution_started:'قيد التنفيذ',
    success:'ناجحة',failed:'فاشلة',review:'مراجعة',cancelled:'ملغاة'
  })[status]||status||'—';
}

export function eventLabel(type){
  return ({
    credit:'رصيد',debt:'دين',payment:'دفع',refund:'إرجاع',
    order_capture:'خصم طلب',order_release:'تحرير حجز',
    adjustment:'تسوية',reversal:'عكس'
  })[type]||type||'—';
}

export function pillClass(status){
  if(['active','success'].includes(status))return 'ok';
  if(['review','reserved','queued','claimed','execution_started'].includes(status))return 'warn';
  if(['blocked','failed','cancelled'].includes(status))return 'bad';
  return '';
}

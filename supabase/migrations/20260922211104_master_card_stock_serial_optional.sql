-- Follow-up applied on 2026-09-22: Code is the official identifier; SN is optional metadata.
update public.card_stock_types
set serial_mode='optional',updated_at=now(),notes=case
 when type_key='mobilis' then 'رقم البطاقة هو المعرف الرسمي. SN معلومة ثانوية تحفظ إذا كانت موجودة ولا تمنع الإدخال عند غيابها.'
 when type_key='idoom' then 'رقم البطاقة هو المعرف الرسمي. SN يحفظ إذا كان موجودًا؛ لا يمنع الإدخال عند غيابه.'
 else notes end
where type_key in ('mobilis','idoom');

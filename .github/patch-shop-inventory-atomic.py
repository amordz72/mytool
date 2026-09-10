from pathlib import Path

p=Path('shop/index.html')
s=p.read_text(encoding='utf-8')
old="""      for(const item of changed){
        const payload={product_id:Number(item.product_id)}
        payload[qtyColumn]=difference(item)
        payload[reasonColumn]=reason
        const {error}=await supabase.from('stock_adjustments').insert(payload)
        if(error){busy.value=false;return notify('توقف الجرد عند '+item.name+': '+error.message,'error')}
      }
      busy.value=false
      notify('تم تسجيل فروق الجرد بنجاح.')"""
new="""      const adjustments=changed.map(item=>{
        const payload={product_id:Number(item.product_id)}
        payload[qtyColumn]=difference(item)
        payload[reasonColumn]=reason
        return payload
      })
      const {error}=await supabase.from('stock_adjustments').insert(adjustments)
      busy.value=false
      if(error)return notify('لم يتم حفظ الجرد: '+error.message,'error')
      notify('تم تسجيل فروق الجرد بنجاح.')"""
if old not in s:
    raise SystemExit('Atomic inventory marker not found')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')

doc=Path('docs/SHOP-LEDGER.md')
d=doc.read_text(encoding='utf-8')
needle='واجهة الجرد لا تفترض اسم عمود كمية التعديل؛ تتحقق وقت التنفيذ من أسماء الحقول المعروفة في جدول `stock_adjustments` قبل الحفظ، وتتوقف برسالة واضحة إذا لم تتعرف على البنية بدل كتابة بيانات خاطئة.'
replacement=needle+'\n\nفروق الجرد المتعددة تُرسل في عملية إدخال واحدة حتى لا يُحفظ جزء من الجرد ويُرفض جزء آخر.'
if needle in d and 'فروق الجرد المتعددة تُرسل' not in d:
    d=d.replace(needle,replacement,1)
doc.write_text(d,encoding='utf-8')

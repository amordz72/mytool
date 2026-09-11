# MyTool — Release Repository Guard

## ⚠️ Repository role

- `ROLE: PUBLIC RELEASE / DEPLOY ONLY`
- هذا المستودع **ليس Source of Truth للتطوير اليومي**.
- سبب بقائه عامًا هو النشر المباشر؛ لا يعني ذلك أن السورس الواضح يجب تطويره هنا.

## مكان السورس الحالي

المرجع المركزي: `amordz72/developer`.

خريطة MyTool المعتمدة:

`projects/mytool/SOURCE-RELEASE-MAP.md`

المصدر الخاص المعتمد بعد إنهاء أي انحراف مزامنة:

`amordz72/developer/projects/mytool/source/`

## حالة مهمة الآن

الحالة الحالية مسجلة في Developer كـ:

`SOURCE DRIFT DETECTED`

السبب: مسار `shop/` وتغييرات حديثة لحساب المحل موجودة في هذا المستودع العام، بينما المصدر الخاص لم تتم مزامنته بها بعد.

لذلك:

- لا تبدأ ميزة جديدة مباشرة داخل هذا المستودع.
- لا تنسخ Source أقدم فوق النسخة العامة.
- اذهب أولًا إلى Developer وراجع `SOURCE-RELEASE-MAP.md`.
- بعد المصالحة يصبح التدفق الطبيعي فقط: `Private Source → Release`.

## قبل أي تعديل كود

1. اقرأ `amordz72/developer/AGENTS.md`.
2. اقرأ `ACTIVE-PROJECT.md` ثم `NEXT-STEP.md`.
3. اقرأ `projects/mytool/SOURCE-RELEASE-MAP.md`.
4. تحقق أن الحالة `IN SYNC` قبل بدء تطوير جديد.
5. إذا كانت `SOURCE DRIFT`، عالج المزامنة أولًا ولا تطور هنا.

## المسموح داخل هذا المستودع

- ملفات Release/Deploy المنشورة من المصدر الخاص.
- ملفات الحراسة والتعريف مثل هذا الملف.
- Hotfix مباشر فقط عند ضرورة واضحة أو بأمر صريح من عمر، وبعده يجب Backport إلى Private Source قبل متابعة التطوير.

## الأمر `00000`

إذا كتب عمر `00000` داخل هذا المشروع، اذهب إلى `amordz72/developer` واقرأ `AGENTS.md` ثم `ACTIVE-PROJECT.md` ثم `NEXT-STEP.md` وخريطة Source/Release قبل أي كتابة كود.

## الأسرار

لا تضع Secret keys أو Tokens أو PIN أو أي منطق يجب أن يبقى سريًا داخل JavaScript/HTML المنشور هنا.

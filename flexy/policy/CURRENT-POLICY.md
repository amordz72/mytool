# سياسة Flexy المركزية

الحالة: CURRENT  
آخر تجميع: 2026-09-21

هذا الملف هو المرجع الثابت قبل أي تعديل في Catalog أو Discovery أو Execution أو Routing أو Recharge.

## ترتيب السلطة
1. هذا الملف داخل `mytool-dev`.
2. الكود والـSchema/Migrations الحالية.
3. الأدلة الحية المؤرخة وتأكيد عمر المباشر.
4. Developer والمشاريع السابقة كمراجع تاريخية.
5. المعلومة القديمة المتعارضة تبقى محفوظة ولا تطبق تلقائيًا.

ذاكرة ChatGPT ليست مصدر حقيقة للمشروع.

## الطبقات
`Operator → Offer Identity → Knowledge Source → Presentation → Execution Route → Routing Policy → Physical Resource → Readiness → Execution Decision → Recharge`

ممنوع خلط هذه الطبقات.

## هوية العرض الحالية
بعد Phase 1.5 في Tehna Connect Core:
`operator + family + amount`

مثال: `Mobilis + PixX + 50`.

نوع الشريحة، Network Index، القالب، الربح، المودم، المحطة ليست جزءًا من هوية العرض.

قرار 2026-08-23 القديم `SimType + Family + Amount` أصبح SUPERSEDED بعد فصل خيارات التنفيذ عن العرض.

## مصدر معرفة العرض
العرض يمكن أن يُعرف من:
- live discovery
- manual
- image
- import
- external

رؤية العرض عبر شريحة لا تعني أن تلك الشريحة هي المنفذ الوحيد أو أنها منفذ أصلًا.

## الظهور
ظهور العرض مستقل عن التنفيذ.
سياسات الإدارة/العامل/العميل مستقلة عن Route التنفيذ.
غياب SIM أو Route لا يحذف العرض من Catalog.

## Execution Route
لا يُنفذ Route إلا إذا:
- verified
- enabled
- مدعوم للعرض
- توجد SIM فعلية من النوع المطلوب
- المورد Online
- السر المطلوب محفوظ
- الرصيد حديث وكافٍ للعملية المالية

الحالات: SUPPORTED/verified، UNSUPPORTED، REVIEW/draft.
Timeout أو رد غامض لا يتحول إلى UNSUPPORTED.

## Mobilis SAMA
مرجعها التاريخي الحالي: `telecom/SAMA-OFFERS-AND-DISCOVERY.md`.

- Network Index خاص بمسار SAMA فقط.
- التنفيذ المثبت: مسار العائلة → PIN → ظهور أول صفحة → Index النهائي.
- `0/00` للتصفح والاكتشاف فقط.
- لا ننسخ Index أو منطق SAMA إلى Arsselli.

العائلات المؤكدة تاريخيًا على SAMA: Revolution، PixX، Sama Mix، Sama Talk، Sama Net.

## Mobilis Arsselli
مرجعها: `telecom/ARSSSELLI-EXECUTION.md`.

Arsselli مصدر تنفيذ مستقل عن مصدر اكتشاف العرض.

الصيغة المرجعية:
`*696*1*{phone}*{distributor_account}*{amount}*{PIN}#`

- لا تستخدم Index SAMA.
- distributor_account متغير تنفيذ مستقل.
- `04 = GTS`.
- `05 = MOBILIS`.
- SIM واحدة يمكن أن تملك أكثر من حساب موزع.
- الحساب الفعلي المستعمل يسجل في العملية.
- PIN يبقى Secret/Vault ولا يدخل Git.

الدعم المؤرخ 2026-08-29:
- Revolution: SUPPORTED
- PixX: SUPPORTED
- Sama Mix: SUPPORTED
- Sama Talk: UNSUPPORTED
- Sama Net: UNSUPPORTED

ذكر `*669*` يبقى تعارضًا تاريخيًا؛ لا يعتمد بدل `*696*1` إلا بدليل حي أحدث.

## حسابات Arsselli
حساب الموزع ليس Offer Index ولا SIM Type ولا Offer Identity.
هو مصدر رصيد داخل تنفيذ Arsselli.
الأرصدة تحفظ منفصلة ولا تجمع.
اختيار الحساب يخضع للسياسة + الرصيد.
لا نضع `04` كهوية ثابتة للشريحة ولا نكرره داخل كل عرض.

## Routing Policy
ممنوع hardcode مثل:
`if amount >= 500 use SAMA`.

التسلسل:
1. خذ العرض.
2. اقرأ Routes المسموحة والمثبتة.
3. طبق enabled + priority من الإدارة/DB.
4. افحص SIMs الفعلية Online.
5. افحص الرصيد الحديث والكافي.
6. اختر أعلى Route مؤهل.
7. سجل Execution Decision.
8. إذا لا يوجد Candidate مؤهل، لا تخترع مصدرًا.

قرار 2026-08-23 القديم "SAMA فقط ولا fallback إلى Arsselli" أصبح HISTORICAL/SUPERSEDED بطلب 2026-09-21: الإدارة يمكنها السماح بأكثر من Route وتحديد الأولوية.

الأولوية Policy ديناميكية في قاعدة البيانات، وليست جزءًا من Catalog.

## الشرائح الفعلية
لا نفترض وجود شريحة من اسم المشغل.
إذا لا توجد SIM مسجلة/Online من نوع معين، لا تدخل في Candidate Routes.
لا يقترح النظام Djezzy/Ooredoo أو أي مصدر غير موجود فعليًا.

## الرصيد
العملية المالية تعتمد Snapshot حديثًا.
مدة freshness إعداد Policy، وليست حقيقة داخل العرض.
Arsselli تعتمد رصيد الحساب المختار، وليس مجموع الحسابات.
SAMA تعتمد رصيد SIM SAMA.

## Recharge
Recharge طبقة تجهيز مستقلة.
مخزون بطاقات Mobilis 1000/2000 يخص إعادة تجهيز SAMA.
نفاد المخزون لا يمنع عرضًا إذا Route آخر مؤهل ومسموح عنده رصيد كافٍ.
Card Stock لا يختلط مع Offer Catalog.
بطاقة بحالة Review لا يعاد استعمالها قبل الحسم.

## Discovery
Discovery يكتشف الحقيقة ولا ينفذها.
Raw response محفوظ.
Catalog المعروف يمكن إعادة استعماله بدون Discovery حي في كل طلب.
TTL قابل للتغيير.
NETWORK_ERROR/UNKNOWN لا يعني NO_OFFERS_CONFIRMED.

## Agent / Server
Agent طبقة مودم ونقل فقط.
Server/MyTool يحمل التحليل، Catalog، Policy، Routing، Decision.
Agent يرجع الرد الخام ولا يحمل منطق الربح أو اختيار المصدر.
Secrets لا تسجل في Git أو Logs.

## ثابت مقابل متغير
Git/versioned:
- معنى الطبقات
- قواعد الفصل
- القوالب المثبتة
- Support matrix المؤرخة
- عقود التنفيذ

Database/dynamic:
- Routes enabled/disabled
- priority
- SIM/modem/station الحالية
- balances
- distributor accounts/balances
- jobs/results/history
- presentation policies
- execution decisions

## قاعدة التغيير
أي معلومة جديدة:
1. تقارن بالمراجع السابقة.
2. يصنف التعارض.
3. تحدث السياسة بحالة وتاريخ.
4. يعدل الكود/DB في الطبقة الصحيحة فقط.
5. يسجل Migration/Commit ونقطة رجوع.

انظر `SOURCES.md` لمعرفة أصل القرارات.
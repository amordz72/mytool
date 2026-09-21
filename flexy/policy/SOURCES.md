# مصادر سياسة Flexy والتعارضات

هذا الملف يحفظ أصل القرارات حتى لا يتحول CURRENT-POLICY إلى تلخيص بلا تاريخ.

## 2026-08-23 — Tehna Pay Connect
المصدر: `amordz72/tehnapay-connect/developer/LOCKED_ARCHITECTURE.md`

أثبت الفصل بين:
Offer / SimType / Template / Policy / Execution Decision / Physical SIM / Recharge / Discovery.

قرارات ما زالت CURRENT:
- لا hardcode amount→source.
- Recharge مستقل عن هوية العرض.
- SIM الفعلية مورد وليست هوية.
- السياسة والقرار في السيرفر، والـAgent لا يحملها.

قرارات أصبحت قديمة:
- هوية `SimType + Family + Amount` = SUPERSEDED.
- SAMA-only/no Arsselli fallback = SUPERSEDED بعد سياسة الإدارة متعددة المسارات الحالية.

## 2026-08-29 — SAMA
المصدر: `amordz72/developer/telecom/SAMA-OFFERS-AND-DISCOVERY.md`

CURRENT REFERENCE لميكانيكية SAMA:
- family route → PIN → first page → final network index.
- 0/00 للاستكشاف/التصفح.
- SAMA index لا ينتقل إلى Arsselli.

## 2026-08-29 — Arsselli
المصدر: `amordz72/developer/telecom/ARSSSELLI-EXECUTION.md`

CURRENT REFERENCE:
- التنفيذ مستقل عن Discovery.
- القالب المرجعي: `*696*1*phone*distributor_account*amount*PIN#`.
- 04=GTS، 05=MOBILIS.
- SIM واحدة قد تملك عدة distributor accounts.
- Revolution/PixX/Sama Mix مدعومة تاريخيًا.
- Sama Talk/Sama Net غير مدعومة تاريخيًا.
- ذكر 669 يبقى REVIEW إذا لم يثبت حيًا.

## 2026-08-29 — Customer Offer Presentation
المصدر: `amordz72/developer/telecom/MOBILIS-CUSTOMER-OFFER-PRESENTATION.md`

CURRENT:
- Discovery / Cache / Catalog / Execution Availability طبقات منفصلة.
- ظهور العرض لا يعتمد على توفر Route.
- TTL قابل للتغيير.
- UNKNOWN/NETWORK_ERROR لا يتحول إلى NO_OFFERS.

## 2026-09-03 — Tehna Connect Core Phase 1.5
المصادر:
- `amordz72/developer/projects/flexy/PHASE-1.5-UI-TRANSFER-SCOPE.md`
- `amordz72/tehna-connect-core/STATUS.md`

CURRENT ARCHITECTURE UPDATE:
- الهوية التجارية أصبحت `operator + family + amount`.
- Execution options منفصلة حسب SIM type.
- Sama network_index داخل execution option.
- Arsselli amount/account based وليست Sama-index based.
- Discovery/Catalog/Presentation/Execution/Routing منفصلة.

هذا القرار أحدث من هوية 2026-08-23 ولذلك يتغلب عليها.

## 2026-09-20 — Mobilis Auto Recharge
المصدر:
`amordz72/developer/projects/mytool/checkpoints/2026-09-20-mobilis-auto-recharge-stock.md`

CURRENT WITH CORRECTION:
- Card stock يجهز SAMA.
- Auto recharge بعد العمليات المناسبة يبقى طبقة readiness.
- الحارس الذي كان يمنع كل `mobilis.offer.execute` عند نفاد stock كشف 2026-09-21 كخلط طبقات.
- Stock ليس شرطًا عالميًا على Route آخر عنده رصيد كافٍ.

## 2026-09-21 — MyTool الحالي
المصادر التشغيلية:
- `flexy_offer_catalog`
- `flexy_offer_sources`
- `flexy_offer_execution_routes`
- `station_connect_sims`
- `station_connect_arsselli_account_balances`

CURRENT:
- مصدر معرفة العرض منفصل عن Route.
- Route status/enabled/priority منفصل.
- Presentation منفصل.
- الحسابات Arsselli تحفظ منفصلة.

## 2026-09-21 — Notes #221 / #222
CURRENT REQUIREMENT:
- لا نبني من آخر معلومة فقط.
- Manual/Discovered sources منفصلة.
- الإدارة تحدد Routes المسموحة والأولوية.
- لا يقترح النظام مصدر تنفيذ غير موجود فعليًا.
- السياسة تكون مرجعًا ثابتًا داخل MyTool Dev وظاهرة من Dashboard.

## قاعدة حل التعارض
1. دليل حي أحدث.
2. قرار معماري أحدث تم تنفيذه.
3. CURRENT-POLICY داخل mytool-dev.
4. القرار التاريخي يبقى محفوظًا مع SUPERSEDED/HISTORICAL بدل حذفه.
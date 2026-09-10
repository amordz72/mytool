from pathlib import Path

p = Path('shop/index.html')
s = p.read_text(encoding='utf-8')

archive = Path('archive/shop-index-before-mobile-ui-v2-2026-09-10.html')
archive.parent.mkdir(parents=True, exist_ok=True)
if not archive.exists():
    archive.write_text(s, encoding='utf-8')

s = s.replace("[v-cloak]{display:none}.app{max-width:900px;margin:auto;padding:14px}.top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}",
              "[v-cloak]{display:none}.app{max-width:none;margin:0;padding:0}.top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}", 1)

css_marker = ".content-card{scroll-margin-top:14px}"
css_add = css_marker + ".shop-topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 14px;padding:4px 2px}.topbar-title{display:flex;align-items:center;gap:10px;min-width:0}.topbar-copy{min-width:0}.topbar-copy h1{font-size:23px;line-height:1.15;white-space:nowrap;margin:0}.topbar-copy .muted{margin-top:3px}.topbar-logo{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:12px;background:#ecfeff;color:var(--main);font-weight:900;flex:0 0 auto}.topbar-actions{display:flex;gap:8px;align-items:center}.topbar-actions .btn{width:auto;white-space:nowrap}.mobile-only{display:none}.desktop-only{display:inline-flex}.alert-card{color:#7c2d12}.alert-card span:last-child{color:#9a3412;font-weight:800}"
if '.shop-topbar{' not in s:
    if css_marker not in s:
        raise SystemExit('content-card CSS marker missing')
    s = s.replace(css_marker, css_add, 1)

old_media = "@media(max-width:860px){.shop-shell{display:block;padding:10px}.shop-main{width:100%}.sidebar{position:fixed;z-index:50;top:0;right:0;height:100vh;width:min(82vw,290px);border-radius:0 0 0 22px;transform:translateX(110%);transition:transform .2s ease}.sidebar.open{transform:translateX(0)}.mobile-overlay{display:block;position:fixed;z-index:40;inset:0;background:rgba(15,23,42,.48)}.menu-toggle{display:inline-block}.metrics-pro{grid-template-columns:repeat(2,minmax(0,1fr))}.hero-title{font-size:23px}}@media(max-width:620px){.dashboard{grid-template-columns:repeat(2,minmax(0,1fr))}.grid,.stock{grid-template-columns:1fr}.app{padding:0}.top{align-items:flex-start}.toolbar{flex-wrap:wrap}.worker-row{align-items:flex-start;flex-direction:column}.worker-actions{width:100%}.worker-actions button{flex:1}.setting-line{align-items:stretch;flex-direction:column}.setting-line button{width:100%}.count-row{grid-template-columns:1fr 1fr}.count-name{grid-column:1/-1}.product-row{align-items:stretch;flex-direction:column}.product-row button{width:100%}.section-actions button{flex:1;min-width:130px}.metrics-pro{grid-template-columns:1fr 1fr}.dash-hero{padding:17px;border-radius:20px}.metric-pro{padding:11px}.metric-pro .mvalue{font-size:22px}.hero-top{align-items:center}.quick-actions{display:grid;grid-template-columns:1fr 1fr}.quick-actions a,.quick-actions button{width:100%;text-align:center}}"
new_media = "@media(max-width:860px){.shop-shell{display:block;padding:10px}.shop-main{width:100%}.sidebar{position:fixed;z-index:50;top:0;right:0;height:100vh;width:min(82vw,290px);border-radius:0 0 0 22px;transform:translateX(110%);transition:transform .2s ease}.sidebar.open{transform:translateX(0)}.mobile-overlay{display:block;position:fixed;z-index:40;inset:0;background:rgba(15,23,42,.48)}.menu-toggle{display:inline-flex;align-items:center;justify-content:center}.metrics-pro{grid-template-columns:repeat(2,minmax(0,1fr))}.hero-title{font-size:23px}.desktop-only{display:none!important}.mobile-only{display:inline-flex}.shop-topbar{position:sticky;top:0;z-index:30;margin:0 -2px 10px;padding:8px 4px;background:rgba(244,247,251,.94);backdrop-filter:blur(10px);border-bottom:1px solid rgba(226,232,240,.9)}.topbar-logo{width:36px;height:36px}.topbar-copy h1{font-size:20px}.topbar-copy .muted{display:none}.menu-toggle{width:42px!important;height:42px;padding:0!important;border-radius:12px!important;font-size:20px}.topbar-actions{gap:6px}}@media(max-width:620px){.dashboard{grid-template-columns:repeat(2,minmax(0,1fr))}.grid,.stock{grid-template-columns:1fr}.app{padding:0}.top{align-items:flex-start}.toolbar{flex-wrap:wrap}.worker-row{align-items:flex-start;flex-direction:column}.worker-actions{width:100%}.worker-actions button{flex:1}.setting-line{align-items:stretch;flex-direction:column}.setting-line button{width:100%}.count-row{grid-template-columns:1fr 1fr}.count-name{grid-column:1/-1}.product-row{align-items:stretch;flex-direction:column}.product-row button{width:100%}.section-actions button{flex:1;min-width:130px}.shop-shell{padding:8px}.dash-hero{padding:14px;border-radius:18px;box-shadow:0 10px 24px rgba(15,23,42,.14)}.dash-hero:after{width:130px;height:130px;left:-45px;top:-55px}.hero-top{align-items:center}.hero-eyebrow{font-size:10px;margin-bottom:3px}.hero-title{font-size:20px;line-height:1.2}.hero-sub{display:none}.live-badge{font-size:10px;padding:6px 8px}.metrics-pro{grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.metric-pro{padding:10px;border-radius:13px;min-height:88px}.metric-pro .mhead{font-size:10.5px}.metric-pro .mico{width:26px;height:26px;border-radius:8px;font-size:12px}.metric-pro .mvalue{font-size:21px;margin-top:6px}.metric-pro .msub{display:none}.quick-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:11px}.quick-actions a,.quick-actions button{width:100%;text-align:center;padding:8px 9px;font-size:11px}.quick-actions .mobile-hide{display:none}.alert-card{align-items:flex-start;padding:9px 10px;margin-top:10px;font-size:11px;line-height:1.5;background:#fff7ed;color:#7c2d12}.content-card{scroll-margin-top:64px}.card{border-radius:16px;padding:14px}.section-title{margin-bottom:11px}}"
if old_media in s:
    s = s.replace(old_media, new_media, 1)
elif 'position:sticky;top:0;z-index:30' not in s:
    raise SystemExit('responsive CSS marker changed')

old_header = '''    <header class="top">
      <div>
        <a class="back" href="../">← MyTool</a>
        <h1>حساب المحل</h1>
        <span class="pill">{{ userMode==='admin' ? 'إدارة' : 'خدام' }}</span>
        <div v-if="userMode==='worker'" class="identity">مرحبًا {{ workerNickname }}</div>
      </div>
      <div class="toolbar">
        <button class="btn secondary menu-toggle" @click="sidebarOpen=true">☰ القائمة</button>
        <button class="btn secondary" @click="loadAll" :disabled="busy">تحديث</button>
        <button class="btn secondary" @click="logout">خروج</button>
      </div>
    </header>'''
new_header = '''    <header class="shop-topbar">
      <div class="topbar-title">
        <button class="btn secondary menu-toggle mobile-only" @click="sidebarOpen=true" aria-label="فتح القائمة">☰</button>
        <div class="topbar-logo">MT</div>
        <div class="topbar-copy">
          <h1>حساب المحل</h1>
          <div class="muted">{{ userMode==='admin' ? 'لوحة الإدارة' : ('مرحبًا '+workerNickname) }}</div>
        </div>
        <span class="pill">{{ userMode==='admin' ? 'إدارة' : 'خدام' }}</span>
      </div>
      <div class="topbar-actions desktop-only">
        <a class="btn secondary" href="../" style="text-decoration:none">MyTool</a>
        <button class="btn secondary" @click="loadAll" :disabled="busy">تحديث</button>
        <button class="btn secondary" @click="logout">خروج</button>
      </div>
    </header>'''
if old_header in s:
    s = s.replace(old_header, new_header, 1)
elif 'class="shop-topbar"' not in s:
    raise SystemExit('header marker missing')

# Add refresh inside the sidebar, since mobile header should stay minimal.
side_marker = '''          <a v-if="userMode==='admin'" class="side-link" href="#settings" @click="sidebarOpen=false"><span class="ico">⚙</span><span>الإعدادات</span></a>
          <a class="side-link" href="../"><span class="ico">↩</span><span>رئيسية MyTool</span></a>'''
side_new = '''          <a v-if="userMode==='admin'" class="side-link" href="#settings" @click="sidebarOpen=false"><span class="ico">⚙</span><span>الإعدادات</span></a>
          <button class="side-link" @click="loadAll();sidebarOpen=false" :disabled="busy"><span class="ico">↻</span><span>تحديث البيانات</span></button>
          <a class="side-link" href="../"><span class="ico">↩</span><span>رئيسية MyTool</span></a>'''
if 'تحديث البيانات</span></button>' not in s:
    if side_marker not in s:
        raise SystemExit('sidebar marker missing')
    s = s.replace(side_marker, side_new, 1)

# Keep only the two most useful quick actions on small screens.
s = s.replace('<a href="#inventory" @click="inventoryTab=\'stock\'">▦ عرض المخزون</a>', '<a class="mobile-hide" href="#inventory" @click="inventoryTab=\'stock\'">▦ عرض المخزون</a>', 1)
s = s.replace('<button @click="loadAll" :disabled="busy">↻ تحديث البيانات</button>', '<button class="mobile-hide" @click="loadAll" :disabled="busy">↻ تحديث البيانات</button>', 1)

p.write_text(s, encoding='utf-8')

doc = Path('docs/SHOP-LEDGER.md')
d = doc.read_text(encoding='utf-8')
section = '''\n## واجهة الهاتف — 10 سبتمبر 2026\n- تم تحويل رأس صفحة المحل على الهاتف إلى Topbar صغيرة وثابتة بدل الأزرار الكبيرة.\n- زر الهاتف أصبح ☰ فقط، ونُقلت وظائف التحديث والخروج إلى الـSidebar.\n- تم تقليل ارتفاع Dashboard على الهاتف مع إبقاء الإحصائيات الأربع في شبكة 2×2.\n- الإجراءات السريعة على الهاتف تركز على البيع الجديد والجرد الفعلي، بينما تبقى بقية الوظائف في الـSidebar.\n- تم تحسين تباين تنبيه المخزون المنخفض.\n'''
if '## واجهة الهاتف — 10 سبتمبر 2026' not in d:
    d += section
doc.write_text(d, encoding='utf-8')

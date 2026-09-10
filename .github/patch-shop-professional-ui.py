from pathlib import Path

p = Path('shop/index.html')
s = p.read_text(encoding='utf-8')

archive = Path('archive/shop-index-before-professional-dashboard-2026-09-10.html')
archive.parent.mkdir(parents=True, exist_ok=True)
if not archive.exists():
    archive.write_text(s, encoding='utf-8')

# Base layout and professional dashboard styles.
css_anchor = ".empty{padding:14px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:14px}"
css_new = css_anchor + ".shop-shell{display:grid;grid-template-columns:250px minmax(0,1fr);gap:18px;max-width:1180px;margin:auto;padding:16px}.shop-main{min-width:0}.sidebar{position:sticky;top:16px;height:calc(100vh - 32px);background:#0f172a;color:#e5e7eb;border-radius:22px;padding:18px;display:flex;flex-direction:column;gap:14px;box-shadow:0 18px 45px rgba(15,23,42,.18)}.side-brand{display:flex;align-items:center;gap:10px;padding:4px 2px 14px;border-bottom:1px solid rgba(255,255,255,.1)}.brand-mark{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:linear-gradient(135deg,#14b8a6,#0f766e);font-weight:900;color:#fff}.side-brand strong{display:block;color:#fff;font-size:16px}.side-brand small{display:block;color:#94a3b8;margin-top:2px}.side-nav{display:grid;gap:6px}.side-link{display:flex;align-items:center;gap:10px;width:100%;padding:11px 12px;border-radius:12px;border:0;background:transparent;color:#cbd5e1;text-decoration:none;font-weight:700;text-align:right;cursor:pointer}.side-link:hover,.side-link.active{background:rgba(20,184,166,.14);color:#fff}.side-link .ico{width:24px;text-align:center;font-size:17px}.side-spacer{flex:1}.side-footer{border-top:1px solid rgba(255,255,255,.1);padding-top:12px}.side-user{font-size:12px;color:#94a3b8;margin-bottom:9px}.menu-toggle{display:none;width:auto;padding:10px 12px}.mobile-overlay{display:none}.dash-hero{position:relative;overflow:hidden;background:linear-gradient(135deg,#0f172a,#134e4a);color:#fff;border:0;border-radius:24px;padding:22px;box-shadow:0 18px 40px rgba(15,23,42,.18)}.dash-hero:after{content:'';position:absolute;width:180px;height:180px;border-radius:50%;background:rgba(255,255,255,.06);left:-50px;top:-70px}.hero-top{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;position:relative;z-index:1}.hero-eyebrow{font-size:12px;color:#99f6e4;font-weight:800;margin-bottom:5px}.hero-title{font-size:27px;font-weight:900;margin:0}.hero-sub{font-size:13px;color:#cbd5e1;margin-top:7px}.live-badge{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.12);padding:7px 10px;border-radius:999px;font-size:12px;font-weight:800;white-space:nowrap}.live-dot{width:8px;height:8px;border-radius:50%;background:#5eead4;box-shadow:0 0 0 4px rgba(94,234,212,.12)}.metrics-pro{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:18px;position:relative;z-index:1}.metric-pro{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:14px;backdrop-filter:blur(8px)}.metric-pro .mhead{display:flex;justify-content:space-between;align-items:center;gap:8px;color:#cbd5e1;font-size:12px}.metric-pro .mico{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:rgba(255,255,255,.1);font-size:15px}.metric-pro .mvalue{font-size:26px;font-weight:900;margin-top:9px}.metric-pro .msub{font-size:11px;color:#94a3b8;margin-top:2px}.quick-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;position:relative;z-index:1}.quick-actions a,.quick-actions button{width:auto;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:#fff;padding:9px 12px;border-radius:11px;text-decoration:none;font-weight:800;font-size:12px;cursor:pointer}.section-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}.section-title h2{margin:0}.section-kicker{font-size:11px;color:var(--main);font-weight:900;margin-bottom:4px}.alert-card{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;padding:11px 13px;margin-top:12px;font-size:12px}.alert-card strong{color:#9a3412}.content-card{scroll-margin-top:14px}"
if '.shop-shell{' not in s:
    if css_anchor not in s:
        raise SystemExit('CSS anchor not found')
    s = s.replace(css_anchor, css_new, 1)

old_media = "@media(max-width:620px){.dashboard{grid-template-columns:repeat(2,minmax(0,1fr))}.grid,.stock{grid-template-columns:1fr}.app{padding:10px}.top{align-items:flex-start}.toolbar{flex-wrap:wrap}.worker-row{align-items:flex-start;flex-direction:column}.worker-actions{width:100%}.worker-actions button{flex:1}.setting-line{align-items:stretch;flex-direction:column}.setting-line button{width:100%}.count-row{grid-template-columns:1fr 1fr}.count-name{grid-column:1/-1}.product-row{align-items:stretch;flex-direction:column}.product-row button{width:100%}.section-actions button{flex:1;min-width:130px}}"
new_media = "@media(max-width:860px){.shop-shell{display:block;padding:10px}.shop-main{width:100%}.sidebar{position:fixed;z-index:50;top:0;right:0;height:100vh;width:min(82vw,290px);border-radius:0 0 0 22px;transform:translateX(110%);transition:transform .2s ease}.sidebar.open{transform:translateX(0)}.mobile-overlay{display:block;position:fixed;z-index:40;inset:0;background:rgba(15,23,42,.48)}.menu-toggle{display:inline-block}.metrics-pro{grid-template-columns:repeat(2,minmax(0,1fr))}.hero-title{font-size:23px}}@media(max-width:620px){.dashboard{grid-template-columns:repeat(2,minmax(0,1fr))}.grid,.stock{grid-template-columns:1fr}.app{padding:0}.top{align-items:flex-start}.toolbar{flex-wrap:wrap}.worker-row{align-items:flex-start;flex-direction:column}.worker-actions{width:100%}.worker-actions button{flex:1}.setting-line{align-items:stretch;flex-direction:column}.setting-line button{width:100%}.count-row{grid-template-columns:1fr 1fr}.count-name{grid-column:1/-1}.product-row{align-items:stretch;flex-direction:column}.product-row button{width:100%}.section-actions button{flex:1;min-width:130px}.metrics-pro{grid-template-columns:1fr 1fr}.dash-hero{padding:17px;border-radius:20px}.metric-pro{padding:11px}.metric-pro .mvalue{font-size:22px}.hero-top{align-items:center}.quick-actions{display:grid;grid-template-columns:1fr 1fr}.quick-actions a,.quick-actions button{width:100%;text-align:center}}"
if old_media in s:
    s = s.replace(old_media, new_media, 1)
elif '@media(max-width:860px)' not in s:
    raise SystemExit('Media marker not found')

# Wrap authenticated area in sidebar shell.
old_open = '''  <template v-else>
    <header class="top">'''
new_open = '''  <template v-else>
    <div class="shop-shell">
      <div v-if="sidebarOpen" class="mobile-overlay" @click="sidebarOpen=false"></div>
      <aside class="sidebar" :class="{open:sidebarOpen}">
        <div class="side-brand">
          <div class="brand-mark">MT</div>
          <div><strong>MyTool</strong><small>إدارة المحل</small></div>
        </div>
        <nav class="side-nav">
          <a class="side-link active" href="#dashboard" @click="sidebarOpen=false"><span class="ico">⌂</span><span>لوحة التحكم</span></a>
          <a class="side-link" href="#sale" @click="sidebarOpen=false"><span class="ico">＋</span><span>تسجيل بيع</span></a>
          <a class="side-link" href="#inventory" @click="inventoryTab='stock';sidebarOpen=false"><span class="ico">▦</span><span>المخزون</span></a>
          <a v-if="userMode==='admin'" class="side-link" href="#inventory" @click="inventoryTab='products';sidebarOpen=false"><span class="ico">◇</span><span>المنتجات</span></a>
          <a v-if="userMode==='admin'" class="side-link" href="#inventory" @click="openPhysicalCount();sidebarOpen=false"><span class="ico">✓</span><span>الجرد الفعلي</span></a>
          <a v-if="userMode==='admin'" class="side-link" href="#users" @click="sidebarOpen=false"><span class="ico">♙</span><span>المستخدمون</span></a>
          <a v-if="userMode==='admin'" class="side-link" href="#settings" @click="sidebarOpen=false"><span class="ico">⚙</span><span>الإعدادات</span></a>
          <a class="side-link" href="../"><span class="ico">↩</span><span>رئيسية MyTool</span></a>
        </nav>
        <div class="side-spacer"></div>
        <div class="side-footer">
          <div class="side-user">{{ userMode==='admin' ? 'حساب الإدارة' : ('الخدام: '+workerNickname) }}</div>
          <button class="side-link" @click="logout"><span class="ico">⇥</span><span>تسجيل الخروج</span></button>
        </div>
      </aside>
      <main class="shop-main">
    <header class="top">'''
if '<div class="shop-shell">' not in s:
    if old_open not in s:
        raise SystemExit('Authenticated open marker not found')
    s = s.replace(old_open, new_open, 1)

# Add mobile menu button to toolbar.
toolbar_old = '''      <div class="toolbar">
        <button class="btn secondary" @click="loadAll" :disabled="busy">تحديث</button>'''
toolbar_new = '''      <div class="toolbar">
        <button class="btn secondary menu-toggle" @click="sidebarOpen=true">☰ القائمة</button>
        <button class="btn secondary" @click="loadAll" :disabled="busy">تحديث</button>'''
if '☰ القائمة' not in s:
    if toolbar_old not in s:
        raise SystemExit('Toolbar marker not found')
    s = s.replace(toolbar_old, toolbar_new, 1)

# Replace simple dashboard with pro dashboard.
start = s.find('    <section class="card">\n      <div class="top" style="margin:0 0 12px">\n        <div><h2 style="margin:0">Dashboard المحل</h2>')
end_marker = '    <section class="card">\n      <h2>تسجيل بيع</h2>'
end = s.find(end_marker, start)
if start != -1 and end != -1:
    pro = '''    <section id="dashboard" class="dash-hero content-card">
      <div class="hero-top">
        <div>
          <div class="hero-eyebrow">MYTOOL / SHOP CONTROL</div>
          <h2 class="hero-title">لوحة تحكم المحل</h2>
          <div class="hero-sub">صورة مباشرة للمبيعات والمخزون وحالة المنتجات اليوم.</div>
        </div>
        <span class="live-badge"><span class="live-dot"></span> مباشر</span>
      </div>
      <div class="metrics-pro">
        <div class="metric-pro"><div class="mhead"><span>المنتجات</span><span class="mico">▦</span></div><div class="mvalue">{{ products.length }}</div><div class="msub">منتج مسجل</div></div>
        <div class="metric-pro"><div class="mhead"><span>إجمالي المخزون</span><span class="mico">◫</span></div><div class="mvalue">{{ stockUnits }}</div><div class="msub">وحدة متاحة حسب الحركات</div></div>
        <div v-if="userMode==='admin'" class="metric-pro"><div class="mhead"><span>عمليات اليوم</span><span class="mico">↗</span></div><div class="mvalue">{{ todaySalesCount }}</div><div class="msub">عملية بيع مسجلة</div></div>
        <div v-if="userMode==='admin'" class="metric-pro"><div class="mhead"><span>مبيعات اليوم</span><span class="mico">دج</span></div><div class="mvalue">{{ money(todayRevenue) }}</div><div class="msub">دينار جزائري</div></div>
      </div>
      <div class="quick-actions">
        <a href="#sale">＋ بيع جديد</a>
        <a href="#inventory" @click="inventoryTab='stock'">▦ عرض المخزون</a>
        <a v-if="userMode==='admin'" href="#inventory" @click="openPhysicalCount">✓ جرد فعلي</a>
        <button @click="loadAll" :disabled="busy">↻ تحديث البيانات</button>
      </div>
      <div v-if="userMode==='admin' && lowStockCount>0" class="alert-card"><span><strong>تنبيه مخزون:</strong> {{ lowStockCount }} منتجات كميتها 2 أو أقل.</span><span>منها {{ outOfStockCount }} نافد</span></div>
    </section>

'''
    s = s[:start] + pro + s[end:]
elif 'MYTOOL / SHOP CONTROL' not in s:
    raise SystemExit('Dashboard marker not found')

# Add IDs and richer headings to sections.
s = s.replace('    <section class="card">\n      <h2>تسجيل بيع</h2>', '    <section id="sale" class="card content-card">\n      <div class="section-title"><div><div class="section-kicker">المبيعات</div><h2>تسجيل بيع</h2></div><span class="pill">عملية جديدة</span></div>', 1)
s = s.replace('    <section class="card">\n      <div class="top" style="margin:0 0 12px">\n        <div><h2 style="margin:0">المنتجات والمخزون</h2>', '    <section id="inventory" class="card content-card">\n      <div class="top" style="margin:0 0 12px">\n        <div><div class="section-kicker">إدارة المخزون</div><h2 style="margin:0">المنتجات والمخزون</h2>', 1)
s = s.replace('      <section class="card">\n        <h2>إدارة المستخدمين</h2>', '      <section id="users" class="card content-card">\n        <div class="section-kicker">الصلاحيات</div><h2>إدارة المستخدمين</h2>', 1)
s = s.replace('      <section class="card">\n        <h2>إعدادات جلسة الأدمن</h2>', '      <section id="settings" class="card content-card">\n        <div class="section-kicker">النظام</div><h2>إعدادات جلسة الأدمن</h2>', 1)

# Close shell/main before authenticated template ends.
close_old = '''    <div class="footer">البيانات التشغيلية محفوظة في Supabase وليست داخل GitHub.</div>
  </template>'''
close_new = '''    <div class="footer">البيانات التشغيلية محفوظة في Supabase وليست داخل GitHub.</div>
      </main>
    </div>
  </template>'''
if '</main>\n    </div>\n  </template>' not in s:
    if close_old not in s:
        raise SystemExit('Authenticated close marker not found')
    s = s.replace(close_old, close_new, 1)

# Vue state and computed values.
refs_old = "const inventoryTab=ref('stock'),newProductName=ref(''),productNames=ref({}),physicalCounts=ref({}),physicalReason=ref('جرد فعلي')"
refs_new = "const inventoryTab=ref('stock'),sidebarOpen=ref(false),newProductName=ref(''),productNames=ref({}),physicalCounts=ref({}),physicalReason=ref('جرد فعلي')"
if 'sidebarOpen=ref(false)' not in s:
    if refs_old not in s:
        raise SystemExit('State marker not found')
    s = s.replace(refs_old, refs_new, 1)

computed_old = "const stockUnits=computed(()=>(inventory.value||[]).reduce((sum,x)=>sum+Number(x.stock_quantity||0),0))\n    const todaySalesCount=computed(()=>todaySales.value.length)"
computed_new = "const stockUnits=computed(()=>(inventory.value||[]).reduce((sum,x)=>sum+Number(x.stock_quantity||0),0))\n    const lowStockCount=computed(()=>(inventory.value||[]).filter(x=>Number(x.stock_quantity||0)<=2).length)\n    const outOfStockCount=computed(()=>(inventory.value||[]).filter(x=>Number(x.stock_quantity||0)<=0).length)\n    const todaySalesCount=computed(()=>todaySales.value.length)"
if 'const lowStockCount=computed' not in s:
    if computed_old not in s:
        raise SystemExit('Computed marker not found')
    s = s.replace(computed_old, computed_new, 1)

return_old = "adminSessionHours,inventoryTab,newProductName,productNames,physicalCounts,physicalReason,userMode,isLoggedIn,stockUnits,todaySalesCount,todayRevenue,countedItems,totalCountDifference"
return_new = "adminSessionHours,inventoryTab,sidebarOpen,newProductName,productNames,physicalCounts,physicalReason,userMode,isLoggedIn,stockUnits,lowStockCount,outOfStockCount,todaySalesCount,todayRevenue,countedItems,totalCountDifference"
if 'inventoryTab,sidebarOpen,newProductName' not in s:
    if return_old not in s:
        raise SystemExit('Return marker not found')
    s = s.replace(return_old, return_new, 1)

p.write_text(s, encoding='utf-8')

# Update project docs.
doc = Path('docs/SHOP-LEDGER.md')
d = doc.read_text(encoding='utf-8')
note = '''\n## واجهة إدارة المحل\nالحالة: `IMPLEMENTED` — تحتاج تحقق بصري من الهاتف بعد نشر GitHub Pages.\n\nتمت ترقية واجهة حساب المحل إلى Dashboard إداري أوضح مع Sidebar يمين على سطح المكتب وDrawer على الهاتف. اللوحة تعرض المنتجات، إجمالي المخزون، عمليات اليوم، مبيعات اليوم، وتنبيه المنتجات منخفضة المخزون، مع اختصارات للبيع والمخزون والجرد.\n'''
if '## واجهة إدارة المحل' not in d:
    d += note
doc.write_text(d, encoding='utf-8')

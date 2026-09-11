from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Marker not found: {label}')
    return text.replace(old, new, 1)

index_path = Path('shop/index.html')
sql_path = Path('shop/worker-auth.sql')
doc_path = Path('docs/SHOP-LEDGER.md')
index = index_path.read_text(encoding='utf-8')
sql = sql_path.read_text(encoding='utf-8')
doc = doc_path.read_text(encoding='utf-8')

archive_dir = Path('archive')
archive_dir.mkdir(exist_ok=True)
archive_index = archive_dir / 'shop-index-before-worker-permissions-2026-09-11.html'
archive_sql = archive_dir / 'worker-auth-before-permissions-2026-09-11.sql'
if not archive_index.exists():
    archive_index.write_text(index, encoding='utf-8')
if not archive_sql.exists():
    archive_sql.write_text(sql, encoding='utf-8')

# --- SQL: per-worker permissions and enforced RPCs ---
if 'can_sell boolean not null default true' not in sql:
    marker = "create unique index if not exists worker_accounts_username_unique\non public.worker_accounts (lower(username));"
    permissions_sql = """alter table public.worker_accounts
    add column if not exists can_sell boolean not null default true,
    add column if not exists can_view_stock boolean not null default true,
    add column if not exists can_inventory boolean not null default false,
    add column if not exists can_manage_products boolean not null default false,
    add column if not exists can_view_sales boolean not null default false;

create unique index if not exists worker_accounts_username_unique
on public.worker_accounts (lower(username));"""
    sql = replace_once(sql, marker, permissions_sql, 'worker permission columns')

context_sql = r'''

create or replace function public.worker_get_context(p_session_token text)
returns table (
    worker_id bigint,
    staff_id bigint,
    nickname text,
    can_sell boolean,
    can_view_stock boolean,
    can_inventory boolean,
    can_manage_products boolean,
    can_view_sales boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_session_id bigint;
begin
    return query
    select wa.id, wa.staff_id,
           coalesce(nullif(wa.nickname, ''), wa.username),
           wa.can_sell, wa.can_view_stock, wa.can_inventory,
           wa.can_manage_products, wa.can_view_sales
    from public.worker_sessions ws
    join public.worker_accounts wa on wa.id = ws.worker_id
    where ws.token_hash = encode(digest(p_session_token, 'sha256'), 'hex')
      and ws.expires_at > now()
      and wa.active = true
    limit 1;

    if not found then
        raise exception 'INVALID_SESSION';
    end if;

    select ws.id into v_session_id
    from public.worker_sessions ws
    where ws.token_hash = encode(digest(p_session_token, 'sha256'), 'hex')
    limit 1;

    update public.worker_sessions set last_used_at = now() where id = v_session_id;
end;
$$;
'''
if 'function public.worker_get_context' not in sql:
    sql = replace_once(sql, "create or replace function public.worker_get_catalog", context_sql + "\ncreate or replace function public.worker_get_catalog", 'worker context rpc')

# Replace catalog function so product names stay available for selling/product work,
# while stock quantity is hidden unless can_view_stock is granted.
start = sql.index('create or replace function public.worker_get_catalog')
end = sql.index('create or replace function public.worker_create_sale', start)
new_catalog = r'''create or replace function public.worker_get_catalog(p_session_token text)
returns table (
    product_id bigint,
    name text,
    stock_quantity bigint
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_session_id bigint;
    v_can_view_stock boolean;
    v_can_use_catalog boolean;
begin
    select ws.id, wa.can_view_stock,
           (wa.can_view_stock or wa.can_sell or wa.can_inventory or wa.can_manage_products)
    into v_session_id, v_can_view_stock, v_can_use_catalog
    from public.worker_sessions ws
    join public.worker_accounts wa on wa.id = ws.worker_id
    where ws.token_hash = encode(digest(p_session_token, 'sha256'), 'hex')
      and ws.expires_at > now()
      and wa.active = true
    limit 1;

    if v_session_id is null then
        raise exception 'INVALID_SESSION';
    end if;
    if not v_can_use_catalog then
        raise exception 'PERMISSION_DENIED';
    end if;

    update public.worker_sessions set last_used_at = now() where id = v_session_id;

    return query
    select i.product_id, i.name,
           case when v_can_view_stock then i.stock_quantity::bigint else null::bigint end
    from public.inventory_summary i
    order by i.product_id;
end;
$$;

'''
sql = sql[:start] + new_catalog + sql[end:]

# Replace sale RPC with explicit permission check.
start = sql.index('create or replace function public.worker_create_sale')
end = sql.index('create or replace function public.worker_logout', start)
new_sale = r'''create or replace function public.worker_create_sale(
    p_session_token text,
    p_product_id bigint,
    p_quantity integer,
    p_unit_price numeric,
    p_notes text default null
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_session_id bigint;
    v_staff_id bigint;
    v_can_sell boolean;
    v_sale_id bigint;
begin
    select ws.id, wa.staff_id, wa.can_sell
    into v_session_id, v_staff_id, v_can_sell
    from public.worker_sessions ws
    join public.worker_accounts wa on wa.id = ws.worker_id
    where ws.token_hash = encode(digest(p_session_token, 'sha256'), 'hex')
      and ws.expires_at > now()
      and wa.active = true
    limit 1;

    if v_session_id is null then raise exception 'INVALID_SESSION'; end if;
    if not v_can_sell then raise exception 'PERMISSION_DENIED'; end if;
    if p_quantity is null or p_quantity < 1 then raise exception 'INVALID_QUANTITY'; end if;
    if p_unit_price is null or p_unit_price < 0 then raise exception 'INVALID_PRICE'; end if;
    if not exists (select 1 from public.products where id = p_product_id) then raise exception 'INVALID_PRODUCT'; end if;

    insert into public.sales (product_id, quantity, unit_price, sold_by, notes)
    values (p_product_id, p_quantity, p_unit_price, v_staff_id, nullif(trim(p_notes), ''))
    returning id into v_sale_id;

    update public.worker_sessions set last_used_at = now() where id = v_session_id;
    return v_sale_id;
end;
$$;

create or replace function public.worker_get_today_summary(p_session_token text)
returns table (sales_count bigint, revenue numeric)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_session_id bigint;
    v_staff_id bigint;
    v_allowed boolean;
begin
    select ws.id, wa.staff_id, wa.can_view_sales
    into v_session_id, v_staff_id, v_allowed
    from public.worker_sessions ws
    join public.worker_accounts wa on wa.id = ws.worker_id
    where ws.token_hash = encode(digest(p_session_token, 'sha256'), 'hex')
      and ws.expires_at > now() and wa.active = true
    limit 1;
    if v_session_id is null then raise exception 'INVALID_SESSION'; end if;
    if not v_allowed then raise exception 'PERMISSION_DENIED'; end if;

    update public.worker_sessions set last_used_at = now() where id = v_session_id;
    return query
    select count(*)::bigint,
           coalesce(sum(s.quantity * s.unit_price), 0)::numeric
    from public.sales s
    where s.operation_at >= date_trunc('day', now())
      and s.operation_at < date_trunc('day', now()) + interval '1 day';
end;
$$;

create or replace function public.worker_add_product(p_session_token text, p_name text)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_session_id bigint;
    v_allowed boolean;
    v_product_id bigint;
begin
    select ws.id, wa.can_manage_products into v_session_id, v_allowed
    from public.worker_sessions ws join public.worker_accounts wa on wa.id = ws.worker_id
    where ws.token_hash = encode(digest(p_session_token, 'sha256'), 'hex')
      and ws.expires_at > now() and wa.active = true limit 1;
    if v_session_id is null then raise exception 'INVALID_SESSION'; end if;
    if not v_allowed then raise exception 'PERMISSION_DENIED'; end if;
    if nullif(trim(p_name), '') is null then raise exception 'INVALID_PRODUCT_NAME'; end if;

    insert into public.products(name) values (trim(p_name)) returning id into v_product_id;
    update public.worker_sessions set last_used_at = now() where id = v_session_id;
    return v_product_id;
end;
$$;

create or replace function public.worker_rename_product(p_session_token text, p_product_id bigint, p_name text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_session_id bigint;
    v_allowed boolean;
begin
    select ws.id, wa.can_manage_products into v_session_id, v_allowed
    from public.worker_sessions ws join public.worker_accounts wa on wa.id = ws.worker_id
    where ws.token_hash = encode(digest(p_session_token, 'sha256'), 'hex')
      and ws.expires_at > now() and wa.active = true limit 1;
    if v_session_id is null then raise exception 'INVALID_SESSION'; end if;
    if not v_allowed then raise exception 'PERMISSION_DENIED'; end if;
    if nullif(trim(p_name), '') is null then raise exception 'INVALID_PRODUCT_NAME'; end if;

    update public.products set name = trim(p_name) where id = p_product_id;
    if not found then raise exception 'INVALID_PRODUCT'; end if;
    update public.worker_sessions set last_used_at = now() where id = v_session_id;
    return true;
end;
$$;

create or replace function public.worker_apply_stock_adjustments(
    p_session_token text,
    p_adjustments jsonb,
    p_reason text
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_session_id bigint;
    v_allowed boolean;
    v_qty_col text;
    v_reason_col text;
    v_row jsonb;
    v_product_id bigint;
    v_quantity_change integer;
    v_count integer := 0;
begin
    select ws.id, wa.can_inventory into v_session_id, v_allowed
    from public.worker_sessions ws join public.worker_accounts wa on wa.id = ws.worker_id
    where ws.token_hash = encode(digest(p_session_token, 'sha256'), 'hex')
      and ws.expires_at > now() and wa.active = true limit 1;
    if v_session_id is null then raise exception 'INVALID_SESSION'; end if;
    if not v_allowed then raise exception 'PERMISSION_DENIED'; end if;
    if jsonb_typeof(p_adjustments) <> 'array' or jsonb_array_length(p_adjustments) = 0 then raise exception 'INVALID_ADJUSTMENTS'; end if;
    if nullif(trim(p_reason), '') is null then raise exception 'INVALID_REASON'; end if;

    select c.column_name into v_qty_col
    from information_schema.columns c
    where c.table_schema='public' and c.table_name='stock_adjustments'
      and c.column_name = any(array['quantity','quantity_change','quantity_delta','adjustment_quantity','adjustment','delta','change_quantity'])
    order by array_position(array['quantity','quantity_change','quantity_delta','adjustment_quantity','adjustment','delta','change_quantity'], c.column_name)
    limit 1;

    select c.column_name into v_reason_col
    from information_schema.columns c
    where c.table_schema='public' and c.table_name='stock_adjustments'
      and c.column_name = any(array['reason','notes','note','description'])
    order by array_position(array['reason','notes','note','description'], c.column_name)
    limit 1;

    if v_qty_col is null or v_reason_col is null then raise exception 'UNSUPPORTED_STOCK_ADJUSTMENTS_SCHEMA'; end if;

    for v_row in select value from jsonb_array_elements(p_adjustments)
    loop
        v_product_id := (v_row->>'product_id')::bigint;
        v_quantity_change := (v_row->>'quantity_change')::integer;
        if v_quantity_change = 0 then continue; end if;
        if not exists (select 1 from public.products where id=v_product_id) then raise exception 'INVALID_PRODUCT'; end if;
        execute format('insert into public.stock_adjustments (product_id, %I, %I) values ($1,$2,$3)', v_qty_col, v_reason_col)
        using v_product_id, v_quantity_change, trim(p_reason);
        v_count := v_count + 1;
    end loop;

    update public.worker_sessions set last_used_at = now() where id = v_session_id;
    return v_count;
end;
$$;

'''
sql = sql[:start] + new_sale + sql[end:]

# Add grants for the new RPCs before existing final grants.
grant_marker = "revoke all on function public.worker_login(text, text) from public;"
new_grants = """revoke all on function public.worker_get_context(text) from public;
revoke all on function public.worker_get_today_summary(text) from public;
revoke all on function public.worker_add_product(text, text) from public;
revoke all on function public.worker_rename_product(text, bigint, text) from public;
revoke all on function public.worker_apply_stock_adjustments(text, jsonb, text) from public;

""" + grant_marker
if 'revoke all on function public.worker_get_context' not in sql:
    sql = replace_once(sql, grant_marker, new_grants, 'permission rpc revokes')

grant_exec_marker = "grant execute on function public.worker_login(text, text) to anon, authenticated;"
new_exec = """grant execute on function public.worker_get_context(text) to anon, authenticated;
grant execute on function public.worker_get_today_summary(text) to anon, authenticated;
grant execute on function public.worker_add_product(text, text) to anon, authenticated;
grant execute on function public.worker_rename_product(text, bigint, text) to anon, authenticated;
grant execute on function public.worker_apply_stock_adjustments(text, jsonb, text) to anon, authenticated;

""" + grant_exec_marker
if 'grant execute on function public.worker_get_context' not in sql:
    sql = replace_once(sql, grant_exec_marker, new_exec, 'permission rpc grants')

# --- UI styles ---
css_marker = ".worker-actions button{width:auto;padding:7px 9px;font-size:12px}"
css_new = css_marker + ".permissions-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:9px}.permission-check{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700}.permission-check input{width:auto;margin:0}.worker-permissions{margin-top:8px;padding-top:8px;border-top:1px dashed var(--line)}"
if '.permissions-grid{' not in index:
    index = replace_once(index, css_marker, css_new, 'permission css')

# --- Sidebar permissions ---
index = index.replace('<a class="side-link" href="#sale" @click="sidebarOpen=false"><span class="ico">＋</span><span>تسجيل بيع</span></a>', '<a v-if="can(\'sell\')" class="side-link" href="#sale" @click="sidebarOpen=false"><span class="ico">＋</span><span>تسجيل بيع</span></a>')
index = index.replace('<a class="side-link" href="#inventory" @click="inventoryTab=\'stock\';sidebarOpen=false"><span class="ico">▦</span><span>المخزون</span></a>', '<a v-if="can(\'view_stock\')" class="side-link" href="#inventory" @click="inventoryTab=\'stock\';sidebarOpen=false"><span class="ico">▦</span><span>المخزون</span></a>')
index = index.replace('<a v-if="userMode===\'admin\'" class="side-link" href="#inventory" @click="inventoryTab=\'products\';sidebarOpen=false"><span class="ico">◇</span><span>المنتجات</span></a>', '<a v-if="can(\'manage_products\')" class="side-link" href="#inventory" @click="inventoryTab=\'products\';sidebarOpen=false"><span class="ico">◇</span><span>المنتجات</span></a>')
index = index.replace('<a v-if="userMode===\'admin\'" class="side-link" href="#inventory" @click="openPhysicalCount();sidebarOpen=false"><span class="ico">✓</span><span>الجرد الفعلي</span></a>', '<a v-if="can(\'inventory\')" class="side-link" href="#inventory" @click="openPhysicalCount();sidebarOpen=false"><span class="ico">✓</span><span>الجرد الفعلي</span></a>')

# --- Dashboard permissions ---
index = index.replace('<div class="metric-pro"><div class="mhead"><span>إجمالي المخزون</span><span class="mico">◫</span></div><div class="mvalue">{{ stockUnits }}</div><div class="msub">وحدة متاحة حسب الحركات</div></div>', '<div v-if="can(\'view_stock\')" class="metric-pro"><div class="mhead"><span>إجمالي المخزون</span><span class="mico">◫</span></div><div class="mvalue">{{ stockUnits }}</div><div class="msub">وحدة متاحة حسب الحركات</div></div>')
index = index.replace('<div v-if="userMode===\'admin\'" class="metric-pro"><div class="mhead"><span>عمليات اليوم</span>', '<div v-if="can(\'view_sales\')" class="metric-pro"><div class="mhead"><span>عمليات اليوم</span>')
index = index.replace('<div v-if="userMode===\'admin\'" class="metric-pro"><div class="mhead"><span>مبيعات اليوم</span>', '<div v-if="can(\'view_sales\')" class="metric-pro"><div class="mhead"><span>مبيعات اليوم</span>')
index = index.replace('<a href="#sale">＋ بيع جديد</a>', '<a v-if="can(\'sell\')" href="#sale">＋ بيع جديد</a>')
index = index.replace('<a class="mobile-hide" href="#inventory" @click="inventoryTab=\'stock\'">▦ عرض المخزون</a>', '<a v-if="can(\'view_stock\')" class="mobile-hide" href="#inventory" @click="inventoryTab=\'stock\'">▦ عرض المخزون</a>')
index = index.replace('<a v-if="userMode===\'admin\'" href="#inventory" @click="openPhysicalCount">✓ جرد فعلي</a>', '<a v-if="can(\'inventory\')" href="#inventory" @click="openPhysicalCount">✓ جرد فعلي</a>')

# Sale section only when allowed.
index = index.replace('<section id="sale" class="card content-card">', '<section v-if="can(\'sell\')" id="sale" class="card content-card">', 1)

# Inventory section/tabs/sections.
index = index.replace('<section id="inventory" class="card content-card">', '<section v-if="can(\'view_stock\') || can(\'manage_products\') || can(\'inventory\')" id="inventory" class="card content-card">', 1)
index = index.replace('<div v-if="userMode===\'admin\'" class="tabs">', '<div class="tabs">', 1)
index = index.replace('<button class="tab" :class="{active:inventoryTab===\'products\'}" @click="inventoryTab=\'products\'">المنتجات</button>', '<button v-if="can(\'manage_products\')" class="tab" :class="{active:inventoryTab===\'products\'}" @click="inventoryTab=\'products\'">المنتجات</button>')
index = index.replace('<button class="tab" :class="{active:inventoryTab===\'stock\'}" @click="inventoryTab=\'stock\'">المخزون</button>', '<button v-if="can(\'view_stock\')" class="tab" :class="{active:inventoryTab===\'stock\'}" @click="inventoryTab=\'stock\'">المخزون</button>')
index = index.replace('<button class="tab" :class="{active:inventoryTab===\'count\'}" @click="openPhysicalCount">الجرد الفعلي</button>', '<button v-if="can(\'inventory\')" class="tab" :class="{active:inventoryTab===\'count\'}" @click="openPhysicalCount">الجرد الفعلي</button>')
index = index.replace('<template v-if="userMode!==\'admin\' || inventoryTab===\'stock\'">', '<template v-if="can(\'view_stock\') && inventoryTab===\'stock\'">')
index = index.replace('<template v-if="userMode===\'admin\' && inventoryTab===\'products\'">', '<template v-if="can(\'manage_products\') && inventoryTab===\'products\'">')
index = index.replace('<template v-if="userMode===\'admin\' && inventoryTab===\'count\'">', '<template v-if="can(\'inventory\') && inventoryTab===\'count\'">')

# Admin worker form: staff link + default permissions.
old_form_grid = '''            <div><label>اسم المستخدم</label><input v-model.trim="workerForm.username" required placeholder="مثال: kamal"></div>
            <div><label>الاسم المستعار</label><input v-model.trim="workerForm.nickname" required placeholder="مثال: كمال"></div>
            <div><label>الهاتف (اختياري)</label><input v-model.trim="workerForm.phone" inputmode="tel"></div>
            <div><label>كلمة مرور خاصة (اختياري)</label><input v-model="workerForm.password" type="password" autocomplete="new-password" placeholder="اتركها فارغة للافتراضية"></div>'''
new_form_grid = '''            <div><label>اسم المستخدم</label><input v-model.trim="workerForm.username" required placeholder="مثال: kamal"></div>
            <div><label>الاسم المستعار</label><input v-model.trim="workerForm.nickname" required placeholder="مثال: كمال"></div>
            <div><label>الخدام المرتبط</label><select v-model.number="workerForm.staff_id" required><option disabled value="">اختر</option><option v-for="s in staff" :key="s.id" :value="s.id">{{ s.name }}</option></select></div>
            <div><label>الهاتف (اختياري)</label><input v-model.trim="workerForm.phone" inputmode="tel"></div>
            <div><label>كلمة مرور خاصة</label><input v-model="workerForm.password" type="password" autocomplete="new-password" required placeholder="4 أحرف/أرقام أو أكثر"></div>
            <div class="worker-permissions"><label>الصلاحيات الأولية</label><div class="permissions-grid"><label class="permission-check"><input type="checkbox" v-model="workerForm.can_sell"> البيع</label><label class="permission-check"><input type="checkbox" v-model="workerForm.can_view_stock"> رؤية المخزون</label><label class="permission-check"><input type="checkbox" v-model="workerForm.can_inventory"> الجرد الفعلي</label><label class="permission-check"><input type="checkbox" v-model="workerForm.can_manage_products"> إدارة المنتجات</label><label class="permission-check"><input type="checkbox" v-model="workerForm.can_view_sales"> رؤية مبيعات اليوم</label></div></div>'''
index = replace_once(index, old_form_grid, new_form_grid, 'worker create form')
index = index.replace('إذا تركت كلمة المرور فارغة يستعمل النظام كلمة المرور الافتراضية المحفوظة داخل قاعدة البيانات.', 'اختر الخدام المرتبط وحدد صلاحياته. كلمة المرور لا تُحفظ كنص صريح؛ قاعدة البيانات تحفظها مشفرة.')

# Admin worker rows permission editor.
old_worker_meta = '''              <small>{{ w.phone || 'بدون هاتف' }} · <span :class="w.active?'status-on':'status-off'">{{ w.active ? 'مفعّل' : 'موقوف' }}</span></small>
            </div>
            <div class="worker-actions">'''
new_worker_meta = '''              <small>{{ w.phone || 'بدون هاتف' }} · <span :class="w.active?'status-on':'status-off'">{{ w.active ? 'مفعّل' : 'موقوف' }}</span></small>
              <div class="worker-permissions permissions-grid">
                <label class="permission-check"><input type="checkbox" v-model="w.can_sell"> البيع</label>
                <label class="permission-check"><input type="checkbox" v-model="w.can_view_stock"> المخزون</label>
                <label class="permission-check"><input type="checkbox" v-model="w.can_inventory"> الجرد</label>
                <label class="permission-check"><input type="checkbox" v-model="w.can_manage_products"> المنتجات</label>
                <label class="permission-check"><input type="checkbox" v-model="w.can_view_sales"> مبيعات اليوم</label>
              </div>
            </div>
            <div class="worker-actions">
              <button class="btn" @click="saveWorkerPermissions(w)" :disabled="busy">حفظ الصلاحيات</button>'''
index = replace_once(index, old_worker_meta, new_worker_meta, 'worker permission editor')

# JS state/computeds.
index = replace_once(index,
"    const session=ref(null),workerToken=ref(storedWorkerToken),workerNickname=ref(storedWorkerNickname)\n    const loading=ref(true),busy=ref(false),loginMode=ref('worker'),email=ref(''),password=ref(''),workerUsername=ref(''),workerPassword=ref('')",
"    const session=ref(null),workerToken=ref(storedWorkerToken),workerNickname=ref(storedWorkerNickname)\n    const workerPermissions=ref({can_sell:false,can_view_stock:false,can_inventory:false,can_manage_products:false,can_view_sales:false})\n    const workerSalesSummary=ref({sales_count:0,revenue:0})\n    const loading=ref(true),busy=ref(false),loginMode=ref('worker'),email=ref(''),password=ref(''),workerUsername=ref(''),workerPassword=ref('')",
'worker permission state')
index = index.replace("    const workerForm=ref({username:'',nickname:'',phone:'',password:''})", "    const workerForm=ref({username:'',nickname:'',phone:'',password:'',staff_id:'',can_sell:true,can_view_stock:true,can_inventory:false,can_manage_products:false,can_view_sales:false})")
index = index.replace("    const todaySalesCount=computed(()=>todaySales.value.length)\n    const todayRevenue=computed(()=>(todaySales.value||[]).reduce((sum,x)=>sum+(Number(x.quantity||0)*Number(x.unit_price||0)),0))", "    const todaySalesCount=computed(()=>userMode.value==='worker'?Number(workerSalesSummary.value.sales_count||0):todaySales.value.length)\n    const todayRevenue=computed(()=>userMode.value==='worker'?Number(workerSalesSummary.value.revenue||0):(todaySales.value||[]).reduce((sum,x)=>sum+(Number(x.quantity||0)*Number(x.unit_price||0)),0))")
index = replace_once(index,
"    function notify(text,type='ok'){message.value=text;messageType.value=type==='error'?'error':'ok'}",
"    function notify(text,type='ok'){message.value=text;messageType.value=type==='error'?'error':'ok'}\n    function can(permission){return userMode.value==='admin'||!!workerPermissions.value['can_'+permission]}",
'can helper')
index = index.replace("    function clearWorkerSession(){workerToken.value='';workerNickname.value='';localStorage.removeItem(WORKER_TOKEN_KEY);localStorage.removeItem(WORKER_NICKNAME_KEY);localStorage.removeItem(WORKER_EXPIRES_KEY)}", "    function clearWorkerSession(){workerToken.value='';workerNickname.value='';workerPermissions.value={can_sell:false,can_view_stock:false,can_inventory:false,can_manage_products:false,can_view_sales:false};workerSalesSummary.value={sales_count:0,revenue:0};localStorage.removeItem(WORKER_TOKEN_KEY);localStorage.removeItem(WORKER_NICKNAME_KEY);localStorage.removeItem(WORKER_EXPIRES_KEY)}")

# Worker load: context first, then only allowed data.
old_worker_load = '''      if(userMode.value==='worker'){
        const {data,error}=await supabase.rpc('worker_get_catalog',{p_session_token:workerToken.value})
        busy.value=false
        if(error){clearWorkerSession();window.location.replace('../');return}
        inventory.value=data||[]
        products.value=(data||[]).map(x=>({id:x.product_id,name:x.name}))
        return
      }'''
new_worker_load = '''      if(userMode.value==='worker'){
        const contextResult=await supabase.rpc('worker_get_context',{p_session_token:workerToken.value})
        if(contextResult.error||!contextResult.data?.length){busy.value=false;clearWorkerSession();window.location.replace('../');return}
        const ctx=contextResult.data[0]
        workerNickname.value=ctx.nickname||workerNickname.value
        workerPermissions.value={can_sell:!!ctx.can_sell,can_view_stock:!!ctx.can_view_stock,can_inventory:!!ctx.can_inventory,can_manage_products:!!ctx.can_manage_products,can_view_sales:!!ctx.can_view_sales}
        localStorage.setItem(WORKER_NICKNAME_KEY,workerNickname.value)
        inventory.value=[];products.value=[];workerSalesSummary.value={sales_count:0,revenue:0}
        if(can('sell')||can('view_stock')||can('inventory')||can('manage_products')){
          const catalogResult=await supabase.rpc('worker_get_catalog',{p_session_token:workerToken.value})
          if(catalogResult.error){busy.value=false;return notify('تعذر قراءة بيانات العامل: '+catalogResult.error.message,'error')}
          inventory.value=catalogResult.data||[]
          products.value=(catalogResult.data||[]).map(x=>({id:x.product_id,name:x.name}))
          productNames.value=Object.fromEntries((products.value||[]).map(x=>[x.id,x.name]))
        }
        if(can('view_sales')){
          const summaryResult=await supabase.rpc('worker_get_today_summary',{p_session_token:workerToken.value})
          if(!summaryResult.error&&summaryResult.data?.length)workerSalesSummary.value=summaryResult.data[0]
        }
        if(!can('view_stock')&&inventoryTab.value==='stock')inventoryTab.value=can('manage_products')?'products':(can('inventory')?'count':'stock')
        busy.value=false
        return
      }'''
index = replace_once(index, old_worker_load, new_worker_load, 'worker load context')

# Admin query includes permissions.
index = index.replace("supabase.from('worker_accounts').select('id,username,phone,nickname,staff_id,active,created_at').order('id')", "supabase.from('worker_accounts').select('id,username,phone,nickname,staff_id,active,created_at,can_sell,can_view_stock,can_inventory,can_manage_products,can_view_sales').order('id')")

# Product writes route through worker RPC when permitted.
index = index.replace("    async function addProduct(){\n      if(userMode.value!=='admin')return", "    async function addProduct(){\n      if(!can('manage_products'))return")
index = index.replace("      const {error}=await supabase.from('products').insert({name})", "      const result=userMode.value==='worker'?await supabase.rpc('worker_add_product',{p_session_token:workerToken.value,p_name:name}):await supabase.from('products').insert({name})\n      const error=result.error")
index = index.replace("    async function renameProduct(product){\n      if(userMode.value!=='admin')return", "    async function renameProduct(product){\n      if(!can('manage_products'))return")
index = index.replace("      const {error}=await supabase.from('products').update({name}).eq('id',product.id)", "      const result=userMode.value==='worker'?await supabase.rpc('worker_rename_product',{p_session_token:workerToken.value,p_product_id:Number(product.id),p_name:name}):await supabase.from('products').update({name}).eq('id',product.id)\n      const error=result.error")

# Inventory write: worker uses one atomic permission-checked RPC.
index = index.replace("    async function applyPhysicalCount(){\n      if(userMode.value!=='admin')return", "    async function applyPhysicalCount(){\n      if(!can('inventory'))return")
old_adjust = '''      const adjustments=changed.map(item=>{
        const payload={product_id:Number(item.product_id)}
        payload[qtyColumn]=difference(item)
        payload[reasonColumn]=reason
        return payload
      })
      const {error}=await supabase.from('stock_adjustments').insert(adjustments)'''
new_adjust = '''      let error=null
      if(userMode.value==='worker'){
        const adjustments=changed.map(item=>({product_id:Number(item.product_id),quantity_change:difference(item)}))
        const result=await supabase.rpc('worker_apply_stock_adjustments',{p_session_token:workerToken.value,p_adjustments:adjustments,p_reason:reason})
        error=result.error
      }else{
        const adjustments=changed.map(item=>{
          const payload={product_id:Number(item.product_id)}
          payload[qtyColumn]=difference(item)
          payload[reasonColumn]=reason
          return payload
        })
        const result=await supabase.from('stock_adjustments').insert(adjustments);error=result.error
      }'''
index = replace_once(index, old_adjust, new_adjust, 'worker inventory rpc')
# Avoid unnecessary admin schema detection for worker path.
index = index.replace("      const qtyColumn=await findAdjustmentColumn(['quantity','quantity_change','quantity_delta','adjustment_quantity','adjustment','delta','change_quantity'])\n      const reasonColumn=await findAdjustmentColumn(['reason','notes','note','description'])\n      if(!qtyColumn||!reasonColumn){\n        busy.value=false\n        return notify('تعذر التعرف على بنية جدول stock_adjustments. أرسل الخطأ للمطور قبل تسجيل الجرد.','error')\n      }", "      let qtyColumn=null,reasonColumn=null\n      if(userMode.value==='admin'){\n        qtyColumn=await findAdjustmentColumn(['quantity','quantity_change','quantity_delta','adjustment_quantity','adjustment','delta','change_quantity'])\n        reasonColumn=await findAdjustmentColumn(['reason','notes','note','description'])\n        if(!qtyColumn||!reasonColumn){busy.value=false;return notify('تعذر التعرف على بنية جدول stock_adjustments. أرسل الخطأ للمطور قبل تسجيل الجرد.','error')}\n      }")

# Create worker and permission save.
old_create_payload = "      const payload={username:workerForm.value.username,nickname:workerForm.value.nickname,phone:workerForm.value.phone||null}\n      if(workerForm.value.password)payload.password=workerForm.value.password"
new_create_payload = "      const payload={username:workerForm.value.username,nickname:workerForm.value.nickname,phone:workerForm.value.phone||null,password:workerForm.value.password,staff_id:Number(workerForm.value.staff_id),can_sell:!!workerForm.value.can_sell,can_view_stock:!!workerForm.value.can_view_stock,can_inventory:!!workerForm.value.can_inventory,can_manage_products:!!workerForm.value.can_manage_products,can_view_sales:!!workerForm.value.can_view_sales}"
index = replace_once(index, old_create_payload, new_create_payload, 'create worker payload')
index = index.replace("      workerForm.value={username:'',nickname:'',phone:'',password:''}", "      workerForm.value={username:'',nickname:'',phone:'',password:'',staff_id:'',can_sell:true,can_view_stock:true,can_inventory:false,can_manage_products:false,can_view_sales:false}")
insert_before_toggle = "    async function toggleWorker(w){"
save_permissions_fn = '''    async function saveWorkerPermissions(w){
      if(userMode.value!=='admin')return
      busy.value=true;message.value=''
      const payload={can_sell:!!w.can_sell,can_view_stock:!!w.can_view_stock,can_inventory:!!w.can_inventory,can_manage_products:!!w.can_manage_products,can_view_sales:!!w.can_view_sales}
      const {error}=await supabase.from('worker_accounts').update(payload).eq('id',w.id)
      busy.value=false
      if(error)return notify('تعذر حفظ الصلاحيات: '+error.message,'error')
      notify('تم حفظ صلاحيات '+(w.nickname||w.username)+'.')
      await loadAll()
    }

'''
if 'async function saveWorkerPermissions' not in index:
    index = replace_once(index, insert_before_toggle, save_permissions_fn + insert_before_toggle, 'save permissions function')

# Return bindings.
index = index.replace("workerNickname,message,messageType,staff,products,inventory,adminWorkers,todaySales,sale,workerForm", "workerNickname,workerPermissions,message,messageType,staff,products,inventory,adminWorkers,todaySales,sale,workerForm")
index = index.replace("money,signed,difference,setLoginMode", "money,signed,difference,can,setLoginMode")
index = index.replace("createWorker,toggleWorker,deleteWorker", "createWorker,saveWorkerPermissions,toggleWorker,deleteWorker")

# --- Documentation ---
if '## صلاحيات الخدام — 11 سبتمبر 2026' not in doc:
    doc += '''\n\n## صلاحيات الخدام — 11 سبتمبر 2026\nالحالة: `IMPLEMENTED IN REPOSITORY / DATABASE APPLY REQUIRED`\n\nتمت إضافة نموذج صلاحيات لكل عامل بدل الصلاحيات الثابتة:\n- تسجيل البيع.\n- رؤية المخزون.\n- تنفيذ الجرد الفعلي.\n- إدارة المنتجات.\n- رؤية ملخص مبيعات اليوم.\n\nالحماية ليست واجهة فقط: `worker-auth.sql` يضيف أعمدة الصلاحيات وRPCs تتحقق من جلسة العامل والصلاحية قبل تنفيذ البيع/الجرد/تعديل المنتجات/قراءة مبيعات اليوم. تغيير الصلاحية من الإدارة يطبق عند إعادة تحميل العامل للبيانات.\n\nتم أيضًا تصحيح إنشاء العامل ليرسل `staff_id` المطلوب في قاعدة البيانات بدل إنشاء حساب غير مرتبط بخدام.\n\n### خطوة التفعيل\nيجب تشغيل النسخة المحدثة من `shop/worker-auth.sql` داخل Supabase SQL Editor مرة واحدة لتطبيق أعمدة الصلاحيات وRPCs الجديدة على قاعدة البيانات، ثم اختبار حساب عامل بصلاحيتين مختلفتين على الأقل.\n'''

index_path.write_text(index, encoding='utf-8')
sql_path.write_text(sql, encoding='utf-8')
doc_path.write_text(doc, encoding='utf-8')

print('worker permissions patch applied')

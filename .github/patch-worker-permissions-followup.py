from pathlib import Path

sql_path = Path('shop/worker-auth.sql')
index_path = Path('shop/index.html')
sql = sql_path.read_text(encoding='utf-8')
index = index_path.read_text(encoding='utf-8')

old_sql = """    select ws.id, wa.can_view_stock,
           (wa.can_view_stock or wa.can_sell or wa.can_inventory or wa.can_manage_products)
    into v_session_id, v_can_view_stock, v_can_use_catalog"""
new_sql = """    select ws.id, (wa.can_view_stock or wa.can_inventory),
           (wa.can_view_stock or wa.can_sell or wa.can_inventory or wa.can_manage_products)
    into v_session_id, v_can_view_stock, v_can_use_catalog"""
if old_sql not in sql:
    raise SystemExit('catalog permission marker not found')
sql = sql.replace(old_sql, new_sql, 1)

old_index = "resetPhysicalCount();await loadAll();inventoryTab.value='stock'"
new_index = "resetPhysicalCount();await loadAll();inventoryTab.value=can('view_stock')?'stock':'count'"
if old_index not in index:
    raise SystemExit('inventory tab marker not found')
index = index.replace(old_index, new_index, 1)

sql_path.write_text(sql, encoding='utf-8')
index_path.write_text(index, encoding='utf-8')
print('worker inventory permission follow-up applied')

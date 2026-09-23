-- Separate commercial card stock from SIM feeding stock — 2026-09-23
-- Owner decision:
-- - cards/card_stock_* = commercial cards for customer sale.
-- - station_connect_recharge_cards = operational cards used only to feed SAMA.
-- - Future Master Card Stock imports must never auto-create or auto-link SAMA recharge cards.

create or replace function public.card_stock_admin_import_batch(
  p_type_key text,
  p_denomination text,
  p_source_kind text,
  p_source_label text,
  p_source_reference text,
  p_note text,
  p_rows jsonb,
  p_product_label text default null,
  p_import_method text default 'manual'
)
returns table(
  batch_uuid uuid,
  total_count integer,
  inserted_count integer,
  duplicate_count integer,
  invalid_count integer,
  operational_count integer
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_type public.card_stock_types%rowtype;
  v_batch uuid;
  v_row jsonb;
  v_raw_code text;
  v_raw_serial text;
  v_code text;
  v_serial text;
  v_fp text;
  v_serial_fp text;
  v_code_secret uuid;
  v_serial_secret uuid;
  v_total integer := 0;
  v_inserted integer := 0;
  v_duplicates integer := 0;
  v_invalid integer := 0;
  v_den text := nullif(btrim(coalesce(p_denomination,'')),'');
  v_source_kind text := btrim(coalesce(p_source_kind,''));
  v_source_label text := btrim(coalesce(p_source_label,''));
  v_import text := btrim(coalesce(p_import_method,'manual'));
  v_is_exception boolean;
begin
  if not private.is_shop_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode='42501';
  end if;

  select * into v_type
  from public.card_stock_types t
  where t.type_key=btrim(coalesce(p_type_key,'')) and t.active;

  if not found then
    raise exception 'CARD_TYPE_NOT_FOUND' using errcode='22023';
  end if;

  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)=0 then
    raise exception 'CARD_BATCH_EMPTY' using errcode='22023';
  end if;

  if v_source_kind not in ('supplier','platform','customer_return','internal','unknown_exception') then
    raise exception 'INVALID_CARD_SOURCE_KIND' using errcode='22023';
  end if;

  if v_source_label='' then
    raise exception 'CARD_SOURCE_LABEL_REQUIRED' using errcode='22023';
  end if;

  if v_import not in ('manual','parser','file','legacy') then
    raise exception 'INVALID_IMPORT_METHOD' using errcode='22023';
  end if;

  if v_type.type_key in ('mobilis','idoom') and v_den is null then
    raise exception 'CARD_DENOMINATION_REQUIRED' using errcode='22023';
  end if;

  if v_type.type_key='mobilis' and v_den !~ '^[0-9]+$' then
    raise exception 'MOBILIS_DENOMINATION_INVALID' using errcode='22023';
  end if;

  v_is_exception := v_source_kind in ('customer_return','unknown_exception');

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_total := v_total + 1;
    v_raw_code := coalesce(v_row->>'code','');
    v_raw_serial := coalesce(v_row->>'serial','');
    v_code := private.card_stock_normalize(v_raw_code,v_type.normalization);
    v_serial := btrim(v_raw_serial);

    if v_code=''
       or char_length(v_code) < v_type.code_min_length
       or char_length(v_code) > v_type.code_max_length
       or v_code !~ v_type.code_regex then
      v_invalid := v_invalid + 1;
      continue;
    end if;

    if v_type.serial_mode='required' and v_serial='' then
      v_invalid := v_invalid + 1;
      continue;
    end if;

    if v_type.serial_mode='none' and v_serial<>'' then
      v_invalid := v_invalid + 1;
      continue;
    end if;

    if v_serial<>'' then
      if v_type.serial_regex is not null and v_serial !~ v_type.serial_regex then
        v_invalid := v_invalid + 1;
        continue;
      end if;
      if v_type.serial_min_length is not null and char_length(v_serial)<v_type.serial_min_length then
        v_invalid := v_invalid + 1;
        continue;
      end if;
      if v_type.serial_max_length is not null and char_length(v_serial)>v_type.serial_max_length then
        v_invalid := v_invalid + 1;
        continue;
      end if;
    end if;
  end loop;

  if v_invalid > 0 then
    raise exception 'CARD_BATCH_FORMAT_INVALID:%',v_invalid using errcode='22023';
  end if;

  insert into public.card_stock_batches(
    type_key,denomination,product_label,source_kind,source_label,source_reference,note,
    is_exception,import_method,total_count,created_by
  ) values (
    v_type.type_key,v_den,nullif(btrim(coalesce(p_product_label,'')),''),
    v_source_kind,v_source_label,nullif(btrim(coalesce(p_source_reference,'')),''),
    nullif(btrim(coalesce(p_note,'')),''),
    v_is_exception,v_import,v_total,auth.uid()
  )
  returning card_stock_batches.batch_uuid into v_batch;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_code := private.card_stock_normalize(coalesce(v_row->>'code',''),v_type.normalization);
    v_serial := btrim(coalesce(v_row->>'serial',''));
    v_fp := encode(extensions.digest(v_code,'sha256'),'hex');

    if exists (
      select 1 from public.card_stock_items i
      where i.type_key=v_type.type_key and i.code_fingerprint=v_fp
    ) then
      v_duplicates := v_duplicates + 1;
      continue;
    end if;

    -- Hard separation: a physical Mobilis card cannot live in both pools.
    if v_type.type_key='mobilis' and exists (
      select 1 from public.station_connect_recharge_cards s
      where s.code_fingerprint=v_fp
    ) then
      raise exception 'MOBILIS_OPERATIONAL_STOCK_CONFLICT' using errcode='23505';
    end if;

    select vault.create_secret(
      v_code,
      'master-card-code-'||gen_random_uuid()::text,
      'MyTool commercial Master Card Stock code'
    ) into v_code_secret;

    v_serial_secret := null;
    v_serial_fp := null;
    if v_serial<>'' then
      v_serial_fp := encode(extensions.digest(v_serial,'sha256'),'hex');
      select vault.create_secret(
        v_serial,
        'master-card-serial-'||gen_random_uuid()::text,
        'MyTool Master Card Stock serial'
      ) into v_serial_secret;
    end if;

    insert into public.card_stock_items(
      batch_uuid,type_key,denomination,product_label,
      code_secret_id,code_fingerprint,code_last4,
      serial_secret_id,serial_fingerprint,serial_last4,
      status,origin_exception,station_recharge_card_uuid,created_by
    ) values (
      v_batch,v_type.type_key,v_den,nullif(btrim(coalesce(p_product_label,'')),''),
      v_code_secret,v_fp,right(v_code,4),
      v_serial_secret,v_serial_fp,case when v_serial='' then null else right(v_serial,4) end,
      case when v_is_exception then 'review' else 'available' end,
      v_is_exception,null,auth.uid()
    );

    v_inserted := v_inserted + 1;
  end loop;

  update public.card_stock_batches b
  set inserted_count=v_inserted,
      duplicate_count=v_duplicates,
      invalid_count=0
  where b.batch_uuid=v_batch;

  -- Kept for API compatibility. Commercial imports now create zero operational cards.
  return query select v_batch,v_total,v_inserted,v_duplicates,0,0;
end;
$function$;

-- Existing historical links are left untouched. They can represent legacy migrations.
-- New imports cannot create a link between the commercial pool and SAMA feeding pool.

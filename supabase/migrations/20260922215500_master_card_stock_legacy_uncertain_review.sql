-- Master Card Stock: previous/uncertain stock review mode
-- Applied live on 2026-09-22. No real card codes are stored in this file.

alter table public.card_stock_batches
  add column if not exists is_legacy_uncertain boolean not null default false;

alter table public.card_stock_items
  add column if not exists risk_accepted_at timestamptz,
  add column if not exists risk_accepted_by uuid;

create index if not exists card_stock_batches_legacy_uncertain_idx
  on public.card_stock_batches(is_legacy_uncertain,created_at desc);

CREATE OR REPLACE FUNCTION public.card_stock_admin_finish_card(p_card_uuid uuid, p_outcome text, p_note text DEFAULT NULL::text)
 RETURNS TABLE(card_uuid uuid, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_item public.card_stock_items%rowtype;
  v_batch public.card_stock_batches%rowtype;
  v_outcome text := btrim(coalesce(p_outcome,''));
  v_station public.station_connect_recharge_cards%rowtype;
begin
  if not private.is_shop_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode='42501';
  end if;

  if v_outcome not in ('available','used','review') then
    raise exception 'INVALID_CARD_OUTCOME' using errcode='22023';
  end if;

  select * into v_item
  from public.card_stock_items i
  where i.card_uuid=p_card_uuid
  for update;

  if not found then
    raise exception 'CARD_NOT_FOUND' using errcode='P0002';
  end if;

  select * into v_batch
  from public.card_stock_batches b
  where b.batch_uuid=v_item.batch_uuid;

  if v_item.status not in ('reserved','review','available') then
    raise exception 'CARD_STATUS_NOT_EDITABLE' using errcode='55000';
  end if;

  if coalesce(v_batch.is_legacy_uncertain,false) and v_outcome='available' then
    raise exception 'LEGACY_UNCERTAIN_CANNOT_BECOME_AVAILABLE' using errcode='55000';
  end if;

  if v_item.station_recharge_card_uuid is not null then
    select * into v_station
    from public.station_connect_recharge_cards s
    where s.card_uuid=v_item.station_recharge_card_uuid
    for update;

    if found and v_station.status in ('queued','processing') then
      raise exception 'CARD_OPERATION_BUSY' using errcode='55000';
    end if;

    if v_outcome='available' then
      if v_station.status='review' and coalesce(v_station.result_text,'')='MASTER_MANUAL_RESERVED' then
        update public.station_connect_recharge_cards
        set status='ready',result_text=null,updated_at=now()
        where station_connect_recharge_cards.card_uuid=v_station.card_uuid;
      elsif v_station.status<>'ready' then
        raise exception 'STATION_CARD_REQUIRES_REVIEW' using errcode='55000';
      end if;
    elsif v_outcome='used' then
      update public.station_connect_recharge_cards
      set status='used',
          result_text=left(coalesce(nullif(btrim(coalesce(p_note,'')),''),'استخدام يدوي من Master Card Stock'),4000),
          used_at=coalesce(used_at,now()),
          updated_at=now()
      where station_connect_recharge_cards.card_uuid=v_station.card_uuid;
    else
      update public.station_connect_recharge_cards
      set status='review',
          result_text=left(coalesce(nullif(btrim(coalesce(p_note,'')),''),'مراجعة يدوية من Master Card Stock'),4000),
          updated_at=now()
      where station_connect_recharge_cards.card_uuid=v_station.card_uuid;
    end if;
  end if;

  update public.card_stock_items i
  set status=v_outcome,
      result_note=nullif(btrim(coalesce(p_note,'')),''),
      used_at=case when v_outcome='used' then coalesce(i.used_at,now()) else i.used_at end,
      updated_at=now()
  where i.card_uuid=v_item.card_uuid;

  return query select v_item.card_uuid,v_outcome;
end;
$function$

CREATE OR REPLACE FUNCTION public.card_stock_admin_import_batch_v2(p_type_key text, p_denomination text, p_source_kind text, p_source_label text, p_source_reference text, p_note text, p_rows jsonb, p_product_label text DEFAULT NULL::text, p_import_method text DEFAULT 'manual'::text, p_legacy_uncertain boolean DEFAULT false)
 RETURNS TABLE(batch_uuid uuid, total_count integer, inserted_count integer, duplicate_count integer, invalid_count integer, operational_count integer, review_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_base record;
  v_type public.card_stock_types%rowtype;
  v_batch uuid;
  v_row jsonb;
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

  if not coalesce(p_legacy_uncertain,false) then
    select * into v_base
    from public.card_stock_admin_import_batch(
      p_type_key,p_denomination,p_source_kind,p_source_label,p_source_reference,
      p_note,p_rows,p_product_label,p_import_method
    );
    return query select
      v_base.batch_uuid,v_base.total_count,v_base.inserted_count,
      v_base.duplicate_count,v_base.invalid_count,v_base.operational_count,0;
    return;
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
    v_code := private.card_stock_normalize(coalesce(v_row->>'code',''),v_type.normalization);
    v_serial := btrim(coalesce(v_row->>'serial',''));

    if v_code=''
       or char_length(v_code)<v_type.code_min_length
       or char_length(v_code)>v_type.code_max_length
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

  if v_invalid>0 then
    raise exception 'CARD_BATCH_FORMAT_INVALID:%',v_invalid using errcode='22023';
  end if;

  insert into public.card_stock_batches(
    type_key,denomination,product_label,source_kind,source_label,source_reference,note,
    is_exception,is_legacy_uncertain,import_method,total_count,created_by
  ) values (
    v_type.type_key,v_den,nullif(btrim(coalesce(p_product_label,'')),''),
    v_source_kind,v_source_label,nullif(btrim(coalesce(p_source_reference,'')),''),
    nullif(btrim(coalesce(p_note,'')),''),
    v_is_exception,true,v_import,v_total,auth.uid()
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

    if v_type.type_key='mobilis' and exists (
      select 1 from public.station_connect_recharge_cards s
      where s.code_fingerprint=v_fp
    ) then
      v_duplicates := v_duplicates + 1;
      continue;
    end if;

    select vault.create_secret(
      v_code,
      'master-card-code-'||gen_random_uuid()::text,
      'MyTool Master Card Stock legacy uncertain code'
    ) into v_code_secret;

    v_serial_secret := null;
    v_serial_fp := null;
    if v_serial<>'' then
      v_serial_fp := encode(extensions.digest(v_serial,'sha256'),'hex');
      select vault.create_secret(
        v_serial,
        'master-card-serial-'||gen_random_uuid()::text,
        'MyTool Master Card Stock legacy uncertain serial'
      ) into v_serial_secret;
    end if;

    insert into public.card_stock_items(
      batch_uuid,type_key,denomination,product_label,
      code_secret_id,code_fingerprint,code_last4,
      serial_secret_id,serial_fingerprint,serial_last4,
      status,origin_exception,station_recharge_card_uuid,
      result_note,created_by
    ) values (
      v_batch,v_type.type_key,v_den,nullif(btrim(coalesce(p_product_label,'')),''),
      v_code_secret,v_fp,right(v_code,4),
      v_serial_secret,v_serial_fp,case when v_serial='' then null else right(v_serial,4) end,
      'review',v_is_exception,null,
      'LEGACY_UNCERTAIN_STOCK',auth.uid()
    );

    v_inserted := v_inserted + 1;
  end loop;

  update public.card_stock_batches b
  set inserted_count=v_inserted,
      duplicate_count=v_duplicates,
      invalid_count=0
  where b.batch_uuid=v_batch;

  return query select v_batch,v_total,v_inserted,v_duplicates,0,0,v_inserted;
end;
$function$

CREATE OR REPLACE FUNCTION public.card_stock_admin_items_v2(p_limit integer DEFAULT 80, p_status text DEFAULT NULL::text)
 RETURNS TABLE(card_uuid uuid, type_key text, type_name text, denomination text, product_label text, masked_code text, masked_serial text, status text, source_kind text, source_label text, source_reference text, origin_exception boolean, legacy_uncertain boolean, risk_accepted_at timestamp with time zone, station_linked boolean, created_at timestamp with time zone, used_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_shop_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode='42501';
  end if;

  if p_status is not null and p_status not in ('available','reserved','used','review','invalid') then
    raise exception 'INVALID_CARD_STATUS' using errcode='22023';
  end if;

  return query
  select
    i.card_uuid,i.type_key,t.name,
    coalesce(i.denomination,''),coalesce(i.product_label,''),
    '•••• '||coalesce(i.code_last4,''),
    case when i.serial_secret_id is null then '' else '•••• '||coalesce(i.serial_last4,'') end,
    i.status,b.source_kind,b.source_label,coalesce(b.source_reference,''),
    i.origin_exception,b.is_legacy_uncertain,i.risk_accepted_at,
    (i.station_recharge_card_uuid is not null),
    i.created_at,i.used_at
  from public.card_stock_items i
  join public.card_stock_types t on t.type_key=i.type_key
  join public.card_stock_batches b on b.batch_uuid=i.batch_uuid
  where p_status is null or i.status=p_status
  order by i.created_at desc
  limit greatest(1,least(coalesce(p_limit,80),300));
end;
$function$

CREATE OR REPLACE FUNCTION public.card_stock_admin_recent_batches_v2(p_limit integer DEFAULT 30)
 RETURNS TABLE(batch_uuid uuid, type_key text, type_name text, denomination text, product_label text, source_kind text, source_label text, source_reference text, is_exception boolean, legacy_uncertain boolean, import_method text, total_count integer, inserted_count integer, duplicate_count integer, invalid_count integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_shop_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode='42501';
  end if;

  return query
  select
    b.batch_uuid,b.type_key,t.name,coalesce(b.denomination,''),coalesce(b.product_label,''),
    b.source_kind,b.source_label,coalesce(b.source_reference,''),
    b.is_exception,b.is_legacy_uncertain,b.import_method,
    b.total_count,b.inserted_count,b.duplicate_count,b.invalid_count,b.created_at
  from public.card_stock_batches b
  join public.card_stock_types t on t.type_key=b.type_key
  order by b.created_at desc
  limit greatest(1,least(coalesce(p_limit,30),100));
end;
$function$

CREATE OR REPLACE FUNCTION public.card_stock_admin_take_legacy_review_card(p_card_uuid uuid, p_accept_risk boolean)
 RETURNS TABLE(card_uuid uuid, type_key text, denomination text, product_label text, code text, serial text, source_label text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_item public.card_stock_items%rowtype;
  v_batch public.card_stock_batches%rowtype;
  v_code text;
  v_serial text;
begin
  if not private.is_shop_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode='42501';
  end if;

  if not coalesce(p_accept_risk,false) then
    raise exception 'RISK_CONFIRMATION_REQUIRED' using errcode='22023';
  end if;

  select * into v_item
  from public.card_stock_items i
  where i.card_uuid=p_card_uuid
  for update;

  if not found then
    raise exception 'CARD_NOT_FOUND' using errcode='P0002';
  end if;

  select * into v_batch
  from public.card_stock_batches b
  where b.batch_uuid=v_item.batch_uuid;

  if not coalesce(v_batch.is_legacy_uncertain,false) then
    raise exception 'CARD_NOT_LEGACY_UNCERTAIN' using errcode='55000';
  end if;

  if v_item.status<>'review' then
    raise exception 'CARD_NOT_IN_REVIEW' using errcode='55000';
  end if;

  if v_item.station_recharge_card_uuid is not null then
    raise exception 'LEGACY_CARD_MUST_NOT_BE_AUTOMATION_LINKED' using errcode='55000';
  end if;

  update public.card_stock_items i
  set status='reserved',
      risk_accepted_at=now(),
      risk_accepted_by=auth.uid(),
      result_note='LEGACY_UNCERTAIN_RISK_ACCEPTED',
      updated_at=now()
  where i.card_uuid=v_item.card_uuid;

  select d.decrypted_secret into v_code
  from vault.decrypted_secrets d
  where d.id=v_item.code_secret_id;

  if v_item.serial_secret_id is not null then
    select d.decrypted_secret into v_serial
    from vault.decrypted_secrets d
    where d.id=v_item.serial_secret_id;
  end if;

  if v_code is null then
    update public.card_stock_items
    set status='review',result_note='SECRET_NOT_FOUND',updated_at=now()
    where card_stock_items.card_uuid=v_item.card_uuid;
    raise exception 'CARD_SECRET_NOT_FOUND' using errcode='P0002';
  end if;

  return query select
    v_item.card_uuid,v_item.type_key,coalesce(v_item.denomination,''),
    coalesce(v_item.product_label,''),v_code,coalesce(v_serial,''),coalesce(v_batch.source_label,'');
end;
$function$

revoke all on function public.card_stock_admin_import_batch_v2(text,text,text,text,text,text,jsonb,text,text,boolean) from public,anon;
revoke all on function public.card_stock_admin_items_v2(integer,text) from public,anon;
revoke all on function public.card_stock_admin_recent_batches_v2(integer) from public,anon;
revoke all on function public.card_stock_admin_take_legacy_review_card(uuid,boolean) from public,anon;

grant execute on function public.card_stock_admin_import_batch_v2(text,text,text,text,text,text,jsonb,text,text,boolean) to authenticated;
grant execute on function public.card_stock_admin_items_v2(integer,text) to authenticated;
grant execute on function public.card_stock_admin_recent_batches_v2(integer) to authenticated;
grant execute on function public.card_stock_admin_take_legacy_review_card(uuid,boolean) to authenticated;

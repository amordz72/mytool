-- Master Card Stock — canonical card inventory
-- Source snapshot for the live migration applied 2026-09-22.
-- Real card codes/SN must never be committed to GitHub.

create table if not exists public.card_stock_types (
  type_key text primary key,
  name text not null,
  family text not null check (family in ('telecom','internet','game','other')),
  code_regex text not null,
  code_min_length integer not null default 4 check (code_min_length >= 1),
  code_max_length integer not null default 128 check (code_max_length >= code_min_length),
  normalization text not null default 'trim' check (normalization in ('trim','upper_trim','remove_spaces','upper_remove_spaces')),
  serial_mode text not null default 'optional' check (serial_mode in ('none','optional','required')),
  serial_regex text,
  serial_min_length integer,
  serial_max_length integer,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (serial_min_length is null or serial_min_length >= 1),
  check (serial_max_length is null or serial_min_length is null or serial_max_length >= serial_min_length)
);

create table if not exists public.card_stock_batches (
  batch_uuid uuid primary key default gen_random_uuid(),
  type_key text not null references public.card_stock_types(type_key),
  denomination text,
  product_label text,
  source_kind text not null check (source_kind in ('supplier','platform','customer_return','internal','unknown_exception')),
  source_label text not null,
  source_reference text,
  note text,
  is_exception boolean not null default false,
  import_method text not null default 'manual' check (import_method in ('manual','parser','file','legacy')),
  total_count integer not null default 0 check (total_count >= 0),
  inserted_count integer not null default 0 check (inserted_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  invalid_count integer not null default 0 check (invalid_count >= 0),
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.card_stock_items (
  card_uuid uuid primary key default gen_random_uuid(),
  batch_uuid uuid not null references public.card_stock_batches(batch_uuid) on delete restrict,
  type_key text not null references public.card_stock_types(type_key),
  denomination text,
  product_label text,
  code_secret_id uuid not null,
  code_fingerprint text not null,
  code_last4 text,
  serial_secret_id uuid,
  serial_fingerprint text,
  serial_last4 text,
  status text not null default 'available' check (status in ('available','reserved','used','review','invalid')),
  origin_exception boolean not null default false,
  station_recharge_card_uuid uuid unique references public.station_connect_recharge_cards(card_uuid) on delete set null,
  result_note text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  used_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (type_key, code_fingerprint)
);

create index if not exists card_stock_items_status_idx on public.card_stock_items(status,type_key,denomination);
create index if not exists card_stock_items_batch_idx on public.card_stock_items(batch_uuid);
create index if not exists card_stock_batches_created_idx on public.card_stock_batches(created_at desc);

alter table public.card_stock_types enable row level security;
alter table public.card_stock_batches enable row level security;
alter table public.card_stock_items enable row level security;

drop policy if exists "card stock types admin" on public.card_stock_types;
create policy "card stock types admin" on public.card_stock_types for all
using ((select private.is_shop_admin())) with check ((select private.is_shop_admin()));
drop policy if exists "card stock batches admin read" on public.card_stock_batches;
create policy "card stock batches admin read" on public.card_stock_batches for select
using ((select private.is_shop_admin()));
drop policy if exists "card stock items admin read" on public.card_stock_items;
create policy "card stock items admin read" on public.card_stock_items for select
using ((select private.is_shop_admin()));

revoke all on public.card_stock_types from anon;
revoke all on public.card_stock_batches from anon;
revoke all on public.card_stock_items from anon;
grant select,insert,update,delete on public.card_stock_types to authenticated;
grant select on public.card_stock_batches to authenticated;
grant select on public.card_stock_items to authenticated;

insert into public.card_stock_types(
 type_key,name,family,code_regex,code_min_length,code_max_length,normalization,
 serial_mode,serial_regex,serial_min_length,serial_max_length,notes
) values
 ('mobilis','Mobilis','telecom','^[0-9]{15}$',15,15,'trim','optional','^[0-9]+$',1,64,'رقم البطاقة هو المعرف الرسمي. SN معلومة ثانوية تحفظ إذا كانت موجودة ولا تمنع الإدخال عند غيابها.'),
 ('idoom','Idoom / ADSL','internet','^[0-9]{16}$',16,16,'trim','optional','^[0-9]{15}$',15,15,'رقم البطاقة هو المعرف الرسمي. SN يحفظ إذا كان موجودًا؛ لا يمنع الإدخال عند غيابه.'),
 ('pubg','PUBG','game','^[^[:space:]]{4,128}$',4,128,'trim','optional',null,null,null,'المصدر مستقل عن نوع البطاقة؛ يمكن شراء PUBG من أي مورد.'),
 ('free_fire','Free Fire','game','^[^[:space:]]{4,128}$',4,128,'trim','optional',null,null,null,'المصدر مستقل عن نوع البطاقة.'),
 ('generic','بطاقة عامة','other','^[^[:space:]]{4,128}$',4,128,'trim','optional',null,null,null,'Fallback للبطاقات التي لم تنشأ لها فئة بعد.')
on conflict (type_key) do update set
 name=excluded.name,family=excluded.family,code_regex=excluded.code_regex,
 code_min_length=excluded.code_min_length,code_max_length=excluded.code_max_length,
 normalization=excluded.normalization,serial_mode=excluded.serial_mode,
 serial_regex=excluded.serial_regex,serial_min_length=excluded.serial_min_length,
 serial_max_length=excluded.serial_max_length,notes=excluded.notes,updated_at=now();

CREATE OR REPLACE FUNCTION private.card_stock_normalize(p_value text, p_mode text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case coalesce(p_mode,'trim')
    when 'upper_trim' then upper(btrim(coalesce(p_value,'')))
    when 'remove_spaces' then regexp_replace(btrim(coalesce(p_value,'')), '[[:space:]]', '', 'g')
    when 'upper_remove_spaces' then upper(regexp_replace(btrim(coalesce(p_value,'')), '[[:space:]]', '', 'g'))
    else btrim(coalesce(p_value,''))
  end
$function$

CREATE OR REPLACE FUNCTION public.card_stock_admin_import_batch(p_type_key text, p_denomination text, p_source_kind text, p_source_label text, p_source_reference text, p_note text, p_rows jsonb, p_product_label text DEFAULT NULL::text, p_import_method text DEFAULT 'manual'::text)
 RETURNS TABLE(batch_uuid uuid, total_count integer, inserted_count integer, duplicate_count integer, invalid_count integer, operational_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_card uuid;
  v_station uuid;
  v_existing_station public.station_connect_recharge_cards%rowtype;
  v_total integer := 0;
  v_inserted integer := 0;
  v_duplicates integer := 0;
  v_invalid integer := 0;
  v_operational integer := 0;
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

    v_existing_station := null;
    if v_type.type_key='mobilis' then
      select * into v_existing_station
      from public.station_connect_recharge_cards s
      where s.code_fingerprint=v_fp
      limit 1;

      if found and v_existing_station.amount::text is distinct from v_den then
        raise exception 'MOBILIS_AMOUNT_CONFLICT' using errcode='22023';
      end if;
    end if;

    if v_type.type_key='mobilis' and v_existing_station.card_uuid is not null then
      v_code_secret := v_existing_station.code_secret_id;
      v_station := v_existing_station.card_uuid;
    else
      select vault.create_secret(
        v_code,
        'master-card-code-'||gen_random_uuid()::text,
        'MyTool Master Card Stock code'
      ) into v_code_secret;
      v_station := null;
    end if;

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
      case
        when v_station is null then 'available'
        when v_existing_station.status='ready' then 'available'
        when v_existing_station.status in ('queued','processing') then 'reserved'
        when v_existing_station.status='used' then 'used'
        else 'review'
      end,
      v_is_exception,v_station,auth.uid()
    )
    returning card_stock_items.card_uuid into v_card;

    if v_type.type_key='mobilis'
       and v_den in ('1000','2000')
       and v_station is null
       and not v_is_exception then
      begin
        insert into public.station_connect_recharge_cards(
          operator,source_code,source_label,amount,code_secret_id,
          code_fingerprint,code_last4,status,created_by
        ) values (
          'mobilis','mytool_cards',v_source_label,v_den::integer,v_code_secret,
          v_fp,right(v_code,4),'ready',auth.uid()
        )
        returning station_connect_recharge_cards.card_uuid into v_station;
      exception when unique_violation then
        select s.card_uuid into v_station
        from public.station_connect_recharge_cards s
        where s.code_fingerprint=v_fp
        limit 1;
      end;

      if v_station is not null then
        update public.card_stock_items i
        set station_recharge_card_uuid=v_station,updated_at=now()
        where i.card_uuid=v_card;
        v_operational := v_operational + 1;
      end if;
    elsif v_station is not null then
      v_operational := v_operational + 1;
    end if;

    v_inserted := v_inserted + 1;
  end loop;

  update public.card_stock_batches b
  set inserted_count=v_inserted,
      duplicate_count=v_duplicates,
      invalid_count=0
  where b.batch_uuid=v_batch;

  return query select v_batch,v_total,v_inserted,v_duplicates,0,v_operational;
end;
$function$

CREATE OR REPLACE FUNCTION public.card_stock_admin_summary()
 RETURNS TABLE(type_key text, type_name text, denomination text, product_label text, available_count bigint, reserved_count bigint, review_count bigint, used_count bigint, total_count bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    i.type_key,
    t.name,
    coalesce(i.denomination,''),
    coalesce(i.product_label,''),
    count(*) filter (where i.status='available'),
    count(*) filter (where i.status='reserved'),
    count(*) filter (where i.status='review'),
    count(*) filter (where i.status='used'),
    count(*)
  from public.card_stock_items i
  join public.card_stock_types t on t.type_key=i.type_key
  where private.is_shop_admin()
  group by i.type_key,t.name,coalesce(i.denomination,''),coalesce(i.product_label,'')
  order by t.name,coalesce(i.denomination,''),coalesce(i.product_label,'')
$function$

CREATE OR REPLACE FUNCTION public.card_stock_admin_items(p_limit integer DEFAULT 80, p_status text DEFAULT NULL::text)
 RETURNS TABLE(card_uuid uuid, type_key text, type_name text, denomination text, product_label text, masked_code text, masked_serial text, status text, source_kind text, source_label text, source_reference text, origin_exception boolean, station_linked boolean, created_at timestamp with time zone, used_at timestamp with time zone)
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
    i.origin_exception,(i.station_recharge_card_uuid is not null),
    i.created_at,i.used_at
  from public.card_stock_items i
  join public.card_stock_types t on t.type_key=i.type_key
  join public.card_stock_batches b on b.batch_uuid=i.batch_uuid
  where p_status is null or i.status=p_status
  order by i.created_at desc
  limit greatest(1,least(coalesce(p_limit,80),300));
end;
$function$

CREATE OR REPLACE FUNCTION public.card_stock_admin_recent_batches(p_limit integer DEFAULT 30)
 RETURNS TABLE(batch_uuid uuid, type_key text, type_name text, denomination text, product_label text, source_kind text, source_label text, source_reference text, is_exception boolean, import_method text, total_count integer, inserted_count integer, duplicate_count integer, invalid_count integer, created_at timestamp with time zone)
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
    b.source_kind,b.source_label,coalesce(b.source_reference,''),b.is_exception,b.import_method,
    b.total_count,b.inserted_count,b.duplicate_count,b.invalid_count,b.created_at
  from public.card_stock_batches b
  join public.card_stock_types t on t.type_key=b.type_key
  order by b.created_at desc
  limit greatest(1,least(coalesce(p_limit,30),100));
end;
$function$

CREATE OR REPLACE FUNCTION public.card_stock_admin_take_card(p_card_uuid uuid)
 RETURNS TABLE(card_uuid uuid, type_key text, denomination text, product_label text, code text, serial text, source_label text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_item public.card_stock_items%rowtype;
  v_code text;
  v_serial text;
  v_source text;
  v_station_status text;
begin
  if not private.is_shop_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode='42501';
  end if;

  select * into v_item
  from public.card_stock_items i
  where i.card_uuid=p_card_uuid
  for update;

  if not found then
    raise exception 'CARD_NOT_FOUND' using errcode='P0002';
  end if;

  if v_item.status<>'available' then
    raise exception 'CARD_NOT_AVAILABLE' using errcode='55000';
  end if;

  if v_item.station_recharge_card_uuid is not null then
    select s.status into v_station_status
    from public.station_connect_recharge_cards s
    where s.card_uuid=v_item.station_recharge_card_uuid
    for update;

    if v_station_status in ('queued','processing','used') then
      raise exception 'CARD_OPERATION_BUSY' using errcode='55000';
    end if;

    update public.station_connect_recharge_cards s
    set status='review',
        result_text='MASTER_MANUAL_RESERVED',
        updated_at=now()
    where s.card_uuid=v_item.station_recharge_card_uuid;
  end if;

  update public.card_stock_items i
  set status='reserved',result_note='MASTER_MANUAL_RESERVED',updated_at=now()
  where i.card_uuid=v_item.card_uuid;

  select d.decrypted_secret into v_code
  from vault.decrypted_secrets d
  where d.id=v_item.code_secret_id;

  if v_item.serial_secret_id is not null then
    select d.decrypted_secret into v_serial
    from vault.decrypted_secrets d
    where d.id=v_item.serial_secret_id;
  end if;

  select b.source_label into v_source
  from public.card_stock_batches b
  where b.batch_uuid=v_item.batch_uuid;

  if v_code is null then
    update public.card_stock_items
    set status='review',result_note='SECRET_NOT_FOUND',updated_at=now()
    where card_stock_items.card_uuid=v_item.card_uuid;
    raise exception 'CARD_SECRET_NOT_FOUND' using errcode='P0002';
  end if;

  return query select
    v_item.card_uuid,v_item.type_key,coalesce(v_item.denomination,''),
    coalesce(v_item.product_label,''),v_code,coalesce(v_serial,''),coalesce(v_source,'');
end;
$function$

CREATE OR REPLACE FUNCTION public.card_stock_admin_finish_card(p_card_uuid uuid, p_outcome text, p_note text DEFAULT NULL::text)
 RETURNS TABLE(card_uuid uuid, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_item public.card_stock_items%rowtype;
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

  if v_item.status not in ('reserved','review','available') then
    raise exception 'CARD_STATUS_NOT_EDITABLE' using errcode='55000';
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

CREATE OR REPLACE FUNCTION private.card_stock_sync_from_station()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update public.card_stock_items i
  set status=case
      when new.status='ready' then 'available'
      when new.status in ('queued','processing') then 'reserved'
      when new.status='used' then 'used'
      else 'review'
    end,
    result_note=case
      when new.status in ('failed','review') then new.result_text
      else i.result_note
    end,
    used_at=case when new.status='used' then coalesce(new.used_at,i.used_at,now()) else i.used_at end,
    updated_at=now()
  where i.station_recharge_card_uuid=new.card_uuid;
  return new;
end;
$function$

drop trigger if exists trg_card_stock_sync_from_station on public.station_connect_recharge_cards;
create trigger trg_card_stock_sync_from_station
after update of status,result_text,used_at on public.station_connect_recharge_cards
for each row execute function private.card_stock_sync_from_station();

do $$
declare v_batch uuid; v_count integer;
begin
  select count(*)::integer into v_count
  from public.station_connect_recharge_cards s
  where not exists (
    select 1 from public.card_stock_items i
    where i.station_recharge_card_uuid=s.card_uuid
  );

  if v_count>0 then
    insert into public.card_stock_batches(
      type_key,denomination,product_label,source_kind,source_label,source_reference,note,
      is_exception,import_method,total_count,inserted_count,created_by
    ) values (
      'mobilis',null,'Mobilis','internal','Station Connect السابق',
      'legacy-reconcile-20260922',
      'إدخال تلقائي للبطاقات الموجودة قبل إنشاء Master Card Stock.',
      false,'legacy',v_count,v_count,null
    ) returning batch_uuid into v_batch;

    insert into public.card_stock_items(
      batch_uuid,type_key,denomination,product_label,
      code_secret_id,code_fingerprint,code_last4,status,origin_exception,
      station_recharge_card_uuid,created_by,created_at,used_at,updated_at
    )
    select v_batch,'mobilis',s.amount::text,'Mobilis '||s.amount::text,
      s.code_secret_id,s.code_fingerprint,s.code_last4,
      case when s.status='ready' then 'available'
           when s.status in ('queued','processing') then 'reserved'
           when s.status='used' then 'used'
           else 'review' end,
      false,s.card_uuid,s.created_by,s.created_at,s.used_at,s.updated_at
    from public.station_connect_recharge_cards s
    where not exists (
      select 1 from public.card_stock_items i
      where i.station_recharge_card_uuid=s.card_uuid
    )
    on conflict (type_key,code_fingerprint) do nothing;
  end if;
end $$;

revoke all on function public.card_stock_admin_import_batch(text,text,text,text,text,text,jsonb,text,text) from public,anon;
revoke all on function public.card_stock_admin_summary() from public,anon;
revoke all on function public.card_stock_admin_items(integer,text) from public,anon;
revoke all on function public.card_stock_admin_recent_batches(integer) from public,anon;
revoke all on function public.card_stock_admin_take_card(uuid) from public,anon;
revoke all on function public.card_stock_admin_finish_card(uuid,text,text) from public,anon;
grant execute on function public.card_stock_admin_import_batch(text,text,text,text,text,text,jsonb,text,text) to authenticated;
grant execute on function public.card_stock_admin_summary() to authenticated;
grant execute on function public.card_stock_admin_items(integer,text) to authenticated;
grant execute on function public.card_stock_admin_recent_batches(integer) to authenticated;
grant execute on function public.card_stock_admin_take_card(uuid) to authenticated;
grant execute on function public.card_stock_admin_finish_card(uuid,text,text) to authenticated;

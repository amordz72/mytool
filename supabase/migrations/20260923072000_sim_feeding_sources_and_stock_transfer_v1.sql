-- SIM feeding source model + explicit commercial-stock transfer — 2026-09-23
-- Owner decision:
-- 1) Source is mandatory before adding SAMA feeding cards.
-- 2) Sources are either:
--    - our commercial stock (explicit transfer, never duplicate)
--    - an active platform from money_platform_directory
-- 3) Commercial stock and feeding stock remain separate. An explicit transfer moves
--    operational ownership and leaves only a historical/audit record in commercial stock.

-- ---------------------------------------------------------------------------
-- 1. Allow explicit transferred state in commercial stock.
-- ---------------------------------------------------------------------------
alter table public.card_stock_items
  drop constraint if exists card_stock_items_status_check;

alter table public.card_stock_items
  add constraint card_stock_items_status_check
  check (status = any (array[
    'available'::text,
    'reserved'::text,
    'used'::text,
    'review'::text,
    'invalid'::text,
    'transferred'::text
  ]));

-- ---------------------------------------------------------------------------
-- 2. Allow normalized source identifiers for SAMA feeding cards.
-- Legacy source values remain accepted.
-- ---------------------------------------------------------------------------
alter table public.station_connect_recharge_cards
  drop constraint if exists station_connect_recharge_cards_source_check;

alter table public.station_connect_recharge_cards
  add constraint station_connect_recharge_cards_source_check
  check (
    source_code = any (array[
      'aladdin_telegram'::text,
      'hanii_rohek'::text,
      'wafferli'::text,
      'digital_home'::text,
      'file_import'::text,
      'sim_feeding'::text,
      'mytool_cards'::text,
      'our_stock'::text
    ])
    or source_code ~ '^platform:[a-z0-9_]+$'
  );

-- ---------------------------------------------------------------------------
-- 3. Audit table for explicit transfer from commercial stock to SAMA feeding.
-- ---------------------------------------------------------------------------
create table if not exists public.station_connect_recharge_transfers (
  transfer_uuid uuid primary key default gen_random_uuid(),
  commercial_card_uuid uuid not null references public.card_stock_items(card_uuid) on delete restrict,
  recharge_card_uuid uuid not null references public.station_connect_recharge_cards(card_uuid) on delete restrict,
  amount integer not null check (amount in (1000,2000)),
  transfer_kind text not null default 'commercial_to_sama' check (transfer_kind='commercial_to_sama'),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (commercial_card_uuid),
  unique (recharge_card_uuid)
);

alter table public.station_connect_recharge_transfers enable row level security;

revoke all on table public.station_connect_recharge_transfers from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- 4. Never let Station Connect status updates turn a transferred commercial card
--    back into available/reserved/used. Commercial record remains historical.
-- ---------------------------------------------------------------------------
create or replace function private.card_stock_sync_from_station()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  update public.card_stock_items i
  set status=case
      when i.status='transferred' then 'transferred'
      when new.status='ready' then 'available'
      when new.status in ('queued','processing') then 'reserved'
      when new.status='used' then 'used'
      else 'review'
    end,
    result_note=case
      when i.status='transferred' then i.result_note
      when new.status in ('failed','review') then new.result_text
      else i.result_note
    end,
    used_at=case
      when i.status='transferred' then i.used_at
      when new.status='used' then coalesce(new.used_at,i.used_at,now())
      else i.used_at
    end,
    updated_at=now()
  where i.station_recharge_card_uuid=new.card_uuid;

  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Source list for the Flexy feeding page.
-- Reads the central platform directory; no hard-coded platform names in UI.
-- ---------------------------------------------------------------------------
create or replace function public.station_connect_admin_feeding_sources()
returns table(
  source_kind text,
  source_key text,
  display_name text
)
language sql
security definer
set search_path to ''
as $function$
  select 'stock'::text,'our_stock'::text,'مخزوننا'::text
  where private.is_shop_admin()
  union all
  select 'platform'::text,p.platform_key,p.display_name
  from public.money_platform_directory p
  where private.is_shop_admin()
    and p.active=true
  order by 1,3
$function$;

revoke all on function public.station_connect_admin_feeding_sources() from public,anon;
grant execute on function public.station_connect_admin_feeding_sources() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Available commercial Mobilis stock summary.
-- Only clean, available, not-linked, non-legacy cards are eligible.
-- ---------------------------------------------------------------------------
create or replace function public.card_stock_admin_mobilis_available_summary()
returns table(
  amount integer,
  available_count bigint
)
language sql
security definer
set search_path to ''
as $function$
  select
    i.denomination::integer as amount,
    count(*)::bigint as available_count
  from public.card_stock_items i
  join public.card_stock_batches b on b.batch_uuid=i.batch_uuid
  where private.is_shop_admin()
    and i.type_key='mobilis'
    and i.status='available'
    and i.station_recharge_card_uuid is null
    and coalesce(i.origin_exception,false)=false
    and coalesce(b.is_legacy_uncertain,false)=false
    and i.denomination in ('1000','2000')
  group by i.denomination
  order by i.denomination::integer
$function$;

revoke all on function public.card_stock_admin_mobilis_available_summary() from public,anon;
grant execute on function public.card_stock_admin_mobilis_available_summary() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Explicit transfer from commercial stock to SAMA feeding.
-- No code is revealed to the browser.
-- The Vault secret is re-used; commercial item becomes TRANSFERRED and is no longer sellable.
-- ---------------------------------------------------------------------------
create or replace function public.station_connect_admin_transfer_stock_to_feeding(
  p_amount integer,
  p_quantity integer
)
returns table(
  requested_count integer,
  transferred_count integer,
  remaining_available bigint
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_item record;
  v_recharge_uuid uuid;
  v_transferred integer := 0;
  v_available bigint := 0;
begin
  if not private.is_shop_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode='42501';
  end if;

  if p_amount not in (1000,2000) then
    raise exception 'RECHARGE_AMOUNT_NOT_SUPPORTED' using errcode='22023';
  end if;

  if coalesce(p_quantity,0)<1 or p_quantity>500 then
    raise exception 'INVALID_TRANSFER_QUANTITY' using errcode='22023';
  end if;

  select count(*) into v_available
  from public.card_stock_items i
  join public.card_stock_batches b on b.batch_uuid=i.batch_uuid
  where i.type_key='mobilis'
    and i.denomination=p_amount::text
    and i.status='available'
    and i.station_recharge_card_uuid is null
    and coalesce(i.origin_exception,false)=false
    and coalesce(b.is_legacy_uncertain,false)=false;

  if v_available < p_quantity then
    raise exception 'INSUFFICIENT_COMMERCIAL_STOCK:%',v_available using errcode='P0002';
  end if;

  for v_item in
    select
      i.card_uuid,
      i.code_secret_id,
      i.code_fingerprint,
      i.code_last4
    from public.card_stock_items i
    join public.card_stock_batches b on b.batch_uuid=i.batch_uuid
    where i.type_key='mobilis'
      and i.denomination=p_amount::text
      and i.status='available'
      and i.station_recharge_card_uuid is null
      and coalesce(i.origin_exception,false)=false
      and coalesce(b.is_legacy_uncertain,false)=false
    order by i.created_at asc,i.card_uuid
    limit p_quantity
    for update of i skip locked
  loop
    if exists (
      select 1
      from public.station_connect_recharge_cards r
      where r.code_fingerprint=v_item.code_fingerprint
    ) then
      raise exception 'MOBILIS_OPERATIONAL_STOCK_CONFLICT' using errcode='23505';
    end if;

    insert into public.station_connect_recharge_cards(
      operator,source_code,source_label,amount,
      code_secret_id,code_fingerprint,code_last4,
      status,result_text,created_by
    ) values (
      'mobilis','our_stock','مخزوننا',p_amount,
      v_item.code_secret_id,v_item.code_fingerprint,v_item.code_last4,
      'ready','TRANSFERRED_FROM_COMMERCIAL_STOCK',auth.uid()
    )
    returning card_uuid into v_recharge_uuid;

    update public.card_stock_items i
    set status='transferred',
        station_recharge_card_uuid=v_recharge_uuid,
        result_note='TRANSFERRED_TO_SAMA_FEEDING',
        updated_at=now()
    where i.card_uuid=v_item.card_uuid
      and i.status='available';

    if not found then
      raise exception 'COMMERCIAL_CARD_TRANSFER_RACE' using errcode='40001';
    end if;

    insert into public.station_connect_recharge_transfers(
      commercial_card_uuid,recharge_card_uuid,amount,created_by
    ) values (
      v_item.card_uuid,v_recharge_uuid,p_amount,auth.uid()
    );

    v_transferred := v_transferred+1;
  end loop;

  select count(*) into v_available
  from public.card_stock_items i
  join public.card_stock_batches b on b.batch_uuid=i.batch_uuid
  where i.type_key='mobilis'
    and i.denomination=p_amount::text
    and i.status='available'
    and i.station_recharge_card_uuid is null
    and coalesce(i.origin_exception,false)=false
    and coalesce(b.is_legacy_uncertain,false)=false;

  return query select p_quantity,v_transferred,v_available;
end;
$function$;

revoke all on function public.station_connect_admin_transfer_stock_to_feeding(integer,integer) from public,anon;
grant execute on function public.station_connect_admin_transfer_stock_to_feeding(integer,integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Platform import. Platform identity comes from money_platform_directory.
-- Browser sends platform_key, backend resolves the trusted display name.
-- ---------------------------------------------------------------------------
create or replace function public.station_connect_admin_bulk_add_recharge_cards_v2(
  p_codes text[],
  p_amount integer,
  p_source_kind text,
  p_source_key text
)
returns table(
  total_count integer,
  inserted_count integer,
  duplicate_count integer,
  invalid_count integer,
  source_label text
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_raw text;
  v_code text;
  v_source_kind text := trim(coalesce(p_source_kind,''));
  v_source_key text := trim(coalesce(p_source_key,''));
  v_source_code text;
  v_source_label text;
  v_fingerprint text;
  v_secret uuid;
  v_total integer := 0;
  v_inserted integer := 0;
  v_duplicates integer := 0;
  v_invalid integer := 0;
begin
  if not private.is_shop_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode='42501';
  end if;

  if p_amount not in (1000,2000) then
    raise exception 'RECHARGE_AMOUNT_NOT_SUPPORTED' using errcode='22023';
  end if;

  if v_source_kind<>'platform' then
    raise exception 'INVALID_FEEDING_SOURCE_KIND' using errcode='22023';
  end if;

  select p.display_name
    into v_source_label
  from public.money_platform_directory p
  where p.platform_key=v_source_key
    and p.active=true
  limit 1;

  if v_source_label is null then
    raise exception 'FEEDING_PLATFORM_NOT_FOUND' using errcode='P0002';
  end if;

  v_source_code := 'platform:'||v_source_key;

  foreach v_raw in array coalesce(p_codes,array[]::text[])
  loop
    v_total := v_total+1;
    v_code := coalesce(v_raw,'');
    if left(v_code,1)=chr(65279) then
      v_code := substring(v_code from 2);
    end if;

    if v_code=''
       or v_code ~ '[[:space:]]'
       or v_code !~ '^[0-9]{15}$' then
      v_invalid := v_invalid+1;
    end if;
  end loop;

  if v_total=0 then
    raise exception 'MOBILIS_BATCH_EMPTY' using errcode='22023';
  end if;

  if v_invalid>0 then
    raise exception 'MOBILIS_BATCH_FORMAT_INVALID:%',v_invalid using errcode='22023';
  end if;

  foreach v_raw in array p_codes
  loop
    v_code := coalesce(v_raw,'');
    if left(v_code,1)=chr(65279) then
      v_code := substring(v_code from 2);
    end if;

    v_fingerprint := encode(extensions.digest(v_code,'sha256'),'hex');

    if exists (
      select 1 from public.station_connect_recharge_cards r
      where r.code_fingerprint=v_fingerprint
    ) then
      v_duplicates := v_duplicates+1;
      continue;
    end if;

    if exists (
      select 1 from public.card_stock_items i
      where i.type_key='mobilis'
        and i.code_fingerprint=v_fingerprint
    ) then
      raise exception 'MOBILIS_COMMERCIAL_STOCK_CONFLICT' using errcode='23505';
    end if;

    select vault.create_secret(
      v_code,
      'station-connect-recharge-card-'||gen_random_uuid()::text,
      'Flexy SAMA feeding card from platform '||v_source_key
    ) into v_secret;

    insert into public.station_connect_recharge_cards(
      operator,source_code,source_label,amount,
      code_secret_id,code_fingerprint,code_last4,
      status,created_by
    ) values (
      'mobilis',v_source_code,v_source_label,p_amount,
      v_secret,v_fingerprint,right(v_code,4),
      'ready',auth.uid()
    );

    v_inserted := v_inserted+1;
  end loop;

  return query select v_total,v_inserted,v_duplicates,0,v_source_label;
end;
$function$;

revoke all on function public.station_connect_admin_bulk_add_recharge_cards_v2(text[],integer,text,text) from public,anon;
grant execute on function public.station_connect_admin_bulk_add_recharge_cards_v2(text[],integer,text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Make transferred status visible through admin listing APIs.
-- ---------------------------------------------------------------------------
create or replace function public.card_stock_admin_items(
  p_limit integer default 80,
  p_status text default null
)
returns table(
  card_uuid uuid,
  type_key text,
  type_name text,
  denomination text,
  product_label text,
  masked_code text,
  masked_serial text,
  status text,
  source_kind text,
  source_label text,
  source_reference text,
  origin_exception boolean,
  station_linked boolean,
  created_at timestamptz,
  used_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not private.is_shop_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode='42501';
  end if;

  if p_status is not null and p_status not in ('available','reserved','used','review','invalid','transferred') then
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
$function$;

create or replace function public.card_stock_admin_items_v2(
  p_limit integer default 80,
  p_status text default null
)
returns table(
  card_uuid uuid,
  type_key text,
  type_name text,
  denomination text,
  product_label text,
  masked_code text,
  masked_serial text,
  status text,
  source_kind text,
  source_label text,
  source_reference text,
  origin_exception boolean,
  legacy_uncertain boolean,
  risk_accepted_at timestamptz,
  station_linked boolean,
  created_at timestamptz,
  used_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not private.is_shop_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode='42501';
  end if;

  if p_status is not null and p_status not in ('available','reserved','used','review','invalid','transferred') then
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
$function$;

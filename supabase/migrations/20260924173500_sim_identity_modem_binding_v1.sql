-- SIM identity follows ICCID/IMSI, while modem identity follows IMEI/Serial.
-- A moved SIM keeps its own PIN and is rebound to the modem where it is physically detected.

alter table public.station_connect_sims
  drop constraint if exists station_connect_sims_type;

alter table public.station_connect_sims
  add constraint station_connect_sims_type
  check (sim_type in ('unknown','mobilis-sama','mobilis-arsselli'));

create or replace function public.station_connect_sync_hardware(
  p_station_uuid uuid,
  p_station_secret text,
  p_machine_fingerprint text,
  p_modem_ip text,
  p_imei text default null,
  p_serial_number text default null,
  p_device_name text default null,
  p_iccid text default null,
  p_imsi text default null,
  p_msisdn text default null
)
returns table(
  modem_uuid uuid,
  sim_uuid uuid,
  imei text,
  serial_number text,
  iccid text,
  imsi text,
  msisdn text,
  sim_type text,
  has_pin boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_station public.station_connect_stations%rowtype;
  v_modem public.station_connect_modems%rowtype;
  v_sim public.station_connect_sims%rowtype;
  v_occupant public.station_connect_sims%rowtype;
  v_registry private.mytool_sim_registry%rowtype;
  v_imei text := nullif(regexp_replace(coalesce(p_imei,''), '[^0-9]', '', 'g'), '');
  v_serial text := nullif(trim(coalesce(p_serial_number,'')), '');
  v_device text := nullif(trim(coalesce(p_device_name,'')), '');
  v_iccid text := nullif(trim(coalesce(p_iccid,'')), '');
  v_imsi text := nullif(regexp_replace(coalesce(p_imsi,''), '[^0-9]', '', 'g'), '');
  v_msisdn text := nullif(regexp_replace(coalesce(p_msisdn,''), '[^0-9]', '', 'g'), '');
  v_ip text := trim(coalesce(p_modem_ip,''));
  v_identity_key text;
  v_conflict uuid;
begin
  select s.* into v_station
  from public.station_connect_stations s
  where s.station_uuid = p_station_uuid;

  if not found
     or v_station.machine_fingerprint <> p_machine_fingerprint
     or extensions.crypt(p_station_secret, v_station.secret_hash) <> v_station.secret_hash then
    raise exception 'INVALID_STATION_IDENTITY' using errcode = '42501';
  end if;

  if v_station.status <> 'approved' then
    raise exception 'STATION_NOT_APPROVED' using errcode = '42501';
  end if;

  if v_ip !~ '^[0-9]{1,3}([.][0-9]{1,3}){3}$' then
    raise exception 'INVALID_MODEM_IP' using errcode = '22023';
  end if;

  if v_msisdn is not null and v_msisdn !~ '^0[5-7][0-9]{8}$' then
    v_msisdn := null;
  end if;

  if v_imei is not null then
    select m.* into v_modem
    from public.station_connect_modems m
    where m.imei = v_imei
    limit 1;
  end if;

  if v_modem.modem_uuid is null and v_serial is not null then
    select m.* into v_modem
    from public.station_connect_modems m
    where m.serial_number = v_serial
    limit 1;
  end if;

  if v_modem.modem_uuid is null then
    select m.* into v_modem
    from public.station_connect_modems m
    where m.station_uuid = p_station_uuid
      and m.modem_ip = v_ip
      and m.imei is null
    order by m.updated_at desc
    limit 1;
  end if;

  v_identity_key := case
    when v_imei is not null then v_imei
    when v_serial is not null then 'serial:' || v_serial
    else 'station:' || p_station_uuid::text || ':ip:' || v_ip
  end;

  if v_modem.modem_uuid is null then
    insert into public.station_connect_modems(
      station_uuid, identity_key, imei, serial_number, device_name, modem_ip, last_seen_at
    ) values (
      p_station_uuid, v_identity_key, v_imei, v_serial, v_device, v_ip, now()
    )
    returning * into v_modem;
  else
    update public.station_connect_modems m
    set station_uuid = p_station_uuid,
        identity_key = v_identity_key,
        imei = coalesce(v_imei, m.imei),
        serial_number = coalesce(v_serial, m.serial_number),
        device_name = coalesce(v_device, m.device_name),
        modem_ip = v_ip,
        last_seen_at = now(),
        updated_at = now()
    where m.modem_uuid = v_modem.modem_uuid
    returning * into v_modem;
  end if;

  select s.* into v_occupant
  from public.station_connect_sims s
  where s.modem_uuid = v_modem.modem_uuid
  limit 1;

  -- If HiLink did not return any SIM identity, do not invent or replace a SIM.
  if v_iccid is null and v_imsi is null and v_msisdn is null then
    v_sim := v_occupant;
    return query
    select
      v_modem.modem_uuid,
      v_sim.sim_uuid,
      v_modem.imei,
      v_modem.serial_number,
      v_sim.iccid,
      v_sim.imsi,
      v_sim.msisdn,
      v_sim.sim_type,
      coalesce(v_sim.pin_secret_id is not null, false);
    return;
  end if;

  if v_iccid is not null then
    select s.sim_uuid into v_conflict
    from public.station_connect_sims s
    where s.iccid = v_iccid
    limit 1;
  else
    v_conflict := null;
  end if;

  if v_conflict is not null then
    select s.* into v_sim
    from public.station_connect_sims s
    where s.sim_uuid = v_conflict;
  end if;

  if v_imsi is not null then
    v_conflict := null;
    select s.sim_uuid into v_conflict
    from public.station_connect_sims s
    where s.imsi = v_imsi
    limit 1;

    if v_conflict is not null then
      if v_sim.sim_uuid is not null and v_sim.sim_uuid <> v_conflict then
        raise exception 'SIM_IDENTITY_CONFLICT' using errcode = '23505';
      end if;

      select s.* into v_sim
      from public.station_connect_sims s
      where s.sim_uuid = v_conflict;
    end if;
  end if;

  if v_msisdn is not null then
    v_conflict := null;
    select s.sim_uuid into v_conflict
    from public.station_connect_sims s
    where s.msisdn = v_msisdn
    limit 1;

    if v_conflict is not null then
      if v_sim.sim_uuid is not null and v_sim.sim_uuid <> v_conflict then
        raise exception 'SIM_IDENTITY_CONFLICT' using errcode = '23505';
      end if;

      select s.* into v_sim
      from public.station_connect_sims s
      where s.sim_uuid = v_conflict;
    end if;
  end if;

  if v_sim.sim_uuid is null
     and v_occupant.sim_uuid is not null
     and v_occupant.iccid is null
     and v_occupant.imsi is null then
    v_sim := v_occupant;
  end if;

  if v_sim.sim_uuid is null then
    if v_occupant.sim_uuid is not null then
      update public.station_connect_sims s
      set modem_uuid = null,
          updated_at = now()
      where s.sim_uuid = v_occupant.sim_uuid;

      update private.mytool_sim_registry r
      set station_uuid = null,
          modem_uuid = null,
          updated_at = now()
      where r.source_sim_uuid = v_occupant.sim_uuid;
    end if;

    insert into public.station_connect_sims(
      modem_uuid, iccid, imsi, msisdn, msisdn_source, sim_type, last_seen_at
    ) values (
      v_modem.modem_uuid,
      v_iccid,
      v_imsi,
      v_msisdn,
      case when v_msisdn is null then null else 'modem' end,
      'unknown',
      now()
    )
    returning * into v_sim;
  else
    if v_occupant.sim_uuid is not null and v_occupant.sim_uuid <> v_sim.sim_uuid then
      update public.station_connect_sims s
      set modem_uuid = null,
          updated_at = now()
      where s.sim_uuid = v_occupant.sim_uuid;

      update private.mytool_sim_registry r
      set station_uuid = null,
          modem_uuid = null,
          updated_at = now()
      where r.source_sim_uuid = v_occupant.sim_uuid;
    end if;

    if v_sim.modem_uuid is distinct from v_modem.modem_uuid then
      update public.station_connect_sims s
      set modem_uuid = null,
          updated_at = now()
      where s.modem_uuid = v_modem.modem_uuid
        and s.sim_uuid <> v_sim.sim_uuid;
    end if;

    update public.station_connect_sims s
    set modem_uuid = v_modem.modem_uuid,
        iccid = coalesce(v_iccid, s.iccid),
        imsi = coalesce(v_imsi, s.imsi),
        msisdn = case
          when s.msisdn is not null and s.msisdn_source = 'manual' then s.msisdn
          else coalesce(v_msisdn, s.msisdn)
        end,
        msisdn_source = case
          when s.msisdn is not null and s.msisdn_source = 'manual' then 'manual'
          when v_msisdn is not null then 'modem'
          else s.msisdn_source
        end,
        last_seen_at = now(),
        updated_at = now()
    where s.sim_uuid = v_sim.sim_uuid
    returning * into v_sim;
  end if;

  -- The inventory row follows the physical SIM, not the modem.
  select r.* into v_registry
  from private.mytool_sim_registry r
  where r.source_sim_uuid = v_sim.sim_uuid
  limit 1;

  if v_registry.registry_uuid is null and v_sim.msisdn is not null then
    select r.* into v_registry
    from private.mytool_sim_registry r
    where r.msisdn = v_sim.msisdn
      and (r.source_sim_uuid is null or r.source_sim_uuid = v_sim.sim_uuid)
    limit 1;
  end if;

  if v_registry.registry_uuid is not null then
    if v_sim.pin_secret_id is null and v_registry.pin_secret_id is not null then
      update public.station_connect_sims s
      set pin_secret_id = v_registry.pin_secret_id,
          updated_at = now()
      where s.sim_uuid = v_sim.sim_uuid
      returning * into v_sim;
    elsif v_registry.pin_secret_id is null and v_sim.pin_secret_id is not null then
      update private.mytool_sim_registry r
      set pin_secret_id = v_sim.pin_secret_id,
          updated_at = now()
      where r.registry_uuid = v_registry.registry_uuid;
    end if;

    update private.mytool_sim_registry r
    set source_sim_uuid = v_sim.sim_uuid,
        station_uuid = p_station_uuid,
        modem_uuid = v_modem.modem_uuid,
        updated_at = now()
    where r.registry_uuid = v_registry.registry_uuid;
  end if;

  -- Clear stale manual placement rows that still point to this modem.
  update private.mytool_sim_registry r
  set station_uuid = null,
      modem_uuid = null,
      updated_at = now()
  where r.modem_uuid = v_modem.modem_uuid
    and (r.source_sim_uuid is null or r.source_sim_uuid <> v_sim.sim_uuid);

  return query
  select
    v_modem.modem_uuid,
    v_sim.sim_uuid,
    v_modem.imei,
    v_modem.serial_number,
    v_sim.iccid,
    v_sim.imsi,
    v_sim.msisdn,
    v_sim.sim_type,
    v_sim.pin_secret_id is not null;
end;
$function$;

create or replace function public.station_connect_admin_update_sim(
  p_sim_uuid uuid,
  p_msisdn text default null,
  p_sim_type text default null,
  p_service_pin text default null
)
returns table(
  sim_uuid uuid,
  msisdn text,
  msisdn_source text,
  sim_type text,
  has_pin boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_sim public.station_connect_sims%rowtype;
  v_registry private.mytool_sim_registry%rowtype;
  v_msisdn text := nullif(regexp_replace(coalesce(p_msisdn,''), '[^0-9]', '', 'g'), '');
  v_type text := nullif(trim(coalesce(p_sim_type,'')), '');
  v_pin text := nullif(trim(coalesce(p_service_pin,'')), '');
  v_secret uuid;
  v_station uuid;
  v_kind text;
begin
  if not private.is_shop_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  select * into v_sim
  from public.station_connect_sims
  where station_connect_sims.sim_uuid = p_sim_uuid;

  if not found then
    raise exception 'SIM_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_msisdn is not null and v_msisdn !~ '^0[5-7][0-9]{8}$' then
    raise exception 'INVALID_MSISDN' using errcode = '22023';
  end if;

  if v_type is not null and v_type not in ('mobilis-sama','mobilis-arsselli') then
    raise exception 'INVALID_SIM_TYPE' using errcode = '22023';
  end if;

  if v_pin is not null and v_pin !~ '^[0-9]{4,8}$' then
    raise exception 'INVALID_SERVICE_PIN' using errcode = '22023';
  end if;

  if v_pin is not null then
    if v_sim.pin_secret_id is null then
      select vault.create_secret(
        v_pin,
        'station-connect-sim-' || v_sim.sim_uuid::text || '-pin',
        'Station Connect SIM service PIN'
      ) into v_secret;
    else
      perform vault.update_secret(v_sim.pin_secret_id, v_pin);
      v_secret := v_sim.pin_secret_id;
    end if;
  else
    v_secret := v_sim.pin_secret_id;
  end if;

  update public.station_connect_sims s
  set msisdn = coalesce(v_msisdn, s.msisdn),
      msisdn_source = case when v_msisdn is not null then 'manual' else s.msisdn_source end,
      sim_type = coalesce(v_type, s.sim_type),
      pin_secret_id = v_secret,
      updated_at = now()
  where s.sim_uuid = p_sim_uuid
  returning * into v_sim;

  if v_sim.modem_uuid is not null then
    select m.station_uuid into v_station
    from public.station_connect_modems m
    where m.modem_uuid = v_sim.modem_uuid;
  end if;

  select r.* into v_registry
  from private.mytool_sim_registry r
  where r.source_sim_uuid = v_sim.sim_uuid
  limit 1;

  if v_registry.registry_uuid is null and v_sim.msisdn is not null then
    select r.* into v_registry
    from private.mytool_sim_registry r
    where r.msisdn = v_sim.msisdn
      and (r.source_sim_uuid is null or r.source_sim_uuid = v_sim.sim_uuid)
    limit 1;
  end if;

  if v_registry.registry_uuid is not null then
    if v_sim.pin_secret_id is null and v_registry.pin_secret_id is not null then
      update public.station_connect_sims s
      set pin_secret_id = v_registry.pin_secret_id,
          updated_at = now()
      where s.sim_uuid = v_sim.sim_uuid
      returning * into v_sim;
    end if;

    update private.mytool_sim_registry r
    set source_sim_uuid = v_sim.sim_uuid,
        msisdn = coalesce(v_sim.msisdn, r.msisdn),
        station_uuid = v_station,
        modem_uuid = v_sim.modem_uuid,
        pin_secret_id = coalesce(v_sim.pin_secret_id, r.pin_secret_id),
        updated_at = now()
    where r.registry_uuid = v_registry.registry_uuid;
  elsif v_sim.sim_type in ('mobilis-sama','mobilis-arsselli') then
    v_kind := case when v_sim.sim_type = 'mobilis-sama' then 'sama' else 'mobilis' end;

    insert into private.mytool_sim_registry(
      registry_uuid, source_sim_uuid, sim_kind, msisdn, status,
      station_uuid, modem_uuid, pin_secret_id, created_by, created_at, updated_at
    ) values (
      gen_random_uuid(), v_sim.sim_uuid, v_kind, v_sim.msisdn,
      case when v_sim.modem_uuid is null then 'spare' else 'active' end,
      v_station, v_sim.modem_uuid, v_sim.pin_secret_id, auth.uid(), now(), now()
    );
  end if;

  return query
  select v_sim.sim_uuid, v_sim.msisdn, v_sim.msisdn_source, v_sim.sim_type, v_sim.pin_secret_id is not null;
end;
$function$;

create or replace function public.station_connect_admin_sim_operational_balances()
returns table(
  sim_uuid uuid,
  msisdn text,
  sim_type text,
  baseline_amount numeric,
  baseline_checked_at timestamptz,
  confirmed_outflow numeric,
  confirmed_execution_count bigint,
  operational_balance numeric,
  reconciliation_threshold_amount numeric,
  reconciliation_due boolean,
  balance_state text
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not private.is_shop_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode='42501';
  end if;

  return query
  select
    s.sim_uuid,
    s.msisdn,
    s.sim_type,
    b.baseline_amount,
    b.baseline_checked_at,
    b.confirmed_outflow,
    b.confirmed_execution_count,
    b.operational_balance,
    b.reconciliation_threshold_amount,
    b.reconciliation_due,
    case
      when b.baseline_amount is null then 'uninitialized'
      when b.reconciliation_due then 'reconciliation_due'
      else 'ready'
    end
  from public.station_connect_sims s
  cross join lateral private.station_connect_operational_balance(
    s.sim_uuid,
    s.sim_type,
    case when s.sim_type='mobilis-arsselli' then '04' else null end
  ) b
  where s.sim_type in ('mobilis-sama','mobilis-arsselli')
  order by s.sim_type,s.msisdn;
end;
$function$;

create or replace function public.station_connect_admin_sim_inventory()
returns table(
  sim_uuid uuid,
  iccid text,
  imsi text,
  msisdn text,
  sim_type text,
  has_pin boolean,
  sim_last_seen_at timestamptz,
  connected boolean,
  modem_uuid uuid,
  modem_ip text,
  modem_imei text,
  modem_serial_number text,
  modem_name text,
  modem_last_seen_at timestamptz,
  station_uuid uuid,
  station_name text,
  registry_uuid uuid,
  owner_name text,
  registry_status text,
  needs_setup boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not private.is_shop_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode='42501';
  end if;

  return query
  select
    s.sim_uuid,
    s.iccid,
    s.imsi,
    s.msisdn,
    s.sim_type,
    s.pin_secret_id is not null,
    s.last_seen_at,
    s.modem_uuid is not null,
    m.modem_uuid,
    m.modem_ip,
    m.imei,
    m.serial_number,
    m.device_name,
    m.last_seen_at,
    st.station_uuid,
    st.computer_name,
    r.registry_uuid,
    r.owner_name,
    r.status,
    (s.sim_type = 'unknown' or s.msisdn is null or s.pin_secret_id is null)
  from public.station_connect_sims s
  left join public.station_connect_modems m on m.modem_uuid = s.modem_uuid
  left join public.station_connect_stations st on st.station_uuid = m.station_uuid
  left join private.mytool_sim_registry r on r.source_sim_uuid = s.sim_uuid
  order by
    case when s.modem_uuid is not null then 0 else 1 end,
    s.last_seen_at desc,
    s.msisdn nulls last,
    s.iccid nulls last;
end;
$function$;

-- Make existing linked registry rows and execution rows share one PIN secret.
update private.mytool_sim_registry r
set pin_secret_id = s.pin_secret_id,
    station_uuid = m.station_uuid,
    modem_uuid = s.modem_uuid,
    updated_at = now()
from public.station_connect_sims s
left join public.station_connect_modems m on m.modem_uuid = s.modem_uuid
where r.source_sim_uuid = s.sim_uuid
  and s.pin_secret_id is not null;

revoke all on function public.station_connect_sync_hardware(uuid,text,text,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.station_connect_sync_hardware(uuid,text,text,text,text,text,text,text,text,text) to service_role;

revoke all on function public.station_connect_admin_update_sim(uuid,text,text,text) from public,anon;
grant execute on function public.station_connect_admin_update_sim(uuid,text,text,text) to authenticated,service_role;

revoke all on function public.station_connect_admin_sim_operational_balances() from public,anon;
grant execute on function public.station_connect_admin_sim_operational_balances() to authenticated,service_role;

revoke all on function public.station_connect_admin_sim_inventory() from public,anon;
grant execute on function public.station_connect_admin_sim_inventory() to authenticated,service_role;

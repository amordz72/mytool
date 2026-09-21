-- Applied to Supabase on 2026-09-21.
-- Multi-route offer router: verified routes + fresh sufficient balance + priority.
-- PixX supports SAMA and Arsselli. GTS/code 04 is a balance account, not an offer index.
-- mobilis.offer.execute is no longer blocked by recharge-card stock.

create or replace function public.station_connect_claim_command(
  p_station_uuid uuid,
  p_station_secret text,
  p_machine_fingerprint text
)
returns table(
  command_uuid uuid,
  session_uuid uuid,
  job_uuid uuid,
  sequence integer,
  action text,
  command_value text,
  modem_uuid uuid,
  sim_uuid uuid,
  modem_ip text
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_station public.station_connect_stations%rowtype;
  v_command public.station_connect_commands%rowtype;
  v_session public.station_connect_sessions%rowtype;
  v_modem public.station_connect_modems%rowtype;
  v_sim public.station_connect_sims%rowtype;
  v_value text;
  v_secret text;
begin
  select * into v_station from public.station_connect_stations s where s.station_uuid=p_station_uuid;
  if not found
     or v_station.machine_fingerprint <> p_machine_fingerprint
     or extensions.crypt(p_station_secret,v_station.secret_hash) <> v_station.secret_hash then
    raise exception 'INVALID_STATION_IDENTITY' using errcode='42501';
  end if;
  if v_station.status <> 'approved' then
    raise exception 'STATION_NOT_APPROVED' using errcode='42501';
  end if;

  select * into v_command
  from public.station_connect_commands c
  where c.station_uuid=p_station_uuid and c.status='queued'
  order by c.created_at asc
  for update skip locked
  limit 1;
  if not found then return; end if;

  select * into v_session
  from public.station_connect_sessions s
  where s.session_uuid=v_command.session_uuid and s.station_uuid=p_station_uuid;
  if not found or v_session.status not in ('open','closing') then return; end if;

  select * into v_modem
  from public.station_connect_modems m
  where m.modem_uuid=v_session.modem_uuid
    and m.station_uuid=p_station_uuid
    and m.last_seen_at >= now()-interval '90 seconds';
  if not found then return; end if;

  select * into v_sim
  from public.station_connect_sims s
  where s.sim_uuid=v_session.sim_uuid and s.modem_uuid=v_modem.modem_uuid;

  v_value := v_command.value;
  if v_command.secret_key is not null then
    if v_command.secret_key='service_pin' then
      select d.decrypted_secret into v_secret
      from vault.decrypted_secrets d
      where d.id=v_sim.pin_secret_id;
    else
      raise exception 'UNSUPPORTED_SECRET_KEY' using errcode='22023';
    end if;
    if v_secret is null then return; end if;
    if v_value is null or v_value='' then
      v_value := v_secret;
    elsif position('{service_pin}' in v_value) > 0 then
      v_value := replace(v_value,'{service_pin}',v_secret);
    else
      v_value := v_secret;
    end if;
  end if;

  update public.station_connect_commands c
  set status='claimed',claimed_at=now(),updated_at=now()
  where c.command_uuid=v_command.command_uuid;

  update public.station_connect_sessions s
  set last_activity_at=now(),updated_at=now()
  where s.session_uuid=v_session.session_uuid;

  return query
  select v_command.command_uuid,v_command.session_uuid,v_command.job_uuid,
         v_command.sequence,v_command.action,v_value,
         v_modem.modem_uuid,v_sim.sim_uuid,v_modem.modem_ip;
end;
$function$;

insert into public.flexy_offer_execution_routes(
  offer_uuid,sim_type,execution_method,route_template,network_index,
  status,enabled,priority,source_note,verified_at
)
select c.offer_uuid,'mobilis-arsselli','ussd',
       '*696*1*{phone}*{amount}*{service_pin}#',null,
       'verified',true,20,
       'Verified Arsselli offer route. GTS/code 04 is the distributor balance account, not an offer index.',
       now()
from public.flexy_offer_catalog c
where c.operator='mobilis'
  and c.family='PixX'
  and c.active=true
  and not exists (
    select 1 from public.flexy_offer_execution_routes r
    where r.offer_uuid=c.offer_uuid
      and r.sim_type='mobilis-arsselli'
      and r.execution_method='ussd'
      and coalesce(r.route_template,'')='*696*1*{phone}*{amount}*{service_pin}#'
      and coalesce(r.network_index,'')=''
  );

update public.flexy_offer_execution_routes r
set status='verified',enabled=true,priority=20,
    source_note='Verified Arsselli offer route. GTS/code 04 is the distributor balance account, not an offer index.',
    verified_at=now(),updated_at=now()
from public.flexy_offer_catalog c
where r.offer_uuid=c.offer_uuid
  and c.operator='mobilis'
  and c.family='PixX'
  and c.active=true
  and r.sim_type='mobilis-arsselli'
  and r.execution_method='ussd'
  and coalesce(r.route_template,'')='*696*1*{phone}*{amount}*{service_pin}#';

create or replace function private.station_connect_require_recharge_stock_for_flexy()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if (
      (new.operation_type='workflow'
       and new.source_app='mytool'
       and new.operation_key='mobilis.flexy.ordinary')
      or new.operation_type in ('offer_execute','automix_pilot')
  ) then
    if not exists (
      select 1 from public.station_connect_recharge_cards c
      where c.status='ready' and c.amount in (1000,2000)
    ) then
      raise exception 'RECHARGE_STOCK_EMPTY' using errcode='P0002';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.station_connect_admin_create_offer_execute(
  p_phone text,
  p_family text,
  p_network_index text,
  p_amount integer,
  p_station_uuid uuid default null
)
returns table(job_uuid uuid, station_uuid uuid, status text, reused boolean)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_phone text;
  v_offer public.flexy_offer_catalog%rowtype;
  v_route_uuid uuid;
  v_route_sim_type text;
  v_route_template text;
  v_route_network_index text;
  v_route_priority integer;
  v_station uuid;
  v_sim uuid;
  v_modem uuid;
  v_balance numeric;
  v_balance_checked_at timestamptz;
  v_job uuid;
  v_status text;
  v_payload jsonb;
  v_start_code text;
  v_begin record;
  v_secret_key text;
begin
  if not private.is_shop_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;

  v_phone := regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
  if v_phone !~ '^0[5-7][0-9]{8}$' then raise exception 'INVALID_PHONE' using errcode='22023'; end if;
  if nullif(trim(coalesce(p_family,'')),'') is null or coalesce(p_amount,0) <= 0 then
    raise exception 'INVALID_OFFER_SELECTION' using errcode='22023';
  end if;

  select c.* into v_offer
  from public.flexy_offer_catalog c
  where c.operator='mobilis'
    and c.family=trim(p_family)
    and c.amount=p_amount
    and c.active=true
    and c.execution_enabled=true
  order by c.updated_at desc
  limit 1;
  if v_offer.offer_uuid is null then raise exception 'OFFER_NOT_EXECUTABLE' using errcode='P0002'; end if;

  select r.route_uuid,r.sim_type,r.route_template,r.network_index,r.priority,
         st.station_uuid,si.sim_uuid,m.modem_uuid,si.balance_amount,si.balance_checked_at
  into v_route_uuid,v_route_sim_type,v_route_template,v_route_network_index,v_route_priority,
       v_station,v_sim,v_modem,v_balance,v_balance_checked_at
  from public.flexy_offer_execution_routes r
  join public.station_connect_stations st
    on st.status='approved' and st.last_seen_at >= now()-interval '90 seconds'
  join public.station_connect_modems m
    on m.station_uuid=st.station_uuid and m.last_seen_at >= now()-interval '90 seconds'
  join public.station_connect_sims si
    on si.modem_uuid=m.modem_uuid and si.sim_type=r.sim_type and si.pin_secret_id is not null
  where r.offer_uuid=v_offer.offer_uuid
    and r.enabled=true
    and r.status='verified'
    and r.execution_method='ussd'
    and (p_station_uuid is null or st.station_uuid=p_station_uuid)
    and si.balance_status='success'
    and si.balance_checked_at >= now()-interval '10 minutes'
    and si.balance_amount is not null
    and si.balance_amount >= p_amount
  order by r.priority asc,si.balance_amount desc,st.last_seen_at desc
  limit 1;

  if v_route_uuid is null then
    if exists (
      select 1 from public.flexy_offer_execution_routes r
      where r.offer_uuid=v_offer.offer_uuid and r.enabled=true and r.status='verified'
    ) then
      raise exception 'NO_ROUTE_WITH_SUFFICIENT_FRESH_BALANCE' using errcode='P0002';
    end if;
    raise exception 'NO_VERIFIED_EXECUTION_ROUTE' using errcode='P0002';
  end if;

  select j.job_uuid,j.status into v_job,v_status
  from public.station_connect_jobs j
  where j.station_uuid=v_station
    and j.operation_type='workflow'
    and j.source_app='mytool'
    and j.operation_key='mobilis.offer.execute'
    and j.phone=v_phone
    and j.amount=p_amount
    and j.status in ('queued','claimed')
    and j.payload->>'offer_uuid'=v_offer.offer_uuid::text
    and j.payload->>'route_uuid'=v_route_uuid::text
  order by j.created_at desc limit 1;

  if v_job is not null then
    return query select v_job,v_station,v_status,true;
    return;
  end if;

  v_start_code := replace(replace(coalesce(v_route_template,''),'{phone}',v_phone),'{amount}',p_amount::text);
  if nullif(v_start_code,'') is null then raise exception 'EXECUTION_ROUTE_TEMPLATE_MISSING' using errcode='P0002'; end if;
  v_secret_key := case when position('{service_pin}' in v_start_code)>0 then 'service_pin' else null end;

  v_payload := jsonb_build_object(
    'phone',v_phone,'family',v_offer.family,
    'network_index',coalesce(v_route_network_index,trim(coalesce(p_network_index,''))),
    'amount',v_offer.amount,'label',v_offer.display_name,
    'offer_uuid',v_offer.offer_uuid,'route_uuid',v_route_uuid,
    'route_sim_type',v_route_sim_type,'route_priority',v_route_priority,
    'route_template',v_route_template,'balance_snapshot',v_balance,
    'balance_checked_at',v_balance_checked_at
  );

  insert into public.station_connect_jobs(
    station_uuid,operation_type,phone,amount,created_by,modem_uuid,sim_uuid,
    source_app,operation_key,capability,payload,execution_plan,target_sim_type,requires_service_pin
  ) values (
    v_station,'workflow',v_phone,p_amount,auth.uid(),v_modem,v_sim,
    'mytool','mobilis.offer.execute','ussd',v_payload,'{}'::jsonb,v_route_sim_type,true
  )
  returning station_connect_jobs.job_uuid into v_job;

  select * into v_begin
  from public.station_connect_begin_command_session(
    v_job,'ussd_start',v_start_code,v_secret_key,
    jsonb_build_object(
      'orchestrator','mytool.mobilis.offer.execute',
      'phase','await_start_response','pages',0,
      'route_uuid',v_route_uuid,'route_sim_type',v_route_sim_type
    )
  );

  return query select v_job,v_station,'claimed'::text,false;
end;
$function$;

-- Arsselli Flexy test path correction — 2026-09-21
-- User confirmed *630 is not the path to test first.
-- Dedicated admin flow uses Arsselli *696*1 with distributor account 04 / GTS.
-- This file is source-controlled; apply to Supabase before financial testing.

create or replace function public.station_connect_admin_create_arsselli_flexy_696(
  p_phone text,
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
  v_station uuid;
  v_modem uuid;
  v_sim uuid;
  v_job uuid;
  v_status text;
  v_balance numeric;
  v_balance_checked_at timestamptz;
  v_start_code text;
  v_payload jsonb;
  v_begin record;
begin
  if not private.is_shop_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode='42501';
  end if;

  v_phone := regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
  if v_phone !~ '^0[5-7][0-9]{8}$' then
    raise exception 'INVALID_PHONE' using errcode='22023';
  end if;

  if coalesce(p_amount,0) <= 0 or p_amount > 50000 then
    raise exception 'INVALID_AMOUNT' using errcode='22023';
  end if;

  select st.station_uuid,m.modem_uuid,si.sim_uuid,b.balance_amount,b.checked_at
    into v_station,v_modem,v_sim,v_balance,v_balance_checked_at
  from public.station_connect_stations st
  join public.station_connect_modems m
    on m.station_uuid=st.station_uuid
   and m.last_seen_at >= now()-interval '90 seconds'
  join public.station_connect_sims si
    on si.modem_uuid=m.modem_uuid
   and si.sim_type='mobilis-arsselli'
   and si.pin_secret_id is not null
  join public.station_connect_arsselli_account_balances b
    on b.sim_uuid=si.sim_uuid
   and b.distributor_account_code='04'
   and upper(trim(b.account_name))='GTS'
  where st.status='approved'
    and st.last_seen_at >= now()-interval '90 seconds'
    and (p_station_uuid is null or st.station_uuid=p_station_uuid)
    and b.checked_at >= now()-interval '10 minutes'
    and b.balance_amount >= p_amount
  order by b.balance_amount desc,st.last_seen_at desc,m.last_seen_at desc
  limit 1;

  if v_station is null or v_modem is null or v_sim is null then
    raise exception 'NO_READY_ARSSELLI_GTS_ROUTE' using errcode='P0002';
  end if;

  select j.job_uuid,j.status
    into v_job,v_status
  from public.station_connect_jobs j
  where j.station_uuid=v_station
    and j.operation_type='workflow'
    and j.source_app='mytool'
    and j.operation_key='mobilis.flexy.arsselli.696'
    and j.phone=v_phone
    and j.amount=p_amount
    and j.status in ('queued','claimed')
  order by j.created_at desc
  limit 1;

  if v_job is not null then
    return query select v_job,v_station,v_status,true;
    return;
  end if;

  v_start_code := '*696*1*' || v_phone || '*04*' || p_amount::text || '*{service_pin}#';

  v_payload := jsonb_build_object(
    'phone',v_phone,
    'amount',p_amount,
    'label','Mobilis Arsselli Flexy 696',
    'route_sim_type','mobilis-arsselli',
    'route_code','696',
    'distributor_account_code','04',
    'distributor_account_name','GTS',
    'route_template','*696*1*{phone}*{distributor_account}*{amount}*{service_pin}#',
    'balance_snapshot',v_balance,
    'balance_checked_at',v_balance_checked_at,
    'confirmation','network_option_1_when_explicit',
    'final_result_policy','success_or_failure_only_when_confirmed_otherwise_review'
  );

  insert into public.station_connect_jobs(
    station_uuid,operation_type,phone,amount,created_by,
    modem_uuid,sim_uuid,
    source_app,operation_key,capability,payload,execution_plan,
    target_sim_type,requires_service_pin
  ) values (
    v_station,'workflow',v_phone,p_amount,auth.uid(),
    v_modem,v_sim,
    'mytool','mobilis.flexy.arsselli.696','ussd',v_payload,'{}'::jsonb,
    'mobilis-arsselli',true
  )
  returning station_connect_jobs.job_uuid into v_job;

  select * into v_begin
  from public.station_connect_begin_command_session(
    v_job,
    'ussd_start',
    v_start_code,
    'service_pin',
    jsonb_build_object(
      'orchestrator','mytool.mobilis.flexy.arsselli.696',
      'phase','await_confirmation',
      'route_code','696',
      'distributor_account_code','04'
    )
  );

  return query select v_job,v_station,'claimed'::text,false;
end;
$function$;

create or replace function public.station_connect_admin_arsselli_flexy_696_job(
  p_job_uuid uuid
)
returns table(
  job_uuid uuid,
  phone text,
  amount integer,
  status text,
  result_code text,
  result_text text,
  technical_result jsonb,
  created_at timestamptz,
  claimed_at timestamptz,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not private.is_shop_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode='42501';
  end if;

  return query
  select
    j.job_uuid,
    j.phone,
    j.amount,
    j.status,
    j.result_code,
    j.result_text,
    coalesce(j.technical_result,'{}'::jsonb),
    j.created_at,
    j.claimed_at,
    j.completed_at
  from public.station_connect_jobs j
  where j.job_uuid=p_job_uuid
    and j.operation_type='workflow'
    and j.source_app='mytool'
    and j.operation_key='mobilis.flexy.arsselli.696';
end;
$function$;

revoke all on function public.station_connect_admin_create_arsselli_flexy_696(text,integer,uuid) from public,anon;
grant execute on function public.station_connect_admin_create_arsselli_flexy_696(text,integer,uuid) to authenticated,service_role;

revoke all on function public.station_connect_admin_arsselli_flexy_696_job(uuid) from public,anon;
grant execute on function public.station_connect_admin_arsselli_flexy_696_job(uuid) to authenticated,service_role;

-- Prevent cached/old UI from accidentally invoking the deprecated *630 path.
revoke execute on function public.station_connect_admin_create_flexy_ordinary(text,integer,uuid) from authenticated;

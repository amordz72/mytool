-- Flexy 696 timeout policy — 2026-09-22
-- User decision:
-- * A timeout alone is NOT a failure.
-- * If the USSD start and confirmation reply "1" were successfully sent and no command/path error is known,
--   an unresolved result becomes operational success after 90 seconds.
-- * This success is explicitly marked as assumed/auditable, not network-confirmed.
-- * Known technical/path failures remain failed.
-- * Never auto-retry a financial send.

create or replace function private.station_connect_finalize_arsselli_flexy_timeout(
  p_job_uuid uuid,
  p_timeout interval default interval '90 seconds'
)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_job public.station_connect_jobs%rowtype;
  v_start_ok boolean := false;
  v_confirm_ok boolean := false;
  v_release_ok boolean := false;
  v_command_error boolean := false;
  v_explicit_failure boolean := false;
  v_basis jsonb;
begin
  select * into v_job
  from public.station_connect_jobs j
  where j.job_uuid=p_job_uuid
    and j.source_app='mytool'
    and j.operation_key='mobilis.flexy.arsselli.696'
  for update;

  if not found then
    return 'not_found';
  end if;

  if v_job.status in ('success','failed','unavailable') then
    return v_job.status;
  end if;

  if now() < v_job.created_at + greatest(p_timeout, interval '30 seconds') then
    return v_job.status;
  end if;

  select
    exists(
      select 1 from public.station_connect_commands c
      where c.job_uuid=v_job.job_uuid
        and c.action='ussd_start'
        and c.status='success'
    ),
    exists(
      select 1 from public.station_connect_commands c
      where c.job_uuid=v_job.job_uuid
        and c.action='ussd_reply'
        and btrim(coalesce(c.value,''))='1'
        and c.status='success'
    ),
    exists(
      select 1 from public.station_connect_commands c
      where c.job_uuid=v_job.job_uuid
        and c.action='ussd_release'
        and c.status='success'
    ),
    exists(
      select 1 from public.station_connect_commands c
      where c.job_uuid=v_job.job_uuid
        and (
          c.status in ('failed','unavailable','cancelled')
          or nullif(btrim(coalesce(c.error_code,'')),'') is not null
        )
    )
  into v_start_ok,v_confirm_ok,v_release_ok,v_command_error;

  v_explicit_failure :=
       coalesce(v_job.result_code,'') like 'MOBILIS_FLEXY_FAILED%'
    or coalesce(v_job.result_code,'') like 'MOBILIS_FLEXY_NOT_SENT%'
    or lower(coalesce(v_job.result_text,'')) like '%insuffisant%'
    or lower(coalesce(v_job.result_text,'')) like '%insufficient%'
    or coalesce(v_job.result_text,'') like '%غير كاف%';

  v_basis := jsonb_build_object(
    'timeout_policy_version',1,
    'timeout_seconds',extract(epoch from greatest(p_timeout, interval '30 seconds'))::integer,
    'ussd_start_success',v_start_ok,
    'confirmation_1_success',v_confirm_ok,
    'ussd_release_success',v_release_ok,
    'command_error',v_command_error,
    'explicit_failure',v_explicit_failure,
    'resolved_at',now()
  );

  if v_explicit_failure or v_command_error or not v_start_ok or not v_confirm_ok then
    update public.station_connect_jobs
    set status='failed',
        result_code=case
          when v_explicit_failure and coalesce(result_code,'')<>'' then result_code
          else 'MOBILIS_FLEXY_FAILED_TECHNICAL_TIMEOUT'
        end,
        result_text=left(
          coalesce(result_text,'')
          || case when coalesce(result_text,'')='' then '' else E'\n' end
          || '[Timeout policy] فشل تقني مؤكد أو لم يثبت إرسال التأكيد 1 إلى الشبكة.',
          4000
        ),
        technical_result=coalesce(technical_result,'{}'::jsonb)
          || v_basis
          || jsonb_build_object(
               'timeout_resolution','failed_known_path_problem',
               'assumed_success',false
             ),
        completed_at=coalesce(completed_at,now()),
        updated_at=now()
    where job_uuid=v_job.job_uuid;

    return 'failed';
  end if;

  update public.station_connect_jobs
  set status='success',
      result_code='MOBILIS_FLEXY_SUCCESS_ASSUMED_HEALTHY_TIMEOUT',
      result_text=left(
        coalesce(result_text,'')
        || case when coalesce(result_text,'')='' then '' else E'\n' end
        || '[Timeout policy] تم إرسال الطلب والتأكيد 1 بنجاح ولم يظهر فشل تقني؛ اعتُبرت العملية ناجحة تشغيليًا بعد انتهاء مهلة الرد.',
        4000
      ),
      technical_result=coalesce(technical_result,'{}'::jsonb)
        || v_basis
        || jsonb_build_object(
             'timeout_resolution','success_assumed_after_healthy_send',
             'assumed_success',true,
             'customer_claim_requires_manual_review',true,
             'automatic_retry',false
           ),
      completed_at=coalesce(completed_at,now()),
      updated_at=now()
  where job_uuid=v_job.job_uuid;

  return 'success';
end;
$function$;

create or replace function public.station_connect_admin_finalize_arsselli_flexy_696_timeout(
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

  perform private.station_connect_finalize_arsselli_flexy_timeout(
    p_job_uuid,
    interval '90 seconds'
  );

  return query
  select
    j.job_uuid,j.phone,j.amount,j.status,j.result_code,j.result_text,
    coalesce(j.technical_result,'{}'::jsonb),
    j.created_at,j.claimed_at,j.completed_at
  from public.station_connect_jobs j
  where j.job_uuid=p_job_uuid
    and j.source_app='mytool'
    and j.operation_key='mobilis.flexy.arsselli.696';
end;
$function$;

revoke all on function public.station_connect_admin_finalize_arsselli_flexy_696_timeout(uuid) from public,anon;
grant execute on function public.station_connect_admin_finalize_arsselli_flexy_696_timeout(uuid) to authenticated,service_role;

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

  perform private.station_connect_finalize_arsselli_flexy_timeout(
    p_job_uuid,
    interval '90 seconds'
  );

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

revoke all on function public.station_connect_admin_arsselli_flexy_696_job(uuid) from public,anon;
grant execute on function public.station_connect_admin_arsselli_flexy_696_job(uuid) to authenticated,service_role;

create or replace function public.station_connect_admin_recent_jobs(p_limit integer default 20)
returns table(
  job_uuid uuid,
  station_uuid uuid,
  phone text,
  amount integer,
  status text,
  family text,
  result_code text,
  result_text text,
  available_offers jsonb,
  created_at timestamptz,
  claimed_at timestamptz,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_job_uuid uuid;
begin
  if not private.is_shop_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode='42501';
  end if;

  for v_job_uuid in
    select j.job_uuid
    from public.station_connect_jobs j
    where j.source_app='mytool'
      and j.operation_key='mobilis.flexy.arsselli.696'
      and j.status in ('queued','claimed','review')
      and j.created_at <= now()-interval '90 seconds'
    order by j.created_at
    limit 20
  loop
    perform private.station_connect_finalize_arsselli_flexy_timeout(
      v_job_uuid,
      interval '90 seconds'
    );
  end loop;

  return query
  select
    j.job_uuid,
    j.station_uuid,
    j.phone,
    j.amount,
    j.status,
    case
      when j.operation_key='mobilis.flexy.arsselli.696' then 'رصيد'
      else coalesce(j.family,j.payload->>'family')
    end,
    j.result_code,
    j.result_text,
    j.available_offers,
    j.created_at,
    j.claimed_at,
    j.completed_at
  from public.station_connect_jobs j
  where j.operation_type='automix_pilot'
     or (
       j.operation_type='workflow'
       and j.source_app='mytool'
       and j.operation_key in ('mobilis.offer.execute','mobilis.flexy.arsselli.696')
     )
  order by j.created_at desc
  limit greatest(1,least(coalesce(p_limit,20),100));
end;
$function$;

revoke all on function public.station_connect_admin_recent_jobs(integer) from public,anon;
grant execute on function public.station_connect_admin_recent_jobs(integer) to authenticated,service_role;

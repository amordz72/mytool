-- When operational SAMA feeding stock is added, queue one balance lookup if possible.
-- This preserves the existing auto-recharge flow without sending a recharge command immediately.

create or replace function private.station_connect_on_feeding_card_added()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_station_uuid uuid;
  v_modem_uuid uuid;
  v_sim_uuid uuid;
  v_msisdn text;
begin
  if new.status<>'ready' or new.amount not in (1000,2000) then
    return new;
  end if;

  select st.station_uuid,m.modem_uuid,s.sim_uuid,s.msisdn
    into v_station_uuid,v_modem_uuid,v_sim_uuid,v_msisdn
  from public.station_connect_sims s
  join public.station_connect_modems m on m.modem_uuid=s.modem_uuid
  join public.station_connect_stations st on st.station_uuid=m.station_uuid
  where s.sim_type='mobilis-sama'
    and st.status='approved'
    and st.last_seen_at>=now()-interval '90 seconds'
    and m.last_seen_at>=now()-interval '90 seconds'
  order by s.last_seen_at desc
  limit 1;

  if v_station_uuid is null then
    return new;
  end if;

  if exists (
    select 1
    from public.station_connect_jobs j
    where j.sim_uuid=v_sim_uuid
      and j.operation_type='balance_lookup'
      and j.status in ('queued','claimed')
  ) then
    return new;
  end if;

  insert into public.station_connect_jobs(
    station_uuid,operation_type,phone,amount,created_by,
    modem_uuid,sim_uuid,source_app,operation_key,capability,
    payload,execution_plan,target_sim_type,requires_service_pin,
    idempotency_key
  ) values (
    v_station_uuid,'balance_lookup',v_msisdn,null,new.created_by,
    v_modem_uuid,v_sim_uuid,'system','mobilis.balance.stock_added','ussd',
    jsonb_build_object(
      'source',new.source_code,
      'source_label',new.source_label,
      'card_uuid',new.card_uuid,
      'card_amount',new.amount
    ),
    '{}'::jsonb,'mobilis-sama',false,
    'stock-added-balance:'||new.card_uuid::text
  )
  on conflict (source_app,idempotency_key)
  where idempotency_key is not null
  do nothing;

  return new;
end;
$function$;

drop trigger if exists trg_station_connect_feeding_card_added
  on public.station_connect_recharge_cards;

create trigger trg_station_connect_feeding_card_added
after insert on public.station_connect_recharge_cards
for each row
execute function private.station_connect_on_feeding_card_added();

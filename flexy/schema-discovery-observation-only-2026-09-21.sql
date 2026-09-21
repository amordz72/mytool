-- Applied 2026-09-21
-- Discovery is observation-only. It must never auto-create/update catalog knowledge.
-- Revolution 100/500 are explicit manual knowledge; known to be supported by Mobilis Arsselli,
-- but automated command mapping is intentionally NOT enabled yet.

create or replace function public.station_connect_record_offer_discovery()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_discovery_uuid uuid;
  v_offer record;
  v_family text;
  v_network_index text;
  v_amount integer;
  v_label text;
  v_route text := '*665*1*{phone}#';
begin
  if new.operation_type <> 'offer_discovery'
     or new.status not in ('success','failed','unavailable','review') then
    return new;
  end if;

  insert into public.station_connect_offer_discoveries(
    job_uuid,station_uuid,modem_uuid,sim_uuid,phone,route_template,status,
    family,result_code,result_text,available_offers,technical_result,
    started_at,completed_at,recorded_at,updated_at
  ) values (
    new.job_uuid,new.station_uuid,new.modem_uuid,new.sim_uuid,new.phone,v_route,new.status,
    new.family,new.result_code,left(coalesce(new.result_text,''),4000),
    coalesce(new.available_offers,'[]'::jsonb),coalesce(new.technical_result,'{}'::jsonb),
    new.claimed_at,new.completed_at,now(),now()
  )
  on conflict (job_uuid) do update set
    modem_uuid=excluded.modem_uuid,
    sim_uuid=excluded.sim_uuid,
    phone=excluded.phone,
    status=excluded.status,
    family=excluded.family,
    result_code=excluded.result_code,
    result_text=excluded.result_text,
    available_offers=excluded.available_offers,
    technical_result=excluded.technical_result,
    started_at=excluded.started_at,
    completed_at=excluded.completed_at,
    updated_at=now()
  returning discovery_uuid into v_discovery_uuid;

  delete from public.station_connect_offer_observations
  where job_uuid=new.job_uuid;

  for v_offer in
    select value as offer, ordinality::integer as offer_order
    from jsonb_array_elements(coalesce(new.available_offers,'[]'::jsonb))
         with ordinality
  loop
    v_family := nullif(trim(coalesce(v_offer.offer->>'family','')),'');
    v_network_index := nullif(trim(coalesce(v_offer.offer->>'index','')),'');
    v_label := nullif(trim(coalesce(v_offer.offer->>'label','')),'');
    v_amount := null;

    if coalesce(v_offer.offer->>'amount','') ~ '^[0-9]+$' then
      v_amount := (v_offer.offer->>'amount')::integer;
    end if;

    insert into public.station_connect_offer_observations(
      discovery_uuid,job_uuid,station_uuid,modem_uuid,sim_uuid,phone,
      route_template,offer_order,family,network_index,amount,raw_label,
      offer_json,observed_at
    ) values (
      v_discovery_uuid,new.job_uuid,new.station_uuid,new.modem_uuid,new.sim_uuid,new.phone,
      v_route,v_offer.offer_order,v_family,v_network_index,v_amount,v_label,
      v_offer.offer,coalesce(new.completed_at,now())
    );
  end loop;

  return new;
end;
$function$;

insert into public.flexy_offer_catalog(
  operator,group_code,family,amount,display_name,network_index,details,
  sort_index,active,execution_enabled,admin_visibility,worker_visibility,customer_visibility
)
values
('mobilis','REVOLUTION','Revolution',100,'Revolution 100',null,
 'عرض معروف يدويًا؛ ليس مطلوبًا أن يظهر في استكشاف SAMA.',2,true,false,'show','policy','policy'),
('mobilis','REVOLUTION','Revolution',500,'Revolution 500',null,
 'عرض معروف يدويًا؛ ليس مطلوبًا أن يظهر في استكشاف SAMA.',3,true,false,'show','policy','policy')
on conflict(operator,family,amount) do update set
  group_code=excluded.group_code,
  display_name=excluded.display_name,
  details=excluded.details,
  active=true,
  updated_at=now();

insert into public.flexy_offer_sources(
  offer_uuid,source_kind,source_name,observed_via_sim_type,source_note,verified_at,active
)
select c.offer_uuid,'manual','معرفة تجارية مؤكدة',null,
       'Revolution 100/500 معروفان مسبقًا في الكتالوج ولا يعتمدان على استكشاف SAMA.',
       now(),true
from public.flexy_offer_catalog c
where c.operator='mobilis' and c.family='Revolution' and c.amount in (100,500)
  and not exists (
    select 1 from public.flexy_offer_sources s
    where s.offer_uuid=c.offer_uuid
      and s.source_kind='manual'
      and s.source_name='معرفة تجارية مؤكدة'
  );

insert into public.flexy_offer_execution_routes(
  offer_uuid,sim_type,execution_method,route_template,network_index,
  status,enabled,priority,source_note,verified_at
)
select c.offer_uuid,'mobilis-arsselli','other',null,null,
       'draft',false,10,
       'Known support: Revolution 100/500 are fulfilled through Mobilis Arsselli. Automated command mapping is not configured yet.',
       now()
from public.flexy_offer_catalog c
where c.operator='mobilis' and c.family='Revolution' and c.amount in (100,500)
on conflict (
  offer_uuid,sim_type,execution_method,coalesce(route_template,''),coalesce(network_index,'')
) do update set
  status='draft',
  enabled=false,
  source_note=excluded.source_note,
  updated_at=now();

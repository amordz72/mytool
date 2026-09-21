-- Flexy offer knowledge sources separated from execution routes.
-- Applied to Supabase project wqyebqzbbpohbnznqdjj on 2026-09-21.
-- Important: observing an offer through a SIM does NOT mean that SIM can execute it.

create table if not exists public.flexy_offer_sources (
  source_uuid uuid primary key default gen_random_uuid(),
  offer_uuid uuid not null references public.flexy_offer_catalog(offer_uuid) on delete cascade,
  source_kind text not null check (source_kind in ('live_discovery','image','manual','external','import')),
  source_name text,
  observed_via_sim_type text,
  source_reference_uuid uuid references public.flexy_offer_reference(reference_uuid) on delete set null,
  source_note text,
  verified_at timestamptz not null default now(),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists flexy_offer_sources_offer_idx
  on public.flexy_offer_sources(offer_uuid,active,verified_at desc);
create index if not exists flexy_offer_sources_sim_idx
  on public.flexy_offer_sources(observed_via_sim_type,active);
create unique index if not exists flexy_offer_sources_reference_unique_idx
  on public.flexy_offer_sources(offer_uuid,source_reference_uuid)
  where source_reference_uuid is not null;

create table if not exists public.flexy_offer_execution_routes (
  route_uuid uuid primary key default gen_random_uuid(),
  offer_uuid uuid not null references public.flexy_offer_catalog(offer_uuid) on delete cascade,
  sim_type text not null,
  execution_method text not null check (execution_method in ('ussd','api','manual','card','other')),
  route_template text,
  network_index text,
  status text not null default 'draft' check (status in ('draft','verified','disabled')),
  enabled boolean not null default false,
  priority integer not null default 100,
  source_note text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists flexy_offer_execution_routes_offer_idx
  on public.flexy_offer_execution_routes(offer_uuid,status,enabled,priority);
create index if not exists flexy_offer_execution_routes_sim_idx
  on public.flexy_offer_execution_routes(sim_type,status,enabled);
create unique index if not exists flexy_offer_execution_routes_identity_idx
  on public.flexy_offer_execution_routes(
    offer_uuid,sim_type,execution_method,coalesce(route_template,''),coalesce(network_index,'')
  );

alter table public.flexy_offer_sources enable row level security;
alter table public.flexy_offer_execution_routes enable row level security;
revoke all on public.flexy_offer_sources from public,anon,authenticated;
revoke all on public.flexy_offer_execution_routes from public,anon,authenticated;

insert into public.flexy_offer_sources(
  offer_uuid,source_kind,source_name,observed_via_sim_type,
  source_reference_uuid,source_note,verified_at,active
)
select
  c.offer_uuid,
  case r.source_type when 'live_agent' then 'live_discovery'
                     when 'live_image' then 'image'
                     else 'manual' end,
  case r.source_type when 'live_agent' then 'Station Connect'
                     when 'live_image' then 'مرجع صورة'
                     else 'مرجع يدوي' end,
  r.sim_type,r.reference_uuid,r.source_note,r.verified_at,r.active
from public.flexy_offer_catalog c
join public.flexy_offer_reference r on r.reference_uuid=c.source_reference_uuid
where not exists (
  select 1 from public.flexy_offer_sources s
  where s.offer_uuid=c.offer_uuid and s.source_reference_uuid=r.reference_uuid
);

insert into public.flexy_offer_sources(
  offer_uuid,source_kind,source_name,source_note,verified_at,active
)
select c.offer_uuid,'manual','كتالوج MyTool',
       'عرض محفوظ في الكتالوج قبل فصل مصدر معرفة العرض عن طريقة التنفيذ.',
       c.updated_at,c.active
from public.flexy_offer_catalog c
where not exists (
  select 1 from public.flexy_offer_sources s where s.offer_uuid=c.offer_uuid
);

create or replace function public.flexy_get_visible_offer_catalog_v2(p_role text default 'worker')
returns table(
  offer_uuid uuid,operator text,group_code text,family text,amount integer,
  display_name text,network_index text,details text,sort_index integer,
  execution_enabled boolean,execution_available boolean,
  execution_sim_types text[],source_kinds text[],source_count integer
)
language plpgsql security definer set search_path=''
as $function$
declare v_role text := lower(btrim(coalesce(p_role,'worker')));
begin
  if v_role not in ('admin','worker','customer') then
    raise exception 'INVALID_FLEXY_ROLE' using errcode='22023';
  end if;
  if v_role='admin' and not private.is_shop_admin() then
    raise exception 'PERMISSION_DENIED' using errcode='42501';
  end if;

  return query
  select
    c.offer_uuid,c.operator,c.group_code,c.family,c.amount,c.display_name,
    c.network_index,c.details,c.sort_index,c.execution_enabled,
    (c.execution_enabled and exists(
      select 1 from public.flexy_offer_execution_routes er
      where er.offer_uuid=c.offer_uuid and er.enabled=true and er.status='verified'
    )),
    coalesce((
      select array_agg(distinct er.sim_type order by er.sim_type)
      from public.flexy_offer_execution_routes er
      where er.offer_uuid=c.offer_uuid and er.enabled=true and er.status='verified'
    ),'{}'::text[]),
    coalesce((
      select array_agg(distinct s.source_kind order by s.source_kind)
      from public.flexy_offer_sources s
      where s.offer_uuid=c.offer_uuid and s.active=true
    ),'{}'::text[]),
    (select count(*)::integer from public.flexy_offer_sources s
     where s.offer_uuid=c.offer_uuid and s.active=true)
  from public.flexy_offer_catalog c
  join public.flexy_offer_role_policies p on p.role=v_role
  where c.active=true
    and case
      when (case when v_role='admin' then c.admin_visibility
                 when v_role='worker' then c.worker_visibility
                 else c.customer_visibility end)='show' then true
      when (case when v_role='admin' then c.admin_visibility
                 when v_role='worker' then c.worker_visibility
                 else c.customer_visibility end)='hide' then false
      else p.default_visible and (p.min_amount is null or c.amount >= p.min_amount)
    end
  order by c.group_code,c.family,c.sort_index,c.amount;
end;
$function$;

create or replace function public.admin_flexy_offer_source_matrix(
  p_operator text default null,
  p_family text default null,
  p_observed_via_sim_type text default null
)
returns table(
  offer_uuid uuid,operator text,group_code text,family text,amount integer,
  display_name text,network_index text,source_uuid uuid,source_kind text,
  source_name text,observed_via_sim_type text,source_note text,verified_at timestamptz,
  execution_available boolean,execution_sim_types text[]
)
language plpgsql security definer set search_path=''
as $function$
begin
  if not private.is_shop_admin() then
    raise exception 'PERMISSION_DENIED' using errcode='42501';
  end if;

  return query
  select
    c.offer_uuid,c.operator,c.group_code,c.family,c.amount,c.display_name,c.network_index,
    s.source_uuid,s.source_kind,s.source_name,s.observed_via_sim_type,s.source_note,s.verified_at,
    (c.execution_enabled and exists(
      select 1 from public.flexy_offer_execution_routes er
      where er.offer_uuid=c.offer_uuid and er.enabled=true and er.status='verified'
    )),
    coalesce((
      select array_agg(distinct er.sim_type order by er.sim_type)
      from public.flexy_offer_execution_routes er
      where er.offer_uuid=c.offer_uuid and er.enabled=true and er.status='verified'
    ),'{}'::text[])
  from public.flexy_offer_catalog c
  left join public.flexy_offer_sources s on s.offer_uuid=c.offer_uuid and s.active=true
  where (p_operator is null or c.operator=p_operator)
    and (p_family is null or c.family=p_family)
    and (p_observed_via_sim_type is null or s.observed_via_sim_type=p_observed_via_sim_type)
  order by c.group_code,c.family,c.sort_index,c.amount,s.verified_at desc nulls last;
end;
$function$;

create or replace function public.admin_flexy_offer_execution_routes(p_offer_uuid uuid default null)
returns table(
  route_uuid uuid,offer_uuid uuid,family text,amount integer,display_name text,
  sim_type text,execution_method text,route_template text,network_index text,
  status text,enabled boolean,priority integer,source_note text,
  verified_at timestamptz,updated_at timestamptz
)
language plpgsql security definer set search_path=''
as $function$
begin
  if not private.is_shop_admin() then
    raise exception 'PERMISSION_DENIED' using errcode='42501';
  end if;
  return query
  select er.route_uuid,er.offer_uuid,c.family,c.amount,c.display_name,
         er.sim_type,er.execution_method,er.route_template,er.network_index,
         er.status,er.enabled,er.priority,er.source_note,er.verified_at,er.updated_at
  from public.flexy_offer_execution_routes er
  join public.flexy_offer_catalog c on c.offer_uuid=er.offer_uuid
  where p_offer_uuid is null or er.offer_uuid=p_offer_uuid
  order by c.group_code,c.family,c.sort_index,er.priority,er.sim_type;
end;
$function$;

revoke all on function public.flexy_get_visible_offer_catalog_v2(text) from public;
grant execute on function public.flexy_get_visible_offer_catalog_v2(text) to anon,authenticated;
revoke all on function public.admin_flexy_offer_source_matrix(text,text,text) from public;
grant execute on function public.admin_flexy_offer_source_matrix(text,text,text) to authenticated;
revoke all on function public.admin_flexy_offer_execution_routes(uuid) from public;
grant execute on function public.admin_flexy_offer_execution_routes(uuid) to authenticated;

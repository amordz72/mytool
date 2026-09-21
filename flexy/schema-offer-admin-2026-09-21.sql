-- Flexy offer catalog + role visibility controls
-- Applied to Supabase project wqyebqzbbpohbnznqdjj on 2026-09-21.
-- Purpose: move offer visibility out of hard-coded UI conditions and keep admin/worker/customer rules independent.

create table if not exists public.flexy_offer_catalog (
  offer_uuid uuid primary key default gen_random_uuid(),
  operator text not null default 'mobilis',
  group_code text not null,
  family text not null,
  amount integer not null check (amount > 0),
  display_name text not null,
  network_index text,
  details text,
  sort_index integer not null default 0,
  active boolean not null default true,
  execution_enabled boolean not null default true,
  admin_visibility text not null default 'show'
    check (admin_visibility in ('policy','show','hide')),
  worker_visibility text not null default 'policy'
    check (worker_visibility in ('policy','show','hide')),
  customer_visibility text not null default 'policy'
    check (customer_visibility in ('policy','show','hide')),
  source_reference_uuid uuid references public.flexy_offer_reference(reference_uuid) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(operator,family,amount)
);

create table if not exists public.flexy_offer_role_policies (
  role text primary key check (role in ('admin','worker','customer')),
  default_visible boolean not null default true,
  min_amount integer check (min_amount is null or min_amount >= 0),
  updated_by_admin_user_id uuid,
  updated_at timestamptz not null default now()
);

insert into public.flexy_offer_role_policies(role,default_visible,min_amount)
values ('admin',true,null),('worker',true,500),('customer',false,null)
on conflict (role) do nothing;

insert into public.flexy_offer_catalog
(operator,group_code,family,amount,display_name,network_index,details,sort_index,active,execution_enabled)
values
('mobilis','SAMA','Sama Mix',100,'Sama Mix 100','1','500Mo — يوم واحد',1,true,true),
('mobilis','SAMA','Sama Mix',500,'Sama Mix 500','2','5Go — 15 يومًا',2,true,true),
('mobilis','SAMA','Sama Mix',1000,'Sama Mix 1000','3','15Go — 30 يومًا',3,true,true),
('mobilis','SAMA','Sama Mix',1500,'Sama Mix 1500','4','30Go — 30 يومًا',4,true,true),
('mobilis','SAMA','Sama Mix',2000,'Sama Mix 2000','5','50Go — 30 يومًا',5,true,true),
('mobilis','SAMA','Sama Talk',500,'Sama Talk 500','6','500Mo — 15 يومًا',1,true,true),
('mobilis','SAMA','Sama Talk',1000,'Sama Talk 1000','7','2Go — 30 يومًا',2,true,true),
('mobilis','SAMA','Sama Talk',1500,'Sama Talk 1500','8','3Go — 30 يومًا',3,true,true),
('mobilis','SAMA','Sama Talk',2000,'Sama Talk 2000','9','4Go — 30 يومًا',4,true,true),
('mobilis','SAMA','Sama Net',500,'Sama Net 500','1','10Go — 15 يومًا',1,true,true),
('mobilis','SAMA','Sama Net',1000,'Sama Net 1000','2','30Go — 30 يومًا',2,true,true),
('mobilis','SAMA','Sama Net',1500,'Sama Net 1500','3','60Go — 30 يومًا',3,true,true),
('mobilis','SAMA','Sama Net',2000,'Sama Net 2000','4','90Go — 30 يومًا',4,true,true),
('mobilis','PIXX','PixX',50,'PixX 50','1','500Mo — يوم واحد',1,true,true),
('mobilis','PIXX','PixX',100,'PixX 100 (1Go)','2','1Go — يوم واحد',2,true,true),
('mobilis','PIXX','PixX',500,'PixX 500 (5Go)','3','5Go — 15 يومًا',3,true,true),
('mobilis','PIXX','PixX',1000,'PixX 1000 (13Go)','4','13Go — 30 يومًا',4,true,true),
('mobilis','PIXX','PixX',2000,'PixX 2000 (30Go)','5','30Go',5,true,true),
('mobilis','REVOLUTION','Revolution',50,'Revolution 50',null,'كتالوج خارجي — التنفيذ غير مؤكد',1,true,false),
('mobilis','REVOLUTION','Revolution',100,'Revolution 100',null,'كتالوج خارجي — التنفيذ غير مؤكد',2,true,false),
('mobilis','REVOLUTION','Revolution',1000,'Revolution 1000','6','',3,true,true),
('mobilis','REVOLUTION','Revolution',1200,'Revolution 1200','5','',4,true,true),
('mobilis','REVOLUTION','Revolution',1500,'Revolution 1500','4','',5,true,true),
('mobilis','REVOLUTION','Revolution',1800,'Revolution 1800','3','',6,true,true),
('mobilis','REVOLUTION','Revolution',2000,'Revolution 2000','2','',7,true,true),
('mobilis','REVOLUTION','Revolution',2500,'Revolution 2500','1','',8,true,true)
on conflict (operator,family,amount) do update
set group_code=excluded.group_code,display_name=excluded.display_name,
    network_index=excluded.network_index,details=excluded.details,
    sort_index=excluded.sort_index,updated_at=now();

update public.flexy_offer_catalog c
set source_reference_uuid=r.reference_uuid,updated_at=now()
from public.flexy_offer_reference r
where r.operator=c.operator and r.family=c.family and r.amount=c.amount
  and c.source_reference_uuid is distinct from r.reference_uuid;

alter table public.flexy_offer_catalog enable row level security;
alter table public.flexy_offer_role_policies enable row level security;
revoke all on public.flexy_offer_catalog from anon,authenticated;
revoke all on public.flexy_offer_role_policies from anon,authenticated;

create or replace function public.flexy_get_visible_offer_catalog(p_role text default 'worker')
returns table(
  offer_uuid uuid,operator text,group_code text,family text,amount integer,
  display_name text,network_index text,details text,sort_index integer,execution_enabled boolean
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
  select c.offer_uuid,c.operator,c.group_code,c.family,c.amount,c.display_name,
         c.network_index,c.details,c.sort_index,c.execution_enabled
  from public.flexy_offer_catalog c
  join public.flexy_offer_role_policies p on p.role=v_role
  where c.active=true
    and case
      when (case when v_role='admin' then c.admin_visibility when v_role='worker' then c.worker_visibility else c.customer_visibility end)='show' then true
      when (case when v_role='admin' then c.admin_visibility when v_role='worker' then c.worker_visibility else c.customer_visibility end)='hide' then false
      else p.default_visible and (p.min_amount is null or c.amount >= p.min_amount)
    end
  order by c.group_code,c.family,c.sort_index,c.amount;
end;
$function$;

create or replace function public.admin_flexy_list_offer_catalog()
returns table(
  offer_uuid uuid,operator text,group_code text,family text,amount integer,
  display_name text,network_index text,details text,sort_index integer,active boolean,
  execution_enabled boolean,admin_visibility text,worker_visibility text,customer_visibility text,
  source_reference_uuid uuid,updated_at timestamptz
)
language plpgsql security definer set search_path=''
as $function$
begin
  if not private.is_shop_admin() then raise exception 'PERMISSION_DENIED' using errcode='42501'; end if;
  return query
  select c.offer_uuid,c.operator,c.group_code,c.family,c.amount,c.display_name,c.network_index,
         c.details,c.sort_index,c.active,c.execution_enabled,c.admin_visibility,
         c.worker_visibility,c.customer_visibility,c.source_reference_uuid,c.updated_at
  from public.flexy_offer_catalog c
  order by c.group_code,c.family,c.sort_index,c.amount;
end;
$function$;

create or replace function public.admin_flexy_list_offer_policies()
returns table(role text,default_visible boolean,min_amount integer,updated_at timestamptz)
language plpgsql security definer set search_path=''
as $function$
begin
  if not private.is_shop_admin() then raise exception 'PERMISSION_DENIED' using errcode='42501'; end if;
  return query
  select p.role,p.default_visible,p.min_amount,p.updated_at
  from public.flexy_offer_role_policies p
  order by case p.role when 'admin' then 1 when 'worker' then 2 else 3 end;
end;
$function$;

create or replace function public.admin_flexy_update_offer_presentation(
  p_offer_uuid uuid,p_admin_visibility text,p_worker_visibility text,p_customer_visibility text,
  p_active boolean,p_execution_enabled boolean
)
returns void language plpgsql security definer set search_path=''
as $function$
begin
  if not private.is_shop_admin() then raise exception 'PERMISSION_DENIED' using errcode='42501'; end if;
  if p_admin_visibility not in ('policy','show','hide')
     or p_worker_visibility not in ('policy','show','hide')
     or p_customer_visibility not in ('policy','show','hide') then
    raise exception 'INVALID_VISIBILITY_MODE' using errcode='22023';
  end if;
  update public.flexy_offer_catalog
  set admin_visibility=p_admin_visibility,worker_visibility=p_worker_visibility,
      customer_visibility=p_customer_visibility,active=coalesce(p_active,false),
      execution_enabled=coalesce(p_execution_enabled,false),updated_at=now()
  where offer_uuid=p_offer_uuid;
  if not found then raise exception 'FLEXY_OFFER_NOT_FOUND' using errcode='P0002'; end if;
end;
$function$;

create or replace function public.admin_flexy_update_offer_policy(
  p_role text,p_default_visible boolean,p_min_amount integer
)
returns void language plpgsql security definer set search_path=''
as $function$
declare v_role text := lower(btrim(coalesce(p_role,'')));
begin
  if not private.is_shop_admin() then raise exception 'PERMISSION_DENIED' using errcode='42501'; end if;
  if v_role not in ('admin','worker','customer') then raise exception 'INVALID_FLEXY_ROLE' using errcode='22023'; end if;
  if p_min_amount is not null and p_min_amount < 0 then raise exception 'INVALID_MIN_AMOUNT' using errcode='22023'; end if;
  insert into public.flexy_offer_role_policies(role,default_visible,min_amount,updated_by_admin_user_id,updated_at)
  values(v_role,coalesce(p_default_visible,false),p_min_amount,auth.uid(),now())
  on conflict(role) do update
  set default_visible=excluded.default_visible,min_amount=excluded.min_amount,
      updated_by_admin_user_id=excluded.updated_by_admin_user_id,updated_at=excluded.updated_at;
end;
$function$;

revoke all on function public.flexy_get_visible_offer_catalog(text) from public;
grant execute on function public.flexy_get_visible_offer_catalog(text) to anon,authenticated;
revoke all on function public.admin_flexy_list_offer_catalog() from public;
grant execute on function public.admin_flexy_list_offer_catalog() to authenticated;
revoke all on function public.admin_flexy_list_offer_policies() from public;
grant execute on function public.admin_flexy_list_offer_policies() to authenticated;
revoke all on function public.admin_flexy_update_offer_presentation(uuid,text,text,text,boolean,boolean) from public;
grant execute on function public.admin_flexy_update_offer_presentation(uuid,text,text,text,boolean,boolean) to authenticated;
revoke all on function public.admin_flexy_update_offer_policy(text,boolean,integer) from public;
grant execute on function public.admin_flexy_update_offer_policy(text,boolean,integer) to authenticated;

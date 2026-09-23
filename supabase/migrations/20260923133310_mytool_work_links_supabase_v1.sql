create table if not exists public.mytool_work_link_groups (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  icon text not null default '🔗',
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mytool_work_links (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  short text,
  url text not null,
  group_id text not null references public.mytool_work_link_groups(id) on update cascade on delete restrict,
  note text,
  external boolean not null default true,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.mytool_work_links_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists mytool_work_link_groups_touch on public.mytool_work_link_groups;
create trigger mytool_work_link_groups_touch
before update on public.mytool_work_link_groups
for each row execute function public.mytool_work_links_touch_updated_at();

drop trigger if exists mytool_work_links_touch on public.mytool_work_links;
create trigger mytool_work_links_touch
before update on public.mytool_work_links
for each row execute function public.mytool_work_links_touch_updated_at();

alter table public.mytool_work_link_groups enable row level security;
alter table public.mytool_work_links enable row level security;

create policy "mytool work link groups admin"
on public.mytool_work_link_groups
for all
to authenticated
using ((select private.is_shop_admin()))
with check ((select private.is_shop_admin()));

create policy "mytool work links admin"
on public.mytool_work_links
for all
to authenticated
using ((select private.is_shop_admin()))
with check ((select private.is_shop_admin()));

revoke all on table public.mytool_work_link_groups from anon;
revoke all on table public.mytool_work_links from anon;
grant select, insert, update, delete on table public.mytool_work_link_groups to authenticated;
grant select, insert, update, delete on table public.mytool_work_links to authenticated;

insert into public.mytool_work_link_groups (id,name,icon,sort_order,active) values
  ('admin','إدارة وتطوير','⚙️',10,true),
  ('communication','التواصل والبريد','✉️',20,true),
  ('card-platforms','شراء البطاقات والمنصات','🛒',30,true),
  ('mytool','أدوات MyTool','🧰',40,true)
on conflict (id) do update set
  name=excluded.name,
  icon=excluded.icon,
  sort_order=excluded.sort_order,
  active=excluded.active;

insert into public.mytool_work_links (id,name,short,url,group_id,note,external,active,sort_order) values
  ('supabase-mytool','Supabase — MyTool','SB','https://supabase.com/dashboard/project/wqyebqzbbpohbnznqdjj','admin','قاعدة بيانات MyTool ولوحة المشروع',true,true,10),
  ('gmail','Gmail','GM','https://mail.google.com/','communication','فتح البريد في صفحة جديدة',true,true,10),
  ('cards','معالج البطاقات','BC','../cards/','mytool','استخراج وتنظيم البطاقات',false,true,10),
  ('chat-reader','قارئ مدفوعات الدردشة','CH','../chat-payments-reader/','mytool','قراءة محادثات المدفوعات',false,true,20)
on conflict (id) do update set
  name=excluded.name,
  short=excluded.short,
  url=excluded.url,
  group_id=excluded.group_id,
  note=excluded.note,
  external=excluded.external,
  active=excluded.active,
  sort_order=excluded.sort_order;

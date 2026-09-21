-- Safety correction applied to Supabase on 2026-09-21.
-- The first multi-route draft omitted Arsselli distributor_account from the template.
-- Keep those draft rows disabled until the account-aware router is implemented.

update public.flexy_offer_execution_routes r
set enabled=false,
    status='draft',
    source_note=coalesce(r.source_note,'') || ' | Disabled: incomplete Arsselli template missing distributor_account.',
    updated_at=now()
from public.flexy_offer_catalog c
where r.offer_uuid=c.offer_uuid
  and c.operator='mobilis'
  and c.family='PixX'
  and r.sim_type='mobilis-arsselli'
  and r.route_template='*696*1*{phone}*{amount}*{service_pin}#';

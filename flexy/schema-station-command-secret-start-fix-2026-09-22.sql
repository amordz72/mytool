-- LIVE schema fix reference — 2026-09-22
-- This is not a Supabase migration-history claim.
-- station_connect_begin_command_session sends a USSD start value containing
-- {service_pin} together with secret_key='service_pin'. station_connect_claim_command
-- replaces that placeholder from Vault before Agent receives the command.
-- The former CHECK constraint allowed secrets only on ussd_reply and therefore
-- blocked valid ussd_start creation before any network execution.

alter table public.station_connect_commands
drop constraint if exists station_connect_commands_check;

alter table public.station_connect_commands
add constraint station_connect_commands_check
check (
  (
    action='ussd_start'
    and value is not null
    and (secret_key is null or secret_key='service_pin')
  )
  or
  (
    action='ussd_reply'
    and (
      (value is not null and secret_key is null)
      or
      (value is null and secret_key is not null)
    )
  )
  or
  (
    action='ussd_release'
    and value is null
    and secret_key is null
  )
);

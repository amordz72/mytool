-- Prevent a physical Mobilis card from entering both commercial sale stock and SAMA feeding stock.

create or replace function public.station_connect_admin_bulk_add_recharge_cards(
  p_codes text[],
  p_amount integer,
  p_source_code text default 'file_import'
)
returns table(total_count integer, inserted_count integer, duplicate_count integer, invalid_count integer)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_raw text;
  v_code text;
  v_source text := trim(coalesce(p_source_code,'file_import'));
  v_source_label text;
  v_fingerprint text;
  v_secret uuid;
  v_total integer := 0;
  v_inserted integer := 0;
  v_duplicates integer := 0;
  v_invalid integer := 0;
  v_station_uuid uuid;
  v_modem_uuid uuid;
  v_sim_uuid uuid;
  v_msisdn text;
begin
  if not private.is_shop_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode='42501';
  end if;

  if p_amount not in (1000,2000) then
    raise exception 'RECHARGE_AMOUNT_NOT_SUPPORTED' using errcode='22023';
  end if;

  v_source_label := case v_source
    when 'file_import' then 'Flexy — تغذية الشرائح'
    when 'sim_feeding' then 'Flexy — تغذية الشرائح'
    when 'aladdin_telegram' then 'بوت تيليجرام علاء الدين'
    when 'hanii_rohek' then 'هني روحك'
    when 'wafferli' then 'وفرلي'
    when 'digital_home' then 'ديجيتال هوم'
    else null
  end;

  if v_source_label is null then
    raise exception 'INVALID_CARD_SOURCE' using errcode='22023';
  end if;

  foreach v_raw in array coalesce(p_codes, array[]::text[])
  loop
    v_total := v_total + 1;
    v_code := coalesce(v_raw,'');

    if left(v_code,1)=chr(65279) then
      v_code := substring(v_code from 2);
    end if;

    if v_code = ''
       or v_code ~ '[[:space:]]'
       or v_code !~ '^[0-9]{15}$' then
      v_invalid := v_invalid + 1;
    end if;
  end loop;

  if v_total = 0 then
    raise exception 'MOBILIS_BATCH_EMPTY' using errcode='22023';
  end if;

  if v_invalid > 0 then
    raise exception 'MOBILIS_BATCH_FORMAT_INVALID:%', v_invalid using errcode='22023';
  end if;

  foreach v_raw in array p_codes
  loop
    v_code := coalesce(v_raw,'');
    if left(v_code,1)=chr(65279) then
      v_code := substring(v_code from 2);
    end if;

    v_fingerprint := encode(extensions.digest(v_code,'sha256'),'hex');

    if exists (
      select 1
      from public.station_connect_recharge_cards c
      where c.code_fingerprint=v_fingerprint
    ) then
      v_duplicates := v_duplicates + 1;
      continue;
    end if;

    if exists (
      select 1
      from public.card_stock_items i
      where i.type_key='mobilis'
        and i.code_fingerprint=v_fingerprint
    ) then
      raise exception 'MOBILIS_COMMERCIAL_STOCK_CONFLICT' using errcode='23505';
    end if;

    select vault.create_secret(
      v_code,
      'station-connect-recharge-card-' || gen_random_uuid()::text,
      'Flexy SAMA feeding card'
    ) into v_secret;

    begin
      insert into public.station_connect_recharge_cards(
        source_code, source_label, amount, code_secret_id,
        code_fingerprint, code_last4, created_by
      ) values (
        case when v_source='file_import' then 'sim_feeding' else v_source end,
        v_source_label, p_amount, v_secret,
        v_fingerprint, right(v_code,4), auth.uid()
      );
      v_inserted := v_inserted + 1;
    exception when unique_violation then
      v_duplicates := v_duplicates + 1;
    end;
  end loop;

  if exists (
    select 1
    from public.station_connect_recharge_cards c
    where c.status='ready'
      and c.amount in (1000,2000)
  ) then
    select st.station_uuid, m.modem_uuid, s.sim_uuid, s.msisdn
      into v_station_uuid, v_modem_uuid, v_sim_uuid, v_msisdn
    from public.station_connect_sims s
    join public.station_connect_modems m on m.modem_uuid=s.modem_uuid
    join public.station_connect_stations st on st.station_uuid=m.station_uuid
    where s.sim_type='mobilis-sama'
      and st.status='approved'
      and st.last_seen_at >= now()-interval '90 seconds'
      and m.last_seen_at >= now()-interval '90 seconds'
    order by s.last_seen_at desc
    limit 1;

    if v_station_uuid is not null
       and not exists (
         select 1
         from public.station_connect_jobs j
         where j.sim_uuid=v_sim_uuid
           and j.operation_type='balance_lookup'
           and j.status in ('queued','claimed')
       ) then
      insert into public.station_connect_jobs(
        station_uuid, operation_type, phone, amount, created_by,
        modem_uuid, sim_uuid, source_app, operation_key, capability,
        payload, execution_plan, target_sim_type, requires_service_pin,
        idempotency_key
      ) values (
        v_station_uuid, 'balance_lookup', v_msisdn, null, auth.uid(),
        v_modem_uuid, v_sim_uuid, 'system', 'mobilis.balance.stock_added', 'ussd',
        jsonb_build_object(
          'source','sim_feeding',
          'import_amount',p_amount,
          'inserted_count',v_inserted,
          'duplicate_count',v_duplicates
        ),
        '{}'::jsonb, 'mobilis-sama', false,
        'stock-added-balance:'||gen_random_uuid()::text
      );
    end if;
  end if;

  return query select v_total,v_inserted,v_duplicates,0;
end;
$function$;

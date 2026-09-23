-- customer_source_snapshot_import_v1
-- Applied Supabase migration version: 20260923223237
-- Source account identity: platform + username.
-- Platform files are idempotent snapshots; missing rows are marked, never deleted.

alter table public.money_platform_source_accounts
  add column if not exists last_snapshot_batch_id bigint null references public.money_source_import_batches(id) on delete set null,
  add column if not exists last_snapshot_seen_at timestamptz null,
  add column if not exists missing_from_latest_snapshot boolean not null default false,
  add column if not exists missing_since_at timestamptz null;

create index if not exists money_platform_source_accounts_snapshot_missing_idx
  on public.money_platform_source_accounts(data_mode,platform_key_normalized,missing_from_latest_snapshot,active);

alter table public.money_source_import_batches
  add column if not exists snapshot_finalized_at timestamptz null,
  add column if not exists snapshot_account_count integer null,
  add column if not exists snapshot_missing_count integer null;

update public.money_source_import_batches
set snapshot_finalized_at=coalesce(snapshot_finalized_at,last_imported_at),
    snapshot_account_count=coalesce(snapshot_account_count,0),
    snapshot_missing_count=coalesce(snapshot_missing_count,0)
where snapshot_finalized_at is null;

CREATE OR REPLACE FUNCTION private.customer_apply_source_payload(p_source_account_id bigint, p_payload jsonb, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.money_platform_source_accounts%rowtype;
  v_username text; v_phone text; v_email text; v_src_at timestamptz; v_created_at timestamptz;
  v_balance numeric; v_debt numeric; v_profit numeric;
  v_external text; v_display text; v_first text; v_last text; v_status text;
  v_active boolean; v_raw jsonb;
  v_stale boolean:=false; v_financial_changed boolean:=false; v_changed boolean:=false;
begin
  select * into a from public.money_platform_source_accounts where id=p_source_account_id for update;
  if not found then raise exception 'SOURCE_ACCOUNT_NOT_FOUND'; end if;

  v_src_at:=private.customer_json_timestamptz(p_payload,'source_updated_at',null);
  v_created_at:=case
    when p_payload ? 'source_created_at'
      then private.customer_json_timestamptz(p_payload,'source_created_at',null)
    else a.source_created_at
  end;

  if not coalesce(p_force,false) and v_src_at is not null and a.source_updated_at is not null and v_src_at<a.source_updated_at then
    return jsonb_build_object('source_account_id',a.id,'stale',true,'changed',false,'financial_changed',false);
  end if;

  perform private.customer_record_source_alias(a.id,'username',a.username);
  perform private.customer_record_source_alias(a.id,'phone',a.phone);
  perform private.customer_record_source_alias(a.id,'email',a.email);

  v_username:=case
    when p_payload ? 'username' then nullif(btrim(coalesce(p_payload->>'username','')),'')
    else a.username
  end;
  if v_username is null then v_username:=a.username; end if;

  v_phone:=case
    when p_payload ? 'phone' then nullif(btrim(coalesce(p_payload->>'phone','')),'')
    else a.phone
  end;
  v_email:=case
    when p_payload ? 'email' then nullif(lower(btrim(coalesce(p_payload->>'email',''))),'')
    else a.email
  end;
  v_external:=case
    when p_payload ? 'external_account_id' then nullif(btrim(coalesce(p_payload->>'external_account_id','')),'')
    else a.external_account_id
  end;
  v_display:=case
    when p_payload ? 'display_name' then nullif(btrim(coalesce(p_payload->>'display_name','')),'')
    else a.display_name
  end;
  v_first:=case
    when p_payload ? 'first_name' then nullif(btrim(coalesce(p_payload->>'first_name','')),'')
    else a.first_name
  end;
  v_last:=case
    when p_payload ? 'last_name' then nullif(btrim(coalesce(p_payload->>'last_name','')),'')
    else a.last_name
  end;
  v_status:=case
    when p_payload ? 'source_status' then nullif(btrim(coalesce(p_payload->>'source_status','')),'')
    else a.source_status
  end;
  v_active:=case
    when p_payload ? 'active' then coalesce((p_payload->>'active')::boolean,a.active)
    else a.active
  end;
  v_raw:=case
    when p_payload ? 'raw_data' then coalesce(nullif(p_payload->'raw_data','null'::jsonb),a.raw_data)
    else a.raw_data
  end;

  v_balance:=case when p_payload ? 'balance' then private.customer_json_numeric(p_payload,'balance',a.balance_amount) else a.balance_amount end;
  v_debt:=case when p_payload ? 'debt' then private.customer_json_numeric(p_payload,'debt',a.debt_amount) else a.debt_amount end;
  v_profit:=case when p_payload ? 'profit' then private.customer_json_numeric(p_payload,'profit',a.profit_amount) else a.profit_amount end;

  v_financial_changed :=
    v_balance is distinct from a.balance_amount or
    v_debt is distinct from a.debt_amount or
    v_profit is distinct from a.profit_amount;

  v_changed := v_financial_changed
    or v_username is distinct from a.username
    or v_phone is distinct from a.phone
    or v_email is distinct from a.email
    or v_external is distinct from a.external_account_id
    or v_display is distinct from a.display_name
    or v_first is distinct from a.first_name
    or v_last is distinct from a.last_name
    or v_status is distinct from a.source_status
    or v_active is distinct from a.active
    or v_created_at is distinct from a.source_created_at
    or v_raw is distinct from a.raw_data
    or (v_src_at is not null and v_src_at is distinct from a.source_updated_at);

  update public.money_platform_source_accounts
  set username=v_username,
      external_account_id=v_external,
      display_name=v_display,
      first_name=v_first,
      last_name=v_last,
      phone=v_phone,
      email=v_email,
      source_status=v_status,
      source_updated_at=case when p_payload ? 'source_updated_at' then v_src_at else source_updated_at end,
      source_created_at=v_created_at,
      raw_data=v_raw,
      active=v_active,
      balance_amount=v_balance,
      debt_amount=v_debt,
      profit_amount=v_profit,
      last_seen_at=now(),
      last_financial_change_at=case when v_financial_changed then now() else last_financial_change_at end,
      updated_at=case when v_changed then now() else updated_at end
  where id=a.id;

  perform private.customer_record_source_alias(a.id,'username',v_username);
  perform private.customer_record_source_alias(a.id,'phone',v_phone);
  perform private.customer_record_source_alias(a.id,'email',v_email);

  return jsonb_build_object(
    'source_account_id',a.id,
    'stale',v_stale,
    'changed',v_changed,
    'financial_changed',v_financial_changed
  );
end
$function$;

CREATE OR REPLACE FUNCTION private.customer_upsert_source_accounts_snapshot_core(p_platform_key text, p_accounts jsonb, p_batch_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_platform text:=nullif(btrim(coalesce(p_platform_key,'')),'');
  x jsonb; v_username text; ukey text; match_id bigint; new_id bigint; rr jsonb;
  v_phone text; v_email text; v_balance numeric; v_debt numeric; v_profit numeric; v_created_at timestamptz;
  v_was_missing boolean:=false;
  cnt integer:=0; ins integer:=0; upd integer:=0; same_n integer:=0; stale integer:=0;
  restored integer:=0; invalid integer:=0;
begin
  if v_platform is null then raise exception 'PLATFORM_REQUIRED'; end if;
  if jsonb_typeof(p_accounts)<>'array' then raise exception 'INVALID_ACCOUNTS'; end if;

  if p_batch_id is not null and not exists(
    select 1 from public.money_source_import_batches b
    where b.id=p_batch_id and b.data_mode='real' and b.platform_key_normalized=lower(v_platform)
  ) then
    raise exception 'SNAPSHOT_BATCH_PLATFORM_MISMATCH';
  end if;

  insert into public.money_platform_directory(platform_key,display_name)
  values(v_platform,v_platform)
  on conflict(platform_key) do update set active=true,updated_at=now();

  for x in select value from jsonb_array_elements(p_accounts)
  loop
    v_username:=nullif(btrim(coalesce(x->>'username','')),'');
    if v_username is null then
      invalid:=invalid+1;
      continue;
    end if;
    ukey:=private.customer_identity_norm('username',v_username);

    select a.id,a.missing_from_latest_snapshot
      into match_id,v_was_missing
    from public.money_platform_source_accounts a
    where a.data_mode='real'
      and a.platform_key_normalized=lower(v_platform)
      and a.username_normalized=ukey
    limit 1
    for update;

    if match_id is not null then
      rr:=private.customer_apply_source_payload(match_id,x,false);
      if coalesce((rr->>'stale')::boolean,false) then
        stale:=stale+1;
      elsif coalesce((rr->>'changed')::boolean,false) then
        upd:=upd+1;
      else
        same_n:=same_n+1;
      end if;

      if p_batch_id is not null then
        update public.money_platform_source_accounts
        set last_snapshot_batch_id=p_batch_id,
            last_snapshot_seen_at=now(),
            missing_from_latest_snapshot=false,
            missing_since_at=null
        where id=match_id;
        if coalesce(v_was_missing,false) then restored:=restored+1; end if;
      end if;
      cnt:=cnt+1;
      match_id:=null;
      continue;
    end if;

    v_phone:=nullif(btrim(coalesce(x->>'phone','')),'');
    v_email:=nullif(lower(btrim(coalesce(x->>'email',''))),'');
    v_balance:=private.customer_json_numeric(x,'balance',0);
    v_debt:=private.customer_json_numeric(x,'debt',0);
    v_profit:=private.customer_json_numeric(x,'profit',0);
    v_created_at:=private.customer_json_timestamptz(x,'source_created_at',null);

    insert into public.money_platform_source_accounts(
      workspace_code,data_mode,platform_key,username,external_account_id,display_name,first_name,last_name,
      phone,email,source_status,source_updated_at,source_created_at,raw_data,active,
      balance_amount,debt_amount,profit_amount,first_seen_at,last_seen_at,last_financial_change_at,imported_at,updated_at,
      last_snapshot_batch_id,last_snapshot_seen_at,missing_from_latest_snapshot,missing_since_at
    ) values(
      'REAL','real',v_platform,v_username,
      nullif(btrim(coalesce(x->>'external_account_id','')),''),
      nullif(btrim(coalesce(x->>'display_name','')),''),
      nullif(btrim(coalesce(x->>'first_name','')),''),
      nullif(btrim(coalesce(x->>'last_name','')),''),
      v_phone,v_email,
      nullif(btrim(coalesce(x->>'source_status','')),''),
      private.customer_json_timestamptz(x,'source_updated_at',null),
      v_created_at,
      coalesce(nullif(x->'raw_data','null'::jsonb),x),
      coalesce((x->>'active')::boolean,true),
      v_balance,v_debt,v_profit,now(),now(),now(),now(),now(),
      p_batch_id,case when p_batch_id is not null then now() end,false,null
    ) returning id into new_id;

    perform private.customer_record_source_alias(new_id,'username',v_username);
    perform private.customer_record_source_alias(new_id,'phone',v_phone);
    perform private.customer_record_source_alias(new_id,'email',v_email);
    ins:=ins+1; cnt:=cnt+1;
  end loop;

  return jsonb_build_object(
    'processed',cnt,'inserted',ins,'updated',upd,'unchanged',same_n,
    'identity_reviews',0,'identity_conflicts',0,'stale_skipped',stale,
    'restored_from_missing',restored,'invalid_rows',invalid
  );
end
$function$;

CREATE OR REPLACE FUNCTION private.customer_upsert_source_accounts_core(p_platform_key text, p_accounts jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.customer_upsert_source_accounts_snapshot_core(p_platform_key,p_accounts,null);
$function$;

CREATE OR REPLACE FUNCTION private.customer_finalize_source_snapshot_core(p_platform_key text, p_batch_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_platform text:=nullif(btrim(coalesce(p_platform_key,'')),'');
  v_new_missing integer:=0;
  v_total_missing integer:=0;
  v_seen integer:=0;
begin
  if v_platform is null then raise exception 'PLATFORM_REQUIRED'; end if;

  if not exists(
    select 1 from public.money_source_import_batches b
    where b.id=p_batch_id and b.data_mode='real' and b.platform_key_normalized=lower(v_platform)
  ) then
    raise exception 'SNAPSHOT_BATCH_PLATFORM_MISMATCH';
  end if;

  update public.money_platform_source_accounts a
  set missing_from_latest_snapshot=true,
      missing_since_at=coalesce(a.missing_since_at,now())
  where a.data_mode='real'
    and a.platform_key_normalized=lower(v_platform)
    and a.last_snapshot_batch_id is distinct from p_batch_id
    and a.missing_from_latest_snapshot=false;
  get diagnostics v_new_missing=row_count;

  select count(*) into v_seen
  from public.money_platform_source_accounts a
  where a.data_mode='real'
    and a.platform_key_normalized=lower(v_platform)
    and a.last_snapshot_batch_id=p_batch_id;

  select count(*) into v_total_missing
  from public.money_platform_source_accounts a
  where a.data_mode='real'
    and a.platform_key_normalized=lower(v_platform)
    and a.missing_from_latest_snapshot=true;

  update public.money_source_import_batches
  set snapshot_finalized_at=now(),
      snapshot_account_count=v_seen,
      snapshot_missing_count=v_total_missing,
      updated_at=now()
  where id=p_batch_id;

  return jsonb_build_object(
    'batch_id',p_batch_id,
    'platform_key',v_platform,
    'snapshot_accounts',v_seen,
    'newly_missing',v_new_missing,
    'total_missing',v_total_missing
  );
end
$function$;

CREATE OR REPLACE FUNCTION private.customer_preview_import_core(p_platform_key text, p_file_sha256 text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_platform text := nullif(btrim(coalesce(p_platform_key,'')),'');
  v_hash text := lower(nullif(btrim(coalesce(p_file_sha256,'')),''));
  b public.money_source_import_batches%rowtype;
begin
  if v_hash is null or v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_FILE_HASH';
  end if;

  select * into b
  from public.money_source_import_batches
  where file_sha256_normalized=v_hash;

  if found then
    if v_platform is null then
      return jsonb_build_object(
        'status',case when b.snapshot_finalized_at is null then 'duplicate_incomplete' else 'duplicate_known' end,
        'batch_id',b.id,
        'existing_platform_key',b.platform_key,
        'file_name',b.file_name,
        'import_count',b.import_count,
        'last_imported_at',b.last_imported_at,
        'snapshot_finalized_at',b.snapshot_finalized_at,
        'snapshot_account_count',b.snapshot_account_count,
        'snapshot_missing_count',b.snapshot_missing_count
      );
    end if;
    if b.platform_key_normalized<>lower(v_platform) then
      return jsonb_build_object(
        'status','wrong_platform',
        'batch_id',b.id,
        'existing_platform_key',b.platform_key,
        'requested_platform_key',v_platform,
        'file_name',b.file_name,
        'import_count',b.import_count,
        'last_imported_at',b.last_imported_at
      );
    end if;
    return jsonb_build_object(
      'status',case when b.snapshot_finalized_at is null then 'same_platform_incomplete' else 'same_platform' end,
      'batch_id',b.id,
      'platform_key',b.platform_key,
      'file_name',b.file_name,
      'import_count',b.import_count,
      'last_imported_at',b.last_imported_at,
      'snapshot_finalized_at',b.snapshot_finalized_at,
      'snapshot_account_count',b.snapshot_account_count,
      'snapshot_missing_count',b.snapshot_missing_count
    );
  end if;

  return jsonb_build_object(
    'status',case when v_platform is null then 'new_unassigned' else 'new' end,
    'platform_key',v_platform
  );
end
$function$;

CREATE OR REPLACE FUNCTION private.customer_register_import_core(p_platform_key text, p_file_name text, p_file_sha256 text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_platform text := nullif(btrim(coalesce(p_platform_key,'')),'');
  v_name text := nullif(btrim(coalesce(p_file_name,'')),'');
  v_hash text := lower(nullif(btrim(coalesce(p_file_sha256,'')),''));
  b public.money_source_import_batches%rowtype;
begin
  if v_platform is null then raise exception 'PLATFORM_REQUIRED'; end if;
  if v_hash is null or v_hash !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_FILE_HASH'; end if;

  select * into b
  from public.money_source_import_batches
  where file_sha256_normalized=v_hash
  for update;

  if found then
    if b.platform_key_normalized<>lower(v_platform) then
      return jsonb_build_object(
        'status','wrong_platform',
        'batch_id',b.id,
        'existing_platform_key',b.platform_key,
        'requested_platform_key',v_platform,
        'file_name',coalesce(b.file_name,v_name)
      );
    end if;

    if b.snapshot_finalized_at is not null then
      return jsonb_build_object(
        'status','same_platform',
        'batch_id',b.id,
        'platform_key',b.platform_key,
        'import_count',b.import_count,
        'snapshot_finalized_at',b.snapshot_finalized_at
      );
    end if;

    update public.money_source_import_batches
    set file_name=coalesce(v_name,file_name),
        last_imported_at=now(),
        import_count=import_count+1,
        updated_at=now()
    where id=b.id;

    return jsonb_build_object(
      'status','resume_incomplete',
      'batch_id',b.id,
      'platform_key',b.platform_key,
      'import_count',b.import_count+1
    );
  end if;

  insert into public.money_source_import_batches(
    workspace_code,platform_key,file_name,file_sha256,snapshot_finalized_at
  ) values(
    'REAL',v_platform,v_name,v_hash,null
  )
  returning * into b;

  return jsonb_build_object(
    'status','new',
    'batch_id',b.id,
    'platform_key',b.platform_key,
    'import_count',1
  );
end
$function$;

CREATE OR REPLACE FUNCTION private.admin_customer_upsert_source_snapshot_chunk_impl(p_platform_key text, p_batch_id bigint, p_accounts jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_shop_admin() then raise exception 'PERMISSION_DENIED'; end if;
  return private.customer_upsert_source_accounts_snapshot_core(p_platform_key,p_accounts,p_batch_id);
end
$function$;

CREATE OR REPLACE FUNCTION private.workspace_admin_upsert_source_snapshot_chunk_impl(p_session_token text, p_platform_key text, p_batch_id bigint, p_accounts jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.worker_accounts%rowtype;
begin
  v:=private.workspace_session_account(p_session_token);
  if v.id is null or v.account_role<>'workspace_admin' then raise exception 'PERMISSION_DENIED'; end if;
  return private.customer_upsert_source_accounts_snapshot_core(p_platform_key,p_accounts,p_batch_id);
end
$function$;

CREATE OR REPLACE FUNCTION private.admin_customer_finalize_source_snapshot_impl(p_platform_key text, p_batch_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_shop_admin() then raise exception 'PERMISSION_DENIED'; end if;
  return private.customer_finalize_source_snapshot_core(p_platform_key,p_batch_id);
end
$function$;

CREATE OR REPLACE FUNCTION private.workspace_admin_finalize_source_snapshot_impl(p_session_token text, p_platform_key text, p_batch_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.worker_accounts%rowtype;
begin
  v:=private.workspace_session_account(p_session_token);
  if v.id is null or v.account_role<>'workspace_admin' then raise exception 'PERMISSION_DENIED'; end if;
  return private.customer_finalize_source_snapshot_core(p_platform_key,p_batch_id);
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_customer_upsert_source_snapshot_chunk(p_platform_key text, p_batch_id bigint, p_accounts jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.admin_customer_upsert_source_snapshot_chunk_impl(p_platform_key,p_batch_id,p_accounts);
$function$;

CREATE OR REPLACE FUNCTION public.workspace_admin_upsert_source_snapshot_chunk(p_session_token text, p_platform_key text, p_batch_id bigint, p_accounts jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.workspace_admin_upsert_source_snapshot_chunk_impl(p_session_token,p_platform_key,p_batch_id,p_accounts);
$function$;

CREATE OR REPLACE FUNCTION public.admin_customer_finalize_source_snapshot(p_platform_key text, p_batch_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.admin_customer_finalize_source_snapshot_impl(p_platform_key,p_batch_id);
$function$;

CREATE OR REPLACE FUNCTION public.workspace_admin_finalize_source_snapshot(p_session_token text, p_platform_key text, p_batch_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select private.workspace_admin_finalize_source_snapshot_impl(p_session_token,p_platform_key,p_batch_id);
$function$;

CREATE OR REPLACE FUNCTION private.admin_customer_list_linking_impl()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_shop_admin() then raise exception 'PERMISSION_DENIED'; end if;

  return jsonb_build_object(
    'data_mode','real',
    'sources',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.platform_key,x.debt_amount desc,x.display_name nulls last,x.username,x.id)
      from (
        select
          a.id,a.platform_key,a.username,a.external_account_id,a.display_name,a.first_name,a.last_name,
          a.phone,a.email,a.source_status,a.source_updated_at,a.source_created_at,a.active,a.updated_at,
          a.balance_amount,a.debt_amount,a.profit_amount,a.first_seen_at,a.last_seen_at,a.last_financial_change_at,
          a.last_snapshot_batch_id,a.last_snapshot_seen_at,a.missing_from_latest_snapshot,a.missing_since_at,
          l.id link_id,l.party_id linked_party_id,p.display_name linked_party_name,
          p.primary_phone linked_party_phone,p.primary_email linked_party_email,
          case
            when l.id is not null then 'linked'
            when exists(
              select 1 from public.money_party_link_suggestions s
              where s.data_mode='real' and s.status='conflict'
                and (s.left_source_account_id=a.id or s.right_source_account_id=a.id)
            ) then 'conflict'
            when exists(
              select 1 from public.money_party_link_suggestions s
              where s.data_mode='real' and s.status='pending'
                and (s.left_source_account_id=a.id or s.right_source_account_id=a.id)
            ) then 'pending_review'
            else 'unlinked'
          end link_status
        from public.money_platform_source_accounts a
        left join public.money_party_platform_links l
          on l.active=true and l.data_mode='real'
         and (
           l.source_account_id=a.id
           or (
             l.source_account_id is null
             and l.platform_key_normalized=a.platform_key_normalized
             and l.username_normalized=a.username_normalized
           )
         )
        left join public.money_party_directory p
          on p.id=l.party_id and p.data_mode='real'
        where a.data_mode='real' and a.active=true
      ) x
    ),'[]'::jsonb),
    'parties',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.display_name,x.id)
      from (
        select id,display_name,aliases,party_type,favorite,financial_open,primary_phone,primary_email,updated_at
        from public.money_party_directory
        where data_mode='real' and active=true and approval_status='approved' and is_canonical=true
      ) x
    ),'[]'::jsonb)
  );
end
$function$;

CREATE OR REPLACE FUNCTION private.workspace_admin_list_customer_linking_impl(p_session_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v public.worker_accounts%rowtype;
begin
  v:=private.workspace_session_account(p_session_token);
  if v.id is null or v.account_role<>'workspace_admin' then raise exception 'PERMISSION_DENIED'; end if;

  return jsonb_build_object(
    'data_mode','real',
    'sources',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.platform_key,x.debt_amount desc,x.display_name nulls last,x.username,x.id)
      from (
        select
          a.id,a.platform_key,a.username,a.external_account_id,a.display_name,a.first_name,a.last_name,
          a.phone,a.email,a.source_status,a.source_updated_at,a.source_created_at,a.active,a.updated_at,
          a.balance_amount,a.debt_amount,a.profit_amount,a.first_seen_at,a.last_seen_at,a.last_financial_change_at,
          a.last_snapshot_batch_id,a.last_snapshot_seen_at,a.missing_from_latest_snapshot,a.missing_since_at,
          l.id link_id,l.party_id linked_party_id,p.display_name linked_party_name,
          p.primary_phone linked_party_phone,p.primary_email linked_party_email,
          case
            when l.id is not null then 'linked'
            when exists(
              select 1 from public.money_party_link_suggestions s
              where s.data_mode='real' and s.status='conflict'
                and (s.left_source_account_id=a.id or s.right_source_account_id=a.id)
            ) then 'conflict'
            when exists(
              select 1 from public.money_party_link_suggestions s
              where s.data_mode='real' and s.status='pending'
                and (s.left_source_account_id=a.id or s.right_source_account_id=a.id)
            ) then 'pending_review'
            else 'unlinked'
          end link_status
        from public.money_platform_source_accounts a
        left join public.money_party_platform_links l
          on l.active=true and l.data_mode='real'
         and (
           l.source_account_id=a.id
           or (
             l.source_account_id is null
             and l.platform_key_normalized=a.platform_key_normalized
             and l.username_normalized=a.username_normalized
           )
         )
        left join public.money_party_directory p
          on p.id=l.party_id and p.data_mode='real'
        where a.data_mode='real' and a.active=true
      ) x
    ),'[]'::jsonb),
    'parties',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.display_name,x.id)
      from (
        select id,display_name,aliases,party_type,favorite,financial_open,primary_phone,primary_email,updated_at
        from public.money_party_directory
        where data_mode='real' and active=true and approval_status='approved' and is_canonical=true
      ) x
    ),'[]'::jsonb),
    'counts',jsonb_build_object(
      'sources',(select count(*) from public.money_platform_source_accounts where data_mode='real' and active=true),
      'linked',(select count(*) from public.money_party_platform_links where data_mode='real' and active=true),
      'pending',(select count(*) from public.money_party_link_suggestions where data_mode='real' and status='pending'),
      'conflicts',(select count(*) from public.money_party_link_suggestions where data_mode='real' and status='conflict')
    )
  );
end
$function$;

revoke all on function public.admin_customer_upsert_source_snapshot_chunk(text,bigint,jsonb) from public;
revoke all on function public.workspace_admin_upsert_source_snapshot_chunk(text,text,bigint,jsonb) from public;
revoke all on function public.admin_customer_finalize_source_snapshot(text,bigint) from public;
revoke all on function public.workspace_admin_finalize_source_snapshot(text,text,bigint) from public;

grant execute on function public.admin_customer_upsert_source_snapshot_chunk(text,bigint,jsonb) to anon,authenticated,service_role;
grant execute on function public.workspace_admin_upsert_source_snapshot_chunk(text,text,bigint,jsonb) to anon,authenticated,service_role;
grant execute on function public.admin_customer_finalize_source_snapshot(text,bigint) to anon,authenticated,service_role;
grant execute on function public.workspace_admin_finalize_source_snapshot(text,text,bigint) to anon,authenticated,service_role;

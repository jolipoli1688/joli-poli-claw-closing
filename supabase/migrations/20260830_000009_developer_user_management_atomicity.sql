-- CLOUD PHASE 4.1: make Developer-managed user profile/membership changes
-- transactional, auditable, and unavailable to direct client table writes.

begin;

create or replace function public.apply_developer_user_profile(
  target_user uuid,
  actor_user uuid,
  requested_username text,
  requested_role public.app_role,
  requested_active boolean,
  requested_outlet_codes text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_username text;
  target_profile public.profiles%rowtype;
  outlet_codes text[];
  outlet_ids uuid[];
  active_developer_count integer;
begin
  if not exists (
    select 1 from public.profiles
    where id = actor_user and role = 'developer'::public.app_role and is_active
  ) then
    raise exception 'Developer role required';
  end if;

  normalized_username := lower(trim(requested_username));
  if normalized_username !~ '^[a-z0-9][a-z0-9._-]{2,31}$' then
    raise exception 'Username must be 3-32 normalized lowercase characters';
  end if;
  if requested_role not in ('developer'::public.app_role, 'admin'::public.app_role, 'outlet'::public.app_role) then
    raise exception 'Role must be Developer, Admin, or Outlet';
  end if;

  select * into target_profile from public.profiles where id = target_user for update;
  if not found then raise exception 'Created Auth identity has no profile'; end if;
  if target_profile.username is not null and target_profile.username <> normalized_username then
    raise exception 'Username is immutable; create a controlled replacement user instead';
  end if;
  if exists (select 1 from public.profiles where lower(username) = normalized_username and id <> target_user) then
    raise exception 'Username already exists';
  end if;

  outlet_codes := array(select distinct trim(code) from unnest(coalesce(requested_outlet_codes, '{}'::text[])) as code where trim(code) <> '');
  if requested_role = 'outlet'::public.app_role and coalesce(array_length(outlet_codes, 1), 0) = 0 then
    raise exception 'Outlet users need at least one outlet assignment';
  end if;
  if requested_role = 'outlet'::public.app_role then
    select array_agg(id order by id) into outlet_ids from public.stores where code = any(outlet_codes) and is_active;
    if coalesce(array_length(outlet_ids, 1), 0) <> coalesce(array_length(outlet_codes, 1), 0) then
      raise exception 'An assigned outlet does not exist or is inactive';
    end if;
  else
    outlet_ids := '{}'::uuid[];
  end if;

  if target_profile.role = 'developer'::public.app_role and target_profile.is_active
     and (requested_role <> 'developer'::public.app_role or not requested_active) then
    select count(*) into active_developer_count
      from public.profiles where role = 'developer'::public.app_role and is_active and id <> target_user;
    if active_developer_count = 0 then
      raise exception 'At least one active Developer must remain';
    end if;
  end if;

  update public.profiles
  set username = normalized_username,
      display_name = normalized_username,
      role = requested_role,
      is_active = requested_active,
      all_stores = requested_role <> 'outlet'::public.app_role,
      updated_by = actor_user,
      updated_at = now()
  where id = target_user;

  delete from public.user_store_access where user_id = target_user;
  if array_length(outlet_ids, 1) > 0 then
    insert into public.user_store_access (user_id, store_id, granted_by)
    select target_user, outlet_id, actor_user from unnest(outlet_ids) as outlet_id;
  end if;

  insert into public.audit_log (actor_user_id, entity_type, entity_id, action, metadata)
  values (
    actor_user,
    'user',
    target_user,
    case when target_profile.username is null then 'create' else 'update' end,
    jsonb_build_object('username', normalized_username, 'role', requested_role::text, 'active', requested_active, 'outlets', outlet_codes)
  );

  return jsonb_build_object('id', target_user, 'username', normalized_username, 'role', requested_role::text, 'status', case when requested_active then 'active' else 'inactive' end, 'outlets', outlet_codes);
end;
$$;

revoke all on function public.apply_developer_user_profile(uuid, uuid, text, public.app_role, boolean, text[]) from public, anon, authenticated;
grant execute on function public.apply_developer_user_profile(uuid, uuid, text, public.app_role, boolean, text[]) to service_role;

-- The authenticated client must never mutate accounts, configuration, or
-- operational records directly. Edge/RPC paths enforce the business rules.
drop policy if exists profiles_admin_update on public.profiles;
drop policy if exists machine_types_admin_insert on public.machine_types;
drop policy if exists machine_types_admin_update on public.machine_types;
drop policy if exists machine_types_admin_delete on public.machine_types;
drop policy if exists stores_admin_insert on public.stores;
drop policy if exists stores_admin_update on public.stores;
drop policy if exists stores_admin_delete on public.stores;
drop policy if exists user_store_access_admin_insert on public.user_store_access;
drop policy if exists user_store_access_admin_update on public.user_store_access;
drop policy if exists user_store_access_admin_delete on public.user_store_access;

commit;

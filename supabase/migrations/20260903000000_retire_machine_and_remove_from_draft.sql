-- Retire a machine and remove only its active Draft snapshot entries atomically.
-- Draft product entries and refill events are deleted by their existing FK cascades.
begin;

create or replace function private.require_active_machine_for_closing_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.machines machine
    where machine.id = new.machine_id
      and machine.is_active
  ) then
    raise exception 'A retired machine cannot be added to a closing';
  end if;
  return new;
end;
$$;

revoke all on function private.require_active_machine_for_closing_entry() from public, anon, authenticated;

drop trigger if exists closing_machine_entries_require_active_machine on public.closing_machine_entries;
create trigger closing_machine_entries_require_active_machine
before insert on public.closing_machine_entries
for each row execute function private.require_active_machine_for_closing_entry();

create or replace function public.retire_machine_and_remove_from_draft(
  target_machine uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target public.machines%rowtype;
  draft_closing_ids uuid[] := '{}'::uuid[];
  removed_draft_machine_entries integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into actor
  from public.profiles profile
  where profile.id = auth.uid()
    and profile.is_active;
  if not found then
    raise exception 'Your account is not active';
  end if;
  if actor.role not in ('developer'::public.app_role, 'admin'::public.app_role) then
    raise exception 'Developer or Admin role required';
  end if;

  select * into target
  from public.machines machine
  where machine.id = target_machine
  for update;
  if not found then
    raise exception 'Machine not found';
  end if;

  -- Developers retain their explicit all-outlet authority. Admins require an
  -- explicit outlet membership even if a legacy profile has all_stores set.
  if actor.role = 'developer'::public.app_role and not actor.all_stores then
    raise exception 'Developer is not authorized for all outlets';
  end if;
  if actor.role = 'admin'::public.app_role and not exists (
    select 1
    from public.user_store_access access
    where access.user_id = auth.uid()
      and access.store_id = target.store_id
  ) then
    raise exception 'Admin is not authorized for this outlet';
  end if;

  select coalesce(array_agg(distinct closing.id order by closing.id), '{}'::uuid[])
    into draft_closing_ids
  from public.closing_machine_entries entry
  join public.daily_closings closing on closing.id = entry.closing_id
  where entry.machine_id = target.id
    and closing.store_id = target.store_id
    and closing.status = 'draft'::public.closing_status;

  -- The existing ON DELETE CASCADE relationships delete product entries and
  -- refill events. Finalized and Void entries are deliberately outside this
  -- predicate, and the daily_closings header is never deleted.
  delete from public.closing_machine_entries entry
  using public.daily_closings closing
  where entry.closing_id = closing.id
    and entry.machine_id = target.id
    and closing.store_id = target.store_id
    and closing.status = 'draft'::public.closing_status;
  get diagnostics removed_draft_machine_entries = row_count;

  update public.machines machine
  set is_active = false,
      updated_at = now()
  where machine.id = target.id;

  insert into public.audit_log (actor_user_id, store_id, entity_type, entity_id, action, metadata)
  values (
    auth.uid(),
    target.store_id,
    'machine',
    target.id,
    'retire',
    jsonb_build_object(
      'machine_id', target.id,
      'machine_code', target.machine_code,
      'removed_draft_machine_entries', removed_draft_machine_entries
    )
  );

  return jsonb_build_object(
    'machine_id', target.id,
    'retired', true,
    'draft_closing_ids', to_jsonb(draft_closing_ids),
    'removed_draft_machine_entries', removed_draft_machine_entries
  );
end;
$$;

revoke all on function public.retire_machine_and_remove_from_draft(uuid) from public, anon;
grant execute on function public.retire_machine_and_remove_from_draft(uuid) to authenticated;

commit;

-- Developer-only, void-history-only machine-type purge. Database work is one
-- transaction; Edge performs the returned exact Storage-path cleanup afterwards.
begin;

create or replace function public.purge_developer_machine_type(
  target_machine_type uuid,
  confirm_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.machine_types%rowtype;
  target_machine_ids uuid[] := '{}'::uuid[];
  target_style_ids uuid[] := '{}'::uuid[];
  target_void_entry_ids uuid[] := '{}'::uuid[];
  image_paths text[] := '{}'::text[];
  deleted_machine_count integer := 0;
  deleted_style_count integer := 0;
  deleted_void_entry_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.is_active
      and profile.role = 'developer'::public.app_role
  ) then
    raise exception 'Developer role required';
  end if;

  select * into target
  from public.machine_types
  where id = target_machine_type
  for update;
  if not found then
    raise exception 'Machine type not found';
  end if;
  if confirm_name is null or target.name <> confirm_name then
    raise exception 'Type the exact machine type name to permanently delete it';
  end if;

  -- A target type may be purged only when any existing closing references are
  -- Void. Snapshot-name matching protects history even if a master machine was
  -- deactivated before this operation.
  if exists (
    select 1
    from public.closing_machine_entries entry
    join public.daily_closings closing on closing.id = entry.closing_id
    left join public.machines machine on machine.id = entry.machine_id
    where closing.status in ('draft'::public.closing_status, 'finalized'::public.closing_status)
      and (machine.machine_type_id = target.id or entry.machine_type_name_snapshot = target.name)
  ) then
    raise exception 'This machine type has active or finalized closing history and cannot be permanently deleted.';
  end if;

  select coalesce(array_agg(machine.id order by machine.id), '{}'::uuid[])
    into target_machine_ids
  from public.machines machine
  where machine.machine_type_id = target.id;
  deleted_machine_count := cardinality(target_machine_ids);

  select coalesce(array_agg(style.id order by style.id), '{}'::uuid[]),
         coalesce(array_agg(distinct style.image_path order by style.image_path) filter (where style.image_path is not null), '{}'::text[])
    into target_style_ids, image_paths
  from public.machine_styles style
  where style.machine_id = any(target_machine_ids);
  deleted_style_count := cardinality(target_style_ids);

  select coalesce(array_agg(entry.id order by entry.id), '{}'::uuid[])
    into target_void_entry_ids
  from public.closing_machine_entries entry
  join public.daily_closings closing on closing.id = entry.closing_id
  where closing.status = 'void'::public.closing_status
    and entry.machine_id = any(target_machine_ids);
  deleted_void_entry_count := cardinality(target_void_entry_ids);

  -- Do not delete a Void closing header or entries for another machine type.
  delete from public.refill_events refill
  using public.closing_product_entries product
  where refill.closing_product_entry_id = product.id
    and product.closing_machine_entry_id = any(target_void_entry_ids);

  delete from public.closing_product_entries product
  where product.closing_machine_entry_id = any(target_void_entry_ids);

  delete from public.closing_machine_entries entry
  where entry.id = any(target_void_entry_ids);

  delete from public.audit_log audit
  where (audit.entity_type = 'machine_type' and audit.entity_id = target.id)
     or (audit.entity_type = 'machine' and audit.entity_id = any(target_machine_ids))
     or (audit.entity_type = 'machine_style' and audit.entity_id = any(target_style_ids));

  delete from public.machine_styles style
  where style.id = any(target_style_ids);

  delete from public.machines machine
  where machine.id = any(target_machine_ids);

  delete from public.store_machine_type_rules rule
  where rule.machine_type_id = target.id;

  delete from public.machine_types
  where id = target.id;

  return jsonb_build_object(
    'deleted_machine_type_id', target.id,
    'deleted_machine_type_name', target.name,
    'deleted_machine_count', deleted_machine_count,
    'deleted_style_count', deleted_style_count,
    'deleted_void_entry_count', deleted_void_entry_count,
    'storage_paths', to_jsonb(image_paths)
  );
end;
$$;

revoke all on function public.purge_developer_machine_type(uuid, text) from public, anon;
grant execute on function public.purge_developer_machine_type(uuid, text) to authenticated;

commit;

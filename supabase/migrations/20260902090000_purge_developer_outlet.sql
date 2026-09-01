-- Permanent Developer-only outlet purge. Database deletion is atomic; the
-- caller removes only the returned, store-scoped Storage paths afterwards.

begin;

create or replace function public.purge_developer_outlet(
  target_store uuid,
  confirm_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  outlet public.stores%rowtype;
  image_paths text[] := '{}'::text[];
  remaining_usable_outlets integer;
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

  select * into outlet
  from public.stores
  where id = target_store
  for update;
  if not found then
    raise exception 'Outlet not found';
  end if;

  if confirm_code is null or outlet.code <> confirm_code then
    raise exception 'Type the exact outlet code to permanently delete this outlet';
  end if;

  -- Serialize outlet purges so two concurrent requests cannot each observe a
  -- different "last usable outlet" and remove both.
  perform 1
  from public.stores
  where is_active
  for update;

  select count(*) into remaining_usable_outlets
  from public.stores
  where is_active
    and id <> outlet.id;
  if remaining_usable_outlets = 0 then
    raise exception 'The last outlet cannot be deleted';
  end if;

  -- Do not infer bucket paths. Return only paths that are both referenced by
  -- this outlet and inside its private stores/{store_id}/ prefix.
  select coalesce(array_agg(style.image_path order by style.image_path), '{}'::text[])
    into image_paths
  from public.machine_styles style
  join public.machines machine on machine.id = style.machine_id
  where machine.store_id = outlet.id
    and style.image_path is not null
    and style.image_path like ('stores/' || outlet.id::text || '/%');

  -- Closing hierarchy first: master-style and machine foreign keys are
  -- restrictive, so snapshots and refill events must be removed before them.
  delete from public.refill_events refill
  using public.closing_product_entries product,
        public.closing_machine_entries machine_entry,
        public.daily_closings closing
  where refill.closing_product_entry_id = product.id
    and product.closing_machine_entry_id = machine_entry.id
    and machine_entry.closing_id = closing.id
    and closing.store_id = outlet.id;

  delete from public.closing_product_entries product
  using public.closing_machine_entries machine_entry,
        public.daily_closings closing
  where product.closing_machine_entry_id = machine_entry.id
    and machine_entry.closing_id = closing.id
    and closing.store_id = outlet.id;

  delete from public.closing_machine_entries machine_entry
  using public.daily_closings closing
  where machine_entry.closing_id = closing.id
    and closing.store_id = outlet.id;

  delete from public.daily_closings where store_id = outlet.id;
  delete from public.machine_styles style using public.machines machine where style.machine_id = machine.id and machine.store_id = outlet.id;
  delete from public.machines where store_id = outlet.id;
  delete from public.audit_log where store_id = outlet.id;
  delete from public.user_store_access where store_id = outlet.id;
  delete from public.store_machine_type_rules where store_id = outlet.id;
  delete from public.store_settings where store_id = outlet.id;
  delete from public.stores where id = outlet.id;

  return jsonb_build_object(
    'deleted_store_id', outlet.id,
    'deleted_store_code', outlet.code,
    'storage_paths', to_jsonb(image_paths)
  );
end;
$$;

-- This exposed RPC is intentionally callable only by signed-in callers; the
-- function independently enforces auth.uid() and Developer role membership.
revoke all on function public.purge_developer_outlet(uuid, text) from public, anon;
grant execute on function public.purge_developer_outlet(uuid, text) to authenticated;

commit;

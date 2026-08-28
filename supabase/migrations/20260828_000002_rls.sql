-- RLS foundation for JOLI POLI Claw Closing Web.
-- Apply only in the chosen development project first.

create schema if not exists private;
revoke all on schema private from public;

grant usage on schema public to authenticated;

create or replace function private.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active = true;
$$;

create or replace function private.has_store_access(target_store uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    private.current_role() in ('head_office'::public.app_role, 'admin'::public.app_role)
    or exists (
      select 1
      from public.user_store_access usa
      join public.profiles p on p.id = usa.user_id
      where usa.user_id = auth.uid()
        and usa.store_id = target_store
        and p.is_active = true
    );
$$;

create or replace function private.can_edit_store(target_store uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    private.current_role() in ('head_office'::public.app_role, 'admin'::public.app_role)
    or (
      private.current_role() in ('staff'::public.app_role, 'store_manager'::public.app_role)
      and exists (
        select 1 from public.user_store_access usa
        where usa.user_id = auth.uid() and usa.store_id = target_store
      )
    );
$$;

create or replace function private.store_for_machine(target_machine uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select store_id from public.machines where id = target_machine;
$$;

create or replace function private.store_for_closing(target_closing uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select store_id from public.daily_closings where id = target_closing;
$$;

create or replace function private.closing_is_draft(target_closing uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select status = 'draft'::public.closing_status from public.daily_closings where id = target_closing;
$$;

create or replace function private.store_for_machine_entry(target_entry uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select dc.store_id
  from public.closing_machine_entries cme
  join public.daily_closings dc on dc.id = cme.closing_id
  where cme.id = target_entry;
$$;

create or replace function private.machine_entry_is_draft(target_entry uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select dc.status = 'draft'::public.closing_status
  from public.closing_machine_entries cme
  join public.daily_closings dc on dc.id = cme.closing_id
  where cme.id = target_entry;
$$;

create or replace function private.store_for_product_entry(target_entry uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select dc.store_id
  from public.closing_product_entries cpe
  join public.closing_machine_entries cme on cme.id = cpe.closing_machine_entry_id
  join public.daily_closings dc on dc.id = cme.closing_id
  where cpe.id = target_entry;
$$;

create or replace function private.product_entry_is_draft(target_entry uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select dc.status = 'draft'::public.closing_status
  from public.closing_product_entries cpe
  join public.closing_machine_entries cme on cme.id = cpe.closing_machine_entry_id
  join public.daily_closings dc on dc.id = cme.closing_id
  where cpe.id = target_entry;
$$;

create or replace function private.safe_uuid(value text)
returns uuid
language plpgsql
immutable
security definer
set search_path = public
as $$
begin
  return value::uuid;
exception when others then
  return null;
end;
$$;

grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;

alter table public.stores enable row level security;
alter table public.profiles enable row level security;
alter table public.user_store_access enable row level security;
alter table public.machine_types enable row level security;
alter table public.store_settings enable row level security;
alter table public.machines enable row level security;
alter table public.machine_styles enable row level security;
alter table public.daily_closings enable row level security;
alter table public.closing_machine_entries enable row level security;
alter table public.closing_product_entries enable row level security;
alter table public.refill_events enable row level security;
alter table public.audit_log enable row level security;

create policy profiles_select_self_or_management on public.profiles
for select to authenticated
using (id = auth.uid() or private.current_role() in ('head_office'::public.app_role, 'admin'::public.app_role));

create policy profiles_admin_update on public.profiles
for update to authenticated
using (private.current_role() = 'admin'::public.app_role)
with check (private.current_role() = 'admin'::public.app_role);

create policy stores_select_authorized on public.stores
for select to authenticated using (private.has_store_access(id));

create policy stores_admin_all on public.stores
for all to authenticated
using (private.current_role() = 'admin'::public.app_role)
with check (private.current_role() = 'admin'::public.app_role);

create policy user_store_access_select on public.user_store_access
for select to authenticated
using (user_id = auth.uid() or private.current_role() in ('head_office'::public.app_role, 'admin'::public.app_role));

create policy user_store_access_admin_all on public.user_store_access
for all to authenticated
using (private.current_role() = 'admin'::public.app_role)
with check (private.current_role() = 'admin'::public.app_role);

create policy machine_types_select on public.machine_types
for select to authenticated using (true);

create policy machine_types_admin_all on public.machine_types
for all to authenticated
using (private.current_role() = 'admin'::public.app_role)
with check (private.current_role() = 'admin'::public.app_role);

create policy store_settings_select on public.store_settings
for select to authenticated using (private.has_store_access(store_id));

create policy store_settings_manage on public.store_settings
for all to authenticated
using (private.current_role() in ('head_office'::public.app_role, 'admin'::public.app_role))
with check (private.current_role() in ('head_office'::public.app_role, 'admin'::public.app_role));

create policy machines_select on public.machines
for select to authenticated using (private.has_store_access(store_id));

create policy machines_manage on public.machines
for all to authenticated
using (
  private.current_role() in ('store_manager'::public.app_role, 'head_office'::public.app_role, 'admin'::public.app_role)
  and private.has_store_access(store_id)
)
with check (
  private.current_role() in ('store_manager'::public.app_role, 'head_office'::public.app_role, 'admin'::public.app_role)
  and private.has_store_access(store_id)
);

create policy machine_styles_select on public.machine_styles
for select to authenticated using (private.has_store_access(private.store_for_machine(machine_id)));

create policy machine_styles_manage on public.machine_styles
for all to authenticated
using (
  private.current_role() in ('store_manager'::public.app_role, 'head_office'::public.app_role, 'admin'::public.app_role)
  and private.has_store_access(private.store_for_machine(machine_id))
)
with check (
  private.current_role() in ('store_manager'::public.app_role, 'head_office'::public.app_role, 'admin'::public.app_role)
  and private.has_store_access(private.store_for_machine(machine_id))
);

create policy daily_closings_select on public.daily_closings
for select to authenticated using (private.has_store_access(store_id));

create policy daily_closings_insert on public.daily_closings
for insert to authenticated
with check (private.can_edit_store(store_id) and created_by = auth.uid() and status = 'draft'::public.closing_status);

create policy daily_closings_update on public.daily_closings
for update to authenticated
using (private.can_edit_store(store_id) and status = 'draft'::public.closing_status)
with check (private.can_edit_store(store_id) and status = 'draft'::public.closing_status);

create policy closing_machine_entries_select on public.closing_machine_entries
for select to authenticated using (private.has_store_access(private.store_for_closing(closing_id)));

create policy closing_machine_entries_write on public.closing_machine_entries
for all to authenticated
using (private.can_edit_store(private.store_for_closing(closing_id)) and private.closing_is_draft(closing_id))
with check (private.can_edit_store(private.store_for_closing(closing_id)) and private.closing_is_draft(closing_id));

create policy closing_product_entries_select on public.closing_product_entries
for select to authenticated using (private.has_store_access(private.store_for_machine_entry(closing_machine_entry_id)));

create policy closing_product_entries_write on public.closing_product_entries
for all to authenticated
using (
  private.can_edit_store(private.store_for_machine_entry(closing_machine_entry_id))
  and private.machine_entry_is_draft(closing_machine_entry_id)
)
with check (
  private.can_edit_store(private.store_for_machine_entry(closing_machine_entry_id))
  and private.machine_entry_is_draft(closing_machine_entry_id)
);

create policy refill_events_select on public.refill_events
for select to authenticated using (private.has_store_access(private.store_for_product_entry(closing_product_entry_id)));

create policy refill_events_insert on public.refill_events
for insert to authenticated
with check (
  created_by = auth.uid()
  and private.can_edit_store(private.store_for_product_entry(closing_product_entry_id))
  and private.product_entry_is_draft(closing_product_entry_id)
);

-- Refill events are not directly updated from the browser. Voiding uses a secure RPC.

create policy audit_log_select on public.audit_log
for select to authenticated
using ((store_id is not null and private.has_store_access(store_id)) or private.current_role() = 'admin'::public.app_role);

-- No direct browser INSERT policy for audit_log. Use secure RPC/Edge Function paths.

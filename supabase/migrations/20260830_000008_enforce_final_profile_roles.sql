-- CLOUD PHASE 4.1: enforce the final application role model.
-- Legacy enum labels remain for migration compatibility but cannot be assigned
-- to profiles. New Auth-triggered profiles are inactive Outlet accounts until
-- a Developer provisions their role and authorized outlets.

begin;

alter table public.profiles alter column role set default 'outlet'::public.app_role;
alter table public.profiles drop constraint if exists profiles_final_application_role;
alter table public.profiles add constraint profiles_final_application_role
  check (role in ('developer','admin','outlet'));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, role, is_active)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', 'User'), 'outlet'::public.app_role, false);
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

commit;

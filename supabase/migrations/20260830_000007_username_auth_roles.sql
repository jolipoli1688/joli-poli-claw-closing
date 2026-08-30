-- CLOUD PHASE 4.1: staging-only application usernames and final role model.
-- The technical Auth email remains internal; authorization uses profiles.

begin;

alter type public.app_role add value if not exists 'developer';
alter type public.app_role add value if not exists 'outlet';

-- PostgreSQL requires new enum values to be committed before a function can
-- reference them in an app_role array.
commit;
begin;

alter table public.profiles add column if not exists username text;
create unique index if not exists ux_profiles_username_normalized
  on public.profiles (lower(username)) where username is not null;
alter table public.profiles drop constraint if exists profiles_username_normalized;
alter table public.profiles add constraint profiles_username_normalized
  check (username is null or username ~ '^[a-z0-9][a-z0-9._-]{2,31}$');

-- Outlet replaces the operational Store Manager scope. Admin and Developer
-- have all-store authority; only Developer can create or manage identities.
create or replace function private.can_manage_store(target_store uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_store_access(target_store)
    and private.has_any_role(array['outlet','admin','developer']::public.app_role[])
$$;

commit;

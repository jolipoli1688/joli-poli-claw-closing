-- ARCHIVED REFERENCE ONLY: permanent local-only project direction. Do not execute.
-- JOLI POLI Claw Closing Web
-- Development schema draft. Reconcile against imported v2.1.78 database.py before production use.

create extension if not exists pgcrypto;

create type public.app_role as enum ('staff', 'store_manager', 'head_office', 'admin');
create type public.closing_status as enum ('draft', 'finalized', 'void');
create type public.meter_mode as enum ('meter', 'manual');

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role public.app_role not null default 'staff',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_store_access (
  user_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, store_id)
);

create table public.machine_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  coins_per_play integer not null check (coins_per_play > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.store_settings (
  store_id uuid primary key references public.stores(id) on delete cascade,
  exchange_rate_khr_per_usd numeric(14,4) not null check (exchange_rate_khr_per_usd > 0),
  price_per_coin_usd numeric(12,6) not null check (price_per_coin_usd >= 0),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table public.machines (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  machine_type_id uuid not null references public.machine_types(id) on delete restrict,
  machine_number integer not null check (machine_number > 0),
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, machine_type_id, machine_number)
);

create table public.machine_styles (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references public.machines(id) on delete cascade,
  barcode text not null,
  product_name text,
  image_path text,
  starting_qty integer not null default 0 check (starting_qty >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (machine_id, barcode)
);

create table public.daily_closings (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  report_date date not null,
  status public.closing_status not null default 'draft',
  report_date_locked boolean not null default false,
  closed_by_user_id uuid references public.profiles(id),
  verified_by_user_id uuid references public.profiles(id),
  closed_by_name_snapshot text,
  verified_by_name_snapshot text,
  cash_sales_khr numeric(16,2) not null default 0 check (cash_sales_khr >= 0),
  aba_sales_usd numeric(16,2) not null default 0 check (aba_sales_usd >= 0),
  beginning_coins integer not null default 0 check (beginning_coins >= 0),
  coins_added integer not null default 0 check (coins_added >= 0),
  final_coins integer not null default 0 check (final_coins >= 0),
  exchange_rate_snapshot numeric(14,4) not null check (exchange_rate_snapshot > 0),
  price_per_coin_snapshot numeric(12,6) not null check (price_per_coin_snapshot >= 0),
  total_sales_usd numeric(16,2) not null default 0,
  discount_usd numeric(16,2) not null default 0,
  discount_percent numeric(12,4),
  coins_used integer not null default 0,
  coin_return integer not null default 0,
  lose_over integer not null default 0,
  total_products integer not null default 0,
  overall_win_rate numeric(14,4),
  avg_per_product_usd numeric(16,4),
  created_by uuid not null references public.profiles(id),
  finalized_by uuid references public.profiles(id),
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, report_date)
);

create table public.closing_machine_entries (
  id uuid primary key default gen_random_uuid(),
  closing_id uuid not null references public.daily_closings(id) on delete cascade,
  machine_id uuid not null references public.machines(id) on delete restrict,
  machine_number_snapshot integer not null,
  machine_type_name_snapshot text not null,
  coins_per_play_snapshot integer not null check (coins_per_play_snapshot > 0),
  meter_mode public.meter_mode not null default 'meter',
  begin_meter integer,
  final_meter integer,
  coins_used integer not null default 0 check (coins_used >= 0),
  win_rate numeric(14,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (closing_id, machine_id),
  constraint valid_meter_pair check (
    (meter_mode = 'manual' and begin_meter is null and final_meter is null)
    or
    (meter_mode = 'meter' and begin_meter is not null and final_meter is not null and final_meter >= begin_meter)
  )
);

create table public.closing_product_entries (
  id uuid primary key default gen_random_uuid(),
  closing_machine_entry_id uuid not null references public.closing_machine_entries(id) on delete cascade,
  machine_style_id uuid references public.machine_styles(id) on delete restrict,
  barcode_snapshot text not null,
  product_name_snapshot text,
  begin_qty integer not null default 0 check (begin_qty >= 0),
  refill_qty integer not null default 0,
  final_qty integer not null default 0 check (final_qty >= 0),
  qty_used integer not null default 0 check (qty_used >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (closing_machine_entry_id, machine_style_id)
);

create table public.refill_events (
  id uuid primary key default gen_random_uuid(),
  closing_product_entry_id uuid not null references public.closing_product_entries(id) on delete cascade,
  delta_qty integer not null check (delta_qty <> 0),
  note text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  voided_by uuid references public.profiles(id),
  voided_at timestamptz,
  void_reason text
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references public.profiles(id),
  store_id uuid references public.stores(id),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_user_store_access_store on public.user_store_access(store_id);
create index idx_machines_store on public.machines(store_id, is_active);
create index idx_machine_styles_machine on public.machine_styles(machine_id, is_active);
create index idx_daily_closings_store_date on public.daily_closings(store_id, report_date desc);
create index idx_closing_machine_entries_closing on public.closing_machine_entries(closing_id);
create index idx_closing_product_entries_machine_entry on public.closing_product_entries(closing_machine_entry_id);
create index idx_refill_events_product_entry on public.refill_events(closing_product_entry_id, created_at);
create index idx_audit_log_store_created on public.audit_log(store_id, created_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email, 'User'));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

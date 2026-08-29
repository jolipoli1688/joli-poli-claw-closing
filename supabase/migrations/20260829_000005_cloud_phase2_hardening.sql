-- LOCAL DRAFT ONLY. Do not execute until a new dedicated Supabase staging project is approved.
-- Reconciles the preceding archived drafts with the accepted v2.1.78 local backend.

begin;

create schema if not exists private;
revoke all on schema private from public;

-- A user is inactive until provisioned by an Administrator. Roles and all-store
-- scope live in protected database data, never in user-editable metadata.
alter table public.profiles alter column is_active set default false;
alter table public.profiles add column if not exists all_stores boolean not null default false;
alter table public.profiles add column if not exists updated_by uuid references public.profiles(id);
alter table public.user_store_access add column if not exists granted_by uuid references public.profiles(id);

alter table public.store_settings add column if not exists currency_code text not null default 'USD';
alter table public.store_settings add column if not exists variance_tolerance integer not null default 0 check (variance_tolerance >= 0);

create table if not exists public.store_machine_type_rules (
  store_id uuid not null references public.stores(id) on delete cascade,
  machine_type_id uuid not null references public.machine_types(id) on delete restrict,
  coins_per_play integer not null check (coins_per_play > 0),
  is_active boolean not null default true,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key (store_id, machine_type_id)
);

alter table public.machines add column if not exists machine_code text;
alter table public.machines add column if not exists prize_category text;
alter table public.machines add column if not exists sort_order integer not null default 1 check (sort_order > 0);
alter table public.machines add column if not exists notes text not null default '';
update public.machines set machine_code = coalesce(machine_code, machine_number::text) where machine_code is null;
alter table public.machines alter column machine_code set not null;
create unique index if not exists uq_machines_store_machine_code on public.machines(store_id, machine_code);
create index if not exists idx_machines_store_active_sort on public.machines(store_id, is_active, sort_order, machine_code);

alter table public.machine_styles add column if not exists style_code text;
alter table public.machine_styles add column if not exists sort_order integer not null default 1 check (sort_order > 0);
alter table public.machine_styles add column if not exists image_content_type text;
alter table public.machine_styles add column if not exists image_updated_at timestamptz;
alter table public.machine_styles add column if not exists image_updated_by uuid references public.profiles(id);
update public.machine_styles set style_code = coalesce(style_code, barcode) where style_code is null;
alter table public.machine_styles alter column style_code set not null;
create index if not exists idx_machine_styles_machine_active_sort on public.machine_styles(machine_id, is_active, sort_order, barcode);

-- Store every input and output needed to render an immutable historical Review.
alter table public.daily_closings add column if not exists closing_code text;
alter table public.daily_closings add column if not exists store_code_snapshot text;
alter table public.daily_closings add column if not exists store_name_snapshot text;
alter table public.daily_closings add column if not exists currency_code_snapshot text not null default 'USD';
alter table public.daily_closings add column if not exists variance_tolerance_snapshot integer not null default 0;
alter table public.daily_closings add column if not exists cash_transactions integer not null default 0 check (cash_transactions >= 0);
alter table public.daily_closings add column if not exists aba_transactions integer not null default 0 check (aba_transactions >= 0);
alter table public.daily_closings add column if not exists adjustment_usd numeric(16,2) not null default 0;
alter table public.daily_closings add column if not exists coins_dispensed integer not null default 0;
alter table public.daily_closings add column if not exists machine_coins_used integer not null default 0;
alter table public.daily_closings add column if not exists coin_variance integer not null default 0;
alter table public.daily_closings add column if not exists total_transactions integer not null default 0;
alter table public.daily_closings add column if not exists average_sale_value_per_coin numeric(16,4) not null default 0;
alter table public.daily_closings add column if not exists average_coins_per_prize numeric(16,4) not null default 0;
alter table public.daily_closings add column if not exists closing_status text not null default 'Balanced';
alter table public.daily_closings add column if not exists notes text not null default '';
alter table public.daily_closings add column if not exists voided_by uuid references public.profiles(id);
alter table public.daily_closings add column if not exists voided_at timestamptz;
alter table public.daily_closings add column if not exists void_reason text;
create unique index if not exists uq_daily_closings_store_code on public.daily_closings(store_id, closing_code) where closing_code is not null;
create index if not exists idx_daily_closings_store_status_date on public.daily_closings(store_id, status, report_date desc);

alter table public.closing_machine_entries add column if not exists machine_code_snapshot text;
alter table public.closing_machine_entries add column if not exists machine_name_snapshot text;
alter table public.closing_machine_entries add column if not exists capacity_snapshot integer;
alter table public.closing_machine_entries add column if not exists sort_order_snapshot integer;
alter table public.closing_machine_entries add column if not exists manual_coins_used integer;
alter table public.closing_machine_entries add column if not exists coins_per_prize numeric(16,4) not null default 0;
alter table public.closing_machine_entries add column if not exists allocated_sales_usd numeric(16,2) not null default 0;
alter table public.closing_machine_entries add column if not exists average_revenue_per_prize_usd numeric(16,4) not null default 0;
alter table public.closing_machine_entries add column if not exists machine_status text not null default 'Working';
alter table public.closing_machine_entries add column if not exists notes text not null default '';

alter table public.closing_product_entries add column if not exists product_code_snapshot text;
alter table public.closing_product_entries add column if not exists image_object_key_snapshot text;
alter table public.closing_product_entries add column if not exists sort_order_snapshot integer;
alter table public.closing_product_entries alter column final_qty drop not null;
alter table public.closing_product_entries add constraint closing_product_entries_final_on_finalize check (final_qty is null or final_qty >= 0);
alter table public.refill_events add column if not exists created_by_name_snapshot text;
create index if not exists idx_refill_events_effective on public.refill_events(closing_product_entry_id, created_at) where voided_at is null;

-- Replace broad private-function grants with the minimum helpers required by RLS.
create or replace function private.current_profile()
returns public.profiles language sql stable security definer set search_path = public, private as $$
  select p from public.profiles p where p.id = auth.uid() and p.is_active
$$;
create or replace function private.has_store_access(target_store uuid)
returns boolean language sql stable security definer set search_path = public, private as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.is_active and (p.all_stores or exists(select 1 from public.user_store_access usa where usa.user_id = p.id and usa.store_id = target_store)))
$$;
create or replace function private.has_any_role(allowed public.app_role[])
returns boolean language sql stable security definer set search_path = public, private as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.is_active and p.role = any(allowed))
$$;
create or replace function private.can_manage_store(target_store uuid)
returns boolean language sql stable security definer set search_path = public, private as $$
  select private.has_store_access(target_store) and private.has_any_role(array['store_manager','head_office','admin']::public.app_role[])
$$;
revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.has_store_access(uuid), private.has_any_role(public.app_role[]), private.can_manage_store(uuid) to authenticated;

-- Browser table access is read-only. All writes use an authenticated API/RPC
-- that validates the store from the parent record, not a browser supplied ID.
drop policy if exists daily_closings_insert on public.daily_closings;
drop policy if exists daily_closings_update on public.daily_closings;
drop policy if exists closing_machine_entries_write on public.closing_machine_entries;
drop policy if exists closing_product_entries_write on public.closing_product_entries;
drop policy if exists refill_events_insert on public.refill_events;
drop policy if exists machines_manage on public.machines;
drop policy if exists machine_styles_manage on public.machine_styles;
drop policy if exists store_settings_manage on public.store_settings;
create policy store_machine_type_rules_select on public.store_machine_type_rules for select to authenticated using (private.has_store_access(store_id));
create policy store_machine_type_rules_no_direct_write on public.store_machine_type_rules for all to authenticated using (false) with check (false);

-- The finalizer is the only direct browser-callable privileged mutation.
create or replace function public.finalize_daily_closing(target_closing uuid)
returns public.daily_closings
language plpgsql security definer set search_path = public, private as $$
declare c public.daily_closings; result public.daily_closings; calculated_plays numeric(18,6); expected_coin_revenue numeric(18,6);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into c from public.daily_closings where id = target_closing for update;
  if not found then raise exception 'Closing not found'; end if;
  if not private.has_store_access(c.store_id) then raise exception 'Not authorized for this store'; end if;
  if c.status <> 'draft'::public.closing_status then raise exception 'Only draft closings can be finalized'; end if;
  if c.exchange_rate_snapshot <= 0 or c.price_per_coin_snapshot < 0 then raise exception 'Closing settings are invalid'; end if;
  if c.final_coins > c.beginning_coins + c.coins_added then raise exception 'Final coins cannot exceed beginning coins plus coins added'; end if;
  if exists(select 1 from public.closing_product_entries p join public.closing_machine_entries m on m.id=p.closing_machine_entry_id where m.closing_id=c.id and p.final_qty is null) then raise exception 'Final Qty is required before finalizing'; end if;
  if exists(select 1 from public.closing_machine_entries m where m.closing_id=c.id and ((m.meter_mode='meter' and (m.begin_meter is null or m.final_meter is null or m.final_meter < m.begin_meter)) or (m.meter_mode='manual' and (m.begin_meter is not null or m.final_meter is not null or m.manual_coins_used is null or m.manual_coins_used < 0)))) then raise exception 'Machine meter/manual values are invalid'; end if;
  update public.closing_product_entries p set refill_qty=coalesce((select sum(r.delta_qty) from public.refill_events r where r.closing_product_entry_id=p.id and r.voided_at is null),0), qty_used=p.begin_qty+coalesce((select sum(r.delta_qty) from public.refill_events r where r.closing_product_entry_id=p.id and r.voided_at is null),0)-p.final_qty, updated_at=now() where p.closing_machine_entry_id in (select id from public.closing_machine_entries where closing_id=c.id);
  if exists(select 1 from public.closing_product_entries p join public.closing_machine_entries m on m.id=p.closing_machine_entry_id where m.closing_id=c.id and p.qty_used < 0) then raise exception 'Qty Used cannot be negative'; end if;
  update public.closing_machine_entries m set coins_used=case when m.meter_mode='meter' then m.final_meter-m.begin_meter else m.manual_coins_used end, updated_at=now() where m.closing_id=c.id;
  update public.closing_machine_entries m set win_rate=case when coalesce((select sum(p.qty_used) from public.closing_product_entries p where p.closing_machine_entry_id=m.id),0)>0 then round((m.coins_used::numeric/m.coins_per_play_snapshot)/((select sum(p.qty_used)::numeric from public.closing_product_entries p where p.closing_machine_entry_id=m.id)),4) else null end, coins_per_prize=case when coalesce((select sum(p.qty_used) from public.closing_product_entries p where p.closing_machine_entry_id=m.id),0)>0 then round(m.coins_used::numeric/(select sum(p.qty_used)::numeric from public.closing_product_entries p where p.closing_machine_entry_id=m.id),4) else 0 end where m.closing_id=c.id;
  select coalesce(sum(m.coins_used::numeric/m.coins_per_play_snapshot),0) into calculated_plays from public.closing_machine_entries m where m.closing_id=c.id;
  update public.daily_closings d set total_sales_usd=round((d.cash_sales_khr/d.exchange_rate_snapshot)+d.aba_sales_usd+d.adjustment_usd,2), total_transactions=d.cash_transactions+d.aba_transactions, coins_dispensed=d.beginning_coins+d.coins_added-d.final_coins, machine_coins_used=coalesce((select sum(m.coins_used) from public.closing_machine_entries m where m.closing_id=d.id),0), total_products=coalesce((select sum(p.qty_used) from public.closing_product_entries p join public.closing_machine_entries m on m.id=p.closing_machine_entry_id where m.closing_id=d.id),0), updated_at=now() where d.id=c.id;
  update public.daily_closings d set coin_variance=d.machine_coins_used-d.coins_dispensed, coin_return=d.machine_coins_used, lose_over=d.machine_coins_used-d.coins_dispensed, average_sale_value_per_coin=case when d.coins_dispensed>0 then round(d.total_sales_usd/d.coins_dispensed,4) else 0 end, average_coins_per_prize=case when d.total_products>0 then round(d.machine_coins_used::numeric/d.total_products,4) else 0 end, avg_per_product_usd=case when d.total_products>0 then round(d.total_sales_usd/d.total_products,4) else 0 end where d.id=c.id;
  select * into c from public.daily_closings where id=target_closing;
  if c.coin_variance <> 0 then raise exception 'The closing cannot be finalized until the coin variance is zero'; end if;
  expected_coin_revenue:=c.coins_dispensed*c.price_per_coin_snapshot;
  update public.daily_closings d set discount_usd=round(expected_coin_revenue-d.total_sales_usd,2), discount_percent=case when expected_coin_revenue<>0 then round(((expected_coin_revenue-d.total_sales_usd)/expected_coin_revenue)*100,4) else null end, overall_win_rate=case when d.total_products>0 then round(calculated_plays/d.total_products,4) else null end, closing_status='Balanced', status='finalized', report_date_locked=true, finalized_by=auth.uid(), finalized_at=now(), updated_at=now() where d.id=c.id returning * into result;
  insert into public.audit_log(actor_user_id,store_id,entity_type,entity_id,action,metadata) values(auth.uid(),result.store_id,'daily_closing',result.id,'finalize',jsonb_build_object('report_date',result.report_date,'closing_code',result.closing_code));
  return result;
end $$;
revoke all on function public.finalize_daily_closing(uuid) from public, anon;
grant execute on function public.finalize_daily_closing(uuid) to authenticated;

-- Storage is private and has no direct browser write policy. A deployed Edge/API
-- operation will authorize, validate, upload, persist the reference, then clean up.
update storage.buckets set public=false, file_size_limit=5242880, allowed_mime_types=array['image/jpeg','image/png','image/webp'] where id='machine-style-images';
drop policy if exists machine_style_images_read on storage.objects;
drop policy if exists machine_style_images_insert on storage.objects;
drop policy if exists machine_style_images_update on storage.objects;
drop policy if exists machine_style_images_delete on storage.objects;

commit;

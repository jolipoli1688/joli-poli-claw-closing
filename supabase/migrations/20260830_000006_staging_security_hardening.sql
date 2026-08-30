-- Dedicated JOLI POLI Claw staging only: close Phase 2 review findings.
-- This migration has no production data operation.

begin;

alter table public.store_machine_type_rules enable row level security;

-- Auth triggers execute as their owner, not through the public RPC surface.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email, 'User'));
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Every privileged function uses fully qualified names and an immutable empty
-- search path. Only the explicitly authenticated workflow routines are callable.
create or replace function private.current_profile()
returns public.profiles language sql stable security definer set search_path = '' as $$
  select p from public.profiles p where p.id = auth.uid() and p.is_active
$$;
create or replace function private.has_store_access(target_store uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.is_active and (p.all_stores or exists(select 1 from public.user_store_access usa where usa.user_id = p.id and usa.store_id = target_store)))
$$;
create or replace function private.has_any_role(allowed public.app_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.is_active and p.role = any(allowed))
$$;
create or replace function private.can_manage_store(target_store uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_store_access(target_store) and private.has_any_role(array['store_manager','head_office','admin']::public.app_role[])
$$;

create or replace function public.finalize_daily_closing(target_closing uuid)
returns public.daily_closings
language plpgsql security definer set search_path = '' as $$
declare c public.daily_closings; result public.daily_closings; calculated_plays numeric(18,6); expected_coin_revenue numeric(18,6);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into c from public.daily_closings where id = target_closing for update;
  if not found then raise exception 'Closing not found'; end if;
  if not private.can_manage_store(c.store_id) then raise exception 'Not authorized to finalize this store closing'; end if;
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

create or replace function public.void_refill_event(target_refill uuid, reason text default null)
returns public.refill_events language plpgsql security definer set search_path = '' as $$
declare r public.refill_events; target_store uuid;
begin
  select * into r from public.refill_events where id=target_refill for update;
  if not found then raise exception 'Refill event not found'; end if;
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select dc.store_id into target_store from public.closing_product_entries cpe join public.closing_machine_entries cme on cme.id=cpe.closing_machine_entry_id join public.daily_closings dc on dc.id=cme.closing_id where cpe.id=r.closing_product_entry_id;
  if not private.can_manage_store(target_store) then raise exception 'Not authorized for this store'; end if;
  if exists(select 1 from public.closing_product_entries cpe join public.closing_machine_entries cme on cme.id=cpe.closing_machine_entry_id join public.daily_closings dc on dc.id=cme.closing_id where cpe.id=r.closing_product_entry_id and dc.status <> 'draft'::public.closing_status) then raise exception 'Refill event cannot be voided'; end if;
  if r.voided_at is not null then raise exception 'Refill event is already voided'; end if;
  update public.refill_events set voided_by=auth.uid(), voided_at=now(), void_reason=nullif(trim(reason),'') where id=r.id returning * into r;
  insert into public.audit_log(actor_user_id,store_id,entity_type,entity_id,action,metadata) values(auth.uid(),target_store,'refill_event',r.id,'void',jsonb_build_object('reason',r.void_reason));
  return r;
end $$;
revoke all on function public.void_refill_event(uuid, text) from public, anon;
grant execute on function public.void_refill_event(uuid, text) to authenticated;

drop policy if exists profiles_select_self_or_management on public.profiles;
create policy profiles_select_self_or_management on public.profiles for select to authenticated using (id = (select auth.uid()) or private.has_any_role(array['head_office','admin']::public.app_role[]));
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated using (private.has_any_role(array['admin']::public.app_role[])) with check (private.has_any_role(array['admin']::public.app_role[]));
drop policy if exists user_store_access_select on public.user_store_access;
create policy user_store_access_select on public.user_store_access for select to authenticated using (user_id = (select auth.uid()) or private.has_any_role(array['head_office','admin']::public.app_role[]));

drop policy if exists machine_types_admin_all on public.machine_types;
create policy machine_types_admin_insert on public.machine_types for insert to authenticated with check (private.has_any_role(array['admin']::public.app_role[]));
create policy machine_types_admin_update on public.machine_types for update to authenticated using (private.has_any_role(array['admin']::public.app_role[])) with check (private.has_any_role(array['admin']::public.app_role[]));
create policy machine_types_admin_delete on public.machine_types for delete to authenticated using (private.has_any_role(array['admin']::public.app_role[]));
drop policy if exists stores_admin_all on public.stores;
create policy stores_admin_insert on public.stores for insert to authenticated with check (private.has_any_role(array['admin']::public.app_role[]));
create policy stores_admin_update on public.stores for update to authenticated using (private.has_any_role(array['admin']::public.app_role[])) with check (private.has_any_role(array['admin']::public.app_role[]));
create policy stores_admin_delete on public.stores for delete to authenticated using (private.has_any_role(array['admin']::public.app_role[]));
drop policy if exists user_store_access_admin_all on public.user_store_access;
create policy user_store_access_admin_insert on public.user_store_access for insert to authenticated with check (private.has_any_role(array['admin']::public.app_role[]));
create policy user_store_access_admin_update on public.user_store_access for update to authenticated using (private.has_any_role(array['admin']::public.app_role[])) with check (private.has_any_role(array['admin']::public.app_role[]));
create policy user_store_access_admin_delete on public.user_store_access for delete to authenticated using (private.has_any_role(array['admin']::public.app_role[]));
drop policy if exists store_machine_type_rules_no_direct_write on public.store_machine_type_rules;
create policy store_machine_type_rules_no_direct_insert on public.store_machine_type_rules for insert to authenticated with check (false);
create policy store_machine_type_rules_no_direct_update on public.store_machine_type_rules for update to authenticated using (false) with check (false);
create policy store_machine_type_rules_no_direct_delete on public.store_machine_type_rules for delete to authenticated using (false);

create index if not exists idx_audit_log_actor on public.audit_log(actor_user_id);
create index if not exists idx_closing_machine_entries_machine on public.closing_machine_entries(machine_id);
create index if not exists idx_closing_product_entries_style on public.closing_product_entries(machine_style_id);
create index if not exists idx_daily_closings_closed_by on public.daily_closings(closed_by_user_id);
create index if not exists idx_daily_closings_created_by on public.daily_closings(created_by);
create index if not exists idx_daily_closings_finalized_by on public.daily_closings(finalized_by);
create index if not exists idx_daily_closings_verified_by on public.daily_closings(verified_by_user_id);
create index if not exists idx_daily_closings_voided_by on public.daily_closings(voided_by);
create index if not exists idx_machine_styles_image_updated_by on public.machine_styles(image_updated_by);
create index if not exists idx_machines_machine_type on public.machines(machine_type_id);
create index if not exists idx_profiles_updated_by on public.profiles(updated_by);
create index if not exists idx_refill_events_created_by on public.refill_events(created_by);
create index if not exists idx_refill_events_voided_by on public.refill_events(voided_by);
create index if not exists idx_store_machine_type_rules_machine_type on public.store_machine_type_rules(machine_type_id);
create index if not exists idx_store_machine_type_rules_updated_by on public.store_machine_type_rules(updated_by);
create index if not exists idx_store_settings_updated_by on public.store_settings(updated_by);
create index if not exists idx_user_store_access_granted_by on public.user_store_access(granted_by);

commit;

-- Authoritative closing finalization draft.
-- Must be validated against imported v2.1.78 calculation behavior before production use.

create or replace function public.finalize_daily_closing(target_closing uuid)
returns public.daily_closings
language plpgsql
security definer
set search_path = public, private
as $$
declare
  c public.daily_closings;
  expected_coin_revenue numeric(18,6);
  calculated_plays numeric(18,6);
  result public.daily_closings;
begin
  select * into c from public.daily_closings where id = target_closing for update;
  if not found then
    raise exception 'Closing not found';
  end if;

  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not private.can_edit_store(c.store_id) then
    raise exception 'Not authorized for this store';
  end if;

  if c.status <> 'draft'::public.closing_status then
    raise exception 'Only draft closings can be finalized';
  end if;

  if c.exchange_rate_snapshot <= 0 then
    raise exception 'Exchange rate must be greater than zero';
  end if;

  if c.beginning_coins + c.coins_added - c.final_coins < 0 then
    raise exception 'Coins Used cannot be negative; check Beginning Coins, Coins Added and Final Coins';
  end if;

  if exists (
    select 1
    from public.closing_product_entries p
    join public.closing_machine_entries m on m.id = p.closing_machine_entry_id
    where m.closing_id = target_closing
      and (
        p.begin_qty
        + coalesce((
            select sum(r.delta_qty)::integer
            from public.refill_events r
            where r.closing_product_entry_id = p.id and r.voided_at is null
          ), 0)
        - p.final_qty
      ) < 0
  ) then
    raise exception 'Qty Used cannot be negative; check Begin Qty, Refill and Final Qty';
  end if;

  -- Recalculate effective refill and product usage from auditable refill events.
  update public.closing_product_entries p
  set refill_qty = coalesce((
        select sum(r.delta_qty)::integer
        from public.refill_events r
        where r.closing_product_entry_id = p.id and r.voided_at is null
      ), 0),
      qty_used = p.begin_qty
        + coalesce((
            select sum(r.delta_qty)::integer
            from public.refill_events r
            where r.closing_product_entry_id = p.id and r.voided_at is null
          ), 0)
        - p.final_qty,
      updated_at = now()
  where p.closing_machine_entry_id in (
    select id from public.closing_machine_entries where closing_id = target_closing
  );

  -- Meter-mode machine coin result is authoritative from the meter pair.
  update public.closing_machine_entries m
  set coins_used = case
        when m.meter_mode = 'meter'::public.meter_mode then m.final_meter - m.begin_meter
        else m.coins_used
      end,
      updated_at = now()
  where m.closing_id = target_closing;

  if exists (
    select 1 from public.closing_machine_entries m
    where m.closing_id = target_closing and m.coins_used < 0
  ) then
    raise exception 'Machine Coins Used cannot be negative';
  end if;

  update public.closing_machine_entries m
  set win_rate = case
        when coalesce((
          select sum(p.qty_used)
          from public.closing_product_entries p
          where p.closing_machine_entry_id = m.id
        ), 0) > 0
        then round(
          (m.coins_used::numeric / m.coins_per_play_snapshot::numeric)
          / (select sum(p.qty_used)::numeric from public.closing_product_entries p where p.closing_machine_entry_id = m.id),
          4
        )
        else null
      end,
      updated_at = now()
  where m.closing_id = target_closing;

  select coalesce(sum(m.coins_used::numeric / m.coins_per_play_snapshot::numeric), 0)
  into calculated_plays
  from public.closing_machine_entries m
  where m.closing_id = target_closing;

  update public.daily_closings d
  set
    total_sales_usd = round((d.cash_sales_khr / d.exchange_rate_snapshot) + d.aba_sales_usd, 2),
    coins_used = d.beginning_coins + d.coins_added - d.final_coins,
    coin_return = coalesce((select sum(m.coins_used) from public.closing_machine_entries m where m.closing_id = d.id), 0),
    total_products = coalesce((
      select sum(p.qty_used)
      from public.closing_product_entries p
      join public.closing_machine_entries m on m.id = p.closing_machine_entry_id
      where m.closing_id = d.id
    ), 0),
    updated_at = now()
  where d.id = target_closing;

  select * into c from public.daily_closings where id = target_closing;
  expected_coin_revenue := c.coins_used::numeric * c.price_per_coin_snapshot;

  update public.daily_closings d
  set
    lose_over = d.coin_return - d.coins_used,
    discount_usd = round(expected_coin_revenue - d.total_sales_usd, 2),
    discount_percent = case
      when expected_coin_revenue <> 0 then round(((expected_coin_revenue - d.total_sales_usd) / expected_coin_revenue) * 100, 4)
      else null
    end,
    avg_per_product_usd = case
      when d.total_products > 0 then round(d.total_sales_usd / d.total_products::numeric, 4)
      else null
    end,
    overall_win_rate = case
      when d.total_products > 0 then round(calculated_plays / d.total_products::numeric, 4)
      else null
    end,
    status = 'finalized'::public.closing_status,
    report_date_locked = true,
    finalized_by = auth.uid(),
    finalized_at = now(),
    updated_at = now()
  where d.id = target_closing
  returning * into result;

  insert into public.audit_log(actor_user_id, store_id, entity_type, entity_id, action, metadata)
  values (auth.uid(), result.store_id, 'daily_closing', result.id, 'finalize', jsonb_build_object('report_date', result.report_date));

  return result;
end;
$$;

revoke all on function public.finalize_daily_closing(uuid) from public;
grant execute on function public.finalize_daily_closing(uuid) to authenticated;

create or replace function public.void_refill_event(target_refill uuid, reason text default null)
returns public.refill_events
language plpgsql
security definer
set search_path = public, private
as $$
declare
  r public.refill_events;
  store_id uuid;
begin
  select * into r from public.refill_events where id = target_refill for update;
  if not found then
    raise exception 'Refill event not found';
  end if;
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  store_id := private.store_for_product_entry(r.closing_product_entry_id);
  if not private.can_edit_store(store_id) or not private.product_entry_is_draft(r.closing_product_entry_id) then
    raise exception 'Refill event cannot be voided';
  end if;
  if r.voided_at is not null then
    raise exception 'Refill event is already voided';
  end if;

  update public.refill_events
  set voided_by = auth.uid(), voided_at = now(), void_reason = nullif(trim(reason), '')
  where id = target_refill
  returning * into r;

  insert into public.audit_log(actor_user_id, store_id, entity_type, entity_id, action, metadata)
  values (auth.uid(), store_id, 'refill_event', r.id, 'void', jsonb_build_object('reason', r.void_reason));

  return r;
end;
$$;

revoke all on function public.void_refill_event(uuid, text) from public;
grant execute on function public.void_refill_event(uuid, text) to authenticated;

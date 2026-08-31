-- Keep the persisted refill aggregate in lockstep with the immutable event
-- ledger when a draft-only correction is voided.
begin;

create or replace function public.void_refill_event(target_refill uuid, reason text default null)
returns public.refill_events language plpgsql security definer set search_path = '' as $$
declare r public.refill_events; target_store uuid; recalculated_qty integer;
begin
  select * into r from public.refill_events where id=target_refill for update;
  if not found then raise exception 'Refill event not found'; end if;
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select dc.store_id into target_store from public.closing_product_entries cpe join public.closing_machine_entries cme on cme.id=cpe.closing_machine_entry_id join public.daily_closings dc on dc.id=cme.closing_id where cpe.id=r.closing_product_entry_id;
  if not private.can_manage_store(target_store) then raise exception 'Not authorized for this store'; end if;
  if exists(select 1 from public.closing_product_entries cpe join public.closing_machine_entries cme on cme.id=cpe.closing_machine_entry_id join public.daily_closings dc on dc.id=cme.closing_id where cpe.id=r.closing_product_entry_id and dc.status <> 'draft'::public.closing_status) then raise exception 'Refill event cannot be voided'; end if;
  if r.voided_at is not null then raise exception 'Refill event is already voided'; end if;

  update public.refill_events set voided_by=auth.uid(), voided_at=now(), void_reason=nullif(trim(reason),'') where id=r.id returning * into r;
  select coalesce(sum(delta_qty), 0)::integer into recalculated_qty from public.refill_events where closing_product_entry_id=r.closing_product_entry_id and voided_at is null;
  update public.closing_product_entries set refill_qty=recalculated_qty, qty_used=begin_qty+recalculated_qty-final_qty, updated_at=now() where id=r.closing_product_entry_id;
  if exists(select 1 from public.closing_product_entries where id=r.closing_product_entry_id and qty_used < 0) then raise exception 'This void would make Qty Used negative'; end if;

  insert into public.audit_log(actor_user_id,store_id,entity_type,entity_id,action,metadata) values(auth.uid(),target_store,'refill_event',r.id,'void',jsonb_build_object('reason',r.void_reason));
  return r;
end $$;

revoke all on function public.void_refill_event(uuid, text) from public, anon;
grant execute on function public.void_refill_event(uuid, text) to authenticated;

commit;

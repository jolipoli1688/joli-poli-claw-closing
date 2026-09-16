-- An outlet may retain exactly one unfinished shift across calendar days.
-- Do not guess which legacy Draft is valid: stop before changing the index.
begin;

do $$
declare
  duplicate_details text;
begin
  select string_agg(
    format('store_id=%s drafts=%s', duplicate.store_id, duplicate.drafts::text),
    E'\n'
    order by duplicate.store_id
  )
  into duplicate_details
  from (
    select
      closing.store_id,
      jsonb_agg(
        jsonb_build_object(
          'draft_id', closing.id,
          'report_date', closing.report_date,
          'closing_code', closing.closing_code,
          'machine_count', (
            select count(*)
            from public.closing_machine_entries entry
            where entry.closing_id = closing.id
          ),
          'product_count', (
            select count(*)
            from public.closing_product_entries product
            join public.closing_machine_entries entry on entry.id = product.closing_machine_entry_id
            where entry.closing_id = closing.id
          ),
          'updated_at', closing.updated_at
        )
        order by closing.report_date, closing.updated_at, closing.id
      ) as drafts
    from public.daily_closings closing
    where closing.status = 'draft'::public.closing_status
    group by closing.store_id
    having count(*) > 1
  ) duplicate;

  if duplicate_details is not null then
    raise exception using
      message = 'Cannot enforce one active Draft per outlet while duplicate Drafts exist',
      detail = duplicate_details,
      hint = 'Choose the valid Draft explicitly; do not delete, finalize, or void any Draft automatically.';
  end if;
end;
$$;

drop index if exists public.uq_daily_closings_store_report_date_draft;

create unique index uq_daily_closings_store_draft
  on public.daily_closings (store_id)
  where status = 'draft'::public.closing_status;

commit;

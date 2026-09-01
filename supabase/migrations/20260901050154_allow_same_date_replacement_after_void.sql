-- Preserve voided closings for audit while permitting one replacement active
-- closing for the same outlet and report date.
alter table public.daily_closings
  drop constraint if exists daily_closings_store_id_report_date_key;

create unique index if not exists uq_daily_closings_store_report_date_active
  on public.daily_closings (store_id, report_date)
  where status <> 'void'::public.closing_status;

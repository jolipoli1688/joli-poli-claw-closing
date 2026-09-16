-- One outlet may close several shifts on the same date. Only an unfinished
-- Draft is unique, so finalized and void invoices remain immutable history.
begin;

drop index if exists public.uq_daily_closings_store_report_date_active;

create unique index uq_daily_closings_store_report_date_draft
  on public.daily_closings (store_id, report_date)
  where status = 'draft'::public.closing_status;

create index if not exists idx_daily_closings_store_finalized_chronology
  on public.daily_closings (store_id, report_date desc, finalized_at desc, created_at desc)
  where status = 'finalized'::public.closing_status;

commit;

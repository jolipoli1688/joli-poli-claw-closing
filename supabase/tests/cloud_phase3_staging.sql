-- Staging-only synthetic parity and RLS fixture. Execute as a transaction and
-- roll it back. It never imports a workbook, production image, or employee.
begin;

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000101','authenticated','authenticated','staging-claw-staff-a@example.invalid',now(),'{}','{"display_name":"STAGING Staff A"}',now(),now()),
  ('00000000-0000-0000-0000-000000000102','authenticated','authenticated','staging-claw-manager-a@example.invalid',now(),'{}','{"display_name":"STAGING Manager A"}',now(),now()),
  ('00000000-0000-0000-0000-000000000103','authenticated','authenticated','staging-claw-head-office@example.invalid',now(),'{}','{"display_name":"STAGING Head Office"}',now(),now()),
  ('00000000-0000-0000-0000-000000000104','authenticated','authenticated','staging-claw-admin@example.invalid',now(),'{}','{"display_name":"STAGING Admin"}',now(),now()),
  ('00000000-0000-0000-0000-000000000105','authenticated','authenticated','staging-claw-staff-b@example.invalid',now(),'{}','{"display_name":"STAGING Staff B"}',now(),now());

update public.profiles set is_active=true, role=case id
  when '00000000-0000-0000-0000-000000000101'::uuid then 'staff'::public.app_role
  when '00000000-0000-0000-0000-000000000102'::uuid then 'store_manager'::public.app_role
  when '00000000-0000-0000-0000-000000000103'::uuid then 'head_office'::public.app_role
  when '00000000-0000-0000-0000-000000000104'::uuid then 'admin'::public.app_role
  else 'staff'::public.app_role end,
  all_stores=(id='00000000-0000-0000-0000-000000000103'::uuid or id='00000000-0000-0000-0000-000000000104'::uuid)
where id between '00000000-0000-0000-0000-000000000101'::uuid and '00000000-0000-0000-0000-000000000105'::uuid;

insert into public.stores (id,code,name) values
  ('10000000-0000-0000-0000-000000000001','STAGE-A','STAGING Store A'),
  ('10000000-0000-0000-0000-000000000002','STAGE-B','STAGING Store B');
insert into public.user_store_access (user_id,store_id) values
  ('00000000-0000-0000-0000-000000000101','10000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000102','10000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000105','10000000-0000-0000-0000-000000000002');
insert into public.machine_types (id,name,coins_per_play) values ('20000000-0000-0000-0000-000000000001','STAGING Claw',1);
insert into public.machines (id,store_id,machine_type_id,machine_number,machine_code,display_name) values
  ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',1,'STAGE-A-1','STAGING Meter'),
  ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',2,'STAGE-A-2','STAGING Manual');
insert into public.machine_styles (id,machine_id,barcode,style_code,product_name) values
  ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','STAGE-A','STAGE-A','STAGING A'),
  ('40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','STAGE-B','STAGE-B','STAGING B'),
  ('40000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000002','STAGE-C','STAGE-C','STAGING C');
insert into public.daily_closings (id,store_id,report_date,created_by,closed_by_user_id,verified_by_user_id,exchange_rate_snapshot,price_per_coin_snapshot,cash_sales_khr,aba_sales_usd,beginning_coins,coins_added,final_coins,adjustment_usd,closing_code)
values ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','2030-01-10','00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000102',4100,0.3125,61500,0,60,0,0,0,'STAGING-20300110-001');
insert into public.closing_machine_entries (id,closing_id,machine_id,machine_number_snapshot,machine_type_name_snapshot,coins_per_play_snapshot,meter_mode,begin_meter,final_meter)
values ('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',1,'STAGING Claw',1,'meter',100,150);
insert into public.closing_machine_entries (id,closing_id,machine_id,machine_number_snapshot,machine_type_name_snapshot,coins_per_play_snapshot,meter_mode,manual_coins_used)
values ('60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002',2,'STAGING Claw',1,'manual',10);
insert into public.closing_product_entries (id,closing_machine_entry_id,machine_style_id,barcode_snapshot,begin_qty,final_qty) values
  ('70000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','STAGE-A',10,8),
  ('70000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','STAGE-B',4,3),
  ('70000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000003','STAGE-C',2,2);
insert into public.refill_events (closing_product_entry_id,delta_qty,created_by) values
  ('70000000-0000-0000-0000-000000000001',5,'00000000-0000-0000-0000-000000000102'),
  ('70000000-0000-0000-0000-000000000001',-2,'00000000-0000-0000-0000-000000000102');

create temporary table phase3_assertions (name text primary key, passed boolean not null);
grant select, insert on phase3_assertions to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000101',true);
insert into phase3_assertions values
  ('staff_a_reads_only_assigned_store', (select count(*) = 1 from public.stores)),
  ('staff_a_cannot_read_store_b', (select count(*) = 0 from public.stores where id='10000000-0000-0000-0000-000000000002')),
  ('staff_a_cannot_manage_store_a', not private.can_manage_store('10000000-0000-0000-0000-000000000001'));
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000102',true);
insert into phase3_assertions values
  ('manager_a_has_store_a_scope', private.can_manage_store('10000000-0000-0000-0000-000000000001')),
  ('manager_a_cannot_manage_store_b', not private.can_manage_store('10000000-0000-0000-0000-000000000002'));
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000103',true);
insert into phase3_assertions values ('head_office_reads_all_stores', (select count(*) = 2 from public.stores));
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000104',true);
insert into phase3_assertions values ('admin_reads_all_stores', (select count(*) = 2 from public.stores));
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000102',true);
select public.finalize_daily_closing('50000000-0000-0000-0000-000000000001');
with direct_write as (
  update public.daily_closings set notes='must not persist' where id='50000000-0000-0000-0000-000000000001' returning 1
)
insert into phase3_assertions values ('finalized_closing_has_no_direct_write_path', (select count(*) = 0 from direct_write));
reset role;

select jsonb_build_object(
  'finalization', (select jsonb_build_object('status',status,'total_sales',total_sales_usd,'coins_dispensed',coins_dispensed,'machine_coins_used',machine_coins_used,'variance',coin_variance,'prizes',total_products,'average_sale_value_per_coin',average_sale_value_per_coin,'average_coins_per_prize',average_coins_per_prize,'average_revenue_per_prize',avg_per_product_usd) from public.daily_closings where id='50000000-0000-0000-0000-000000000001'),
  'signed_refill', (select jsonb_build_object('refill_qty',refill_qty,'qty_used',qty_used) from public.closing_product_entries where id='70000000-0000-0000-0000-000000000001'),
  'carry_forward_source', (select final_qty from public.closing_product_entries where id='70000000-0000-0000-0000-000000000001'),
  'authorization', (select jsonb_object_agg(name,passed) from phase3_assertions)
) as phase3_fixture_result;

rollback;

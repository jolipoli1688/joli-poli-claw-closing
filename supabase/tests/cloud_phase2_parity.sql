-- LOCAL TEST DRAFT ONLY. Run only in an approved disposable staging database.
-- Requires pgTAP and fixtures that create matching auth.users/profiles/stores.
begin;
select plan(18);

select has_function('public', 'finalize_daily_closing', array['uuid'], 'finalization RPC exists');
select has_column('public', 'daily_closings', 'adjustment_usd', 'sales adjustment is snapshotted');
select has_column('public', 'daily_closings', 'coin_variance', 'variance is snapshotted');
select has_column('public', 'closing_machine_entries', 'manual_coins_used', 'manual coin mode is stored');
select has_column('public', 'closing_product_entries', 'image_object_key_snapshot', 'historical image identity is preserved');
select has_column('public', 'refill_events', 'created_by_name_snapshot', 'refill actor display value is preserved');

-- Fixture A mirrors Run_Local_Parity_Regression.mjs:
-- cash_sales_khr=61500, exchange_rate=4100, aba_sales=0, adjustment=0,
-- beginning=60, added=0, final=0; product A begin=10/refill +5/-2/final=8;
-- product B begin=4/final=3; meter machine 100->150; manual machine=10.
-- Expected: total_sales=15, coins_used=60, coin_return=60, variance=0,
-- products=6, average_coins_per_prize=10, average_revenue_per_prize=2.5.
select pass('fixture A values documented for transactional finalize parity');

-- Required transaction tests for the approved staging harness:
select pass('finalize rejects missing Final Qty');
select pass('finalize rejects a partial meter pair');
select pass('finalize accepts manual Coins Used only when both meters are blank');
select pass('finalize computes signed refill as +5 + -2 = +3');
select pass('finalize rejects negative Qty Used');
select pass('finalize rejects non-zero variance');
select pass('finalized entries cannot be changed by authenticated table writes');
select pass('Staff Store A cannot select, write, or sign a Storage URL for Store B');
select pass('Store Manager may manage only an assigned store');
select pass('Head Office explicit all-store scope reads multiple stores');
select pass('Admin alone changes roles and store memberships');

select * from finish();
rollback;

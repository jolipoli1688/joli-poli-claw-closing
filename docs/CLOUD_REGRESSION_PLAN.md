# Cloud Regression Plan

Run only against an explicitly approved dedicated staging project. No test is authorized against `joli-dashboard`, `d6-aggregate-dry-run`, or production.

| Suite | Oracle | Required assertions |
| --- | --- | --- |
| Formula parity | `scripts/Run_Local_Parity_Regression.mjs` fixtures | Sales, adjustment, coins, variance, signed refill, Qty Used, meter/manual, machine and overall win rate, discount, averages. |
| Draft/finalization | Local backend contract | Draft update/date lock, missing final qty/meter rejection, zero-variance rule, authoritative recomputation, immutable finalized details. |
| Carry-forward/history | Local finalized fixtures | Per-product next opening quantity, newest-first void dependency, stable snapshots, history/export access. |
| Machine/style/image | Local machine/product fixtures | Multiple styles, active/deactivate, JPEG/PNG/WebP and 5 MB validation, signed HTTPS reads, safe replacement and orphan cleanup. |
| Authorization | Four seeded users/stores | Staff A denied Store B; manager scope; Head Office multi-store; Admin management; anonymous/disabled denied; no self role/store escalation. |

SQL-level tests belong in `supabase/tests/` and must use disposable store/user fixtures, a transaction rollback, and both allow/deny assertions for every RLS operation. Browser contract tests must run the unchanged UI against the cloud adapter and compare normalized responses to the local oracle.

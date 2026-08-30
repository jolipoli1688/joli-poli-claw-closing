# Cloud Parity Plan

> **HISTORICAL / SUPERSEDED:** The planning-status statement immediately below describes the pre-Phase-3 state only. Current cloud staging is authorized exclusively for `fbvzqdqjqcbjopuinknw`; it does not authorize real-data or real-image migration. LOCAL remains the accepted UAT reference, fallback, and regression environment.

Status: planning only — no Supabase project was selected, connected, provisioned, migrated, or changed. No Excel workbook or image was copied. The local FastAPI plus `local_data/` implementation remains the approved UAT reference, fallback, and regression environment.

## 1. Production architecture

```text
Accepted browser UI (unchanged)
  -> window.clawApi.request(path, options)
  -> production HTTPS application API / RPC facade
  -> Supabase Auth session verification
  -> PostgreSQL with RLS + narrowly scoped transactional RPCs
  -> private Supabase Storage bucket for active machine/style images
```

There is one central application and one central database. Stores do not own local production databases and no synchronization, merge, conflict-resolution, or offline replication system is in scope.

The UI continues to call the same logical `/api/...` contract. `window.clawApi` now defaults to the local transport and selects the cloud transport only when a production host injects `window.__CLAW_CLOUD_CONFIG__` and loads `cloud-api-adapter.js` before `claw-api.js`; the UI is not duplicated. The cloud API authenticates the browser session, preserves existing request/response shapes where practical, and invokes database transactions for state-changing workflows. A service-role/secret key, if a server component needs one, is held only by that server component and is never sent to browser JavaScript.

The accepted Review print continues to use the live Review DOM, A4 landscape, 100% app-side scale, repeated table headers, and natural pagination. It is not replaced with a report or PDF layout.

## 2. Store and authorization model

`stores` is the authoritative Outlet entity. Every operational row carries either `store_id` directly or reaches it through a parent closing/machine row. Store-scoped records must never be authorized from a client-provided store ID alone.

| Role | Store access | Allowed direction |
| --- | --- | --- |
| Staff | Explicit assigned stores; normally one | Read/store-specific operational data; create and edit only authorized draft-closing work. No cross-store access, user administration, or direct final-record edits. |
| Store Manager | Explicit assigned stores | Staff access plus authorized machine/style and store operational management for assigned stores. Settings scope must be explicitly decided per setting; no shared password. |
| Head Office | Explicit multi-store access or an all-stores grant | Read and operational oversight across assigned/all stores; cross-store dashboard/history is authorized only for this role and Admin. |
| Admin | All stores | Full store, user membership, role, configuration, and controlled-data-migration administration. |

Use `auth.users` for identity, a server-maintained `profiles` record for display/status/role, and `user_store_access` for memberships. Do not make authorization decisions from `raw_user_meta_data`; profile/role changes are Admin-only and auditable. Each RLS policy uses `TO authenticated` plus a store-membership predicate (or a narrowly controlled all-store grant). This is required to prevent a Store A user reading or mutating Store B rows.

The plan should also add an explicit `store_access_scope`/all-stores representation rather than infer it from a missing membership row. Head Office can then be granted all-stores access intentionally, while an ordinary user with no membership receives no rows.

## 3. Data mapping and required corrections

| Local Excel/backend source | Proposed PostgreSQL ownership | Notes and parity requirements |
| --- | --- | --- |
| `Settings` (`Outlet`, currency, variance tolerance, exchange rate, Price/Coin, machine-type rules) | `stores`, `store_settings`, `machine_types`, and preferably `store_machine_type_rules` | Outlet becomes `stores`; financial and variance settings are store-scoped. Machine type names may be global, but coins-per-play must support an explicit per-store rule if UAT data requires it. Keep settings snapshots on finalized closings. |
| `Machine_Master` | `machines` | Add `machine_id_code`, name, capacity, prize category, sort order, notes, active state, timestamps, and `store_id`. Preserve deterministic configured ordering. Use a unique store-scoped stable code, not only an integer machine number. |
| `Barcodes_JSON` and local multi-product support | `machine_styles` / `products` | One active style/product reference per machine; barcode is unique per machine. Add stable product/style code, barcode, product name, active state, sort order, and current image object key. Do not model a product list as JSON in the cloud schema. |
| Local product image directory and image URL helper | `storage.objects` + `machine_styles.image_object_key` | Private `machine-style-images` bucket; HTTPS signed delivery URL is derived for the browser and no Windows path is stored or returned. |
| `Daily_Closing` | `daily_closings` | Add missing parity fields: cash/ABA transaction counts, adjustment, currency values, variance tolerance snapshot, coins dispensed, machine coins used, closing status, workflow status, notes, report-date lock, staff identity/name snapshots, created/finalized/void metadata, and an immutable business Closing ID/display sequence. Retain all formula outputs as finalized snapshots. |
| `Machine_Closing` | `closing_machine_entries` | Include machine ID/name/type/capacity snapshots, sort order, meter/manual mode, begin/final meter, manual coins input where applicable, calculated coins used, coin/play snapshot, allocated sales, coins/product, average revenue/product, win rate, status, notes, and timestamps. |
| `Product_Closing` plus `Refill_History_JSON` | `closing_product_entries` + `refill_events` | Persist product ID/barcode/name/image-reference snapshots needed for history, begin/final qty, computed effective refill and Qty Used. Each signed refill/adjustment is an event; voids remain retained but are excluded from effective totals. |
| `Audit_Log` | `audit_log` | Include `store_id`, actor user ID, action, target type/ID, request/correlation identifier, and non-secret metadata. Audit finalization, voiding, store membership/role changes, settings, machine/style changes, and image replacement/removal. |
| Local generated exports/reports | on-demand report service + browser download | Do not store report files as source-of-truth business data. Generate only from authorized immutable records; do not preserve Windows `open_folder` behavior in production. |

All child rows must be constrained to the same store as their parent. Prefer a transactional API/RPC for cross-table writes rather than client-side sequences of direct table mutations.

## 4. `window.clawApi` cloud contract map

| Existing logical operation | Cloud classification | Production direction |
| --- | --- | --- |
| `GET /api/bootstrap` | Direct cloud read + authorization | Return only authorized stores, active-store context, store settings, machine/style setup, and permitted recent closings. |
| Auth session/bootstrap/logout and active-store selection (new cloud-only seam) | Authentication/authorization operation | Supabase Auth session lifecycle plus server-derived profile and permitted-store list. Active store must be validated against membership on every request. |
| `GET /api/settings` | Direct cloud read | Store-scoped settings under RLS. |
| `POST /api/settings/unlock` | Removed | Replace the shared settings password with authenticated role/store authorization. |
| `POST /api/settings` | Secured cloud mutation | Role-authorized setting update with audit row; selected store derived/validated server-side. |
| `GET /api/dashboard`, `/api/history`, `/api/closings`, `/api/closings/{id}`, `/api/reports/summary` | Direct cloud read + authorization | Store-filtered by default; multi-store aggregation only for Head Office/Admin. Use indexed query/RPC surfaces, not unrestricted client filtering. |
| `GET /api/machines`, `GET /api/new-closing` | Direct cloud read + authorization | Resolve active styles/images and authoritative carry-forward opening state for the authorized store/date. |
| `POST /api/machines`, `DELETE /api/machines/{id}` | Secured cloud mutation + image-storage operation | Store Manager/Head Office/Admin only as authorized. Soft-deactivate rather than delete history dependencies. Image replacement uses the safe upload-reference-delete sequence. |
| Image upload, replace, remove, and signed URL delivery | Image-storage operation | Browser obtains an authorized upload path or signed upload URL; server/RPC validates style/store ownership and atomically updates the image key before retiring the old object. Clipboard paste remains a client input method, not a storage model. |
| `POST /api/calculate` | Server-authoritative calculation | Retain as a validation/preview calculation endpoint if required by the UI, but never trust client totals for saved/finalized records. |
| `POST /api/closings/save` with `Draft` | Secured cloud mutation | Transactional draft upsert validates membership, role, draft status, date locking, machine/style ownership, meter/manual input, and signed refill events. |
| `POST /api/closings/save` with `Finalized` | Server-authoritative calculation/finalization | Dedicated transactional finalize RPC/API: lock the draft, recompute all authoritative values from stored inputs/events, enforce final-qty/meter/variance/role rules, snapshot values, freeze detail, and audit. |
| `DELETE /api/closings/{id}` / void behavior | Server-authoritative workflow | Do not expose raw delete. Use an authorized void RPC that retains the record, requires a reason, enforces newest-first/carry-forward dependency rules, and audits the result. |
| History/monthly export | Secured cloud mutation/read | Authorized server-generated browser download; no server filesystem opening. |
| Local-only health/runtime/update/open-folder routes | Local development/fallback only | Do not expose Windows updater, local paths, shutdown, or folder-opening APIs in production. |

## 5. Archived migration review

| Archived draft | Reuse assessment | Required correction before any execution |
| --- | --- | --- |
| `20260828_000001_initial_schema.sql` | Reusable foundation only | Add the missing Daily Closing, Machine Closing, product/style, sort/order, stable code, snapshot, void, and per-store rule fields listed above. Replace the global-only `machine_types` assumption if store-specific play rules exist. Review the active-closing uniqueness rule so void/replacement and draft lifecycle match local behavior. |
| `20260828_000002_rls.sql` | Reuse policy shape only | Do not grant `authenticated` broad execution on every `private` function. Keep private helpers unexposed with tightly controlled execution, fixed search paths, and RLS policy tests. Add explicit all-store entitlement, operation-specific policies, and policy tests for Store A deny/Store B allow, cross-store denial, draft/finalized transitions, and Admin management. |
| `20260828_000003_finalize_closing.sql` | Reusable transactional starting point only | Correct formula parity: include adjustment and all current KPI semantics; require the local zero-variance finalization rule; validate final quantities and meter/manual mode; preserve all required snapshots; prevent direct post-finalization detail edits; and use the actual carry-forward/void rules. Its `SECURITY DEFINER` use needs a dedicated security review and narrow grants. |
| `20260828_000004_image_storage.sql` | Reusable private-bucket concept only | Keep the private bucket and store/style path convention, but make replacement atomic at the application level: upload, verify, update reference, then delete the old object. Validate object ownership/path from database state, enforce the 5 MB JPEG/PNG/WebP policy, and test signed read plus upsert permissions. |

The current Supabase changelog was checked during this planning review. A relevant platform change is that new tables are not necessarily automatically exposed through the Data API. The implementation phase must explicitly verify Data API exposure/grants and RLS together; it must not assume that enabling RLS alone makes a table reachable or safe.

## 6. Security and integrity gates for implementation

1. Enable RLS for every exposed application and Storage table; write a policy per operation, with both `USING` and `WITH CHECK` for updates.
2. Add automated allow/deny tests for Staff Store A, Store Manager Store A, Head Office multi-store, Admin, anonymous, disabled profile, and finalization/void edge cases.
3. Keep `service_role`/secret material server-side. Browser configuration may contain only public project configuration and is never a substitute for RLS.
4. Use database transactions and row locks for finalization, image-reference replacement, carry-forward dependencies, and voiding. The finalization path recomputes values; it never accepts browser KPI totals as authoritative.
5. Create indexes for store/date/status listing, parent foreign keys, membership lookup, and finalized carry-forward queries. Validate query plans and RLS behavior with representative multi-store data before rollout.
6. Do not use user-editable user metadata for authorization. Avoid broadly callable `SECURITY DEFINER` routines; if one is unavoidable, use a non-exposed schema, a fixed safe search path, explicit authentication/authorization checks, and least-privilege grants.

## 7. Deployment requirements

- A separate Supabase project must be explicitly approved and identified before any connection or migration. The existing JOLI dashboard project is out of scope unless separately approved.
- Host the static browser application and HTTPS cloud API under the production domain; configure allowed Auth redirect/origin URLs, CSP, TLS, and CORS only for that domain.
- Required secret/configuration names are environment-only: `SUPABASE_URL`, a browser-safe publishable key, server-only `SUPABASE_SERVICE_ROLE_KEY` if a server requires it, Auth redirect URL(s), Storage bucket name, and application origin. Never commit or print their values.
- Configure authentication onboarding, password/MFA/reset policy, session lifetime, account deactivation, Admin role/membership workflow, backup/restore ownership, observability, error reporting, and audit-log retention before pilot use.
- Run staging first with a separate approved project and representative non-production fixtures. Require RLS, function-grant, storage-policy, formula-parity, load, backup/restore, and browser parity acceptance before production cutover.

## 8. Future controlled data-migration procedure

No real workbook migration is authorized by this plan. Once separately approved, use a repeatable, read-only export and staged import:

1. Freeze and identify the source workbook copy; record checksum, sheet/row counts, date range, store mapping, and image inventory without changing the Windows source.
2. Import into an approved staging project only; map outlets to approved store IDs and resolve machine/style identifiers deterministically.
3. Upload images to staging using the generated object-key convention; verify each object before writing its database reference, then reconcile missing-image fallbacks.
4. Import settings, machine/style master data, daily headers, machine rows, product rows, and refill events in dependency order. Preserve legacy identifiers and timestamps where legally/operationally required.
5. Recompute and reconcile formulas, totals, finalized status, carry-forward states, history counts, and image references against the source copy. Produce an exception report; do not silently coerce discrepancies.
6. Obtain written reconciliation approval, repeat from a fresh production source snapshot during a controlled cutover window, validate post-import read-only samples, and retain a rollback decision point. Do not build synchronization between the workbook and cloud.

## 9. Risks and recommended next step

Primary risks are formula drift in the archived finalize draft, cross-store data exposure through incomplete RLS/function grants, historical snapshot omissions, local image-path leakage, and changing a finalized/carry-forward record outside the authorized workflow. A second risk is treating the accepted local UI as permission-aware before a cloud adapter and Auth session layer exist.

Recommended next step: approve an implementation specification for a disposable staging project only. That specification should first define the corrected schema and RLS test matrix, build a cloud adapter contract test suite against the existing `window.clawApi` requests, and establish formula fixtures from the accepted local backend. Only after those gates pass should a migration file or cloud connection be proposed for approval.

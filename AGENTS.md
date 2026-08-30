# AGENTS.md — JOLI POLI Claw Closing Web Migration Rules

## Mission

Continue from the existing JOLI POLI Claw Closing Windows application v2.1.78. Do not rebuild the product from a generic template.

The existing desktop app is the product baseline. Preserve its approved UI, workflow and calculations first; then replace platform-specific components with browser/local-Python equivalents.

## Authoritative architecture: shared UI, local and cloud adapters

The accepted local application remains preserved and supported for regression, fallback, development, and reference. The final target is one central cloud application and database for all stores; stores connect directly to it. This is not a local-database synchronization, replication, merge, or conflict-resolution architecture.

The accepted browser UI communicates only through `window.clawApi`:

```text
Accepted browser UI -> window.clawApi -> local adapter -> isolated project-owned local_data/
                                      -> cloud adapter -> approved Supabase project
```

Cloud staging work is explicitly authorized only for **JOLI POLI Claw Staging** (`fbvzqdqjqcbjopuinknw`, `ap-southeast-1`). Supabase schema, Auth, Storage, RPCs, Edge Functions, and the cloud adapter may be implemented and tested there with synthetic staging data. Do not change any other Supabase project unless separately authorized.

Cloud application identities use Username + Password. Supabase may hold a derived technical email identifier internally, but the UI and user-management APIs must never request or display it. The authoritative roles are Developer, Admin, and Outlet; only Developer manages user identities, and Outlet users receive explicit outlet memberships.

- LOCAL mode must remain functional while CLOUD staging is developed.
- Do not duplicate or redesign the accepted browser UI, Review, or Print View during backend migration.
- Browser configuration may expose only browser-safe Supabase configuration. Service-role keys, passwords, access tokens, and all other secrets must never be committed or exposed in browser code.
- Real production-data migration is not authorized. Synthetic staging data and ignored project-owned local copied/test data are allowed.
- Local images remain under the isolated project-owned data area in LOCAL mode. Cloud Storage is permitted only for approved synthetic staging work until real-image migration is separately authorized.
- CLOUD staging must retain authenticated role/store authorization, RLS, private Storage policies, least-privilege grants, and server-authoritative finalization. Do not weaken these controls to simplify testing.

## Non-negotiable source safety

1. The Windows source folder `D:\Python File\Claw_Closing_App` is read-only for this migration, including while cloud staging is developed.
2. Never edit, rename, delete or move anything under `D:\Python File\Claw_Closing_App`.
3. Never copy, upload, inspect for migration output, or modify these source folders: `data`, `backups`, `reports`, `.venv`, `tests`, `updates`, `.webview`, `__pycache__`, `.git`.
4. Never touch the live Excel workbook during development.
5. Never publish a Windows-app update as part of the web migration unless the user explicitly requests a Windows-app change.
6. Do not modify, access, or execute anything in the protected Windows source folder for cloud work. The `supabase/` files are active staging implementation material only for the approved project and must be handled under the cloud authorization and secret rules above.

## Baseline import

Before changing the web UI, run `scripts/Import_Current_Windows_App.ps1`.

The importer must confirm `APP_VERSION = 2.1.78`. If the version does not match, stop and report the actual version. Do not bypass the version check unless the user explicitly approves another baseline.

The imported source is stored under `legacy/windows-v2.1.78/` and is a reference snapshot. Do not rewrite the snapshot to make migration easier.

## Preserve before refactor

Preserve these completed product areas unless a task explicitly changes them:

- Dashboard
- Daily Closing
- Closing Entry
- Machine Closing
- Review / Finalize
- Closing History
- Reports
- Settings
- Manage Machines inside Daily Closing
- machine types / play rules
- multiple products/styles per machine
- refill behavior including positive and negative adjustments
- meter/manual Coins Used behavior
- KPI calculations
- image upload/display behavior
- multi-select behavior
- print from Review

## UI migration rule

The first browser milestone must look and behave like the current application as closely as practical.

Do not replace the current HTML/CSS/JavaScript UI with a new React design merely because this is a web migration. First migrate the existing DOM/CSS/JS and introduce an adapter for desktop-only API calls. Framework refactoring can be considered only after parity is validated.

## Business formulas

Do not change formulas without an explicit product decision.

Authoritative formulas are documented in `PROJECT_SPEC.md` and must be backed by tests before backend replacement.

Finalization in the local backend must recompute authoritative totals server-side. Do not trust client-submitted KPI totals as final business records.

## Local backend safety

1. Browser code communicates through `window.clawApi`: LOCAL mode uses the local backend; CLOUD mode uses only the approved authenticated staging cloud adapter.
2. Never expose passwords or secrets in browser code/Git.
3. Keep all development data under `local_data/`; never point it at the production workbook.
4. Finalized closing details must not remain editable through direct browser calls.

## Images

The local version stores one active image per current machine/style reference. Historical closing rows do not duplicate image files.

Replace image safely:
1. upload new image,
2. confirm upload,
3. update database reference,
4. delete old object.

Never delete the old object before the new reference is safely stored.

## Scope discipline

Implement only the current migration milestone. Do not jump ahead to Reports/Dashboard redesign while Daily Closing parity is incomplete.

Recommended order:

1. import/inventory current app,
2. browser shell parity,
3. bridge/API inventory,
4. formula parity tests,
5. isolated local backend/data area,
6. machine/style setup and local images,
7. Daily Closing persistence,
8. Review/finalize,
9. Print parity,
10. History,
11. Reports/Compare Stores.

## Completion checks

For each task:
- state exact files changed,
- run relevant syntax/type/build tests,
- run formula tests when business logic is touched,
- verify LOCAL isolation remains intact and CLOUD work is limited to the approved staging project when data scope changes,
- verify no protected Windows paths were written,
- verify no secret was committed,
- update migration documentation when an adapter/API is replaced.

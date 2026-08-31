# Local and Cloud Staging Separation

`npm.cmd run dev` is the authoritative LOCAL command. It sets
`CLAW_RUNTIME_MODE=local`, clears cloud configuration, and starts only the
local FastAPI backend against project-owned `local_data/uat`.

`npm.cmd run dev:cloud` is the authoritative CLOUD STAGING command. It sets
`CLAW_RUNTIME_MODE=cloud-staging`, clears local data configuration, and starts
only the static cloud host. The host injects browser-safe configuration for the
approved staging project `fbvzqdqjqcbjopuinknw`; it never imports or starts the
local backend.

The browser binds one adapter only. A missing/invalid cloud configuration, an
unloaded cloud adapter, an unexpected cloud configuration in LOCAL, a wrong
project ref, or an already-bound adapter is an error. It never selects another
adapter as a fallback.

## Cloud staging data sources

| Surface | Cloud source | Local file access |
| --- | --- | --- |
| Login/session and profile | Supabase Auth; `profiles`; `user_store_access`; `stores` | None |
| Settings and machine types | `store_settings`; `machine_types`; `store_machine_type_rules` | None |
| Machines and styles | `machines`; `machine_styles` | None |
| Daily Closing, draft, Review, finalize | `daily_closings`; `closing_machine_entries`; `closing_product_entries`; `finalize_daily_closing` RPC | None |
| Refill | `refill_events`; closing-entry tables; `void_refill_event` RPC | None |
| Closing History | `daily_closings`; closing-entry tables | None |
| Reports/export | Edge API reads finalized cloud closing tables and returns generated CSV download content | None |
| Images | Private `machine-style-images` Storage plus `machine_styles.image_path`; signed reads | None |
| User management/audit | Supabase Auth admin API; `apply_developer_user_profile` RPC; `audit_log` and database audit fields | None |

The Edge function and cloud host contain no local workbook, `local_data`, local
image-directory, or production Windows-app path references. The local backend
requires `CLAW_RUNTIME_MODE=local`, rejects cloud configuration, and confines
its workbook, reports, backups, and images to `local_data/`.

# Desktop v2.1.78 -> Web Migration Map

This document defines what should be reused versus replaced. Codex must refine it after importing and inspecting the actual installed v2.1.78 source.

| Desktop component | Migration treatment | Web target |
|---|---|---|
| `assets/web/index.html` | Reuse first | Browser HTML shell; preserve DOM/labels/layout initially |
| `assets/web/styles.css` | Reuse first | Browser styles; remove WebView-only assumptions only when necessary |
| `assets/web/app.js` | Reuse/refactor | Preserve UI/event/business behavior; replace Python bridge calls through adapter |
| `app.py` | Reference only | Inventory desktop host/API endpoints; browser no longer runs PyWebView host |
| `database.py` | Reference + migrate | Map Excel reads/writes to PostgreSQL repositories/RPCs |
| `calculations.py` if present | Reuse logic via tests | Shared/tested calculation behavior; authoritative finalization server-side |
| `product_support.py` | Reference + migrate | Browser file handling + image compression + Supabase Storage |
| `pdf_report.py` | Reference only unless still used | Web Print uses Review/print CSS; no need to keep rejected separate-PDF flow |
| local Excel workbook | Migration source only | PostgreSQL after rehearsal/import validation |
| `data/machine_images` | Do not import during source capture | Later controlled migration to Supabase Storage from an approved copy/export |
| desktop updater | Keep only in Windows app | Web deployment replaces per-PC update mechanism |
| Settings password gate | Replace | Auth role/authorization; never expose a shared admin secret in client code |

## Bridge migration pattern

Do not scatter direct Supabase calls throughout the legacy UI during the first migration.

Use this progression:

```text
Existing app.js
     |
     | current desktop calls
     v
window.pywebview.api.*

becomes

Existing/migrated app.js
     |
     v
window.clawApi.*   (compatibility adapter)
     |
     +--> local mock/stub during parity work
     +--> Supabase repositories/RPCs during cloud integration
```

The compatibility layer allows the current UI to survive while backend behavior is migrated one method at a time.

## First inventory required

After source import, Codex must create `docs/BRIDGE_INVENTORY.md` containing every desktop bridge/API call found in the current JS and the matching Python method/route. For each method record:

- current JS caller,
- current Python implementation,
- input shape,
- output shape,
- workbook/module dependency,
- future Supabase table/RPC/Storage replacement,
- migration status.

Do not implement a guessed adapter surface before this inventory exists.

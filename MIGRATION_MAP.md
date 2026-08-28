# Desktop v2.1.78 -> Web Migration Map

This document defines what should be reused versus replaced. Codex must refine it after importing and inspecting the actual installed v2.1.78 source.

| Desktop component | Migration treatment | Web target |
|---|---|---|
| `assets/web/index.html` | Reuse first | Browser HTML shell; preserve DOM/labels/layout initially |
| `assets/web/styles.css` | Reuse first | Browser styles; remove WebView-only assumptions only when necessary |
| `assets/web/app.js` | Reuse/refactor | Preserve UI/event/business behavior; replace Python bridge calls through adapter |
| `app.py` | Reference only | Inventory desktop host/API endpoints; browser no longer runs PyWebView host |
| `database.py` | Reuse/refactor | Local project-owned Excel repository under `local_data/` |
| `calculations.py` if present | Reuse logic via tests | Shared/tested calculation behavior; authoritative finalization server-side |
| `product_support.py` | Reuse/refactor | Local image handling and product/refill behavior |
| `pdf_report.py` | Reference only unless still used | Web Print uses Review/print CSS; no need to keep rejected separate-PDF flow |
| local Excel workbook | Production source only | Never touched; local backend creates an isolated `local_data` workbook |
| `data/machine_images` | Do not import during source capture | Local images in project-owned `local_data/machine_images` only |
| desktop updater | Keep only in Windows app | Web deployment replaces per-PC update mechanism |
| Settings password gate | Preserve for parity | Existing local behavior until an explicit local product decision changes it |

## Bridge migration pattern

Do not scatter direct backend calls throughout the legacy UI.

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
     +--> local FastAPI endpoints backed by the isolated workbook
```

The compatibility layer allows the current UI to survive while backend behavior is migrated one method at a time.

## First inventory required

After source import, Codex must create `docs/BRIDGE_INVENTORY.md` containing every desktop bridge/API call found in the current JS and the matching Python method/route. For each method record:

- current JS caller,
- current Python implementation,
- input shape,
- output shape,
- workbook/module dependency,
- local Python/workbook/image replacement,
- migration status.

Do not implement a guessed adapter surface before this inventory exists.

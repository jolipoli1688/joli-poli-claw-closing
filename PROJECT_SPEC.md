# JOLI POLI Claw Closing Web — Migration Product Specification

Status: migration foundation
Desktop product baseline: v2.1.78

## 1. Product direction

Build a cloud web version by continuing from the current Windows app, not by redesigning the application from zero.

The Windows application stays operational as production/fallback until the web version passes validation and pilot rollout.

Expected launch scale:
- about 10 stores,
- about 15 physical machines per store,
- about 2 product/styles per machine,
- about 30 active images per store / about 300 active images total,
- one Daily Closing per store per day.

Cloud target: Supabase Free initially. Monitor database/storage/egress before any paid-plan decision.

## 2. Existing modules to preserve

- Dashboard
- Daily Closing
- Closing History
- Reports
- Settings

Machine Management is not a standalone sidebar page. Machine setup stays inside Daily Closing through Manage Machines.

## 3. Daily Closing workflow

Three stages:
1. Closing Entry — sales, coins and staff
2. Machine Closing — products and meters
3. Review — verify, finalize and print

Closing Entry concepts:
- Report Date
- Outlet / Store
- Closed By
- Verified By
- Cash Sales (KHR)
- ABA QR Sales (USD)
- Beginning Coins
- Coins Added
- Final Coins

Date behavior to preserve:
- defaults to today for New Closing,
- DD-MM-YYYY display,
- previous/today/next controls,
- future dates disabled,
- opening quantities reload for selected date,
- warn before changing a date with entered data,
- report date locks after first Save Draft,
- finalized closing keeps original date.

## 4. KPI order

1. Sales
2. Discount
3. Coins Used
4. Coin Return
5. Lose / Over
6. Products
7. Win Rate
8. AVG / Product

## 5. Business formulas

Settings supply:
- Exchange Rate: KHR per USD
- Price / Coin: USD
- Machine Type coins per play

Formulas:
- Total Sales USD = `(Cash Sales KHR / Exchange Rate) + ABA QR Sales USD`
- Coins Used = `Beginning Coins + Coins Added - Final Coins`
- Coin Return = total machine coins from meter/manual machine entries
- Lose / Over = `Coin Return - Coins Used`
- Products = total Qty Used
- AVG / Product = `Total Sales / total Qty Used` when Qty Used > 0
- Discount USD = `(Coins Used * Price/Coin USD) - Total Sales USD`
- Discount % = `Discount USD / (Coins Used * Price/Coin USD) * 100` when denominator > 0
- Machine Win Rate = `Machine Coins Used / coins-per-play / machine Qty Used` when Qty Used > 0
- Overall Win Rate = `sum(calculated machine plays) / total Qty Used` when Qty Used > 0
- Qty Used = `Begin Qty + effective Refill - Final Qty`

Do not silently clamp invalid values. Invalid quantity/meter states must be surfaced for correction.

Finalized closings must snapshot settings needed for stable historical reporting, including exchange rate, Price/Coin and machine-type coins/play.

## 6. Machine Closing

Expected data presentation includes:
- Machine
- Product / Barcode
- Begin Qty
- Refill
- Final Qty
- Qty Used
- Begin Meter
- Final Meter
- Coins Used
- Win Rate
- Status

For a machine with multiple products/styles:
- machine identity is visually shown once/merged,
- each barcode/style has its own product row/image/quantities,
- meter, machine Coins Used, Win Rate and Status occur once per machine.

Machine ordering remains deterministic by configured machine type/sequence. Do not rotate/randomize rows.

Meter modes:
1. Meter mode: Coins Used = Final Meter - Begin Meter.
2. Manual mode: when both meters are blank, staff can enter Coins Used manually.
3. Exactly one meter entered is invalid.

## 7. Refill

Refill supports both positive and negative quantity adjustments.

Cloud data should store refill events for auditability. A voided refill is retained but excluded from the effective refill total.

Begin Qty for the next closing comes from the prior finalized quantity according to the approved closing workflow; later stock changes use refill rather than silently rewriting Begin Qty.

## 8. Images

Images belong to the current machine/style setup and are displayed in Daily Closing.

Historical report rows do not store duplicated image files.

Expected active image count at launch: about 300.

Replacement sequence:
1. upload new image,
2. confirm upload success,
3. update machine/style image reference,
4. delete old Storage object.

Removal sequence:
1. clear database image reference,
2. delete Storage object,
3. show placeholder.

Deleting/deactivating a machine/style must not break historical report data.

Recommended web upload handling:
- accept JPG/PNG/WEBP,
- incoming upload maximum around 5 MB,
- resize/compress for permanent storage,
- target roughly 300–700 KB where practical,
- WebP preferred for generated web images.

## 9. Cloud users / permissions

Initial roles:
- Staff: assigned store(s), Daily Closing
- Store Manager: assigned store(s), Daily Closing, History, Reports, machine setup
- Head Office: all stores, reporting/comparison visibility
- Admin: all stores, user/store administration, settings and machine setup

Database Row Level Security must enforce store access.

## 10. Historical records

Historical report values must remain stable if current machine/style names, settings or images later change.

Snapshot identifying values needed for reporting, including machine number/type, barcode/product name, exchange rate, Price/Coin and coins/play where applicable.

Old product images do not need to be archived into every closing.

## 11. Print

Print remains required in the web version.

Preserve the current product intent: Print is from Review and should be visually close to the actual Review UI, with print-only cleanup.

Target:
- A4 landscape,
- Review/date/outlet/staff identity,
- KPI summary,
- Machine Closing table,
- natural row pagination,
- repeated table header on continuation pages,
- no sidebar,
- no workflow stepper,
- no editing/action controls.

The v2.1.78 print typography/design-system adjustments are print-only unless separately approved for screen UI.

## 12. Cloud storage model

Do not store image binaries or generated PDFs inside PostgreSQL rows.

Use Supabase Storage for active machine/style images. Database stores the path/reference only.

Daily Closing/report records should be relational rows, not a large duplicated JSON/PDF payload.

## 13. Migration strategy

Phase A — Baseline parity
- import installed v2.1.78 source read-only,
- inventory current WebView bridge calls,
- run current UI in a browser with adapters/stubs,
- preserve screen parity.

Phase B — Cloud foundation
- Supabase development schema,
- Auth,
- store permissions/RLS,
- settings/machines/styles/images.

Phase C — Daily Closing
- load opening data,
- Save Draft,
- refill events,
- machine/product rows,
- server-side finalize calculation,
- Review.

Phase D — Print / History / Reports
- print parity,
- historical views,
- comparison/reporting.

Phase E — Migration / rollout
- migration rehearsal from an Excel backup/copy,
- record/count/total reconciliation,
- one-store pilot,
- multi-store rollout,
- Windows app remains fallback until explicit retirement approval.

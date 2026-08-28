# Baseline UI inventory — Windows v2.1.78

Status: baseline inventory complete from `legacy/windows-v2.1.78/`. The first web shell copies this DOM/CSS/JS structure; it does not introduce a React redesign.

## Static DOM shell

| Area | Imported DOM container | Purpose |
| --- | --- | --- |
| Application shell | `#appShell.app-shell` | Sidebar/workspace grid and collapsed-sidebar state. |
| Navigation | `#sidebar`, `#sidebarNav`, `#sidebarToggle`, `#versionText` | Dynamic main navigation, logo and version. |
| Top bar | `.topbar`, `#pageTitle`, `#pageSubtitle`, `#pageActions` | Page identity and context actions. |
| Print/update controls | `#globalPrintButton`, `#globalUpdateButton` | Print is enabled in Review; update controls belong only to the desktop updater flow. |
| Page viewport | `.content-viewport`, `#page-closing`, `#page-history`, `#page-settings` | Runtime-rendered page content. Dashboard and Reports are rendered through the same page runtime rather than static containers. |
| Transient UI | `#loadingOverlay`, `#modalRoot`, `#toastRoot` | Startup state, all modal dialogs and notifications. |

## Pages and workflow

| Surface | Baseline contents / behavior |
| --- | --- |
| Dashboard | Summary cards and latest finalized closing, supplied by dashboard data. Preserve it; it is not being redesigned in this milestone. |
| Daily Closing — Closing Entry | Date controls (previous/today/next), Report Date, Outlet, Closed By, Verified By, Cash Sales KHR, ABA QR Sales USD, Beginning Coins, Coins Added and Final Coins. Date is displayed DD-MM-YYYY; future dates are disabled; draft save locks the report date. |
| Daily Closing — Machine Closing | `renderMachineClosingTable` renders grouped, deterministic machine/product rows. It has product image/barcode identity, Begin Qty, signed Refill, Final Qty, Qty Used, meter/manual coins controls, Win Rate, Status and spreadsheet-style multi-select/bulk controls. Manage Machines opens the existing machine/style editor from Daily Closing. |
| Daily Closing — Review | `renderClosingReview` reuses the closing page with `closing-review` state. It displays the KPI summary, staff/date identity, machine-product table, validation issues and Finalize/Print actions. |
| Closing History | `renderHistory` shows finalized record KPIs, filters, detail modal, refill information and guarded Void Bill context action. |
| Reports | Monthly summary and export/open-folder desktop actions. It remains present as a baseline surface but is not a current migration target. |
| Settings | Local business settings, machine type/play rules and desktop password-lock behavior. The baseline layout and local behavior remain reference-only until explicitly changed. |

## Daily Closing stage containers and controls

- Page root: `#page-closing`.
- Workflow stage UI: `.workflow-stepper` / `.workflow-step` produced by `workflowStepper`, with Entry, Machine Closing and Review stages.
- Entry structure: `.closing-entry-card`, `.closing-date-control`, `#field-report_date`, `#field-outlet`, `#field-closed_by`, `#field-verified_by` and sales/coin inputs rendered by `inputField`.
- Machine Closing table: `.data-table-wrap`, `.data-table`, `.refill-enabled-table`, `.product-closing-table`; machine group/identity rows use `.group-row`, `.product-row-identity`, `.machine-identity` and product thumbnail classes.
- Machine management: existing modal root with `.product-machine-editor`, `.product-editor-cards`, `.barcode-editor` and `.machine-image-editor`.
- Refill interaction: `.refill-total-button`, `.refill-cell-modal`, `.refill-cell-history-list` and review refill summary cards. Positive and negative events are both represented.
- Review root and summary: `.closing-review`, `.closing-summary-strip`, `.closing-summary-item`, `#reviewTopActions`; current printing uses the review representation rather than a separate PDF screen.

## Review and Print containers

- The global `#globalPrintButton` is made visible only while the Review stage is active.
- `printClosingPdf` calls `window.print()` after two animation frames; it does not call the desktop PDF endpoint.
- Print styling begins at the baseline `@media print` rules and is refined by the later v2.1.21, v2.1.22, v2.1.48, v2.1.51, v2.1.60, v2.1.64, v2.1.77 and v2.1.78 sections.
- Important print-only selectors include `body.print-exact-v2163`, `body.exact-print-active-v2164`, `#exactPrintRootV2164`, `#page-closing`, `.closing-summary-strip` and `.product-closing-table`. The sidebar, workflow stepper, top actions and edit controls are removed by print rules.

## CSS inventory

| CSS section | Baseline responsibility |
| --- | --- |
| Base through `.loading-card` (top of `styles.css`) | Shell grid, sidebar, top bar, cards, buttons, inputs, data tables, modals, toast and loading overlay. |
| Machine images / multiple barcode codes (v2.1.10) | Thumbnails, barcode chips and machine/product editor layout. |
| Settings / machine types (v2.1.12–v2.1.13) | Settings cards, machine-type rules and locked edit controls. |
| Daily Closing structure (v2.1.15–v2.1.22) | Closing layout, compact operations table, currency/KPIs, print action and Entry → Machine Closing → Review flow. |
| Print revisions (v2.1.21 onward) | A4 landscape-oriented Review print cleanup, repeated table header and print-only visibility/spacing. |
| Refill revisions (v2.1.38–v2.1.54, v2.1.63, v2.1.68) | Refill history/modal controls, signed adjustments, colors and operator field. |
| History revisions (v2.1.49–v2.1.50) | Operational history rows, protected void warning and context menu. |
| Typography/light branding (v2.1.55–v2.1.62) | Approved typography, icon system, light surfaces, JOLI POLI logo and machine-number alignment. |
| v2.1.77–v2.1.78 | Latest print-only cleanup and Print View design-system alignment. |

## Preservation notes

- Keep the runtime DOM generation and appended v2.1.x behavior patches intact during the parity milestone.
- Preserve mobile breakpoints and print rules; they are part of the approved baseline.
- Do not make the updater or Windows production folders browser features. Local workbook/report/image calls stay isolated behind `window.clawApi` and are served only by the project-owned local backend.

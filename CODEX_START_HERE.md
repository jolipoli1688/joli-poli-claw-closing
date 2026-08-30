# Codex — Start Here

You are migrating the existing JOLI POLI Claw Closing Windows application v2.1.78 to a web app. This is a continuation of the existing product, not a fresh redesign.

## First task — do this now

1. Read `AGENTS.md`, `PROJECT_SPEC.md`, and `MIGRATION_MAP.md` completely.
2. Run the read-only source importer:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Import_Current_Windows_App.ps1
```

3. If the importer reports anything other than v2.1.78, STOP. Report the actual version and do not modify the source app.
4. Inspect these imported files first if present:
   - `legacy/windows-v2.1.78/assets/web/index.html`
   - `legacy/windows-v2.1.78/assets/web/styles.css`
   - `legacy/windows-v2.1.78/assets/web/app.js`
   - `legacy/windows-v2.1.78/app.py`
   - `legacy/windows-v2.1.78/database.py`
   - `legacy/windows-v2.1.78/calculations.py`
   - `legacy/windows-v2.1.78/product_support.py`
5. Create `docs/BRIDGE_INVENTORY.md` listing every JS -> desktop/Python API interaction and its implementation/data dependency.
6. Create `docs/BASELINE_UI_INVENTORY.md` listing the current pages, key DOM containers, Daily Closing stages, Review/Print containers, and relevant CSS sections.
7. Do **not** redesign the UI.
8. Do **not** connect to production Supabase or any unapproved project. The approved staging project is `fbvzqdqjqcbjopuinknw`; use it only when the active task explicitly authorizes cloud staging work.
9. Do **not** modify the imported legacy snapshot.
10. Run syntax checks on the imported JS/Python source where available and report results.

## Second task — only after the inventory

Create the first browser parity shell under `web/` by copying the current UI assets and introducing a compatibility adapter named `window.clawApi`.

The adapter should initially use a local/mock implementation sufficient to render and navigate the current UI without Excel/Supabase writes. Replace desktop bridge calls through this single adapter rather than rewriting the UI.

Success for the first browser milestone is **visual/workflow parity**, not a new design.

## Important

The existing Windows updater project must never be repurposed. Preserve LOCAL mode and use `window.clawApi` as the local/cloud compatibility boundary. Real production workbook, image, user, and closing migration still requires separate authorization.

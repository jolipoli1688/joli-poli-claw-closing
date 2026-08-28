# Local backend

The active architecture is permanently local-only:

```text
Browser UI -> window.clawApi -> local FastAPI -> local_data/claw_machine_database.xlsx
```

Run `scripts\Start_Web_Parity.bat` to start the FastAPI server and open `http://127.0.0.1:4173/`.

## Data isolation

- `local_backend/config.py` sets all backend paths under the migration-project `local_data/` directory.
- The generated development workbook, backups, reports, locks, and machine images stay under `local_data/` and are ignored by Git.
- The backend never points to or writes `D:\Python File\Claw_Closing_App\data\claw_machine_database.xlsx`.
- Images remain local at `local_data/machine_images/`.

## Reused v2.1.78 modules

`local_backend/` is a project-owned copy of the imported backend modules: `database.py`, `calculations.py`, `product_support.py`, `report_service.py`, `pdf_report.py`, and `app.py`. The copied application installs the same v2.1.78 product/refill/history route overrides and serves the preserved `web/` UI.

## Active endpoints

- Read: `/api/bootstrap`, `/api/settings`, `/api/machines`, `/api/new-closing`, `/api/closings`, `/api/closings/{id}`, `/api/history`, `/api/dashboard`.
- Calculation/draft: `/api/calculate`, `/api/closings/save`.
- Static UI: `/`, `/claw-api.js`, `/assets/*`.

The desktop software-update endpoints return disabled responses. Supabase files are archived and never contacted.

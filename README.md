# JOLI POLI Claw Closing Web Migration

This repository migrates the existing **JOLI POLI Claw Closing Windows application v2.1.78** to one shared browser UI that supports both a preserved local Python backend and an authenticated central cloud backend.

This is **not a redesign from zero**. The migration starts from the installed Windows application's actual HTML/CSS/JavaScript and Python business/data implementation, then replaces desktop-only and Excel-only pieces gradually.

## Safety model

The current Windows application remains untouched and operational during migration.

The import script is read-only against the source application. It copies only application/source assets into this workspace and explicitly excludes live business-data and runtime folders.

Protected source folders are never copied or modified:

- `data`
- `backups`
- `reports`
- `.venv`
- `tests`
- `updates`
- `.webview`
- `__pycache__`
- `.git`

The live Excel database and live machine/product images are therefore not copied by the source import.

## Start in VS Code + Codex

1. Extract this ZIP to a normal development folder, for example `D:\Python File\joli-poli-claw-web`.
2. Open that folder in VS Code.
3. Open Codex.
4. Tell Codex: `Read CODEX_START_HERE.md and continue exactly from it.`

Codex should run the read-only source import first. The default source folder is:

`D:\Python File\Claw_Closing_App`

If the installed app is not v2.1.78, the importer stops instead of silently using the wrong baseline.

## Current architecture and safety gate

No production Windows-app database, workbook, images, or updater table is changed by this migration kit.

The accepted local implementation remains available through `window.clawApi` for regression, fallback, and development. CLOUD staging is authorized only for **JOLI POLI Claw Staging** (`fbvzqdqjqcbjopuinknw`, `ap-southeast-1`); stores will ultimately connect directly to the central cloud application rather than synchronize local workbooks. `supabase/` contains the controlled staging implementation. Do not touch another Supabase project or migrate real data/images/users without separate authorization.

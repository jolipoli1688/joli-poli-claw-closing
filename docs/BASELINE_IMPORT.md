# Baseline Import Design

The installed Windows application is the preferred migration baseline because updater ZIPs can be incremental and may omit unchanged modules.

The importer only reads from the installed app and copies source/application files into the migration workspace.

Default source:

`D:\Python File\Claw_Closing_App`

Expected version:

`2.1.78`

## Explicitly excluded

- live Excel/business database under `data`
- live machine/product images under `data`
- backups
- reports
- test/runtime environments
- downloaded update packages
- WebView cache
- Git metadata

## Imported reference categories

- root Python modules
- root JSON/version metadata
- root documentation/start scripts needed to understand bootstrapping
- UI/media assets under `assets`

The importer also writes `legacy/windows-v2.1.78/_IMPORT_MANIFEST.json` with hashes so later Codex edits can be proven to target the migrated copy rather than silently altering the reference snapshot.

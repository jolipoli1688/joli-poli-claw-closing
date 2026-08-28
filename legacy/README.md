# Legacy Source Snapshot

Run `scripts/Import_Current_Windows_App.ps1` on the Windows development machine.

The script creates `legacy/windows-v2.1.78/` from the installed app using read-only copy operations and excludes business data/runtime folders.

The imported snapshot is intentionally git-ignored by default and should be treated as immutable reference source.

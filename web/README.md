# Browser Migration Workspace

The v2.1.78 source has been imported and inventoried. This directory is the first browser parity shell, copied from `legacy/windows-v2.1.78/assets/web/`.

It preserves the current DOM/CSS/interaction patterns. `claw-api.js` supplies `window.clawApi`, a non-persistent local mock; `assets/app.js` sends every legacy request through that adapter. Do not add direct Supabase calls to the legacy UI. Route-by-route replacements are recorded in `../docs/BRIDGE_INVENTORY.md`.

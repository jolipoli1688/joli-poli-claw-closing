# Browser Migration Workspace

The v2.1.78 source has been imported and inventoried. This directory is the browser parity shell, copied from `legacy/windows-v2.1.78/assets/web/`.

It preserves the current DOM/CSS/interaction patterns. `claw-api.js` supplies `window.clawApi`, which sends every legacy request to the same-origin local FastAPI backend. Start the complete local app with `scripts\\Start_Web_Parity.bat`. Do not add direct database, cloud, or synchronization calls to the legacy UI. Route-by-route replacements are recorded in `../docs/BRIDGE_INVENTORY.md`.

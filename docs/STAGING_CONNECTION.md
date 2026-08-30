# JOLI POLI Claw staging connection

The only approved remote target is `JOLI POLI Claw Staging`
(`fbvzqdqjqcbjopuinknw`, `ap-southeast-1`). Local UAT and the isolated local
regression remain the default/fallback path.

Use environment configuration based on `.env.example`; keep all actual values
out of Git. The browser may receive only the Supabase URL, publishable key, and
an HTTPS cloud API base URL. `SUPABASE_SERVICE_ROLE_KEY` is server/Edge-only.

The unchanged browser UI selects cloud mode only when its host injects
`window.__CLAW_CLOUD_CONFIG__` before loading `claw-api.js` and loads
`cloud-api-adapter.js` first. The config must name the approved staging ref and
use that ref's `*.supabase.co` function host. The local UI must not point at
PostgREST tables directly.

Cloud staging is enabled through the JWT-required `claw-api` Edge Function.
Launch the unchanged UI with `python scripts\Start_Cloud_Staging.py` after
setting `CLAW_SUPABASE_URL` and `CLAW_SUPABASE_PUBLISHABLE_KEY` in the invoking
shell. The launcher injects those browser-safe values only into its response,
shows a subtle **STAGING** indicator, and never writes values to disk. LOCAL
mode remains `scripts\Start_Web_Parity.bat`. Do not enable cloud mode with raw
table access or a service-role key in the browser.

For later manual staging-only Auth setup, create clearly labelled accounts in
the Supabase dashboard (for example `staging-claw-staff-a@…`,
`staging-claw-manager-a@…`, `staging-claw-head-office@…`, and
`staging-claw-admin@…`), then have a server-side administrator activate the
corresponding profiles, assign roles, and grant store memberships. Never use
employee accounts or role data from editable user metadata.

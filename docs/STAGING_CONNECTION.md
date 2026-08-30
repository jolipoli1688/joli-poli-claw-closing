# JOLI POLI Claw staging connection

> **Current Auth authority:** users sign in with **Username + Password**. The
> technical Supabase email is derived as `<normalized-username>@claw.internal`
> and is never requested from or shown to normal users. The only bootstrap
> identity is Developer; the final roles are Developer, Admin, and Outlet.

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

> **HISTORICAL / SUPERSEDED:** The following former four-email-account setup is
> retained only as phase history. Do not create or use these accounts.

For historical reference, the earlier manual staging-only Auth setup created
clearly labelled accounts in
the Supabase dashboard (for example `staging-claw-staff-a@…`,
`staging-claw-manager-a@…`, `staging-claw-head-office@…`, and
`staging-claw-admin@…`), then have a server-side administrator activate the
corresponding profiles, assign roles, and grant store memberships. Never use
employee accounts or role data from editable user metadata.

## One-time synthetic Auth fixtures

Current bootstrap variables are only `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `STG_DEVELOPER_USERNAME`, and
`STG_DEVELOPER_PASSWORD`. Earlier four-user email examples below are
**HISTORICAL / SUPERSEDED** and must not be used.

Create an ignored file named `.env.staging.local` at the repository root and
set only `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`STG_DEVELOPER_USERNAME`, and `STG_DEVELOPER_PASSWORD`. Do not paste any value
into chat, source code, browser configuration, or documentation. In a local
shell, load those variables using the team's approved secret-loading method,
then run `node scripts\provision_staging_auth_users.mjs`. The provisioner is
restricted to this staging project, uses the server-side Auth Admin endpoint,
confirms the internal Auth identity, preserves existing passwords, and
creates/repairs only the single Developer bootstrap identity and its protected
profile/store membership.

## Authenticated staging UAT

With the same ignored local environment loaded, run
`node scripts\test_authenticated_cloud_staging.mjs`. It signs in the existing
Developer, creates synthetic Admin and Outlet test identities only through the
authenticated Developer API, and keeps generated temporary passwords in memory
only. It verifies user-management audit records, session lifecycle, role/store
isolation, direct-write denial, private image lifecycle, and synthetic closing
calculation/finalization/carry-forward parity. It must never be run against a
project other than the approved staging ref.

Cloud daily/monthly export endpoints remain a separate implementation gate;
the authenticated UAT records their current HTTP status rather than treating a
missing export route as a successful export.

"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const edge = await readFile(new URL("../supabase/functions/claw-api/index.ts", import.meta.url), "utf8");
const runtime = await readFile(new URL("../web/cloud-runtime.js", import.meta.url), "utf8");
const users = await readFile(new URL("../web/cloud-user-management.js", import.meta.url), "utf8");
const launcher = await readFile(new URL("./Start_Cloud_Staging.py", import.meta.url), "utf8");
const manualLauncher = await readFile(new URL("../Start_Cloud_Staging.bat", import.meta.url), "utf8");
const manualChecklist = await readFile(new URL("../docs/MANUAL_CLOUD_BROWSER_UAT.md", import.meta.url), "utf8");

for (const route of ["/api/bootstrap", "/api/settings", "/api/machines", "/api/new-closing", "/api/calculate", "/api/closings/save", "/api/refills/", "/api/history", "/api/images/replace", "/api/images/remove"]) {
  assert.ok(edge.includes(route), `cloud Edge façade must cover ${route}`);
}
assert.match(edge, /admin\.auth\.getUser\(bearer\)/, "Edge façade must verify the user token");
assert.match(edge, /finalize_daily_closing/, "finalization must use the server-authoritative RPC");
assert.match(edge, /5 \* 1024 \* 1024/, "image size must remain capped at 5 MB");
assert.match(edge, /remove\(\[nextPath\]\)/, "failed image reference updates must clean the new object");
assert.match(runtime, /refresh_token/, "cloud runtime must restore and refresh sessions");
assert.match(runtime, /signOut/, "cloud runtime must support logout");
assert.match(runtime, /Username/, "cloud login must present Username, not Email");
assert.match(runtime, /@claw\.internal/, "cloud login must derive an internal Auth identifier");
assert.ok(!/name=\\"email\\"|>Email</.test(runtime), "cloud login must not expose an email field");
assert.match(users, /Add User/, "Developer UI must provide Add User");
assert.match(users, /Username/, "Developer UI must display Username");
assert.ok(!/>Email<|name=\\"email\\"/.test(users), "Developer UI must not expose technical Auth email");
assert.match(users, /Show inactive/, "Developer UI must hide inactive accounts by default with an explicit toggle");
assert.match(users, /data-user-id/, "Developer UI must expose the existing edit/update action");
assert.match(users, /method: editing \? "PATCH" : "POST"/, "Developer UI must retain create and update API behavior");
assert.match(users, /claw-role-badge/, "Developer UI must render readable role badges");
assert.match(users, /claw-status-badge/, "Developer UI must render readable status badges");
assert.match(edge, /apply_developer_user_profile/, "Developer-managed users must use the transactional profile/access RPC");
assert.match(edge, /auth\.admin\.deleteUser/, "failed user setup must compensate by removing the new Auth identity");
assert.match(launcher, /CLAW_SUPABASE_PUBLISHABLE_KEY/, "launcher must inject only runtime configuration");
assert.match(launcher, /\("localhost", 3001\)/, "cloud host must use localhost:3001");
assert.ok(!runtime.includes("SERVICE_ROLE"), "browser runtime must not contain a service-role key");
assert.match(manualLauncher, /\.env\.cloud-staging\.local/, "manual launcher must use its separate browser-safe config");
assert.match(manualLauncher, /fbvzqdqjqcbjopuinknw/, "manual launcher must pin the approved staging ref");
assert.match(manualLauncher, /http:\/\/localhost:3001\//, "manual launcher must open localhost:3001");
assert.match(manualLauncher, /Get-NetTCPConnection -State Listen -LocalPort 3001/, "manual launcher must refuse an occupied port 3001");
assert.match(manualChecklist, /localhost:3000\/.*reserved for normal local development/s, "manual cloud UAT must distinguish the reserved local-development port");
assert.ok(!/set "CONFIG=.*\.env\.staging\.local/i.test(manualLauncher), "manual launcher must not read the server-side staging environment");
assert.match(manualLauncher, /SUPABASE_SERVICE_ROLE_KEY/, "manual launcher must reject a service-role key in browser config");
for (const item of ["Developer: PASS / FAIL", "Admin: PASS / FAIL", "Outlet A: PASS / FAIL", "Outlet B: PASS / FAIL", "Daily Closing: PASS / FAIL", "Clipboard Paste: PASS / FAIL", "Review: PASS / FAIL", "Print: PASS / FAIL"]) assert.ok(manualChecklist.includes(item), `manual checklist must include ${item}`);
console.log("PASS - cloud Phase 4 façade/runtime contract");

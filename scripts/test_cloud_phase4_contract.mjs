"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const edge = await readFile(new URL("../supabase/functions/claw-api/index.ts", import.meta.url), "utf8");
const runtime = await readFile(new URL("../web/cloud-runtime.js", import.meta.url), "utf8");
const launcher = await readFile(new URL("./Start_Cloud_Staging.py", import.meta.url), "utf8");

for (const route of ["/api/bootstrap", "/api/settings", "/api/machines", "/api/new-closing", "/api/calculate", "/api/closings/save", "/api/refills/", "/api/history", "/api/images/replace", "/api/images/remove"]) {
  assert.ok(edge.includes(route), `cloud Edge façade must cover ${route}`);
}
assert.match(edge, /admin\.auth\.getUser\(bearer\)/, "Edge façade must verify the user token");
assert.match(edge, /finalize_daily_closing/, "finalization must use the server-authoritative RPC");
assert.match(edge, /5 \* 1024 \* 1024/, "image size must remain capped at 5 MB");
assert.match(edge, /remove\(\[nextPath\]\)/, "failed image reference updates must clean the new object");
assert.match(runtime, /refresh_token/, "cloud runtime must restore and refresh sessions");
assert.match(runtime, /signOut/, "cloud runtime must support logout");
assert.match(launcher, /CLAW_SUPABASE_PUBLISHABLE_KEY/, "launcher must inject only runtime configuration");
assert.ok(!runtime.includes("SERVICE_ROLE"), "browser runtime must not contain a service-role key");
console.log("PASS - cloud Phase 4 façade/runtime contract");

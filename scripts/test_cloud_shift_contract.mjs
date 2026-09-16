"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [edge, app, users, profile, uat, cleanup] = await Promise.all([
  read("../supabase/functions/claw-api/index.ts"), read("../web/assets/app.js"), read("../web/cloud-user-management.js"), read("../web/cloud-profile.js"), read("./test_authenticated_cloud_staging.mjs"), read("./cleanup_authenticated_cloud_uat.mjs"),
]);

assert.match(edge, /activeDraftForStore/, "Start Shift must resolve the outlet-wide active draft");
assert.match(edge, /closing_id: created\.closing_id/, "Start Shift must create and return a real server-side draft");
assert.match(edge, /closing_id: active\.id/, "repeated Start Shift must reuse one existing draft");
assert.match(edge, /validShiftDate/, "Start Shift must reject future dates");
assert.match(edge, /carryForward\.get\(product\.product_id\) \?\? integer\(product\.starting_qty\)/, "Begin Qty must carry forward or use canonical configured stock");
assert.match(edge, /status: "void"/, "void operation must retain an audited backend state");
assert.match(edge, /\.neq\("status", "void"\)/, "bootstrap must exclude voided records");
assert.match(app, /Start Shift/, "client must expose a Start Shift state");
assert.match(app, /api\("\/api\/active-closing"\)/, "client refresh must resolve the outlet-wide active draft before rendering Start Shift");
assert.match(app, /renderContinueShiftStateV2190\(active\)/, "client refresh must present Continue Shift for the active draft");
assert.match(app, /product-qty-input\[data-field="begin_qty"\]/, "Begin Qty must be locked in the client");
assert.match(app, /if\(scrollable&&Math\.abs\(event\.deltaY\)>Math\.abs\(event\.deltaX\)\)\{scrollable\.scrollTop/, "modal wheel handling must only intercept an actual internal scroll");
assert.doesNotMatch(users, />STAGING</, "User Management must not display a staging label");
assert.doesNotMatch(profile, /indicator\.textContent = "STAGING"/, "top bar must not display a staging label");
assert.match(uat, /try \{[\s\S]*finally \{[\s\S]*removeFixtureData/, "authenticated UAT must always run cleanup");
assert.match(uat, /createdMachineIds\.push\(meterMachine\.machine\.Machine_ID\)/, "UAT must track its own synthetic machines");
assert.match(cleanup, /delete-controlled-uat/, "one-time cleanup must require an explicit destructive confirmation");
assert.match(cleanup, /stg-admin-uat-|stg-outlet-a-uat-|stg-outlet-b-uat-/, "one-time cleanup must use only controlled test prefixes");
assert.match(cleanup, /Synthetic authenticated cloud parity fixture%/, "one-time cleanup must use the controlled closing marker");

console.log("PASS - cloud shift, UI, and fixture-cleanup contracts are covered.");

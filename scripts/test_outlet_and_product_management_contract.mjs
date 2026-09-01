"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [edge, app, users, cleanup, schema] = await Promise.all([
  read("../supabase/functions/claw-api/index.ts"),
  read("../web/assets/app.js"),
  read("../web/cloud-user-management.js"),
  read("./retire_stg_a_seed_styles.mjs"),
  read("../supabase/migrations/20260828_000001_initial_schema.sql"),
]);

assert.match(edge, /path\.startsWith\("\/api\/machine-styles\/"\) && req\.method === "DELETE"/, "product retirement needs its dedicated DELETE route");
assert.match(edge, /if \(!configurationManager\(ctx\)\) return fail\("Developer or Admin role required\.", 403\)/, "product retirement must remain Developer/Admin-only");
assert.match(edge, /update\(\{ is_active: false, updated_at:/, "retirement must soft-disable the master style");
assert.match(edge, /writeAudit\(ctx, "machine_style", styleId, "retire"/, "retirement must be audited");
assert.match(edge, /includeInactiveStyles \|\| style\.is_active/, "default machine templates must hide retired styles");
assert.match(edge, /is_active: product\.active !== false/, "re-adding an existing barcode must reactivate its master style");
assert.match(edge, /include_inactive/, "authorized configuration UI can request inactive styles");
assert.match(app, /Historical and active-shift rows will be preserved/, "UI must explain the non-destructive retirement boundary");
assert.match(app, /currentById\.forEach/, "active closing snapshots must retain retired products");
assert.match(app, /Show inactive/, "Manage Machines must offer an inactive-style view");
assert.match(app, /Close Shift/, "active draft must expose Close Shift");
assert.match(app, /void openClosingReview\(\)/, "Close Shift must enter review rather than finalize directly");

assert.match(edge, /path === "\/api\/outlets" && req\.method === "GET"/, "Developer outlet list route is required");
assert.match(edge, /path === "\/api\/outlets" && req\.method === "POST"/, "Developer outlet create route is required");
assert.match(edge, /path\.startsWith\("\/api\/outlets\/"\) && req\.method === "PATCH"/, "Developer outlet update route is required");
assert.match(edge, /normalizeOutletCode/, "outlet codes must be normalized");
assert.match(schema, /create table public\.stores[\s\S]*code text not null unique/, "outlet codes must remain uniquely enforced by the schema");
assert.match(edge, /The last active outlet cannot be deactivated/, "last active outlet must be protected");
assert.match(edge, /active draft shift/, "outlet deactivation must protect active drafts");
assert.match(edge, /settings_copied_from_store_id/, "new outlet settings must copy an active store default");
assert.match(users, /data-admin-tab="outlets"/, "User Management must include an Outlets tab");
assert.match(users, /Add Outlet/, "Outlets tab must create outlets");
assert.match(users, /Show inactive/, "Outlets tab must default-hide inactive outlets");
assert.match(users, /cannot have an active draft shift/, "UI must explain outlet deactivation safety");
assert.match(cleanup, /STG-A-RED/, "cleanup must name the first exact seed barcode");
assert.match(cleanup, /STG-A-BLUE/, "cleanup must name the second exact seed barcode");
assert.match(cleanup, /CLAW_RETIRE_STG_A_SEED_STYLES/, "cleanup must require explicit confirmation");
assert.match(cleanup, /--execute/, "cleanup must not run by default");
assert.doesNotMatch(cleanup, /closing_product_entries.*delete/i, "cleanup must not delete historical product entries");

console.log("PASS - outlet management, guarded seed retirement, active-draft retention, and Close Shift review contract.");

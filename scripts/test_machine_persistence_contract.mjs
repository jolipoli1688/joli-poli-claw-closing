"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [edge, app] = await Promise.all([
  read("../supabase/functions/claw-api/index.ts"),
  read("../web/assets/app.js"),
]);

assert.match(edge, /from\("machines"\)\.select\("sort_order"\)\.eq\("store_id", ctx\.store\.id\)\.order\("sort_order", \{ ascending: false \}\)\.limit\(1\)\.maybeSingle\(\)/, "new Cloud machines must derive position from the active outlet's maximum persisted sort order");
assert.match(edge, /const sortOrder = integer\(previousSort\.data\?\.sort_order\) \+ 1 \|\| 1/, "new Cloud machines must append with max sort_order plus one");
assert.match(edge, /sort_order: sortOrder/, "new Cloud machine rows must persist the computed append position");
assert.match(edge, /sort_order: machine\.Sort_Order, products: machine\.Products/, "opening templates must retain the master machine position after refresh");
assert.match(edge, /Machine_Type: row\.machine_type_name_snapshot, Sort_Order: row\.sort_order_snapshot/, "active draft reloads must retain the persisted machine position snapshot");
assert.match(edge, /\.eq\("store_id", ctx\.store\.id\)\.order\("sort_order"\)\.order\("machine_code"\)/, "machine reads must remain scoped and deterministic");

assert.match(app, /const confirmedMachines = await api\("\/api\/machines\?active_only=false"\);[\s\S]*state\.machines = confirmedMachines;[\s\S]*state\.bootstrap\.machines = confirmedMachines/, "the browser must read back the authoritative machine list before treating a save as confirmed");
assert.match(app, /sort_order: updated\.Sort_Order,[\s\S]*products: freshProducts/, "a newly created machine must carry its persisted position into the active closing");
assert.match(app, /if \(state\.closing && state\.closingId && !state\.closingReadOnly\) \{[\s\S]*scheduleAutosaveV2179\(\);[\s\S]*await flushAutosaveV2179\(\);/, "a machine added to an active draft must persist its closing snapshot before the editor closes");
assert.match(app, /function stableMachineComparator\(left, right\)/, "browser ordering must remain centralized");
assert.ok(!app.includes("localStorage.setItem") || !app.match(/localStorage\.setItem\([^)]*machine/i), "machine persistence must not be faked with browser storage");

console.log("PASS - Cloud machine creation is read-back confirmed, draft-persisted, and deterministically ordered after reload.");

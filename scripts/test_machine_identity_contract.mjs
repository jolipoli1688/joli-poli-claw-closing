"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [edge, app, schema] = await Promise.all([
  read("../supabase/functions/claw-api/index.ts"),
  read("../web/assets/app.js"),
  read("../supabase/migrations/20260828_000001_initial_schema.sql"),
]);

assert.match(schema, /unique \(store_id, machine_type_id, machine_number\)/, "database must keep per-store, per-type machine-number uniqueness");
assert.match(edge, /const machineNumber = integer\(previous\.data\?\.machine_number\) \+ 1 \|\| 1/, "first machine of each type must start at 1 and later machines increment");
assert.match(edge, /eq\("machine_type_id", machineType\.data\.id\)/, "number sequence must be scoped to the selected type");
assert.match(edge, /machine_code: machineCode/, "internal machine code must be server-generated");
assert.match(edge, /machineCodePart\(ctx\.store\.code\).*machineCodePart\(machineType\.data\.name\).*padStart\(3, "0"\)/, "internal code must deterministically include store, type, and number");
assert.match(edge, /display_name: `\$\{machineType\.data\.name\} \$\{machineNumber\}`/, "visible identity must be Type plus number");
assert.doesNotMatch(edge, /Machine ID is required/, "obsolete machine-ID error must be removed");
assert.match(edge, /At least one product barcode is required/, "new machine must require an actual product barcode");
assert.match(edge, /for \(let attempt = 0; attempt < 5; attempt\+\+\)/, "concurrent creates must retry");
assert.match(edge, /isUniqueViolation\(created\.error\)/, "only unique collisions may retry");
assert.match(edge, /Machine Type is fixed after creation/, "editing must not silently renumber or change identity");
assert.match(app, /if \(machineId\) payload\.machine_id = machineId/, "new-machine payload must omit machine_id");
const machinePayload = app.match(/const payload = \{[\s\S]*?body: JSON\.stringify\(payload\)/)?.[0] || "";
assert.doesNotMatch(machinePayload, /machine_code:|machine_name:|machine_number:/, "new-machine UI must not submit internal identity fields");
assert.match(app, /Machine number is assigned automatically inside the selected type\./, "Add Machine must explain automatic numbering");
assert.match(app, /Machine Type is fixed after creation/, "Edit Machine must communicate immutable identity");
assert.match(edge, /is_active: product\.active !== false/, "multiple/retired product behavior must retain reactivation support");

console.log("PASS - automatic machine identity, concurrency retry, immutable edit identity, and product preservation contract.");

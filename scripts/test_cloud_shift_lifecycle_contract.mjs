"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [edge, uat, migration] = await Promise.all([
  read("../supabase/functions/claw-api/index.ts"),
  read("./test_authenticated_cloud_staging.mjs"),
  read("../supabase/migrations/20260901050154_allow_same_date_replacement_after_void.sql"),
]);

const calculateSource = edge.match(/function calculate\(payload: any\) \{[\s\S]*?\n}\n\nasync function saveClosing/)?.[0] || "";
const refillSource = edge.match(/async function recordRefill[\s\S]*?\n}\n\nasync function serve/)?.[0] || "";
const saveSource = edge.match(/async function saveClosing[\s\S]*?\n}\n\nfunction refillHistory/)?.[0] || "";

assert.match(calculateSource, /finalQty === "" \|\| finalQty === null \|\| finalQty === undefined\) return sum/, "blank Final Qty must contribute zero product usage");
assert.match(edge, /final_qty: ""/, "fresh Start Shift products must begin with a blank Final Qty");
assert.match(calculateSource, /total_prizes_won: prizes/, "Start Shift KPI product usage must be derived only from completed Final Qty values");
assert.match(refillSource, /const qtyUsed = finalQty === null \|\| finalQty === undefined \? 0/, "refill with blank Final Qty must keep Qty Used at zero");
assert.match(saveSource, /workflow === "finalized" && !payload\.closed_by/, "only finalization must require Closed By");
assert.match(saveSource, /workflow === "finalized" && \(!canFinalize\(ctx\) \|\| !payload\.verified_by\)/, "only finalization must require Verified By");
assert.doesNotMatch(saveSource, /requireClosedBy[^\n]*Closed By is required/, "draft save must not require Closed By");
assert.match(edge, /\.neq\("status", "void"\)\.maybeSingle\(\)/, "Start Shift must ignore voided same-date closings");
assert.match(migration, /drop constraint if exists daily_closings_store_id_report_date_key/, "migration must remove the hard store/date constraint");
assert.match(migration, /create unique index if not exists uq_daily_closings_store_report_date_active/, "migration must create the active-closing unique index");
assert.match(migration, /where status <> 'void'::public\.closing_status/, "only non-void closings may be unique per store/date");
assert.match(uat, /selectPastFixtureStart/, "UAT must choose a collision-free past fixture window");
assert.match(uat, /fixtureDate\(6\) <= today/, "UAT must assert its fixture dates are not future dates");
assert.doesNotMatch(uat, /fixtureYear/, "UAT must not retain stale fixtureYear references");
assert.doesNotMatch(uat, /setUTCDate\(fixtureStart\.getUTCDate\(\) \+/, "UAT must not generate future fixture dates");
assert.match(uat, /draft without Closed By/, "UAT must cover a draft without Closed By");
assert.match(uat, /finalization must still require Verified By/, "UAT must cover Verified By finalization validation");
assert.match(uat, /refill with blank Final Qty/, "UAT must cover blank Final Qty refill behavior");
assert.match(uat, /same-date replacement draft/, "UAT must cover replacement after void");
assert.match(uat, /synthetic fixture zero-growth verification/, "UAT must verify cleanup leaves no created fixtures");

console.log("PASS - cloud shift lifecycle contract; blank Final Qty, draft/finalization, past fixtures, void replacement, and cleanup are covered.");

"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [edge, uat, migration] = await Promise.all([
  read("../supabase/functions/claw-api/index.ts"),
  read("./test_authenticated_cloud_staging.mjs"),
  read("../supabase/migrations/20260903010000_one_active_draft_per_store.sql"),
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
assert.match(edge, /async function activeDraftForStore\(ctx: Context\)/, "active lifecycle lookup must be scoped to the outlet, not a report date");
assert.match(edge, /\.eq\("store_id", ctx\.store\.id\)\.eq\("status", "draft"\)\.maybeSingle\(\)/, "only one outlet Draft may be active");
assert.doesNotMatch(edge, /async function activeClosingForDate/, "date-scoped Draft lookup must not remain a lifecycle authority");
assert.match(migration, /having count\(\*\) > 1/, "migration must stop before changing the index when legacy duplicate Drafts exist");
assert.match(migration, /draft_id[\s\S]*?report_date[\s\S]*?closing_code[\s\S]*?machine_count[\s\S]*?product_count[\s\S]*?updated_at/, "migration diagnostics must identify every legacy duplicate Draft");
assert.match(migration, /drop index if exists public\.uq_daily_closings_store_report_date_draft/, "migration must replace the former per-date Draft index");
assert.match(migration, /create unique index uq_daily_closings_store_draft[\s\S]*?\(store_id\)/, "migration must enforce one Draft per outlet");
assert.match(migration, /where status = 'draft'::public\.closing_status/, "only Draft rows may be unique; finalized and Void history remains unrestricted");
assert.match(uat, /selectPastFixtureStart/, "UAT must choose a collision-free past fixture window");
assert.match(uat, /fixtureDate\(6\) <= today/, "UAT must assert its fixture dates are not future dates");
assert.doesNotMatch(uat, /fixtureYear/, "UAT must not retain stale fixtureYear references");
assert.doesNotMatch(uat, /setUTCDate\(fixtureStart\.getUTCDate\(\) \+/, "UAT must not generate future fixture dates");
assert.match(uat, /draft without Closed By/, "UAT must cover a draft without Closed By");
assert.match(uat, /finalization must still require Verified By/, "UAT must cover Verified By finalization validation");
assert.match(uat, /refill with blank Final Qty/, "UAT must cover blank Final Qty refill behavior");
assert.match(uat, /same-date replacement draft/, "UAT must cover replacement after void");
assert.match(uat, /synthetic fixture zero-growth verification/, "UAT must verify cleanup leaves no created fixtures");

console.log("PASS - cloud shift lifecycle contract; blank Final Qty, finalization, one cross-day Draft per outlet, safe legacy duplicate blocking, past fixtures, void replacement, and cleanup are covered.");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../web/assets/app.js", import.meta.url), "utf8");
const edge = readFileSync(new URL("../supabase/functions/claw-api/index.ts", import.meta.url), "utf8");
const workflow = app.slice(app.lastIndexOf("/* v2.1.108 -- server-confirmed Draft mutations"));

assert.match(workflow, /activeDraftRefillProductV2214[\s\S]*?String\(item\.product_id\) === requestedId/, "confirmed updates must resolve the canonical product by stable product identity");
assert.match(workflow, /serverProduct\.refill_history[\s\S]*?product\.refill_history = history\.map/, "the confirmed refill ledger must merge into active Draft state");
assert.match(workflow, /product\.refill_history\.reduce\([\s\S]*?signedAdjustmentNumberV2164/, "the visible refill total must derive from the active ledger");
assert.match(workflow, /finalValue === ''[\s\S]*?\? 0[\s\S]*?Math\.max\(0, numeric\(product\.begin_qty\)\) \+ total - numeric\(finalValue\)/, "Qty Used must immediately use the existing blank-final and signed-refill formula");
assert.match(workflow, /flushAutosaveForDraftMutationV2214[\s\S]*?autosavePromiseV2179[\s\S]*?autosaveQueuedV2179/, "a refill mutation must drain queued autosave work before it starts");
assert.match(workflow, /await flushAutosaveForDraftMutationV2214\(\)/, "the refill modal must use the autosave drain");
assert.match(workflow, /api\('\/api\/refills'[\s\S]*?applyConfirmedRefillToDraftV2214/, "Cloud refill responses must update state only after confirmation");
assert.match(workflow, /oldHistory[\s\S]*?catch \(error\) \{\s*product\.refill_history = oldHistory;[\s\S]*?throw error;/, "a failed local Draft save must roll back its unsaved refill event");
assert.match(workflow, /applyConfirmedRefillToDraftV2214[\s\S]*?autosaveRevisionV2179 \+= 1[\s\S]*?autosaveQueuedV2179 = false/, "confirmed mutations must rebase client autosave state");
assert.match(workflow, /closeModal\(\);\s*renderClosing\(\);/, "the active Closing render must run immediately after a confirmed refill");
assert.doesNotMatch(workflow, /window\.location\.reload/, "the refill update must not reload the page");
assert.match(edge, /path\.startsWith\("\/api\/refills\/"\)[\s\S]*?product: \{ refill_qty:[\s\S]*?refill_history:/, "the existing refill void endpoint returns the recomputed product ledger for a live client merge");

console.log("PASS - refill confirmed Draft state update contract.");

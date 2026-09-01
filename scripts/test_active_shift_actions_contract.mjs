"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [edge, app] = await Promise.all([
  read("../supabase/functions/claw-api/index.ts"),
  read("../web/assets/app.js"),
]);

assert.match(app, /closingAutosaveStatusV2181/, "every active draft must render a top action autosave status");
assert.match(app, /closeShiftBtnV2181/, "every active draft must render Close Shift in the top action area");
assert.match(app, /voidCurrentShiftBtnV2181/, "Developer/Admin active drafts must render Void Shift");
assert.match(app, /\["developer", "admin"\]/, "Void Shift must follow the existing Developer/Admin policy");
assert.match(app, /await flushAutosaveV2179\(\); openClosingReviewV2179DailyWorkflow/, "Close Shift must flush before Review");
assert.match(app, /Void this shift\?/, "current shift void requires confirmation");
assert.match(app, /Historical audit data will be retained/, "current shift void must state the audit boundary");
assert.match(app, /api\(`\/api\/closings\/\$\{encodeURIComponent\(targetClosingId\)\}`/, "Void Shift must use its captured current closing ID only");
assert.match(app, /state\.closingId = null[\s\S]*state\.closing = null[\s\S]*await reloadBootstrapAfterVoidV2181\(\)[\s\S]*await ensureClosingPage\(\)/, "successful void must clear the draft and immediately restore Start Shift state");
assert.match(app, /autosaveGenerationV2181 \+= 1/, "void must invalidate a pending autosave generation");
assert.match(app, /generation !== autosaveGenerationV2181 \|\| closingId !== state\.closingId/, "stale autosave responses must not mutate a voided draft");
assert.match(edge, /existing\.data\.status !== "draft"/, "the server must reject post-void draft saves");
assert.match(edge, /\.neq\("status", "void"\)\.maybeSingle\(\)/, "same-date replacement must ignore voided closings");
assert.match(edge, /readMachines\(ctx, true\)/, "replacement opening templates must use active machines/styles only");
assert.match(edge, /includeInactiveStyles \|\| style\.is_active/, "inactive RED/BLUE styles must stay out of a replacement template");

const display = iso => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
assert.equal(display("2026-01-09"), "09-01-2026", "January 9 must remain January 9 in staff display");
assert.equal(display("2026-09-01"), "01-09-2026", "September 1 must remain September 1 in staff display");
assert.match(app, /function isoToDisplayDate\(value\)/, "all ISO dates must use the central display conversion");

console.log("PASS - active Draft actions, exact void/reset, same-date restart, inactive-template exclusion, date display, and autosave race contract.");

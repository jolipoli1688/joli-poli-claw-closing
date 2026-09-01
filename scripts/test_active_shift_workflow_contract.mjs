"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [edge, app] = await Promise.all([
  read("../supabase/functions/claw-api/index.ts"),
  read("../web/assets/app.js"),
]);

assert.match(edge, /if \(active\?\.status === "draft"\) \{[\s\S]*closingId = active\.id/, "saveClosing without an ID must reuse a same-store draft");
assert.match(edge, /active\?\.status === "finalized"\) throw new Error\("This shift is already closed/, "saveClosing must reject a closed same-date shift");
assert.match(edge, /path === "\/api\/active-closing" && req\.method === "GET"/, "resume must use an exact draft lookup route");
assert.match(edge, /active\?\.status === "draft" \? active\.id : null/, "finalized and voided closings must never resume as drafts");
assert.match(edge, /if \(active\?\.status === "draft"\) closingId = active\.id/, "refill without closing_id must reuse an existing draft");
assert.doesNotMatch(edge.match(/async function recordRefill[\s\S]*?\n}\n\nasync function serve/)?.[0] || "", /insert\(record\)/, "refill must not blindly create a second same-date draft");
assert.match(edge, /from\("closing_product_entries"\)\.update\(productRecord\)/, "draft autosave must preserve existing product rows and their refill ledger");
assert.match(app, /setTimeout\(\(\) => \{ void flushAutosaveV2179\(\)\.catch\(\(\) => \{\}\); \}, 850\)/, "operational edits must debounce autosave without an unhandled retry error");
assert.match(app, /autosavePromiseV2179/, "autosave must permit only one in-flight draft write");
assert.match(app, /autosaveQueuedV2179/, "edits during a save must queue the newer draft state");
assert.match(app, /await flushAutosaveV2179\(\); openClosingReviewV2179DailyWorkflow/, "Review must flush pending autosave");
assert.match(app, /await flushAutosaveV2179\(\); return showRefillProductModalV2179DailyWorkflow/, "Refill must flush pending autosave");
assert.match(app, /Pending autosave changes will be saved before this shift is closed/, "Close Shift must flush pending autosave");
assert.match(app, /closingAutosaveStatusV2179/, "Save Draft must be replaced by an autosave status indicator");
assert.match(app, /Save Now/, "autosave failure recovery must offer an explicit Save Now action");
assert.match(app, /data-autosave-error/, "autosave failures must reuse one visible error toast");
assert.match(app, /autosaveQueuedV2179 && succeeded/, "failed autosaves must not enter a tight queued retry loop");
assert.match(app, /clearAutosaveErrorV2179\(\)/, "a successful autosave must clear its prior failure state");
assert.match(app, /Start Shift creates today/, "Start Shift copy must describe an immediate server-side draft");
assert.doesNotMatch(app.slice(app.lastIndexOf("/* v2.1.79")), /New Closing|New closing/, "the current operational layer must not use New Closing wording");

console.log("PASS - active shift draft ownership, autosave, resume, and refill reuse contract.");

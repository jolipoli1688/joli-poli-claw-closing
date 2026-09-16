"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [edge, app, migration, diagnostic] = await Promise.all([
  read("../supabase/functions/claw-api/index.ts"),
  read("../web/assets/app.js"),
  read("../supabase/migrations/20260903010000_one_active_draft_per_store.sql"),
  read("./report_active_draft_duplicates.mjs"),
]);

const opening = edge.match(/async function openingTemplate[\s\S]*?\n}\n\nasync function saveClosing/)?.[0] || "";
const save = edge.match(/async function saveClosing[\s\S]*?\n}\n\nfunction refillHistory/)?.[0] || "";
const refill = edge.match(/async function recordRefill[\s\S]*?\n}\n\nasync function serve/)?.[0] || "";
const activeRoute = edge.match(/if \(path === "\/api\/active-closing"[\s\S]*?\n    if \(path === "\/api\/new-closing"/)?.[0] || "";
const newRoute = edge.match(/if \(path === "\/api\/new-closing"[\s\S]*?\n    if \(path === "\/api\/calculate"/)?.[0] || "";
const ensure = app.slice(app.lastIndexOf("ensureClosingPage = async function()"));
const continueCard = app.match(/function renderContinueShiftStateV2194[\s\S]*?\n}/)?.[0] || "";

assert.match(edge, /async function activeDraftForStore\(ctx: Context\)[\s\S]*?\.eq\("store_id", ctx\.store\.id\)\.eq\("status", "draft"\)/, "active Draft lookup must be outlet-wide and independent of report date");
assert.match(activeRoute, /has_active_shift/, "active-closing must expose explicit active-shift state");
assert.doesNotMatch(activeRoute, /validShiftDate/, "active-closing must not require today's date to find an old Draft");
assert.match(newRoute, /const active = await activeDraftForStore\(ctx\);[\s\S]*?existing_closing_id: active\.id/, "Start Shift must return an existing outlet Draft before creating another");
assert.match(newRoute, /const concurrent = await activeDraftForStore\(ctx\)/, "concurrent Start Shift requests must converge on the same outlet Draft");
assert.match(save, /record\.report_date = existing\.data\.report_date/, "saving an existing Draft must preserve its original report date");
assert.match(save, /record\.report_date = active\.report_date/, "a stale no-ID save must preserve the reused Draft report date");
assert.match(refill, /const active = await activeDraftForStore\(ctx\)/, "refill-triggered draft creation must reuse the outlet Draft too");
assert.match(app, /const CONTINUE_SHIFT_ACK_STORAGE_KEY_V2194 = "claw_continue_shift_ack"/, "Continue Shift acknowledgement must persist locally across refresh and browser restart");
assert.match(app, /function localCalendarDateV2194\(now = new Date\(\)\)[\s\S]*?getFullYear\(\)[\s\S]*?getMonth\(\) \+ 1[\s\S]*?getDate\(\)/, "acknowledgements must use the browser's local calendar date");
assert.doesNotMatch(app.match(/function localCalendarDateV2194[\s\S]*?\n}/)?.[0] || "", /toISOString/, "Continue Shift acknowledgement must not use a UTC ISO date");
assert.match(app, /acknowledged_date: localCalendarDateV2194\(\)/, "acknowledgements must record the local acknowledgement date");
assert.match(app, /store_id: String\(storeId\)[\s\S]*?closing_id: String\(closingId\)/, "acknowledgements must bind both selected outlet and Draft ID");
assert.match(continueCard, /acknowledgeContinueShiftV2194\(active\.closing_id\)[\s\S]*?openClosingV2179DailyWorkflow\(active\.closing_id\)/, "Continue Shift must acknowledge then reopen the exact existing Draft");
assert.match(app, /function requiresContinueShiftAcknowledgementV2205\(active\)[\s\S]*?reportDate < localCalendarDateV2194\(\)/, "only a Draft from an earlier local calendar day may require Continue Shift acknowledgement");
assert.match(ensure, /api\("\/api\/active-closing"\)[\s\S]*?requiresContinueShiftAcknowledgementV2205\(active\)[\s\S]*?acknowledgeContinueShiftV2194\(active\.closing_id, storeId\)[\s\S]*?openClosingV2179DailyWorkflow\(active\.closing_id\)[\s\S]*?hasContinueShiftAcknowledgementV2194\(active\.closing_id, storeId\)[\s\S]*?openClosingV2179DailyWorkflow\(active\.closing_id\)[\s\S]*?renderContinueShiftStateV2194/, "same-day Drafts must auto-open while old Drafts resume only after local-day acknowledgement");
assert.match(ensure, /pruneContinueShiftAcknowledgementsV2194\(storeId, active\.closing_id\)/, "stale or another-Draft acknowledgements must be discarded before resuming");
assert.match(app, /if \(!data\.existing_closing_id\) acknowledgeContinueShiftV2194\(closingId\)/, "a newly started Draft must be acknowledged immediately");
assert.match(app, /status === "Finalized"\) clearContinueShiftAcknowledgementV2194/, "Close Shift must clear its acknowledgement");
assert.match(app, /result\.voided_closing_id !== targetClosingId[\s\S]*?clearContinueShiftAcknowledgementV2194\(targetClosingId\)/, "successful Draft void must clear its acknowledgement");
assert.match(opening, /readMachines\(ctx, true\)/, "new shifts must preserve current active machine structure");
assert.match(opening, /\.eq\("status", "finalized"\)\.lte\("report_date", reportDate\)\.order\("report_date", \{ ascending: false \}\)\.order\("finalized_at", \{ ascending: false \}\)\.order\("created_at", \{ ascending: false \}\)/, "carry-forward must use the latest finalized same-or-earlier outlet closing");
assert.match(opening, /machine_style_id,final_qty/, "carry-forward must map Final Qty by stable machine_style_id");
assert.match(opening, /carryForward\.get\(product\.product_id\) \?\? integer\(product\.starting_qty\)/, "new styles must fall back only to configured starting_qty");
assert.match(opening, /refill_qty: 0, final_qty: ""/, "new shifts must reset operational quantities while preserving machine configuration");
assert.match(migration, /having count\(\*\) > 1/, "the index migration must block legacy duplicates without modifying them");
assert.match(migration, /create unique index uq_daily_closings_store_draft[\s\S]*?\(store_id\)/, "database must enforce one Draft per outlet");
assert.match(diagnostic, /draft_id[\s\S]*?report_date[\s\S]*?closing_code[\s\S]*?machine_count[\s\S]*?product_count[\s\S]*?updated_at/, "read-only diagnostic must report all requested duplicate Draft fields");
assert.doesNotMatch(diagnostic, /\.insert\(|\.update\(|\.delete\(|\.rpc\(/, "duplicate diagnostics must be read-only");

console.log("PASS - cross-day Draft lifecycle, global outlet uniqueness, carry-forward, machine preservation, and duplicate-draft diagnostics are contract-protected.");

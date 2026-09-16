"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [app, edge] = await Promise.all([
  read("../web/assets/app.js"),
  read("../supabase/functions/claw-api/index.ts"),
]);

assert.match(app, /function displayToIsoDate\(value\)/, "the browser must centralize display-to-ISO conversion");
assert.match(app, /text\.match\(\/\^\(\\d\{2\}\)-\(\\d\{2\}\)-\(\\d\{4\}\)\$\//, "DD-MM-YYYY must be parsed explicitly rather than by browser date parsing");
assert.match(app, /function isoToDisplayDate\(value\)/, "the browser must centralize ISO-to-display conversion");
assert.match(app, /candidate\.getUTCFullYear\(\) !== y/, "invalid display calendar dates must be rejected");
assert.match(app, /report_date: canonicalClosingDate\(state\.closing\.report_date\)/, "all save/autosave/finalization payloads must use ISO report dates");
assert.match(app, /const reportDate = displayToIsoDate\(value\)/, "date navigation requests must use ISO report dates");
assert.match(app, /api\("\/api\/active-closing"\)/, "Continue Shift lookup must be outlet-wide rather than date-scoped");
assert.match(app, /closingPayload\("Draft"\)/, "refill closing_payload must continue to use the canonical payload builder");
assert.match(edge, /text\.match\(\/\^\(\\d\{2\}\)-\(\\d\{2\}\)-\(\\d\{4\}\)\$\//, "Edge must defensively accept DD-MM-YYYY");
assert.match(edge, /parsed\.getUTCMonth\(\) !== Number\(month\) - 1/, "Edge must reject invalid calendar dates");
assert.match(edge, /reportDate > today/, "Edge must reject future dates");
assert.match(edge, /return reportDate/, "Edge must store the normalized ISO report date");

const displayToIso = value => {
  const text = String(value || "").trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/), year, month, day;
  if (match) [, year, month, day] = match;
  else { match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/); if (!match) return ""; [, day, month, year] = match; }
  const candidate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return candidate.getUTCFullYear() === Number(year) && candidate.getUTCMonth() === Number(month) - 1 && candidate.getUTCDate() === Number(day) ? `${year}-${month}-${day}` : "";
};
assert.equal(displayToIso("01-09-2026"), "2026-09-01", "display date must canonicalize for API payloads");
assert.equal(displayToIso("2026-09-01"), "2026-09-01", "ISO must remain unchanged");
assert.equal(displayToIso("31-02-2026"), "", "invalid calendar date must be rejected");

console.log("PASS - cloud shift date normalization and API payload contract.");

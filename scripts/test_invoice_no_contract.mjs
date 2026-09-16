"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [edge, app, hardening] = await Promise.all([
  read("../supabase/functions/claw-api/index.ts"),
  read("../web/assets/app.js"),
  read("../supabase/migrations/20260829_000005_cloud_phase2_hardening.sql"),
]);

assert.match(hardening, /unique index if not exists uq_daily_closings_store_code on public\.daily_closings\(store_id, closing_code\)/, "existing store-scoped closing_code uniqueness must protect invoice collisions");
assert.match(edge, /function invoiceCode\(storeCode: unknown, reportDate: string, sequence: number\)/, "invoice numbers must be generated server-side");
assert.match(edge, /return `\$\{code\}-\$\{day\}\$\{month\}\$\{year\.slice\(-2\)\}\$\{sequence\}`/, "invoice format must preserve outlet code and use DDMMYY plus the daily sequence");
assert.match(edge, /select\("id", \{ count: "exact", head: true \}\)\.eq\("store_id", ctx\.store\.id\)\.eq\("report_date", reportDate\)/, "daily invoice sequence must count every closing for the same outlet and date");
assert.match(edge, /for \(let attempt = 0; attempt < 5; attempt\+\+\)[\s\S]*isUniqueViolation\(created\.error\)/, "invoice creation must retry a database uniqueness collision");
assert.match(edge, /record\.closing_code = invoiceCode\(ctx\.store\.code, reportDate, \(sequence\.count \|\| 0\) \+ 1\)/, "new drafts must persist the generated invoice in closing_code");
assert.match(edge, /Closing_Code: row\.closing_code \|\| ""/, "read APIs must return the business invoice alongside the internal UUID");
assert.match(edge, /return \{ ok: true, closing_id: closingId, closing_code: saved\.data\.closing_code \|\| ""/, "save responses must retain UUID internals while returning the invoice for display");
assert.match(edge, /\["Report Date", "Invoice No", "Workflow"/, "monthly downloads must use Invoice No");
assert.match(edge, /\["Invoice No", value\.Closing_Code\]/, "daily downloads must use Invoice No");

assert.match(app, /function closingInvoiceNo\(source\)/, "browser display must resolve closing_code without substituting the UUID");
assert.match(app, /invoice_no: h\.Closing_Code \|\| ""/, "closing reloads must retain the invoice number");
assert.match(app, /<span>Invoice No<\/span><strong>\$\{escapeHtml\(closingInvoiceNo\(c\)\)\}/, "Review must display Invoice No rather than Closing ID");
assert.match(app, /placeholder="Search Invoice No, machine, barcode, or staff/, "History search must refer to Invoice No");
assert.match(app, /<th>Date \/ Time<\/th><th>Invoice No<\/th>/, "History table must display Invoice No");
assert.match(app, /encodeURIComponent\(row\.Closing_ID\)/, "void operations must continue to use the internal UUID");
assert.match(app, /closing_id: state\.closingId/, "autosave and save payloads must keep UUID relations internal");
assert.match(app, /state\.closing\.invoice_no = result\.closing_code \|\| state\.closing\.invoice_no \|\| ""/, "finalization must retain rather than regenerate the assigned invoice");

console.log("PASS - Invoice No generation, collision handling, UUID boundaries, and user-facing presentation contract.");

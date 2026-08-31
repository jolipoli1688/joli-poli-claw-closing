"use strict";

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const projectRef = "fbvzqdqjqcbjopuinknw";
const expectedUrl = `https://${projectRef}.supabase.co`;
const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "STG_DEVELOPER_USERNAME", "STG_DEVELOPER_PASSWORD"];
const missing = required.filter(key => !process.env[key]);
if (missing.length) throw new Error(`Missing required test environment variables: ${missing.join(", ")}.`);
const baseUrl = process.env.SUPABASE_URL.replace(/\/$/, "");
if (baseUrl !== expectedUrl) throw new Error("Authenticated UAT is restricted to the approved staging project.");

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const service = createClient(baseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const assertStatus = (actual, expected, label) => assert.equal(actual, expected, `${label}: expected HTTP ${expected}, got ${actual}`);
const password = () => `Uat-${crypto.randomBytes(18).toString("base64url")}9!`;
const normalize = value => String(value).normalize("NFKC").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9._-]/g, "").replace(/-+/g, "-");
const internalEmail = username => `${normalize(username)}@claw.internal`;
const authHeaders = { apikey: serviceKey, "Content-Type": "application/json" };

async function login(username, secret) {
  const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, { method: "POST", headers: authHeaders, body: JSON.stringify({ email: internalEmail(username), password: secret }) });
  assertStatus(response.status, 200, "username/password login");
  return response.json();
}
async function api(token, path, options = {}) {
  const response = await fetch(`${baseUrl}/functions/v1/claw-api${path}`, {
    method: options.method || "GET",
    headers: { ...authHeaders, Authorization: `Bearer ${token}`, ...(options.storeId ? { "x-claw-store-id": options.storeId } : {}) },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}
async function unauthenticated(path) {
  const response = await fetch(`${baseUrl}/functions/v1/claw-api${path}`, { headers: { "Content-Type": "application/json" } });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}
async function refresh(session) {
  const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=refresh_token`, { method: "POST", headers: authHeaders, body: JSON.stringify({ refresh_token: session.refresh_token }) });
  assertStatus(response.status, 200, "session refresh");
  return response.json();
}
async function logout(session) {
  const response = await fetch(`${baseUrl}/auth/v1/logout`, { method: "POST", headers: { ...authHeaders, Authorization: `Bearer ${session.access_token}` } });
  assert.ok(response.ok, `logout failed with ${response.status}`);
}
async function expectStatus(promise, expected, label) {
  const result = await promise;
  assert.equal(result.status, expected, `${label}: expected HTTP ${expected}, got ${result.status}${result.body?.detail ? ` (${result.body.detail})` : ""}`);
  return result.body;
}

const runSuffix = crypto.randomBytes(5).toString("hex");
const fixtureYear = 3000 + (Number.parseInt(runSuffix.slice(0, 4), 16) % 6000);
const users = {
  admin: { username: `STG Admin UAT ${runSuffix}`, role: "admin", outlets: [] },
  outletA: { username: `STG Outlet A UAT ${runSuffix}`, role: "outlet", outlets: ["STG-A"] },
  outletB: { username: `STG Outlet B UAT ${runSuffix}`, role: "outlet", outlets: ["STG-B"] },
};
for (const user of Object.values(users)) user.password = password();

let developer = await login(process.env.STG_DEVELOPER_USERNAME, process.env.STG_DEVELOPER_PASSWORD);
const developerBootstrap = await expectStatus(api(developer.access_token, "/api/bootstrap"), 200, "Developer bootstrap");
assert.equal(developerBootstrap.cloud_context.profile.role, "developer", "Developer profile role");
assert.deepEqual(developerBootstrap.cloud_context.stores.map(store => store.code).sort(), ["STG-A", "STG-B"], "Developer outlet access");
developer = await refresh(developer);
await logout(developer);
developer = await login(process.env.STG_DEVELOPER_USERNAME, process.env.STG_DEVELOPER_PASSWORD);

for (const user of Object.values(users)) {
  const result = await expectStatus(api(developer.access_token, "/api/users", { method: "POST", body: { username: user.username, temporary_password: user.password, role: user.role, outlets: user.outlets, status: "active" } }), 201, `${user.role} creation through Developer API`);
  assert.equal(result.username, normalize(user.username), "username must be normalized");
  assert.equal(result.role, user.role, "created role");
  user.id = result.id;
}

const listed = await expectStatus(api(developer.access_token, "/api/users"), 200, "Developer user list");
assert.ok(!JSON.stringify(listed).includes("@claw.internal"), "internal Auth email must not be displayed");
for (const user of Object.values(users)) assert.ok(listed.some(row => row.id === user.id && row.username === normalize(user.username)), "created user must be listed by username");
await expectStatus(api(developer.access_token, "/api/users", { method: "POST", body: { username: users.admin.username, temporary_password: password(), role: "admin", outlets: [], status: "active" } }), 400, "duplicate normalized username rejection");
await expectStatus(api(developer.access_token, "/api/users", { method: "POST", body: { username: `stg-weak-password-${runSuffix}`, temporary_password: "onlylowercase", role: "admin", outlets: [], status: "active" } }), 400, "temporary password strength rejection");
await expectStatus(api(developer.access_token, "/api/users", { method: "POST", body: { username: `stg-invalid-outlet-${runSuffix}`, temporary_password: password(), role: "outlet", outlets: [], status: "active" } }), 400, "Outlet assignment requirement");
const afterInvalid = await expectStatus(api(developer.access_token, "/api/users"), 200, "post-failure user list");
assert.ok(!afterInvalid.some(row => row.username === `stg-invalid-outlet-${runSuffix}`), "failed user setup must compensate the new Auth/profile identity");

const developerEntry = listed.find(row => row.username === normalize(process.env.STG_DEVELOPER_USERNAME));
assert.ok(developerEntry, "Developer must remain listable");
await expectStatus(api(developer.access_token, `/api/users/${developerEntry.id}`, { method: "PATCH", body: { status: "inactive", role: "developer", outlets: [] } }), 400, "last active Developer protection");
await expectStatus(api(developer.access_token, `/api/users/${users.outletA.id}`, { method: "PATCH", body: { status: "inactive", role: "outlet", outlets: ["STG-A"] } }), 200, "Developer deactivation");
await expectStatus(api(developer.access_token, `/api/users/${users.outletA.id}`, { method: "PATCH", body: { status: "active", role: "outlet", outlets: ["STG-A"] } }), 200, "Developer reactivation");
await expectStatus(api(developer.access_token, `/api/users/${users.outletA.id}`, { method: "PATCH", body: { status: "active", role: "outlet", outlets: ["STG-B"] } }), 200, "Developer outlet reassignment to STG-B");
const reassignedOutlet = await login(users.outletA.username, users.outletA.password);
const reassignedBootstrap = await expectStatus(api(reassignedOutlet.access_token, "/api/bootstrap"), 200, "reassigned Outlet bootstrap");
assert.deepEqual(reassignedBootstrap.cloud_context.stores.map(store => store.code), ["STG-B"], "outlet reassignment must remove STG-A access immediately for a new session");
await expectStatus(api(developer.access_token, `/api/users/${users.outletA.id}`, { method: "PATCH", body: { status: "active", role: "outlet", outlets: ["STG-A"] } }), 200, "Developer outlet reassignment back to STG-A");
const restoredUsers = await expectStatus(api(developer.access_token, "/api/users"), 200, "post-edit user list refresh");
assert.deepEqual(restoredUsers.find(row => row.id === users.outletA.id).outlets.map(outlet => outlet.code), ["STG-A"], "user list must return authoritative outlet objects after an edit");

const { data: auditRows, error: auditError } = await service.from("audit_log").select("entity_id,action,metadata").eq("entity_type", "user").in("entity_id", Object.values(users).map(user => user.id));
assert.ifError(auditError);
for (const user of Object.values(users)) assert.ok(auditRows.some(row => row.entity_id === user.id && row.action === "create" && row.metadata?.username === normalize(user.username)), "user creation must have an audit record");

const admin = await login(users.admin.username, users.admin.password);
const adminBootstrap = await expectStatus(api(admin.access_token, "/api/bootstrap"), 200, "Admin bootstrap");
assert.equal(adminBootstrap.cloud_context.profile.role, "admin", "Admin profile role");
assert.deepEqual(adminBootstrap.cloud_context.stores.map(store => store.code).sort(), ["STG-A", "STG-B"], "Admin all-store access");
await expectStatus(api(admin.access_token, "/api/users"), 403, "Admin Developer-user-management denial");

const outletA = await login(users.outletA.username, users.outletA.password);
const outletB = await login(users.outletB.username, users.outletB.password);
const outletABootstrap = await expectStatus(api(outletA.access_token, "/api/bootstrap"), 200, "Outlet A bootstrap");
const outletBBootstrap = await expectStatus(api(outletB.access_token, "/api/bootstrap"), 200, "Outlet B bootstrap");
assert.deepEqual(outletABootstrap.cloud_context.stores.map(store => store.code), ["STG-A"], "Outlet A isolation");
assert.deepEqual(outletBBootstrap.cloud_context.stores.map(store => store.code), ["STG-B"], "Outlet B isolation");
const storeB = developerBootstrap.cloud_context.stores.find(store => store.code === "STG-B");
const outletAcrossStores = await expectStatus(api(outletA.access_token, "/api/bootstrap", { storeId: storeB.id }), 200, "Outlet A cross-store attempt");
assert.equal(outletAcrossStores.cloud_context.active_store.code, "STG-A", "Outlet A cannot select STG-B");
await expectStatus(api(outletA.access_token, "/api/users"), 403, "Outlet A Developer-user-management denial");
await expectStatus(api(outletA.access_token, "/api/settings", { method: "POST", body: {} }), 403, "Outlet A settings write denial");

const directWrite = await fetch(`${baseUrl}/rest/v1/profiles?id=eq.${users.admin.id}`, { method: "PATCH", headers: { ...authHeaders, Authorization: `Bearer ${admin.access_token}`, Prefer: "return=representation" }, body: JSON.stringify({ role: "developer" }) });
assert.ok(!directWrite.ok || (await directWrite.text()) === "[]", "direct table write must not bypass user-management controls");
const afterDirectWrite = await expectStatus(api(developer.access_token, "/api/users"), 200, "post-direct-write user list");
assert.equal(afterDirectWrite.find(row => row.id === users.admin.id).role, "admin", "Admin cannot promote itself to Developer");
await expectStatus(unauthenticated("/api/bootstrap"), 401, "unauthenticated protected API denial");

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9J6Z4AAAAASUVORK5CYII=";
const styleId = developerBootstrap.machines?.[0]?.Products?.[0]?.product_id;
assert.ok(styleId, "synthetic STG-A machine style is required for image UAT");
const firstImage = await expectStatus(api(developer.access_token, "/api/images/replace", { method: "POST", body: { machine_style_id: styleId, content_type: "image/png", image_base64: png } }), 200, "synthetic image upload");
assert.ok(firstImage.image_path && firstImage.image_url, "private image upload must return its signed read URL");
assert.ok((await fetch(firstImage.image_url)).ok, "signed private image read");
const imagePrefix = firstImage.image_path.slice(0, firstImage.image_path.lastIndexOf("/"));
const beforeFault = await service.storage.from("machine-style-images").list(imagePrefix, { limit: 100 });
assert.ifError(beforeFault.error);
const faultedImage = await api(developer.access_token, "/api/test/image-persistence-failure", { method: "POST", body: { machine_style_id: styleId, content_type: "image/png", image_base64: png } });
assert.equal(faultedImage.status, 400, "controlled post-upload image persistence failure");
const afterFault = await service.storage.from("machine-style-images").list(imagePrefix, { limit: 100 });
assert.ifError(afterFault.error);
assert.deepEqual(afterFault.data.map(row => row.name).sort(), beforeFault.data.map(row => row.name).sort(), "failed image persistence must clean the newly uploaded orphan");
const styleAfterFault = await service.from("machine_styles").select("image_path").eq("id", styleId).single();
assert.ifError(styleAfterFault.error);
assert.equal(styleAfterFault.data.image_path, firstImage.image_path, "failed image persistence must preserve the old database reference");
assert.ok(!(await service.storage.from("machine-style-images").download(firstImage.image_path)).error, "failed image persistence must preserve the old object");
const secondImage = await expectStatus(api(developer.access_token, "/api/images/replace", { method: "POST", body: { machine_style_id: styleId, content_type: "image/png", image_base64: png } }), 200, "synthetic image replacement");
assert.notEqual(secondImage.image_path, firstImage.image_path, "replacement must create a new object");
const previousObject = await service.storage.from("machine-style-images").download(firstImage.image_path);
assert.ok(previousObject.error, "successful replacement must clean the old object");
const publicRead = await fetch(`${baseUrl}/storage/v1/object/public/machine-style-images/${encodeURIComponent(secondImage.image_path)}`);
assert.ok(!publicRead.ok, "storage bucket must not expose public image URLs");
const outletImageWrite = await api(outletA.access_token, "/api/images/replace", { method: "POST", body: { machine_style_id: styleId, content_type: "image/png", image_base64: png } });
assert.ok(outletImageWrite.status >= 400, "Outlet A cannot change another outlet's images");
await expectStatus(api(developer.access_token, "/api/images/remove", { method: "POST", body: { machine_style_id: styleId } }), 200, "synthetic image removal");
const removedObject = await service.storage.from("machine-style-images").download(secondImage.image_path);
assert.ok(removedObject.error, "removed image object must not survive");

const machineType = developerBootstrap.settings.machine_types?.[0]?.name;
assert.ok(machineType, "synthetic staging machine type is required for closing UAT");
const meterMachine = await expectStatus(api(developer.access_token, "/api/machines", { method: "POST", body: { machine_code: `STG-UAT-METER-${runSuffix}`, machine_name: "STG UAT Meter", machine_type: machineType, products: [{ barcode: `STG-UAT-A-${runSuffix}`, product_name: "STG UAT Product A", starting_qty: 10 }, { barcode: `STG-UAT-B-${runSuffix}`, product_name: "STG UAT Product B", starting_qty: 4 }] } }), 200, "synthetic meter machine creation");
const manualMachine = await expectStatus(api(developer.access_token, "/api/machines", { method: "POST", body: { machine_code: `STG-UAT-MANUAL-${runSuffix}`, machine_name: "STG UAT Manual", machine_type: machineType, products: [{ barcode: `STG-UAT-C-${runSuffix}`, product_name: "STG UAT Product C", starting_qty: 2 }] } }), 200, "synthetic manual machine creation");
const meterProducts = meterMachine.machine.Products;
const manualProducts = manualMachine.machine.Products;
const closingPayload = {
  report_date: `${fixtureYear}-01-15`,
  closed_by: "STG UAT Closer",
  verified_by: "STG UAT Verifier",
  notes: "Synthetic authenticated cloud parity fixture.",
  sales: { cash_sales_khr: 61500, cash_transactions: 1, aba_sales: 0, aba_transactions: 0, adjustment: 0, beginning_coins: 60, coins_added: 0, final_coins: 0, exchange_rate_usd_khr: 4100, price_per_coin_usd: 0.3125 },
  machines: [
    { machine_id: meterMachine.machine.Machine_ID, machine_name: meterMachine.machine.Machine_Name, machine_type: machineType, products: [{ product_id: meterProducts[0].product_id, barcode: meterProducts[0].barcode, begin_qty: 10, final_qty: 8, refill_history: [{ qty: 5 }, { qty: -2 }] }, { product_id: meterProducts[1].product_id, barcode: meterProducts[1].barcode, begin_qty: 4, final_qty: 3 }], begin_coin_meter: 100, final_coin_meter: 150, status: "Working" },
    { machine_id: manualMachine.machine.Machine_ID, machine_name: manualMachine.machine.Machine_Name, machine_type: machineType, products: [{ product_id: manualProducts[0].product_id, barcode: manualProducts[0].barcode, begin_qty: 2, final_qty: 2 }], begin_coin_meter: "", final_coin_meter: "", manual_coins_used: 10, status: "Working" },
  ],
};
const calculation = await expectStatus(api(developer.access_token, "/api/calculate", { method: "POST", body: closingPayload }), 200, "cloud calculation");
assert.deepEqual({ sales: calculation.summary.total_sales, coins: calculation.summary.coins_dispensed, used: calculation.summary.machine_coins_used, variance: calculation.summary.coin_variance }, { sales: 15, coins: 60, used: 60, variance: 0 }, "cloud calculation parity");
const refillOnlyPayload = { ...closingPayload, report_date: `${fixtureYear}-01-14`, closed_by: "", verified_by: "" };
const refillPlus = await expectStatus(api(developer.access_token, "/api/refills", { method: "POST", body: { closing_payload: refillOnlyPayload, machine_style_id: meterProducts[0].product_id, adjusted_by: "STG Refill Operator", delta_qty: 7 } }), 200, "positive refill without Closed By");
assert.equal(refillPlus.product.refill_qty, 10, "positive refill must update the cumulative total");
assert.equal(refillPlus.product.qty_used, 12, "positive refill must update Qty Used");
assert.ok(refillPlus.product.refill_history.some(event => event.qty === 7 && event.by === "STG Refill Operator"), "positive refill must retain Adjusted By in history");
const refillNegative = await expectStatus(api(developer.access_token, "/api/refills", { method: "POST", body: { closing_id: refillPlus.closing_id, machine_style_id: meterProducts[0].product_id, adjusted_by: "STG Refill Operator", delta_qty: -7 } }), 200, "negative refill without Closed By");
assert.equal(refillNegative.product.refill_qty, 3, "negative refill must restore the signed cumulative total");
assert.equal(refillNegative.product.qty_used, 5, "negative refill must update Qty Used");
assert.ok(refillNegative.product.refill_history.some(event => event.qty === -7 && event.by === "STG Refill Operator"), "negative refill must retain Adjusted By in history");
const refillReload = await expectStatus(api(developer.access_token, `/api/closings/${refillPlus.closing_id}`), 200, "refill history reload");
const reloadedRefillProduct = refillReload.products.find(product => product.Product_ID === meterProducts[0].product_id);
assert.ok(reloadedRefillProduct.Refill_History_JSON.some(event => event.qty === 7 && event.by === "STG Refill Operator"), "refill history must be immediately readable without a page reload");
const missingCloserFinalize = await api(developer.access_token, "/api/closings/save", { method: "POST", body: { ...closingPayload, report_date: `${fixtureYear}-01-13`, closed_by: "", workflow_status: "Finalized" } });
assert.equal(missingCloserFinalize.status, 400, "finalization must still require Closed By");
assert.match(missingCloserFinalize.body.detail || "", /Closed By is required/i, "finalization must retain the relevant Closed By error");
const draft = await expectStatus(api(developer.access_token, "/api/closings/save", { method: "POST", body: { ...closingPayload, workflow_status: "Draft" } }), 200, "cloud draft save");
const reloadedDraft = await expectStatus(api(developer.access_token, `/api/closings/${draft.closing_id}`), 200, "cloud draft reload");
assert.equal(reloadedDraft.products.length, 3, "cloud draft must retain all product rows");
const edited = await expectStatus(api(developer.access_token, "/api/closings/save", { method: "POST", body: { ...closingPayload, closing_id: draft.closing_id, notes: "Synthetic cloud parity fixture (edited).", workflow_status: "Draft" } }), 200, "cloud draft edit");
assert.equal(edited.closing_id, draft.closing_id, "cloud draft edit must retain the closing ID");
const unbalancedPayload = { ...closingPayload, report_date: `${fixtureYear}-01-16`, sales: { ...closingPayload.sales, final_coins: 1 } };
const unbalancedDraft = await expectStatus(api(developer.access_token, "/api/closings/save", { method: "POST", body: { ...unbalancedPayload, workflow_status: "Draft" } }), 200, "unbalanced draft save");
const unbalancedFinalize = await api(developer.access_token, "/api/closings/save", { method: "POST", body: { ...unbalancedPayload, closing_id: unbalancedDraft.closing_id, workflow_status: "Finalized" } });
assert.equal(unbalancedFinalize.status, 400, "unbalanced finalization must be rejected server-side");
assert.match(unbalancedFinalize.body.detail || "", /coin variance is zero/i, "unbalanced finalization must return a useful error");
const unbalancedAfter = await expectStatus(api(developer.access_token, `/api/closings/${unbalancedDraft.closing_id}`), 200, "unbalanced draft state after rejected finalization");
assert.equal(unbalancedAfter.header.Workflow_Status, "Draft", "rejected finalization must leave the closing as a draft");
assert.equal(unbalancedAfter.header.Finalized_At, null, "rejected finalization must not persist a finalization snapshot");
const finalized = await expectStatus(api(developer.access_token, "/api/closings/save", { method: "POST", body: { ...closingPayload, closing_id: draft.closing_id, workflow_status: "Finalized" } }), 200, "cloud finalization");
assert.equal(finalized.workflow_status, "Finalized", "cloud closing must finalize");
const finalizedDetail = await expectStatus(api(developer.access_token, `/api/closings/${draft.closing_id}`), 200, "finalized cloud closing read");
assert.deepEqual({ sales: finalizedDetail.header.Total_Sales, coins: finalizedDetail.header.Coins_Dispensed, used: finalizedDetail.header.Machine_Coins_Used, variance: finalizedDetail.header.Coin_Variance, prizes: finalizedDetail.header.Total_Prizes_Won, discount: finalizedDetail.header.Discount_USD }, { sales: 15, coins: 60, used: 60, variance: 0, prizes: 6, discount: 3.75 }, "finalized cloud KPI parity");
assert.equal(finalizedDetail.header.Workflow_Status, "Finalized", "finalized cloud closing lock state");
const rejectedEdit = await api(developer.access_token, "/api/closings/save", { method: "POST", body: { ...closingPayload, closing_id: draft.closing_id, notes: "must not overwrite finalized", workflow_status: "Draft" } });
assert.ok(rejectedEdit.status >= 400, "finalized closing must be immutable");
const history = await expectStatus(api(developer.access_token, "/api/history"), 200, "cloud history");
assert.ok(history.records.some(row => row.Closing_ID === draft.closing_id), "finalized closing must appear in history");
const carryForward = await expectStatus(api(developer.access_token, `/api/new-closing?report_date=${fixtureYear}-02-01`), 200, "cloud carry-forward");
const carriedMeter = carryForward.machines.find(machine => machine.machine_id === meterMachine.machine.Machine_ID);
assert.equal(carriedMeter.products.find(product => product.product_id === meterProducts[0].product_id).begin_qty, 8, "cloud carry-forward must use prior Final Qty");
const reportDaily = await expectStatus(api(developer.access_token, `/api/reports/daily/${draft.closing_id}`, { method: "POST" }), 200, "daily report export");
const reportMonthly = await expectStatus(api(developer.access_token, "/api/reports/monthly", { method: "POST", body: { month: `${fixtureYear}-01` } }), 200, "monthly report export");
for (const report of [reportDaily, reportMonthly]) assert.ok(report.filename && report.content_base64 && report.path.startsWith("cloud-download:"), "authenticated report must return a download payload");
assert.match(Buffer.from(reportDaily.content_base64, "base64").toString("utf8"), /STG UAT Meter/, "daily export must include machine detail");
assert.match(Buffer.from(reportDaily.content_base64, "base64").toString("utf8"), /15/, "daily export must include final KPI values");
assert.match(Buffer.from(reportMonthly.content_base64, "base64").toString("utf8"), /Totals/, "monthly export must include totals");
const outletBReport = await api(outletB.access_token, `/api/reports/daily/${draft.closing_id}`, { method: "POST" });
assert.equal(outletBReport.status, 400, "Outlet B cannot export a Store A closing");

console.log(JSON.stringify({ ok: true, report_exports: [reportDaily.filename, reportMonthly.filename], checks: ["Developer login/session restore-refresh-logout-login", "Developer User Management create/list/normalization/audit/edit/outlet reassignment", "Admin and Outlet role isolation", "last active Developer protection", "unauthenticated and direct-write denial", "private image upload/read/replace/fault-cleanup/remove", "cloud draft/reload/edit/finalization/history/carry-forward", "balanced and unbalanced calculation parity", "authenticated daily/monthly report exports"] }));

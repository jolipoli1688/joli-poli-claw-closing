"use strict";

const base = process.env.LOCAL_APP_URL || "http://127.0.0.1:4174";
const expectedDataDirectory = String(process.env.CLAW_EXPECTED_DATA_DIRECTORY || "local_data/test").replace(/\\/g, "/");
const runId = `PARITY-${Date.now()}`;
const reportDate = "2030-01-10";
const nextDate = "2030-01-11";
const pngA = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9J6Z4AAAAASUVORK5CYII=";
const pngB = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const request = async (path, options = {}, expected = 200) => {
  const response = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (response.status !== expected) throw new Error(`${options.method || "GET"} ${path}: expected ${expected}, got ${response.status}: ${body.detail || ""}`);
  return body;
};
const expectError = async (path, options, contains) => {
  const response = await fetch(`${base}${path}`, { headers: { "Content-Type": "application/json" }, ...options });
  const body = await response.json().catch(() => ({}));
  assert(response.status >= 400, `${path} should fail`);
  assert(String(body.detail || "").includes(contains), `${path} error should include ${contains}; received ${body.detail}`);
};
const waitForIsolatedTestRuntime = async () => {
  const deadline = Date.now() + 30_000;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/api/runtime`);
      const body = await response.json().catch(() => ({}));
      if (response.ok) return body;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`isolated regression backend did not become ready: ${lastError}`);
};

const baseMachine = (machineId, type, products, meter = {}) => ({
  machine_id: machineId,
  machine_name: `${type} ${machineId}`,
  machine_type: type,
  capacity: 20,
  products,
  begin_coin_meter: meter.begin ?? "",
  final_coin_meter: meter.final ?? "",
  coins_used: meter.manual ?? "",
  status: "Working",
  notes: "",
});
const sales = {
  cash_sales: 15,
  cash_transactions: 1,
  aba_sales: 0,
  aba_transactions: 0,
  adjustment: 0,
  beginning_coins: 60,
  coins_added: 0,
  final_coins: 0,
  cash_sales_khr: 61500,
  exchange_rate_usd_khr: 4100,
  price_per_coin_usd: 0.3125,
};

const runtime = await waitForIsolatedTestRuntime();
assert(runtime.mode === "test", `regression requires isolated test mode; received ${runtime.mode}`);
assert(
  String(runtime.data_directory || "").replace(/\\/g, "/") === expectedDataDirectory,
  `regression requires ${expectedDataDirectory}; received ${runtime.data_directory}`,
);
const initialSettings = await request("/api/settings");
await expectError("/api/settings", { method: "POST", body: JSON.stringify({ exchange_rate_usd_khr: 4100, price_per_coin_usd: 0.3125 }) }, "Settings password is required");
await expectError("/api/settings/unlock", { method: "POST", body: JSON.stringify({ password: "wrong-password" }) }, "Incorrect Settings password");
const renamedOutlet = `${initialSettings.settings.outlet} local regression`;
await request("/api/settings", { method: "POST", body: JSON.stringify({ outlet: renamedOutlet }) });
await request("/api/settings", { method: "POST", body: JSON.stringify({ outlet: initialSettings.settings.outlet }) });

let machineId = "";
try {
machineId = `${runId}-CL`;
const productA = `${runId}-A`;
const productB = `${runId}-B`;
let machineResult = await request("/api/machines", {
  method: "POST",
  body: JSON.stringify({
    machine_id: machineId,
    machine_name: "Local parity Claw",
    machine_type: "Claw",
    active: true,
    products: [
      { product_id: `${runId}-PRODUCT-A`, barcode: productA, image_data: pngA },
      { product_id: `${runId}-PRODUCT-B`, barcode: productB },
    ],
  }),
});
assert(machineResult.machine.Products.length === 2, "machine should retain two products");
const firstImage = machineResult.machine.Products[0].image_url;
assert(firstImage, "first product should have a local image URL");
const imageResponse = await fetch(`${base}${firstImage}`);
assert(imageResponse.ok, "local product image should be readable");
await expectError("/api/machines", {
  method: "POST",
  body: JSON.stringify({ machine_id: machineId, machine_type: "Claw", products: [{ barcode: productA }, { barcode: productA }] }),
}, "Duplicate barcode");
machineResult = await request("/api/machines", {
  method: "POST",
  body: JSON.stringify({
    machine_id: machineId,
    machine_type: "Claw",
    products: [
      { product_id: `${runId}-PRODUCT-A`, barcode: productA, image_data: pngB },
      { product_id: `${runId}-PRODUCT-B`, barcode: productB },
    ],
  }),
});
assert((await fetch(`${base}${machineResult.machine.Products[0].image_url}`)).ok, "replacement local image should be readable");
machineResult = await request("/api/machines", {
  method: "POST",
  body: JSON.stringify({
    machine_id: machineId,
    machine_type: "Claw",
    products: [
      { product_id: `${runId}-PRODUCT-A`, barcode: productA, remove_image: true },
      { product_id: `${runId}-PRODUCT-B`, barcode: productB },
    ],
  }),
});
assert(!machineResult.machine.Products[0].image_url, "image removal should clear the local reference");

const machines = [
  baseMachine(machineId, "Claw", [
    { product_id: `${runId}-PRODUCT-A`, barcode: productA, begin_qty: 10, final_qty: 8, refill_history: [{ qty: 5, at: "2030-01-10T08:00:00Z", by: "Tester" }, { qty: -2, at: "2030-01-10T08:05:00Z", by: "Tester" }] },
    { product_id: `${runId}-PRODUCT-B`, barcode: productB, begin_qty: 4, final_qty: 3 },
  ], { begin: 100, final: 150 }),
  baseMachine(`${runId}-KC`, "Keychain", [
    { product_id: `${runId}-PRODUCT-C`, barcode: `${runId}-C`, begin_qty: 2, final_qty: 2 },
  ], { manual: 10 }),
];
const payload = { report_date: reportDate, outlet: initialSettings.settings.outlet, closed_by: "Local Tester", verified_by: "Local Verifier", notes: "Automated local parity fixture.", sales, machines };
const calculated = await request("/api/calculate", { method: "POST", body: JSON.stringify(payload) });
const summary = calculated.summary;
assert(summary.total_sales === 15 && summary.coins_dispensed === 60 && summary.machine_coins_used === 60 && summary.coin_variance === 0, "sales/coin parity mismatch");
assert(summary.total_prizes_won === 6 && summary.average_revenue_per_prize === 2.5 && summary.average_coins_per_prize === 10, "product/average parity mismatch");
assert(calculated.machines[0].coins_used === 50 && calculated.machines[0].coins_per_prize === 8.3333, "meter mode or per-machine Coins/Product mismatch");
assert(calculated.machines[1].coins_used === 10, "manual meter mode mismatch");
await expectError("/api/calculate", { method: "POST", body: JSON.stringify({ ...payload, machines: [baseMachine(machineId, "Claw", machines[0].products, { begin: 100 })] }) }, "enter both Begin Meter and Final Meter");
await expectError("/api/calculate", { method: "POST", body: JSON.stringify({ ...payload, machines: [baseMachine(machineId, "Claw", [{ ...machines[0].products[0], refill_history: [{ qty: -11, at: "2030-01-10T08:00:00Z", by: "Tester" }] }], { begin: 100, final: 150 })] }) }, "stock adjustment cannot make available quantity negative");
const zeroQuantity = await request("/api/calculate", { method: "POST", body: JSON.stringify({ ...payload, machines: [baseMachine(machineId, "Claw", [{ product_id: `${runId}-ZERO`, barcode: `${runId}-ZERO`, begin_qty: 0, final_qty: 0 }], { manual: 0 })] }) });
assert(zeroQuantity.summary.total_prizes_won === 0 && zeroQuantity.summary.average_coins_per_prize === 0 && zeroQuantity.summary.average_revenue_per_prize === 0, "zero-quantity calculation mismatch");
await expectError("/api/closings/save", { method: "POST", body: JSON.stringify({ ...payload, machines: [baseMachine(machineId, "Claw", [{ ...machines[0].products[0], final_qty: "" }], { begin: 100, final: 150 })], workflow_status: "Finalized" }) }, "Final Qty is required");

const draft = await request("/api/closings/save", { method: "POST", body: JSON.stringify({ ...payload, workflow_status: "Draft" }) });
const reloadedDraft = await request(`/api/closings/${encodeURIComponent(draft.closing_id)}`);
assert(reloadedDraft.products.length === 3, "draft reload should retain all product rows");
const savedRefill = reloadedDraft.products.find(row => row.Product_ID === `${runId}-PRODUCT-A`);
assert(savedRefill && savedRefill.Refill_Qty === 3 && savedRefill.Qty_Used === 5, "signed refill history or Qty Used persistence mismatch");
const editedDraftPayload = { ...payload, closing_id: draft.closing_id, notes: "Automated local parity fixture (edited draft).", workflow_status: "Draft" };
const editedDraft = await request("/api/closings/save", { method: "POST", body: JSON.stringify(editedDraftPayload) });
assert(editedDraft.closing_id === draft.closing_id, "draft edit should retain its closing ID");
const reloadedEditedDraft = await request(`/api/closings/${encodeURIComponent(draft.closing_id)}`);
assert(reloadedEditedDraft.header.Notes === editedDraftPayload.notes, "edited draft should persist its changes");
const finalized = await request("/api/closings/save", { method: "POST", body: JSON.stringify({ ...editedDraftPayload, workflow_status: "Finalized" }) });
assert(finalized.workflow_status === "Finalized", "finalization should succeed with balanced data");
assert(finalized.report_path && finalized.report_path.includes("local_data"), "finalization should generate its report only inside local_data");
await expectError("/api/closings/save", { method: "POST", body: JSON.stringify({ ...payload, closing_id: draft.closing_id, notes: "attempt overwrite", workflow_status: "Draft" }) }, "finalized closing cannot be overwritten");
const finalizedDetail = await request(`/api/closings/${encodeURIComponent(draft.closing_id)}`);
assert(finalizedDetail.header.Workflow_Status === "Finalized", "finalized detail should be locked state");
assert(finalizedDetail.header.Coins_Used === 60 && finalizedDetail.header.Coin_Return === 60 && finalizedDetail.header.Lose_Over === 0, "saved Closing KPI fields mismatch");
assert(finalizedDetail.header.Discount_USD === 3.75 && finalizedDetail.header.Discount_Percent === 20, "discount KPI fields mismatch");
const savedClaw = finalizedDetail.machines.find(row => row.Machine_ID === machineId);
assert(savedClaw && savedClaw.Meter_Mode === "meter" && savedClaw.Win_Rate === 50 / 1 / 6, "machine Win Rate persistence mismatch");
assert(finalizedDetail.header.Overall_Win_Rate === 60 / 1 / 6, "overall Win Rate persistence mismatch");
const dailyExport = await request(`/api/reports/daily/${encodeURIComponent(draft.closing_id)}`, { method: "POST" });
assert(dailyExport.path && dailyExport.path.includes("local_data"), "daily Excel export should remain inside local_data");
const reportSummary = await request("/api/reports/summary?month=2030-01");
assert(reportSummary.closings === 1 && reportSummary.total_sales === 15 && reportSummary.coins === 60 && reportSummary.prizes === 6, "monthly report summary mismatch");
const monthlyExport = await request("/api/reports/monthly", { method: "POST", body: JSON.stringify({ month: "2030-01" }) });
assert(monthlyExport.path && monthlyExport.path.includes("local_data"), "monthly Excel export should remain inside local_data");
const history = await request("/api/history?limit=1000");
assert(history.records.some(row => row.Closing_ID === draft.closing_id), "finalized closing should appear in history");
const nextClosing = await request(`/api/new-closing?report_date=${nextDate}`);
const carriedMachine = nextClosing.machines.find(machine => machine.machine_id === machineId);
assert(carriedMachine?.products.find(product => product.product_id === `${runId}-PRODUCT-A`)?.begin_qty === 8, "previous Final Qty should carry to next Begin Qty");
await request(`/api/closings/${encodeURIComponent(draft.closing_id)}`, { method: "DELETE", body: JSON.stringify({ reason: "Automated local parity void", remove_dependent_drafts: true }) });
const historyAfterVoid = await request("/api/history?limit=1000");
assert(!historyAfterVoid.records.some(row => row.Closing_ID === draft.closing_id), "void should remove the finalized history record");
const deleted = await request(`/api/machines/${encodeURIComponent(machineId)}`, { method: "DELETE" });
assert(deleted.deactivated === true, "machine delete should deactivate the master record");

console.log(JSON.stringify({ ok: true, runId, draft: draft.closing_id, formula: summary, checks: ["settings lock", "machine multi-product", "duplicate barcode", "local image replace/remove", "positive/negative refill", "zero quantities", "meter/manual mode", "draft reload", "finalize/report/history/void", "carry-forward"] }, null, 2));
} finally {
  if (machineId) {
    await fetch(`${base}/api/machines/${encodeURIComponent(machineId)}`, { method: "DELETE" }).catch(() => {});
  }
}

import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";

const app = readFileSync(new URL("../web/assets/app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
const edge = readFileSync(new URL("../supabase/functions/claw-api/index.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../web/assets/styles.css", import.meta.url), "utf8");

assert.match(html, /data-page="dashboard"[\s\S]*?data-page="closing"[\s\S]*?data-page="history"[\s\S]*?data-page="settings"/, "Sidebar order must be Dashboard, Daily Closing, Closing History, Settings.");
assert.match(html, /id="page-dashboard" class="page" hidden/, "Dashboard must use the existing page shell and remain hidden until navigation.");
assert.match(html, /assets\/styles\.css\?v=2\.1\.78-start-shift-premium/, "Dashboard CSS must use the current cache tag.");
assert.match(html, /assets\/app\.js\?v=2\.1\.78-start-shift-premium/, "Dashboard JavaScript must use the current cache tag.");
assert.match(app, /dashboard:\s*\["Dashboard", ""\]/, "Dashboard header must not add an invented explanatory subtitle.");
assert.match(app, /async function renderDashboardLegacyV2200\(\) \{\s*setActions\(""\);/, "Dashboard must not own a Start Shift action in local mode.");
assert.match(app, /async function renderDashboard\(\) \{\s*if \(!isCloudStaging\(\)\) return renderDashboardLegacyV2200\(\);[\s\S]*?dashboardFiltersTopbar/, "Dashboard must keep its analytical filter action in the persistent topbar beside the global Outlet context.");
assert.match(app, /\["dashboard", "layout-dashboard", "Dashboard"\]/, "Dashboard must use the existing Lucide-style layout icon.");
assert.match(app, /Date From[\s\S]*?Date To[\s\S]*?Store[\s\S]*?Apply[\s\S]*?Reset/, "Dashboard filters must include Date From, Date To, Store, Apply, and Reset.");
assert.match(app, /function dashboardCalendarMonthRange\(now = new Date\(\)\)/, "Dashboard must derive its default from local calendar components.");
assert.match(app, /const year = now\.getFullYear\(\);\s*const month = now\.getMonth\(\);/, "Dashboard month boundaries must use local getFullYear/getMonth values.");
assert.match(app, /new Date\(year, month, 1\)[\s\S]*?new Date\(year, month \+ 1, 0\)/, "Dashboard default must span the complete local calendar month.");
assert.match(app, /return \{ \.\.\.dashboardCalendarMonthRange\(\), store_id: "all" \};/, "Initial Dashboard filters and Reset must use the full-month helper.");
const monthRangeSource = app.match(/function dashboardCalendarMonthRange\(now = new Date\(\)\) \{[\s\S]*?\n\}/)?.[0] || "";
const dashboardCalendarMonthRange = new Function(`${monthRangeSource}; return dashboardCalendarMonthRange;`)();
assert.deepEqual(dashboardCalendarMonthRange(new Date(2026, 8, 7, 12)), { from: "2026-09-01", to: "2026-09-30" }, "September must default to all 30 local calendar days, not month-to-date.");
assert.notEqual(dashboardCalendarMonthRange(new Date(2026, 8, 7, 12)).to, "2026-09-07", "Dashboard default must not end at today.");
assert.deepEqual(dashboardCalendarMonthRange(new Date(2026, 9, 7, 12)), { from: "2026-10-01", to: "2026-10-31" }, "October must include 31 days.");
assert.deepEqual(dashboardCalendarMonthRange(new Date(2026, 1, 7, 12)), { from: "2026-02-01", to: "2026-02-28" }, "A common-year February must include 28 days.");
assert.deepEqual(dashboardCalendarMonthRange(new Date(2028, 1, 7, 12)), { from: "2028-02-01", to: "2028-02-29" }, "A leap-year February must include 29 days.");
assert.match(app, /data-filter-toolbar/, "Dashboard filters must use the reference FilterToolbar marker.");
assert.doesNotMatch(app, /Performance overview|Finalized closings only\. Draft shifts are never included\./, "The invented dashboard hero must not return.");
assert.match(app, /dashboardKpiCard\("Sales"[\s\S]*?dashboardKpiCard\("QTY"[\s\S]*?dashboardKpiCard\("AVG \/ Product"[\s\S]*?dashboardKpiCard\("Discount"/, "Dashboard must render exactly the required KPI sequence.");
assert.doesNotMatch(app, /Finalized closing sales|Products won|Sales ÷ products won/, "KPI cards must not add invented supporting copy.");
assert.match(app, /<h2>Store Sales Performance by Date<\/h2>/, "Store Sales Performance by Date title must use the exact retail-dashboard text.");
assert.match(app, /\/api\/dashboard\?\$\{query\.toString\(\)\}/, "Dashboard must fetch the server-side analytics endpoint.");
assert.doesNotMatch(app, /Performance Trend|dashboardTrend|dashboardDailyTrend|dashboardSalesChart|dashboardChartYAxis|dashboardRechartsMonotoneXPath|dashboardTrendTickIndexes|dashboard-chart-/, "Dashboard frontend must not restore the retired Performance Trend tab or its old presentation.");
assert.match(app, /function dashboardPrimaryOutcomes\(data, filters\)[\s\S]*?dashboard-kpi-grid[\s\S]*?renderPrimaryOutcomesDailySalesTrend\(filters\)/, "Primary Outcomes must place its new Daily Sales Trend card after the KPI row.");
assert.match(app, /function loadPrimaryOutcomesSales\(filters, retry = false\)/, "Primary Outcomes must own the new Daily Sales Trend request lifecycle.");
assert.match(app, /function dashboardStoreMatrix/, "Store performance must use the reference compact matrix renderer.");
assert.match(app, /data-store-sales-grid/, "Store performance must use the reference Store x Date matrix marker.");
assert.match(app, /dashboard-store-outlet-pane[\s\S]*?dashboard-store-date-pane[\s\S]*?dashboard-store-total-pane/, "Store matrix must use the reference fixed Outlet, scrolling dates, and fixed Month Total panes.");
assert.match(app, /data-dashboard-week/, "Store Detail must expose client-side W1-W5 week controls.");
assert.match(app, /dashboardStoreSearch[\s\S]*?dashboardStoreLocal[\s\S]*?dashboardMinimumTotal/, "Store Detail must include local search, outlet, and minimum-total controls.");
assert.match(app, /data-dashboard-sort/, "Store Detail must expose local date and Month Total sorting controls.");
assert.match(app, /dashboard-store-trend/, "Store Detail must render client-side up/down trend indicators.");
assert.match(app, /function dashboardStoreDailySalesValue\(value\)[\s\S]*?sales > 0 \? dashboardReferenceMoney\(sales, true\) : ""/, "Daily zero, null, and missing sales must display as blank while totals remain independently formatted.");
assert.match(app, /function dashboardStoreDailyTrend\(currentValue, previousValue\)[\s\S]*?current <= 0 \|\| previous <= 0 \|\| current === previous\) return "";[\s\S]*?current > previous \? "up" : "down"/, "Daily trend icons must compare only two positive unequal neighboring daily values.");
assert.match(app, /dashboard-store-date-heading[\s\S]*?dashboardDateLabel\(date\)[\s\S]*?dashboardDateLabel\(date, true\)/, "Date headers must render date/month above weekday in a dedicated two-line owner.");
const dailyValueSource = app.match(/function dashboardStoreDailySalesValue\(value\) \{[\s\S]*?\n}/)?.[0] || "";
const dailySalesValue = new Function("dashboardReferenceMoney", `${dailyValueSource}; return dashboardStoreDailySalesValue;`)(value => `$${Number(value).toFixed(2)}`);
assert.equal(dailySalesValue(0), "", "A zero daily sale must be blank.");
assert.equal(dailySalesValue(null), "", "A null daily sale must be blank.");
assert.equal(dailySalesValue(undefined), "", "A missing daily sale must be blank.");
assert.equal(dailySalesValue(6.22), "$6.22", "A positive daily sale must retain its formatted value.");
const dailyTrendSource = app.match(/function dashboardStoreDailyTrend\(currentValue, previousValue\) \{[\s\S]*?\n}/)?.[0] || "";
const dailyTrend = new Function(`${dailyTrendSource}; return dashboardStoreDailyTrend;`)();
assert.equal(dailyTrend(6, 4), "up", "A higher positive day must show a growth icon.");
assert.equal(dailyTrend(4, 6), "down", "A lower positive day must show a decline icon.");
assert.equal(dailyTrend(4, 4), "", "Equal positive days must not show an icon.");
assert.equal(dailyTrend(4, 0), "", "A blank/zero predecessor must not create an icon.");
assert.match(app, /loading-dots/, "Dashboard loading must use the app's shared three-dot treatment.");
assert.match(app, /function dashboardResponse\(data\)/, "Dashboard must validate API responses before rendering data.");
assert.match(app, /typeof data\?\.has_data !== "boolean"/, "Dashboard must reject responses without a boolean has_data flag.");
assert.match(app, /store_performance\.every\(row => \/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/.test\(String\(row\?\.date \|\| ""\)\)/, "Dashboard must require a date on every store-performance row.");
assert.doesNotMatch(app, /<th>Date<\/th><th>Store<\/th>/, "Store Sales Performance must not regress to the giant flat Date/Store report.");
assert.doesNotMatch(app.match(/function dashboardResponse[\s\S]*?\n}\n\nfunction dashboardStoreOptions/)?.[0] || "", /discount_percent/, "Dashboard must not require an invalid discount percentage.");
assert.match(app, /Unable to load dashboard data\.[\s\S]*?Retry/, "Dashboard failures must have a distinct retry state.");
assert.match(app, /No finalized closing data for this period\./, "Dashboard must retain a distinct successful zero-data state.");
assert.match(app, /const fixedOutlet = role === "outlet";/, "Only an Outlet dashboard filter may be fixed in the UI.");
assert.doesNotMatch(app, /fixedOutlet = role === "outlet" \|\| stores\.length === 1/, "Developer and Admin filters must not become fixed just because one store is authorized.");
assert.match(app, /const kpis = data\.kpis, stores = data\.store_performance, hasData = data\.has_data === true;/, "Dashboard successful empty states must use has_data rather than generated grid lengths or values.");
assert.match(app, /dashboardView === "outcomes"\) return dashboardPrimaryOutcomes\(data, filters\);/, "Primary Outcomes must be its own view.");
assert.match(app, /dashboardView === "store"[\s\S]*?dashboardStoreMatrix\(stores\)/, "Store Detail must be its own view.");
assert.match(app, /dashboardFilters = \{ from, to, store_id: fixedOutlet \? filters\.store_id : document\.getElementById\("dashboardStore"\)\.value \|\| "all" \};/, "Apply must retain a valid custom Dashboard range.");
assert.match(app, /dashboardReset"\)\?\.addEventListener\("click", \(\) => \{ dashboardFilters = dashboardDefaultFilters\(\);/, "Reset must restore the full local calendar month.");
assert.match(app, /Primary Outcomes[\s\S]*?Store Detail/, "Dashboard sub-navigation must contain Primary Outcomes and Store Detail.");
const dashboardShellSource = app.match(/function dashboardShell[\s\S]*?\n}/)?.[0] || "";
assert.match(dashboardShellSource, /tab\("outcomes", "Primary Outcomes"\)\}\$\{tab\("store", "Store Detail"\)/, "Dashboard tab control must contain exactly the two supported tabs in order.");
assert.doesNotMatch(dashboardShellSource, /tab\("trend"|Performance Trend/, "Dashboard tab control must not retain an empty or hidden Performance Trend slot.");
assert.match(app, /Filters Active/, "Dashboard must provide the reference Filters Active control.");
assert.match(app, /dashboardFiltersTopbar/, "Filters Active must render in the persistent Dashboard header actions beside the global Outlet selector.");
assert.match(app, /function dashboardReferenceMoney\(value, compact = false\)/, "Dashboard money must use the reference formatter contract.");
assert.match(app, /maximumFractionDigits: compact \? 1 : 2/, "Reference compact money must retain its one-decimal compact behavior.");
assert.match(app, /applyDashboardStoreMonthTotalMoney\(\)/, "Month Total must use the reference standard currency formatter after Store Detail state is applied.");
assert.match(app, /dashboardReferenceMoney\(totalFor\(outlets\[index\]\)\)/, "Month Total values must retain the source two-decimal currency presentation.");
assert.match(app, /const visibleDates = dates;/, "Week selection must preserve every date column in the Store Detail matrix.");
assert.match(app, /scrollTo\(\{ left: Math\.max\(0, target\.offsetLeft - 8\), behavior: "smooth" \}\)/, "Week controls must scroll the date viewport to the selected week.");
const dashboardUiSource = app.match(/function dashboardShell[\s\S]*?\n}\n\nfunction defaultSales/)?.[0] || "";
assert.match(dashboardUiSource, /renderDashboardCached\(\); return;/, "Dashboard tab/filter presentation must reuse the loaded analytics response rather than refetching.");
assert.doesNotMatch(dashboardUiSource, /(?:newClosing|saveClosing|flushAutosave|openClosing)\(/, "Dashboard filtering must not create, switch, save, or open a Daily Closing Draft.");
assert.doesNotMatch(dashboardUiSource, /state\.(?:closing|closingId|closingStatus|closingReadOnly)\s*=/, "Dashboard filtering must not mutate Daily Closing working context.");
assert.match(edge, /function dashboardStoreScope/, "Dashboard store authorization must be enforced server-side.");
assert.match(edge, /ctx\.profile\.role === "outlet"/, "Outlet users must be constrained server-side.");
assert.match(edge, /path === "\/api\/dashboard" && req\.method === "GET"/, "Edge function must expose GET /api/dashboard.");
assert.match(edge, /if \(!stores\?\.length\) return fail\("This store is not authorized for dashboard analytics\.", 403\);/, "Unauthorized requested dashboard stores must receive 403 rather than a fake success response.");
assert.match(edge, /\.eq\("status", "finalized"\)/, "Dashboard analytics must query finalized closings only.");
assert.match(edge, /daily_trend: dailyTrend/, "Dashboard response must include a zero-fillable daily trend.");
assert.match(edge, /store_performance: storePerformance/, "Dashboard response must include store performance rows.");
assert.match(edge, /total_sales_usd,total_products,discount_usd/, "Dashboard must reuse authoritative closing totals rather than a second data model.");
assert.doesNotMatch(edge, /if \(path === "\/api\/dashboard"\) return json\(\{ summary: \{\}, recent_closings: \[\] \}\);/, "Dashboard must not retain a fake-success placeholder route.");
assert.match(css, /#page-dashboard \[data-filter-toolbar\]/, "Dashboard filters must port the reference FilterToolbar presentation.");
assert.match(css, /--dashboard-surface-secondary:#f8fafc/, "Dashboard must use the reference surface-secondary token.");
assert.match(css, /#page-dashboard \[data-kpi-card\]/, "Dashboard KPIs must port the reference StatCard presentation.");
assert.match(css, /min-height:6\.75rem/, "Dashboard KPI cards must retain the reference 108px minimum height.");
assert.match(css, /primary-outcomes-daily-sales \{[^}]*border-radius:12px; background:#fff;/, "Primary Outcomes must own the new Daily Sales Trend card surface.");
assert.doesNotMatch(css, /dashboard-chart-|dashboard-daily-trend|dashboard-trend-skeleton|dashboard-sales-chart|is-dashboard-trend-animating/, "Dashboard CSS must not restore old Daily Trend styling.");
assert.match(css, /--store-grid-outlet-width:156px/, "Store performance must retain the reference compact matrix dimensions.");
assert.match(css, /grid-template-columns:var\(--store-grid-outlet-width\) minmax\(0,1fr\) var\(--store-grid-total-width\)/, "Store performance must retain reference fixed outer panes around its scrolling dates.");
assert.match(css, /\.dashboard-store-date-pane \{ min-width:0; overflow-x:auto;/, "Long store matrices must scroll inside the date pane rather than the page.");
assert.match(css, /\.dashboard-store-date-heading \{ display:grid; gap:\.125rem; justify-items:center; line-height:1rem; \}/, "Date/month and weekday must use a centered two-line header grid.");
assert.match(css, /\.dashboard-store-date-heading > span \{ font-size:\.8125rem; font-weight:600; \}/, "Date/month must be the slightly stronger header line.");
assert.match(css, /\.dashboard-store-date-heading small \{[^}]*font-size:\.75rem; font-weight:400;/, "Weekday must be the smaller lighter second header line.");
assert.match(css, /\.dashboard-store-trend svg \{ width:\.8125rem; height:\.8125rem; stroke-width:1\.8; \}/, "Daily direction icons must remain small and lightweight.");
assert.match(css, /\.dashboard-store-sales-header \{ display:grid; grid-template-columns:14rem 11rem 15rem max-content;/, "Store Detail must keep its source-sized desktop toolbar controls on one row below the title.");
assert.match(css, /\.dashboard-store-detail-toolbar \{ display:contents; \}/, "Store Detail title must precede the compact toolbar without a stretched wrapper.");
assert.match(css, /\.dashboard-store-outlet-pane \{ left:0;/, "Outlet pane must remain sticky at the left of the date viewport.");
assert.match(css, /\.dashboard-store-total-pane \{ right:0;/, "Month Total pane must remain sticky at the right of the date viewport.");
assert.match(css, /\.dashboard-view-tab\.is-active \{ border-color:#111; background:#111; color:#fff;/, "Active Dashboard tabs must use the reference black treatment.");
assert.doesNotMatch(css, /dashboard-trend-svg|dashboard-store-table/, "Rejected custom Dashboard visual CSS must be removed.");

// When the Cloud staging host is already running, prove its live asset is the
// same Dashboard owner that the static assertions inspected. Offline suites
// remain valid when no developer host is listening.
try {
  const response = await fetch("http://localhost:3001/assets/app.js?v=2.1.78-start-shift-premium");
  if (!response.ok) throw new Error(`served Dashboard asset returned ${response.status}`);
  const servedApp = await response.text();
  const stylesResponse = await fetch("http://localhost:3001/assets/styles.css?v=2.1.78-start-shift-premium");
  assert.ok(stylesResponse.ok, `served Dashboard stylesheet returned ${stylesResponse.status}`);
  const servedCss = await stylesResponse.text();
  const sha256 = source => createHash("sha256").update(source).digest("hex");
  assert.equal(sha256(servedApp), sha256(app), "served Dashboard JavaScript must exactly match disk");
  assert.equal(sha256(servedCss), sha256(css), "served Dashboard CSS must exactly match disk");
  for (const marker of ["Primary Outcomes", "Store Detail", "Daily Sales Trend", "Filters Active", "Search outlet", "Minimum month total", "W1", "W5", "dashboardReferenceMoney", "const visibleDates = dates", "behavior: \"smooth\""]) {
    assert.ok(servedApp.includes(marker), `served Dashboard asset must contain ${marker}`);
  }
  assert.match(servedApp, /function dashboardShell/, "served Dashboard asset must own the exclusive tab shell");
  assert.match(servedApp, /renderPrimaryOutcomesDailySalesTrend/, "served Dashboard asset must own the new Primary Outcomes Daily Sales Trend card");
  assert.doesNotMatch(servedApp, /dailySalesOverview|daily-sales-overview/, "served Dashboard asset must not retain the previously reused chart renderer");
  assert.doesNotMatch(servedApp, /Performance Trend|dashboardTrend|dashboardDailyTrend|dashboardSalesChart|dashboardChartYAxis|dashboardRechartsMonotoneXPath|dashboardTrendTickIndexes|dashboard-chart-/, "served Dashboard asset must not restore the retired Performance Trend tab or old presentation");
  assert.doesNotMatch(servedApp, /dashboardTrendSvgV2200|dashboard-store-table/, "served Cloud runtime must not contain the obsolete combined Dashboard visual path");
  console.log("Claw dashboard served-runtime markers passed.");
} catch (error) {
  if (!/fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND/i.test(String(error?.message || error))) throw error;
  console.log("Claw dashboard served-runtime markers skipped (local Cloud host unavailable).");
}

const dashboardSource = edge.match(/async function dashboardAnalytics[\s\S]*?\n}(?=\n\nfunction calculate)/)?.[0] || "";
assert.match(dashboardSource, /\.eq\("status", "finalized"\)/, "the one dashboard query must select finalized closings only");
assert.match(dashboardSource, /const key = `\$\{String\(closing\.report_date\)\}:\$\{String\(closing\.store_id\)\}`/, "dashboard aggregation must retain the date and store dimensions");
assert.match(dashboardSource, /dates\.flatMap\(date => stores\.map\(store =>/, "every selected date must contain every authorized store");
assert.match(dashboardSource, /store_code: String\(store\.code \|\| ""\)/, "dashboard rows must carry stable store codes");
assert.match(dashboardSource, /filters: \{ from, to, store_id: requestedStoreId \}/, "dashboard filters must echo the requested store filter unchanged");
assert.match(dashboardSource, /has_data: \(data \|\| \[\]\)\.length > 0/, "has_data must be derived from actual finalized rows before zero filling");
assert.doesNotMatch(dashboardSource, /discount_percent/, "dashboard must not calculate Discount percent from sales");

const dashboardAnalytics = new Function("num", "integer", "dashboardMoney", `${dashboardSource.replace("async function dashboardAnalytics(ctx: Context, from: string, to: string, requestedStoreId: string, stores: any[])", "async function dashboardAnalytics(ctx, from, to, requestedStoreId, stores)").replace("const daily = new Map<string, number>();", "const daily = new Map();").replace("const performance = new Map<string, { total_sales: number; quantity: number; discount: number }>();", "const performance = new Map();").replace("const dailyTrend: { date: string; sales: number }[] = [];", "const dailyTrend = [];").replace("const dates: string[] = [];", "const dates = [];")} return dashboardAnalytics;`)(
  value => Number(value ?? 0) || 0,
  value => Math.trunc(Number(value ?? 0) || 0),
  value => Number(value.toFixed(2)),
);
const fixtureClosings = [
  { store_id: "store-a", report_date: "2026-09-04", total_sales_usd: 100, total_products: 20, discount_usd: 10, status: "finalized" },
  { store_id: "store-a", report_date: "2026-09-04", total_sales_usd: 50, total_products: 5, discount_usd: 5, status: "finalized" },
  { store_id: "store-b", report_date: "2026-09-04", total_sales_usd: 75, total_products: 15, discount_usd: 7, status: "finalized" },
  { store_id: "store-a", report_date: "2026-09-05", total_sales_usd: 40, total_products: 8, discount_usd: 4, status: "finalized" },
  { store_id: "store-b", report_date: "2026-09-05", total_sales_usd: 999, total_products: 999, discount_usd: 999, status: "draft" },
  { store_id: "store-b", report_date: "2026-09-05", total_sales_usd: 999, total_products: 999, discount_usd: 999, status: "void" },
];
const query = { table: "", statuses: [] };
const dashboardContext = rows => ({ admin: { from(table) { query.table = table; return { select() { return this; }, in() { return this; }, eq(field, value) { if (field === "status") query.statuses.push(value); return this; }, gte() { return this; }, lte() { return this; }, order() { return Promise.resolve({ data: rows.filter(row => query.statuses.includes(row.status)), error: null }); } }; } } });
const fixtureStores = [{ id: "store-a", code: "ZMS", name: "ZMS" }, { id: "store-b", code: "ZTM", name: "ZTM" }];
const analytics = await dashboardAnalytics(dashboardContext(fixtureClosings), "2026-09-04", "2026-09-05", "all", fixtureStores);
assert.equal(query.table, "daily_closings", "dashboard must make one bounded daily_closings query");
assert.deepEqual(query.statuses, ["finalized"], "Draft and Void rows must be excluded by the query");
assert.equal(analytics.has_data, true, "actual finalized rows must set has_data true");
assert.deepEqual(analytics.daily_trend, [{ date: "2026-09-04", sales: 225 }, { date: "2026-09-05", sales: 40 }], "daily trend must sum all finalized stores by date");
assert.deepEqual(analytics.store_performance, [
  { date: "2026-09-04", store_id: "store-a", store_code: "ZMS", store_name: "ZMS", total_sales: 150, quantity: 25, discount: 15, average_per_product: 6 },
  { date: "2026-09-04", store_id: "store-b", store_code: "ZTM", store_name: "ZTM", total_sales: 75, quantity: 15, discount: 7, average_per_product: 5 },
  { date: "2026-09-05", store_id: "store-a", store_code: "ZMS", store_name: "ZMS", total_sales: 40, quantity: 8, discount: 4, average_per_product: 5 },
  { date: "2026-09-05", store_id: "store-b", store_code: "ZTM", store_name: "ZTM", total_sales: 0, quantity: 0, discount: 0, average_per_product: 0 },
], "store performance must preserve date-store cells, sum same-date shifts, and zero-fill missing cells");
assert.deepEqual(analytics.kpis, { total_sales: 265, quantity: 48, average_per_product: 5.52, discount: 26 }, "KPI totals must use finalized snapshot sums only");
assert.equal(analytics.filters.store_id, "all", "All Stores must remain All Stores even for a one-store result");

query.statuses = [];
const noData = await dashboardAnalytics(dashboardContext(fixtureClosings.filter(row => row.status !== "finalized")), "2026-09-04", "2026-09-05", "all", fixtureStores);
assert.equal(noData.has_data, false, "Draft and Void rows alone must set has_data false");
assert.equal(noData.daily_trend.length, 2, "zero-data responses must still retain generated date rows");
assert.equal(noData.store_performance.length, 4, "zero-data responses must still retain generated date-store cells");

const scopeSource = edge.match(/function dashboardStoreScope\(ctx: Context, requestedStoreId: string\) \{[\s\S]*?\n}/)?.[0] || "";
const dashboardStoreScope = new Function(`${scopeSource.replace("ctx: Context, requestedStoreId: string", "ctx, requestedStoreId").replaceAll("(store: any)", "(store)")} return dashboardStoreScope;`)();
const scopeContext = (role, stores = fixtureStores, store = fixtureStores[0]) => ({ profile: { role }, stores, store });
assert.deepEqual(dashboardStoreScope(scopeContext("developer"), "all"), fixtureStores, "Developer All Stores must use all authorized stores");
assert.deepEqual(dashboardStoreScope(scopeContext("admin"), "all"), fixtureStores, "Admin All Stores must mean all stores assigned to that Admin");
assert.deepEqual(dashboardStoreScope(scopeContext("admin"), "missing-store"), [], "Admin requests for an unauthorized store must be rejected by the route's 403 guard");
assert.deepEqual(dashboardStoreScope(scopeContext("outlet"), "all"), [fixtureStores[0]], "Outlet All Stores must remain limited to its assigned outlet");
assert.equal(dashboardStoreScope(scopeContext("outlet"), "store-b"), null, "Outlet requests for another outlet must be rejected by the route's 403 guard");

console.log("Claw dashboard contract passed.");

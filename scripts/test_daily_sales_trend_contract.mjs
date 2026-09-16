import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const edge = readFileSync(new URL("../supabase/functions/claw-api/index.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../web/assets/app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../web/assets/styles.css", import.meta.url), "utf8");

assert.match(edge, /path === "\/api\/analytics\/dashboard\/daily-trend" && req\.method === "GET"/, "The existing authenticated Daily Trend endpoint must remain unchanged.");
assert.match(edge, /dashboardStoreScope\(ctx, requestedStoreId\)/, "Daily Trend must retain Dashboard store authorization.");
assert.match(edge, /\.eq\("status", "finalized"\)/, "Daily Trend must retain finalized-only semantics.");

assert.match(app, /function renderPrimaryOutcomesDailySalesTrend\(filters\)/, "Primary Outcomes must own a new independent Daily Sales Trend card renderer.");
assert.match(app, /function renderPrimaryOutcomesSalesChart\(rows, animationKey\)/, "Primary Outcomes must own a new independent chart renderer.");
assert.match(app, /function primaryOutcomesSalesSpline\(points\)/, "The new chart must use its own fresh smooth-path builder.");
assert.match(app, /function primaryOutcomesSalesAxis\(values\)/, "The new chart must own its Y-axis scale builder.");
assert.match(app, /function bindPrimaryOutcomesSalesTooltip\(host\)/, "The new chart must own its tooltip binding.");
assert.match(app, /function schedulePrimaryOutcomesSalesAnimation\(host, animationKey\)/, "Daily Trend must own a scope-keyed line animation lifecycle.");
assert.match(app, /function dashboardPrimaryOutcomes\(data, filters\)[\s\S]*?dashboard-kpi-grid[\s\S]*?renderPrimaryOutcomesDailySalesTrend\(filters\)/, "The new renderer must appear directly below the KPI cards.");
assert.match(app, /<h2>Daily Sales Trend<\/h2>[\s\S]*?day sales overview/, "The new header must contain the title and sales-overview helper.");
assert.match(app, /Showing \$\{escapeHtml\(primaryOutcomesSalesDate\(period\.dateFrom\)\)\} to \$\{escapeHtml\(primaryOutcomesSalesDate\(period\.dateTo\)\)\}/, "The new header must render the returned period range.");
assert.match(app, /\/api\/analytics\/dashboard\/daily-trend\?\$\{query\.toString\(\)\}/, "The new component must retain only the existing data request.");
assert.match(app, /row\?\.sales === null \|\| Number\.isFinite\(row\?\.sales\)/, "Future-null response semantics must remain valid.");
assert.match(app, /points\.filter\(point => point\.y !== null\)/, "Future-null dates must not render as points or tooltip targets.");
assert.match(app, /let primaryOutcomesSalesChartSize = \{ width: 0, height: 0 \};[\s\S]*?function observePrimaryOutcomesSalesChart\(host\)/, "The chart must own its measured SVG-pixel geometry state and observer.");
assert.match(app, /const width = primaryOutcomesSalesChartSize\.width \|\| 960, height = primaryOutcomesSalesChartSize\.height \|\| 270, left = 52, right = 16, top = 14, bottom = 36/, "The plot must use the measured canvas dimensions rather than a permanently stretched logical viewBox.");
assert.match(app, /<svg class="primary-outcomes-daily-sales-svg\$\{awaitingAnimation\}"[^>]*width="\$\{width\}" height="\$\{height\}" viewBox="0 0 \$\{width\} \$\{height\}"/, "The SVG attributes and viewBox must use the same measured dimensions.");
assert.doesNotMatch(app, /primary-outcomes-daily-sales-svg"[^>]*preserveAspectRatio="none"/, "The chart must not non-uniformly stretch SVG coordinates.");
assert.match(app, /primaryOutcomesSalesChartResizeObserver = new ResizeObserver\(syncSize\);[\s\S]*?primaryOutcomesSalesChartResizeObserver\.observe\(canvas\);/, "Chart resize measurement must keep SVG units aligned with the responsive canvas.");
assert.match(app, /const width = Math\.round\(rect\.width \* 100\) \/ 100, height = Math\.round\(rect\.height \* 100\) \/ 100;/, "Measured SVG dimensions must retain fractional CSS-pixel precision rather than introducing a responsive rounding scale.");
assert.match(app, /linearGradient id="primaryOutcomesSalesArea"/, "The fresh chart must own a new gradient definition.");
assert.match(app, /<g class="primary-outcomes-daily-sales-grid">[\s\S]*?<g class="primary-outcomes-daily-sales-series">/, "The fresh chart must have separate grid and series DOM groups.");
assert.match(app, /path \+= `C\$\{\(current\.x \+ width \/ 3\)/, "The premium line must use a monotone cubic path rather than the old quadratic smoothing.");
assert.match(app, /primary-outcomes-daily-sales-line-shadow" d="\$\{path\.line\}"\/>[\s\S]*?primary-outcomes-daily-sales-line" d="\$\{path\.line\}"\/>/, "The series must render one restrained duplicate depth path and one main line for real-length animation.");
assert.match(app, /stop-opacity="\.18"[\s\S]*?stop-opacity="0"/, "The area gradient must use the premium 18%-to-transparent fill.");

const labelSource = app.match(/function primaryOutcomesSalesLabels\(length\) \{[\s\S]*?\n}/)?.[0] || "";
const labels = new Function(`${labelSource}; return primaryOutcomesSalesLabels;`)();
assert.deepEqual(labels(30), Array.from({ length: 30 }, (_, index) => index), "September must render all 30 desktop day labels.");
assert.deepEqual(labels(31), Array.from({ length: 31 }, (_, index) => index), "A 31-day month must render all 31 day labels.");
assert.deepEqual(labels(28), Array.from({ length: 28 }, (_, index) => index), "Common-year February must render all 28 day labels.");
assert.deepEqual(labels(29), Array.from({ length: 29 }, (_, index) => index), "Leap-year February must render all 29 day labels.");
const scaleSource = app.match(/function primaryOutcomesSalesUnit\(value\) \{[\s\S]*?\n}\n\nfunction primaryOutcomesSalesAxis\(values\) \{[\s\S]*?\n}/)?.[0] || "";
const axis = new Function(`${scaleSource}; return primaryOutcomesSalesAxis;`)()([6.22]);
assert.deepEqual(axis, { maximum: 8, ticks: [0, 2, 4, 6, 8] }, "A $6.22 maximum must render clean $0/$2/$4/$6/$8 levels.");

assert.match(css, /primary-outcomes-daily-sales \{[^}]*border:1px solid #e2e6ea; border-radius:12px; background:#fff;/, "The new card must use its own white 12px professional surface.");
assert.match(css, /primary-outcomes-daily-sales-header \{[^}]*padding:1\.25rem 1\.5rem 1rem;/, "The new header must use compact 20px/24px/16px spacing.");
assert.match(css, /primary-outcomes-daily-sales-svg \{[^}]*height:14rem;/, "The new mobile SVG owner must start at 224px.");
assert.match(css, /@media \(min-width:1024px\) \{ #page-dashboard \.primary-outcomes-daily-sales-svg \{ height:16\.875rem;/, "The new desktop plot must use the requested 270px height.");
assert.match(css, /primary-outcomes-daily-sales-grid line \{ stroke:#edf0f2; stroke-width:1; stroke-dasharray:3 3;/, "The new chart must use only subtle horizontal 3/3 grid lines.");
assert.match(css, /primary-outcomes-daily-sales-line \{ fill:none; stroke:#2563a6; stroke-width:3; stroke-linecap:round; stroke-linejoin:round; vector-effect:non-scaling-stroke; \}/, "The premium line must retain its non-scaling 3px blue treatment.");
assert.match(css, /primary-outcomes-daily-sales-line-shadow \{[^}]*filter:drop-shadow\(0 2px 2px rgb\(37 99 166 \/ \.20\)\)/, "The premium line must retain a minimal duplicate depth effect.");
assert.match(app, /const length = path\.getTotalLength\(\);[\s\S]*?path\.style\.strokeDasharray = `\$\{length\}`;[\s\S]*?stroke-dashoffset 900ms cubic-bezier\(\.22,1,\.36,1\)/, "The line reveal must use each actual SVG path length over 900ms.");
assert.match(app, /fill\.style\.transition = "opacity 600ms cubic-bezier\(\.16,1,\.3,1\) 120ms"/, "The area must fade in 120ms after the measured line reveal begins.");
assert.match(app, /animationKey === primaryOutcomesSalesAnimatedKey/, "Animation must avoid replaying during unrelated chart DOM updates.");
assert.match(app, /primaryOutcomesSalesDataKey\(dashboardFilters\)/, "Animation replay must be keyed to the applied store/date scope.");
assert.match(css, /primary-outcomes-daily-sales-label \{ fill:#64748b; font-family:"Inter",ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; font-size:12px; font-weight:500; line-height:normal; letter-spacing:0; font-variant-numeric:tabular-nums; -webkit-font-smoothing:antialiased; font-synthesis:none; \}/, "Both axes must use the single approved 12px/500 Inter numeric typography rule.");
assert.match(css, /primary-outcomes-daily-sales-svg \{[^}]*text-rendering:geometricPrecision;/, "The measured SVG must retain geometric text rendering without CSS scale transforms.");
assert.match(css, /primary-outcomes-daily-sales-hover\.is-active \{ r:5; opacity:1; transform:scale\(1\); \}/, "The premium chart must use a softly scaled hover-only point marker.");
assert.match(css, /primary-outcomes-daily-sales-tooltip \{[^}]*border-radius:10px; background:#fff;[\s\S]*?box-shadow:/, "The new tooltip must be a compact white 10px-radius card.");
assert.match(css, /primary-outcomes-daily-sales-tooltip:not\(\[hidden\]\) \{ animation:primary-outcomes-sales-tooltip-in \.18s/, "The tooltip must have a soft fade-and-rise entrance.");
assert.match(app, /window\.matchMedia\?\.\("\(prefers-reduced-motion: reduce\)"\)\?\.matches/, "Measured line motion must respect reduced-motion preferences.");
assert.match(css, /is-awaiting-animation[^}]*visibility:hidden/, "The chart must begin hidden until actual path lengths are prepared.");
assert.match(css, /@media \(max-width:540px\) \{[\s\S]*?primary-outcomes-daily-sales-x-axis .primary-outcomes-daily-sales-label \{ font-size:9px; \}/, "Narrow screens may compact labels but must not remove calendar dates.");

assert.doesNotMatch(app, /dailySalesOverview|daily-sales-overview|dashboardDailyTrendCard|dashboardSalesChart|renderDailyTrend|dashboard-sales-chart|dashboard-daily-trend-card|dashboardTrend|Performance Trend/, "Primary Outcomes must not reference a legacy Performance Trend renderer or tab.");
assert.doesNotMatch(css, /daily-sales-overview|dashboard-sales-chart|dashboard-daily-trend-card|dashboard-chart-/, "The legacy chart CSS owner must be removed.");

console.log("Daily Sales Trend new Primary Outcomes renderer contract passed.");

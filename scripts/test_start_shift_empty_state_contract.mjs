"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [app, css, html] = await Promise.all([
  read("../web/assets/app.js"),
  read("../web/assets/styles.css"),
  read("../web/index.html"),
]);

assert.match(app, /function startShiftLaunchContextV2204\(\)[\s\S]*?activeCloudStoreV2186\(\)[\s\S]*?isoToday\(\)/, "empty state context must use the active outlet and existing Start Shift business date");
assert.match(app, /month: "short"[\s\S]*?\.format\(new Date\(`\$\{isoToday\(\)\}T00:00:00`\)\)[\s\S]*?\.replace\("Sept", "Sep"\)/, "business date must retain its internal date while using readable DD Mon YYYY formatting");
assert.match(app, /function startShiftLaunchPanelV2204\(buttonId\)[\s\S]*?class="card shift-launch-panel"[\s\S]*?No active shift[\s\S]*?Ready to start today's shift\?[\s\S]*?Begin a new closing session for this outlet\.[\s\S]*?shift-launch-context-icon[\s\S]*?icon\("store", 20\)[\s\S]*?>Outlet<[\s\S]*?icon\("calendar", 20\)[\s\S]*?>Date<[\s\S]*?Start Shift <span aria-hidden="true">→<\/span>/, "empty state must contain the approved centered launch content, live outlet/date icons, and CTA");
assert.doesNotMatch(app.match(/function startShiftLaunchPanelV2204[\s\S]*?\n}\n\nfunction renderStartShiftStateV2178/)?.[0] || "", /newClosing\(|api\(/, "rendering the launch panel must not create or mutate a draft");
assert.match(app, /function renderStartShiftStateV2178\(\)[\s\S]*?page\.innerHTML = startShiftLaunchPanelV2204\("startShiftButtonV2178"\)[\s\S]*?\.onclick = \(\) => newClosing\(\)/, "local Start Shift must retain its existing action path");
assert.match(app, /function renderStartShiftStateV2179\(\)[\s\S]*?page\.innerHTML = startShiftLaunchPanelV2204\("startShiftButtonV2179"\)/, "cloud Start Shift must use the same launch-panel presentation");
assert.match(app, /const renderStartShiftStateV2182Loading = renderStartShiftStateV2179;[\s\S]*?await newClosing\(\)/, "cloud Start Shift loading wrapper must retain the existing action path");
assert.match(app, /function renderContinueShiftStateV2190\(active\)[\s\S]*?class="card shift-launch-panel shift-continue-panel"[\s\S]*?Shift still open[\s\S]*?Continue your open shift\?[\s\S]*?Your previous shift is still in progress and ready to continue\.[\s\S]*?>Shift Date<[\s\S]*?Continue Shift <span aria-hidden="true">→<\/span>/, "active draft continuation must use the same launch-panel visual family with its own copy");
assert.doesNotMatch(app, /todayÃ|todayâ/, "Daily Closing Start Shift copy must not contain mojibake");

assert.doesNotMatch(css, /start-shift-empty-card/, "obsolete Start Shift-only layout rules must be removed");
assert.match(css, /#page-closing \.shift-launch-panel \{[\s\S]*?max-width:40rem[\s\S]*?margin:2\.25rem auto 0[\s\S]*?padding:2rem[\s\S]*?border:1px solid #e2e6ea[\s\S]*?border-radius:16px/, "desktop empty state must be a centered 640px launch panel");
assert.match(css, /shift-launch-icon \{[^}]*width:44px; height:44px[\s\S]*?shift-launch-icon svg \{[^}]*width:20px; height:20px/, "launch icon must use the specified 44px container and 20px icon");
assert.match(css, /shift-launch-context \{[^}]*grid-template-columns:repeat\(2, minmax\(0, 1fr\)\)[^}]*?text-align:center[\s\S]*?shift-launch-context-item \{[^}]*justify-items:center[\s\S]*?shift-launch-context-icon \{[^}]*width:20px; height:20px[^}]*margin-bottom:8px[\s\S]*?shift-launch-context dt \{[^}]*font-size:12px; font-weight:500[\s\S]*?shift-launch-context dd \{[^}]*margin:4px 0 0[^}]*font-size:14px; font-weight:600[\s\S]*?shift-launch-actions \{[^}]*justify-content:center[\s\S]*?min-height:44px/, "context must be a centered two-column surface with 20px icons, specified type scale, and a centered 44px CTA");
assert.match(css, /shift-launch-actions \.btn:hover \{[^}]*transform:translateY\(-1px\)[\s\S]*?shift-launch-actions \.btn:active \{[^}]*translateY\(0\)/, "CTA must have the requested restrained hover and active interaction");
assert.match(css, /@media screen and \(max-width:620px\)[\s\S]*?shift-launch-context \{[^}]*grid-template-columns:1fr[\s\S]*?shift-launch-actions \.btn \{ width:100%/, "mobile context must stack and CTA must fill the panel width");
assert.match(html, /assets\/(?:styles\.css|app\.js)\?v=2\.1\.78-start-shift-premium/, "HTML must reference the premium Start Shift cache tag");

console.log("PASS - Daily Closing Start Shift empty-state presentation and behavior boundary contract.");

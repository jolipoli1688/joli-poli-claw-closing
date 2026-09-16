"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [index, app, css, users] = await Promise.all([
  read("../web/index.html"),
  read("../web/assets/app.js"),
  read("../web/assets/styles.css"),
  read("../web/cloud-user-management.js"),
]);

assert.match(index, /app-shell-loading/, "the normal application shell must render immediately");
assert.match(index, /class="page-loading" role="status"/, "initial Daily Closing must use a centered page loading boundary");
assert.equal((index.match(/loading-dots/g) || []).length, 1, "initial Daily Closing must render one dot loader");
assert.doesNotMatch(index, /skeleton|shimmer|loading-page-skeleton/i, "initial Daily Closing must not render skeleton placeholders");
assert.match(css, /\.page-loading \{ display:grid; min-height:calc\(100vh - 88px\); place-items:center; \}/, "page loading must stay centered in the available content area");
assert.match(css, /\.loading-dots > span \{ width:8px; height:8px/, "Dashboard dots must be 8px");
assert.match(css, /gap:6px/, "Dashboard dots must retain their 6px spacing");
assert.match(css, /animation-delay:-\.3s/, "first dot must retain the Dashboard stagger");
assert.match(css, /animation-delay:-\.15s/, "second dot must retain the Dashboard stagger");
assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.loading-dots > span/, "dot motion must respect reduced motion");
assert.doesNotMatch(css, /skeleton|shimmer/i, "skeleton CSS must be removed");
assert.match(app, /loadingDotsV2183/, "Settings, History, and Reports must share the dot loader");
assert.doesNotMatch(app, /loadingKpiCardsV2182|loadingTableRowsV2182|renderSettingsLoadingV2182|renderHistoryLoadingV2182|skeleton/i, "page scripts must not create skeleton loading UI");
assert.match(app, /setInlineButtonLoading/, "small actions must retain inline button loading");
assert.match(users, /page-loading page-loading-section/, "User Management must use the shared dot loader");
assert.doesNotMatch(users, /skeleton/i, "User Management must not render skeleton rows");
assert.match(users, /loading-inline-spinner/, "User and outlet actions must retain inline spinners");

console.log("PASS - persistent shell and Dashboard three-dot page loading contract.");

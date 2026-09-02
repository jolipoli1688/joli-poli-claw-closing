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

assert.doesNotMatch(index, /loadingOverlay|loading-card|Opening Claw Closing|Loading your workspace/, "initial loading must not use the old full-page card");
assert.match(index, /app-shell-loading/, "the normal application shell must render immediately");
assert.match(index, /loading-page-skeleton/, "initial Daily Closing content must reserve its final layout");
assert.match(index, /skeleton-machine-table[\s\S]*Machine[\s\S]*Product \/ Barcode[\s\S]*Begin Qty[\s\S]*Coins Used[\s\S]*Status/s, "machine skeleton must retain the real column structure");
assert.equal((index.match(/skeleton-table-row/g) || []).length, 5, "initial machine table must reserve five loading rows");
assert.match(css, /--loading-skeleton-base/, "skeleton colors must use application design tokens");
assert.match(css, /\[data-theme="dark"\], \.theme-dark/, "dark-theme skeleton tokens must be supported");
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/, "loading motion must respect reduced-motion preferences");
assert.match(css, /claw-skeleton-shimmer/, "skeletons must use a quiet shimmer");
assert.doesNotMatch(css, /bounce|flash/i, "loading CSS must not introduce bouncing or flashing effects");
assert.match(app, /renderSettingsLoadingV2182/, "Settings must render a matching skeleton while data loads");
assert.match(app, /renderHistoryLoadingV2182/, "History must render a matching skeleton while data loads");
assert.match(app, /loadingKpiCardsV2182/, "KPI areas must retain card dimensions while loading");
assert.match(app, /loadingTableRowsV2182\(9\)/, "History table skeleton must preserve its column count");
assert.match(app, /showInitialLoadingError/, "bootstrap failures must replace skeletons with a retry state");
assert.match(app, /setInlineButtonLoading/, "small actions must use inline button loading");
assert.match(app, /upload-progress/, "image selection must expose progress and status treatment");
assert.match(users, /clawDeveloperUsersLoading/, "User Management must show a skeleton while its data loads");
assert.match(users, /loading-inline-spinner/, "User and outlet actions must show inline spinners");

console.log("PASS - professional shell, skeleton, inline-action, upload-progress, and error loading contracts.");

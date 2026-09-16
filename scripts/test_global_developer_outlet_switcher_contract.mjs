"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [app, html, css, edge] = await Promise.all([
  read("../web/assets/app.js"),
  read("../web/index.html"),
  read("../web/assets/styles.css"),
  read("../supabase/functions/claw-api/index.ts"),
]);

const globalSwitcher = app.match(/function renderDeveloperOutletSwitcherV2187[\s\S]*?\n}\n\nconst initialiseV2187GlobalOutletSwitcher/)?.[0] || "";
const innerField = app.match(/function installCloudOutletSelectorV2186[\s\S]*?\n}\n\nconst renderClosingV2186OutletSelector/)?.[0] || "";
const switcher = app.match(/async function switchCloudOutletV2186[\s\S]*?\n}\n\nfunction installCloudOutletSelectorV2186/)?.[0] || "";

assert.match(html, /id="developerOutletSwitcher"/, "the app shell must reserve a persistent header host for the Developer outlet control");
assert.match(globalSwitcher, /cloudProfileRoleV2186\(\) !== "developer"/, "only Developers may receive the global selector");
assert.match(globalSwitcher, /developerOutletSelectV2187/, "the global selector must have a stable accessible control ID");
assert.match(globalSwitcher, /option\.value = String\(store\.id\)/, "outlet selection must use the existing store ID context");
assert.match(globalSwitcher, /option\.textContent = String\(store\.name \|\| store\.code/, "outlet labels must not expose UUIDs");
assert.match(globalSwitcher, /switchCloudOutletV2186\(requestedStoreId\)/, "the header selector must use the existing single outlet-context switch path");
assert.match(app, /initialiseV2187GlobalOutletSwitcher[\s\S]*renderDeveloperOutletSwitcherV2187\(\)/, "the selector must render after initial bootstrap");
assert.match(app, /navigateV2187GlobalOutletSwitcher[\s\S]*renderDeveloperOutletSwitcherV2187\(\)/, "the selector must remain available across pages");
assert.match(app, /reloadBootstrapAfterVoidV2187GlobalOutletSwitcher[\s\S]*renderDeveloperOutletSwitcherV2187\(\)/, "the selector must synchronize after any bootstrap context refresh");
assert.match(innerField, /outletField\.readOnly = true/, "the Closing Entry outlet field must be a synchronized read-only display");
assert.doesNotMatch(innerField, /document\.createElement\("select"\)/, "the Closing Entry must not create an independent outlet selector");
assert.match(switcher, /flushPendingAutosaveForOutletSwitchV2186\(\)/, "switching away from a Draft must flush autosave first");
assert.match(switcher, /invalidateAutosaveForVoidV2181\(\)/, "switching must invalidate stale queued writes");
assert.match(switcher, /state\.closing = null/, "switching must not transfer a closing to the selected outlet");
assert.match(switcher, /await ensureClosingPage\(\)/, "switching the Closing page must resolve Draft-or-ready state without starting a shift");
assert.doesNotMatch(switcher, /newClosing\(/, "switching itself must never create a shift");
assert.match(edge, /x-claw-store-id/, "the existing Edge store-context validation remains the sole server context authority");
assert.match(css, /\.developer-outlet-switcher/, "the global selector must use compact professional styling");

console.log("PASS - Developer outlet selector remains global, synchronized, Draft-safe, and no-shift safe without new Edge or database behavior.");

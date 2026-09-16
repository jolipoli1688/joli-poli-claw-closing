"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [edge, adapter, app, lifecycleMigration, purgeMigration] = await Promise.all([
  read("../supabase/functions/claw-api/index.ts"),
  read("../web/cloud-api-adapter.js"),
  read("../web/assets/app.js"),
  read("../supabase/migrations/20260903010000_one_active_draft_per_store.sql"),
  read("../supabase/migrations/20260902090544_purge_developer_machine_type.sql"),
]);

const opening = edge.match(/async function openingTemplate[\s\S]*?\n}\n\nasync function saveClosing/)?.[0] || "";
const machineTypeRoute = edge.match(/if \(path\.startsWith\("\/api\/machine-types\/"\)[\s\S]*?\n    if \(path === "\/api\/machines"/)?.[0] || "";
const switcher = app.match(/async function switchCloudOutletV2186[\s\S]*?\n}\n\nfunction installCloudOutletSelectorV2186/)?.[0] || "";
const selector = app.match(/function installCloudOutletSelectorV2186[\s\S]*?\n}\n\nconst renderClosingV2186OutletSelector/)?.[0] || "";
const globalSelector = app.match(/function renderDeveloperOutletSwitcherV2187[\s\S]*?\n}\n\nconst initialiseV2187GlobalOutletSwitcher/)?.[0] || "";
const purgeUi = app.match(/function showMachineTypePurgeV2186[\s\S]*?\n}\n\nfunction installDeveloperMachineTypePurgeV2186/)?.[0] || "";

assert.match(lifecycleMigration, /unique index uq_daily_closings_store_draft/, "one Draft per outlet must be the only lifecycle uniqueness rule");
assert.match(lifecycleMigration, /where status = 'draft'::public\.closing_status/, "finalized and Void same-date shifts must remain historical");
assert.match(edge, /\.eq\("status", "draft"\)\.maybeSingle\(\)/, "active closing lookup must be Draft-only");
assert.match(opening, /\.eq\("status", "finalized"\)\.lte\("report_date", reportDate\)\.order\("report_date", \{ ascending: false \}\)\.order\("finalized_at", \{ ascending: false \}\)\.order\("created_at", \{ ascending: false \}\)/, "carry-forward must choose the latest finalized same-or-earlier-date shift by chronology");
assert.match(opening, /carryForward\.set\(product\.machine_style_id, integer\(product\.final_qty\)\)/, "carry-forward must map persisted quantities by machine_style_id");
assert.match(opening, /readMachines\(ctx, true\)/, "new shifts must start from current active master machines");
assert.match(opening, /begin_qty: carryForward\.get\(product\.product_id\)/, "each current style must receive only its own previous final quantity");
assert.match(opening, /refill_qty: 0, final_qty: ""/, "new shifts must reset refill and final quantity");
assert.match(opening, /image_url: machine\.Image_URL/, "new shifts must use signed current master images");

assert.match(adapter, /active-store/, "cloud adapter must remember the selected outlet locally");
assert.match(adapter, /"x-claw-store-id": activeStoreId/, "all subsequent cloud calls must carry the active outlet header");
assert.match(adapter, /path === "\/api\/bootstrap"\) setActiveStoreId\(body\?\.cloud_context\?\.active_store\?\.id \|\| ""\)/, "bootstrap must validate or fall back the remembered outlet");
assert.match(globalSelector, /cloudProfileRoleV2186\(\) !== "developer"/, "only Developers receive the global outlet selector");
assert.match(globalSelector, /option\.value = String\(store\.id\)/, "outlet choices must carry an internal store ID");
assert.match(globalSelector, /option\.textContent = String\(store\.name \|\| store\.code/, "outlet choices must display names rather than UUIDs");
assert.match(selector, /outletField\.readOnly = true/, "the Closing Entry outlet must stay synchronized as a read-only display");
assert.match(switcher, /flushPendingAutosaveForOutletSwitchV2186\(\)/, "switching must flush the old outlet Draft first");
assert.match(switcher, /invalidateAutosaveForVoidV2181\(\)/, "switching must cancel stale timers and queued writes");
assert.match(switcher, /setActiveStoreId\?\.\(target\.id\)/, "switching must set the new request context");
assert.match(switcher, /state\.closingId = null[\s\S]*?state\.closing = null/, "switching must not transfer an in-memory closing to another outlet");
assert.match(switcher, /reloadBootstrapAfterVoidV2181\(\)/, "switching must reload the target outlet bootstrap, settings, machines, images, and Draft");

assert.match(purgeMigration, /security definer\s+set search_path = ''/, "purge RPC must use a fixed search path");
assert.match(purgeMigration, /if auth\.uid\(\) is null/, "purge RPC must require authentication");
assert.match(purgeMigration, /profile\.is_active[\s\S]*profile\.role = 'developer'/, "purge RPC must require an active Developer");
assert.match(purgeMigration, /target\.name <> confirm_name/, "purge RPC must require exact type-name confirmation");
assert.match(purgeMigration, /closing\.status in \('draft'::public\.closing_status, 'finalized'::public\.closing_status\)/, "Draft and finalized history must block a permanent purge");
assert.match(purgeMigration, /closing\.status = 'void'::public\.closing_status/, "only target entries in Void closings may be removed");
assert.match(purgeMigration, /delete from public\.refill_events[\s\S]*?delete from public\.closing_product_entries[\s\S]*?delete from public\.closing_machine_entries/, "purge must remove target Void dependencies in FK-safe order");
assert.match(purgeMigration, /storage_paths/, "purge RPC must return exact style-image paths");
assert.doesNotMatch(purgeMigration, /delete from public\.daily_closings/, "purge must preserve closing headers and unrelated entries");
assert.match(purgeMigration, /revoke all on function public\.purge_developer_machine_type[\s\S]*?grant execute[\s\S]*?authenticated/, "purge RPC must not be executable by public or anon");
assert.match(machineTypeRoute, /ctx\.user\.rpc\("purge_developer_machine_type"/, "Edge must invoke the atomic database RPC as the caller");
assert.match(machineTypeRoute, /storage\.from\(IMAGE_BUCKET\)\.remove\(storagePaths\)/, "Edge must remove only RPC-returned Storage paths after the database succeeds");
assert.match(purgeUi, /Delete Machine Type Permanently/, "UI must label the destructive action clearly");
assert.match(purgeUi, /Type the exact machine type name/, "UI must require exact type-name confirmation");
assert.match(purgeUi, /confirm_name: confirmation/, "UI must submit the typed confirmation to the protected API");

console.log("PASS - shift carry-forward, Developer outlet context, and void-only machine-type purge contracts are covered.");

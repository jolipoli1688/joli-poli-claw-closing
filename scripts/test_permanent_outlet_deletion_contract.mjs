"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, edge, users, app] = await Promise.all([
  read("../supabase/migrations/20260902090000_purge_developer_outlet.sql"),
  read("../supabase/functions/claw-api/index.ts"),
  read("../web/cloud-user-management.js"),
  read("../web/assets/app.js"),
]);

assert.match(migration, /create or replace function public\.purge_developer_outlet\(\s*target_store uuid,\s*confirm_code text/s, "migration must provide the Developer outlet purge RPC");
assert.match(migration, /security definer[\s\S]*set search_path = ''/i, "RPC must fix its SECURITY DEFINER search path");
assert.match(migration, /auth\.uid\(\) is null/, "RPC must require an authenticated caller");
assert.match(migration, /profile\.role = 'developer'::public\.app_role/, "RPC must require the Developer role");
assert.match(migration, /outlet\.code <> confirm_code/, "RPC must require the exact outlet code");
assert.match(migration, /from public\.stores\s+where is_active\s+for update/s, "RPC must serialize last-usable-outlet checks");
assert.match(migration, /The last outlet cannot be deleted/, "RPC must preserve one usable outlet");
assert.match(migration, /style\.image_path like \('stores\/' \|\| outlet\.id::text \|\| '\/%'\)/, "returned storage paths must be limited to the deleted outlet prefix");
assert.match(migration, /delete from public\.refill_events[\s\S]*delete from public\.closing_product_entries[\s\S]*delete from public\.closing_machine_entries[\s\S]*delete from public\.daily_closings/s, "closing hierarchy must be purged before machines and styles");
assert.match(migration, /delete from public\.machine_styles[\s\S]*delete from public\.machines/s, "outlet styles must be purged before outlet machines");
assert.match(migration, /delete from public\.(?:audit_log|user_store_access|store_machine_type_rules|store_settings)/, "outlet-scoped support rows must be purged");
assert.doesNotMatch(migration, /delete from public\.(?:profiles|machine_types)/i, "user accounts and global machine types must be preserved");
assert.doesNotMatch(migration, /STG-[AB]\b/, "migration must never target STG-A or STG-B automatically");
assert.match(migration, /revoke all on function public\.purge_developer_outlet\(uuid, text\) from public, anon/, "public execution must be revoked");
assert.match(migration, /grant execute on function public\.purge_developer_outlet\(uuid, text\) to authenticated/, "signed-in callers need RPC execution for role-gated access");

assert.match(edge, /path\.startsWith\("\/api\/outlets\/"\) && req\.method === "DELETE"/, "Edge must expose DELETE /api/outlets/{id}");
assert.match(edge, /ctx\.user\.rpc\("purge_developer_outlet"/, "Edge must invoke the authenticated RPC context");
assert.match(edge, /confirm_code: String\(body\.confirm_code \|\| ""\)/, "Edge must pass confirmation text unchanged to the RPC");
const rpcIndex = edge.indexOf('ctx.user.rpc("purge_developer_outlet"');
const storageIndex = edge.indexOf(".storage.from(IMAGE_BUCKET).remove(storagePaths)");
assert.ok(rpcIndex >= 0 && storageIndex > rpcIndex, "Storage cleanup must occur only after a successful database RPC");
assert.match(edge, /storage_cleanup_failed_paths/, "Edge must report failed storage cleanup paths without undoing the purge");

assert.match(users, /Delete Outlet Permanently/, "Outlets UI needs a destructive permanent-delete action");
assert.match(users, /Type <strong>\$\{esc\(outlet\.code\)\}<\/strong> to confirm/, "UI must tell the Developer to type the exact outlet code");
assert.match(users, /confirmCode !== outlet\.code/, "UI must reject non-exact confirmations before the API request");
assert.match(users, /method: "DELETE"/, "UI must send its deletion through the DELETE API");
assert.match(users, /claw-outlet-deleted/, "UI must notify the shared workspace of a current-outlet deletion");
assert.match(app, /resetAfterDeletedOutletV2182/, "shared app must reset current-outlet state after deletion");
assert.match(app, /invalidateAutosaveForVoidV2181\(\)/, "current-outlet reset must invalidate pending autosave state");
assert.match(app, /await reloadBootstrapAfterVoidV2181\(\)/, "current-outlet reset must bootstrap a remaining outlet");

console.log("PASS - permanent outlet deletion is RPC-gated, store-scoped, and resets the active cloud workspace.");

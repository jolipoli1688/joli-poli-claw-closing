"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, edge, app] = await Promise.all([
  read("../supabase/migrations/20260903000000_retire_machine_and_remove_from_draft.sql"),
  read("../supabase/functions/claw-api/index.ts"),
  read("../web/assets/app.js"),
]);

const rpc = migration.match(/create or replace function public\.retire_machine_and_remove_from_draft[\s\S]*?grant execute on function public\.retire_machine_and_remove_from_draft\(uuid\) to authenticated;/)?.[0] || "";
const trigger = migration.match(/create or replace function private\.require_active_machine_for_closing_entry[\s\S]*?for each row execute function private\.require_active_machine_for_closing_entry\(\);/)?.[0] || "";
const saveClosing = edge.match(/async function saveClosing[\s\S]*?\n}\n\nfunction refillHistory/)?.[0] || "";
const deleteRoute = edge.match(/if \(path\.startsWith\("\/api\/machines\/"\) && req\.method === "DELETE"\)[\s\S]*?return json\(retired\.data\);/)?.[0] || "";
const reload = app.match(/async function retireMachineAndReloadDraftV2189[\s\S]*?\n}\n\nfunction bindClosingStructureActions/)?.[0] || "";

assert.match(rpc, /returns jsonb[\s\S]*?security definer[\s\S]*?set search_path = ''/, "retirement must be a fixed-search-path SECURITY DEFINER transaction");
assert.match(rpc, /if auth\.uid\(\) is null/, "retirement requires an authenticated caller");
assert.match(rpc, /profile\.is_active/, "retirement requires an active profile");
assert.match(rpc, /'developer'::public\.app_role, 'admin'::public\.app_role/, "only Developer and Admin may retire a machine");
assert.match(rpc, /actor\.role = 'developer'::public\.app_role and not actor\.all_stores/, "Developer authority must respect all_stores");
assert.match(rpc, /actor\.role = 'admin'::public\.app_role and not exists[\s\S]*?public\.user_store_access/, "Admin authority must require an explicit outlet membership");
assert.match(rpc, /from public\.machines machine[\s\S]*?for update/, "the target master row must be locked in the transaction");
assert.match(rpc, /closing\.status = 'draft'::public\.closing_status/, "only Draft entries may be selected or deleted");
assert.match(rpc, /delete from public\.closing_machine_entries entry[\s\S]*?using public\.daily_closings closing/, "the RPC deletes only Draft machine entries");
assert.doesNotMatch(rpc, /delete from public\.(?:refill_events|closing_product_entries)/, "product and refill children must rely on existing FK cascades");
assert.doesNotMatch(rpc, /delete from public\.daily_closings/, "the Draft header must remain intact");
assert.match(rpc, /update public\.machines machine[\s\S]*?is_active = false/, "retirement must mark the master inactive atomically");
assert.match(rpc, /insert into public\.audit_log[\s\S]*?'retire'/, "retirement must write an in-transaction audit event");
assert.match(rpc, /revoke all on function public\.retire_machine_and_remove_from_draft\(uuid\) from public, anon/, "public and anon execute must be revoked");
assert.match(rpc, /grant execute on function public\.retire_machine_and_remove_from_draft\(uuid\) to authenticated/, "only authenticated callers receive execute permission");
assert.match(trigger, /before insert on public\.closing_machine_entries/, "a database trigger must guard against stale draft reinsertion");
assert.match(trigger, /machine\.is_active/, "the insert trigger must reject retired masters");
assert.match(deleteRoute, /ctx\.user\.rpc\("retire_machine_and_remove_from_draft", \{ target_machine: id \}\)/, "the Edge endpoint must call the authenticated user-JWT RPC");
assert.doesNotMatch(deleteRoute, /\.from\("machines"\)\.update/, "the Edge endpoint must not perform a standalone soft delete");
assert.match(saveClosing, /const configuredMachines = await ctx\.admin\.from\("machines"\)\.select\("id,is_active"\)/, "save must load current active configuration before calculating a draft");
assert.match(saveClosing, /return machine\.is_active/, "stale inactive machine payload rows must be omitted before persistence");
assert.match(saveClosing, /\.eq\("is_active", true\)\.maybeSingle\(\)/, "a save racing retirement must recheck active status immediately before entry mutation");
assert.match(reload, /invalidateAutosaveForVoidV2181\(\)/, "retirement must invalidate queued and in-flight autosave generations first");
assert.match(reload, /setBulkMode\(false\)/, "retirement must clear selections containing the removed machine");
assert.match(reload, /state\.closing\.machines = state\.closing\.machines\.filter/, "retirement must remove the local Draft row before reload");
assert.match(reload, /await openClosing\(targetClosingId\)/, "retirement must reload the authoritative current Draft");
assert.match(reload, /state\.machines = await api\("\/api\/machines\?active_only=true"\)/, "retirement must reload active configuration after the RPC");

console.log("PASS - atomic retirement is authorized, cascade-safe, historical-safe, audit-recorded, and protected from stale autosave restoration.");

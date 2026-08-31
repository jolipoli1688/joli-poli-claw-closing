"use strict";

import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

if (process.env.CLOUD_UAT_CLEANUP !== "delete-controlled-uat") throw new Error("Set CLOUD_UAT_CLEANUP=delete-controlled-uat to remove only controlled UAT fixtures.");
const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = required.filter(key => !process.env[key]);
if (missing.length) throw new Error(`Missing required cleanup environment variables: ${missing.join(", ")}.`);
const baseUrl = process.env.SUPABASE_URL.replace(/\/$/, "");
if (baseUrl !== "https://fbvzqdqjqcbjopuinknw.supabase.co") throw new Error("Cleanup is restricted to the approved staging project.");

const service = createClient(baseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const userFilter = "username.like.stg-admin-uat-%,username.like.stg-outlet-a-uat-%,username.like.stg-outlet-b-uat-%";
const closingMarker = "Synthetic authenticated cloud parity fixture%";

async function authCandidates() {
  const matches = [];
  for (let page = 1; ; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data.users || [];
    matches.push(...users.filter(user => /^(stg-admin-uat-|stg-outlet-a-uat-|stg-outlet-b-uat-).+@claw\.internal$/i.test(String(user.email || ""))));
    if (users.length < 1000) return matches;
  }
}

async function candidates() {
  const [profiles, closings, machines, authUsers] = await Promise.all([
    service.from("profiles").select("id,username").or(userFilter),
    service.from("daily_closings").select("id").ilike("notes", closingMarker),
    service.from("machines").select("id").ilike("machine_code", "STG-UAT-%"),
    authCandidates(),
  ]);
  for (const result of [profiles, closings, machines]) assert.ifError(result.error);
  const machineIds = (machines.data || []).map(row => row.id);
  const styles = machineIds.length ? await service.from("machine_styles").select("id,image_path").in("machine_id", machineIds) : { data: [], error: null };
  assert.ifError(styles.error);
  return { profileIds: (profiles.data || []).map(row => row.id), closingIds: (closings.data || []).map(row => row.id), machineIds, storagePaths: (styles.data || []).map(row => row.image_path).filter(Boolean), authUserIds: authUsers.map(user => user.id) };
}

const before = await candidates();
console.log(JSON.stringify({ phase: "before", users: before.authUserIds.length, profiles: before.profileIds.length, closings: before.closingIds.length, machines: before.machineIds.length, storage_objects: before.storagePaths.length }));

if (before.storagePaths.length) assert.ifError((await service.storage.from("machine-style-images").remove(before.storagePaths)).error);
if (before.closingIds.length) assert.ifError((await service.from("daily_closings").delete().in("id", before.closingIds)).error);
if (before.machineIds.length) assert.ifError((await service.from("machines").delete().in("id", before.machineIds)).error);

const auditEntityIds = [...before.profileIds, ...before.closingIds, ...before.machineIds];
if (auditEntityIds.length) assert.ifError((await service.from("audit_log").delete().or(`actor_user_id.in.(${before.profileIds.join(",") || "00000000-0000-0000-0000-000000000000"}),entity_id.in.(${auditEntityIds.join(",")})`)).error);
for (const id of before.authUserIds) assert.ifError((await service.auth.admin.deleteUser(id)).error);

const after = await candidates();
console.log(JSON.stringify({ phase: "after", users: after.authUserIds.length, profiles: after.profileIds.length, closings: after.closingIds.length, machines: after.machineIds.length, storage_objects: after.storagePaths.length, deleted: { users: before.authUserIds.length - after.authUserIds.length, profiles: before.profileIds.length - after.profileIds.length, closings: before.closingIds.length - after.closingIds.length, machines: before.machineIds.length - after.machineIds.length } }));
assert.deepEqual(after, { profileIds: [], closingIds: [], machineIds: [], storagePaths: [], authUserIds: [] }, "controlled UAT fixtures must be fully removed, including Auth ghosts");

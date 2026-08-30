"use strict";

import { createClient } from "@supabase/supabase-js";

// One-time STAGING-only server-side Auth Admin provisioner. It intentionally
// reads every credential from the invoking environment and never prints a key,
// password, access token, or refresh token. It uses the same Auth Admin
// create-user operation through supabase.auth.admin.createUser.

const PROJECT_REF = "fbvzqdqjqcbjopuinknw";
const expectedUrl = `https://${PROJECT_REF}.supabase.co`;
const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "STG_DEVELOPER_USERNAME", "STG_DEVELOPER_PASSWORD"];
const missing = required.filter(name => !process.env[name]);
if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}. No provisioning was attempted.`);
const baseUrl = process.env.SUPABASE_URL.replace(/\/$/, "");
if (baseUrl !== expectedUrl) throw new Error("Provisioner is restricted to the approved JOLI POLI staging project.");

const admin = createClient(baseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
function normalizeUsername(value) {
  const username = String(value || "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9._-]/g, "").replace(/-+/g, "-");
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) throw new Error("STG_DEVELOPER_USERNAME must normalize to 3-32 lowercase letters, digits, dot, underscore, or hyphen.");
  return username;
}
const developerUsername = normalizeUsername(process.env.STG_DEVELOPER_USERNAME);
const users = [{ key: "developer", username: developerUsername, email: `${developerUsername}@claw.internal`, password: process.env.STG_DEVELOPER_PASSWORD, displayName: developerUsername, role: "developer", allStores: true, stores: ["STG-A", "STG-B"] }];

const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listed.error) throw new Error("Could not inspect existing staging Auth users.");
const byEmail = new Map((listed.data.users || []).map(user => [String(user.email || "").toLowerCase(), user]));
const { data: storeRows, error: storeError } = await admin.from("stores").select("id,code").in("code", ["STG-A", "STG-B"]);
if (storeError) throw new Error("Could not resolve STG outlet assignments.");
const storeIds = new Map(storeRows.map(store => [store.code, store.id]));
if (storeIds.size !== 2) throw new Error("Expected STG-A and STG-B stores are missing. No provisioning was attempted.");

for (const fixture of users) {
  let identity = byEmail.get(fixture.email);
  let state = "existing";
  if (!identity) {
    const created = await admin.auth.admin.createUser({ email: fixture.email, password: fixture.password, email_confirm: true, user_metadata: { display_name: fixture.displayName } });
    if (created.error) throw new Error(`Could not create synthetic ${fixture.key} identity.`);
    identity = created.data.user;
    state = "created";
  }
  if (!identity?.id) throw new Error(`Could not resolve synthetic identity for ${fixture.key}.`);
  const profile = await admin.from("profiles").update({ username: fixture.username, display_name: fixture.displayName, role: fixture.role, is_active: true, all_stores: fixture.allStores }).eq("id", identity.id);
  if (profile.error) throw new Error(`Could not configure the ${fixture.key} profile.`);
  const memberships = fixture.stores.map(code => ({ user_id: identity.id, store_id: storeIds.get(code) }));
  const membership = await admin.from("user_store_access").upsert(memberships, { onConflict: "user_id,store_id" });
  if (membership.error) throw new Error(`Could not assign ${fixture.key} outlets.`);
  console.log(`${fixture.key}: ${state} ${identity.id}`);
}

console.log("STAGING_AUTH_PROVISION_COMPLETE");

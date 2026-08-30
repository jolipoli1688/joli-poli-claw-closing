"use strict";

// One-time STAGING-only server-side Auth Admin provisioner. It intentionally
// reads every credential from the invoking environment and never prints a key,
// password, access token, or refresh token. It uses the same Auth Admin
// create-user operation as supabase.auth.admin.createUser.

const PROJECT_REF = "fbvzqdqjqcbjopuinknw";
const expectedUrl = `https://${PROJECT_REF}.supabase.co`;
const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "STG_STAFF_PASSWORD", "STG_MANAGER_PASSWORD", "STG_HO_PASSWORD", "STG_ADMIN_PASSWORD"];
const missing = required.filter(name => !process.env[name]);
if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}. No provisioning was attempted.`);
const baseUrl = process.env.SUPABASE_URL.replace(/\/$/, "");
if (baseUrl !== expectedUrl) throw new Error("Provisioner is restricted to the approved JOLI POLI staging project.");

const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
const authHeaders = { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };
const restHeaders = { ...authHeaders, Prefer: "resolution=merge-duplicates,return=representation" };
const users = [
  { key: "staff", email: "stg-claw-staff-a@staging.jolipoli.cloud", password: process.env.STG_STAFF_PASSWORD, displayName: "STG Staff A", role: "staff", allStores: false, stores: ["STG-A"] },
  { key: "manager", email: "stg-claw-manager-a@staging.jolipoli.cloud", password: process.env.STG_MANAGER_PASSWORD, displayName: "STG Store Manager A", role: "store_manager", allStores: false, stores: ["STG-A"] },
  { key: "head_office", email: "stg-claw-head-office@staging.jolipoli.cloud", password: process.env.STG_HO_PASSWORD, displayName: "STG Head Office", role: "head_office", allStores: true, stores: ["STG-A", "STG-B"] },
  { key: "admin", email: "stg-claw-admin@staging.jolipoli.cloud", password: process.env.STG_ADMIN_PASSWORD, displayName: "STG Admin", role: "admin", allStores: true, stores: ["STG-A", "STG-B"] },
];

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  if (!response.ok) throw new Error(`Staging provisioner request failed (${response.status}).`);
  return response.status === 204 ? null : response.json();
}

const existing = await request("/auth/v1/admin/users?page=1&per_page=1000", { headers: authHeaders });
const byEmail = new Map((existing.users || []).map(user => [String(user.email || "").toLowerCase(), user]));
const storeRows = await request("/rest/v1/stores?select=id,code&code=in.(STG-A,STG-B)", { headers: authHeaders });
const storeIds = new Map(storeRows.map(store => [store.code, store.id]));
if (storeIds.size !== 2) throw new Error("Expected STG-A and STG-B stores are missing. No provisioning was attempted.");

for (const fixture of users) {
  let identity = byEmail.get(fixture.email);
  let state = "existing";
  if (!identity) {
    identity = await request("/auth/v1/admin/users", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ email: fixture.email, password: fixture.password, email_confirm: true, user_metadata: { display_name: fixture.displayName } }),
    });
    state = "created";
  }
  if (!identity?.id) throw new Error(`Could not resolve synthetic identity for ${fixture.key}.`);
  await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(identity.id)}`, {
    method: "PATCH",
    headers: restHeaders,
    body: JSON.stringify({ display_name: fixture.displayName, role: fixture.role, is_active: true, all_stores: fixture.allStores }),
  });
  const memberships = fixture.stores.map(code => ({ user_id: identity.id, store_id: storeIds.get(code) }));
  await request("/rest/v1/user_store_access?on_conflict=user_id,store_id", { method: "POST", headers: restHeaders, body: JSON.stringify(memberships) });
  console.log(`${fixture.key}: ${state} ${identity.id}`);
}

console.log("STAGING_AUTH_PROVISION_COMPLETE");

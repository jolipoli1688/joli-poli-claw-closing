"use strict";

import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

if (process.env.CLOUD_UAT_CLEANUP !== "confirm") throw new Error("Set CLOUD_UAT_CLEANUP=confirm to deactivate duplicate synthetic UAT users.");
const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "STG_DEVELOPER_USERNAME", "STG_DEVELOPER_PASSWORD"];
const missing = required.filter(key => !process.env[key]);
if (missing.length) throw new Error(`Missing required cleanup environment variables: ${missing.join(", ")}.`);
const baseUrl = process.env.SUPABASE_URL.replace(/\/$/, "");
if (baseUrl !== "https://fbvzqdqjqcbjopuinknw.supabase.co") throw new Error("Cleanup is restricted to the approved staging project.");
const normalize = value => String(value).normalize("NFKC").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9._-]/g, "").replace(/-+/g, "-");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const service = createClient(baseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const developerEmail = `${normalize(process.env.STG_DEVELOPER_USERNAME)}@claw.internal`;
const login = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: serviceKey, "Content-Type": "application/json" }, body: JSON.stringify({ email: developerEmail, password: process.env.STG_DEVELOPER_PASSWORD }) });
assert.ok(login.ok, "Developer authentication failed.");
const session = await login.json();
const { data: candidates, error } = await service.from("profiles").select("id,username,role,is_active,created_at,user_store_access!user_store_access_user_id_fkey(store_id,stores(code))").or("username.like.stg-admin-uat-%,username.like.stg-outlet-a-uat-%,username.like.stg-outlet-b-uat-%").order("created_at", { ascending: false });
assert.ifError(error);
const category = username => username.startsWith("stg-admin-uat-") ? "admin" : username.startsWith("stg-outlet-a-uat-") ? "outlet-a" : "outlet-b";
const kept = new Set();
let deactivated = 0;
for (const user of candidates || []) {
  const key = category(user.username || "");
  if (!kept.has(key)) { kept.add(key); continue; }
  if (!user.is_active) continue;
  const outlets = (user.user_store_access || []).map(access => access.stores?.code).filter(Boolean);
  const response = await fetch(`${baseUrl}/functions/v1/claw-api/api/users/${user.id}`, { method: "PATCH", headers: { apikey: serviceKey, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ role: user.role, status: "inactive", outlets }) });
  assert.ok(response.ok, "Developer API could not deactivate a duplicate synthetic user.");
  deactivated += 1;
}
assert.deepEqual([...kept].sort(), ["admin", "outlet-a", "outlet-b"], "expected synthetic Admin, Outlet A, and Outlet B test identities");
console.log(JSON.stringify({ ok: true, active_synthetic_sets: 3, duplicate_synthetic_users_deactivated: deactivated }));

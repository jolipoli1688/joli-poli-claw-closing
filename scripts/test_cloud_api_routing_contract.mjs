"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(path.join(root, file), "utf8");
const [adapterSource, clawSource, launcher, profileSource, usersSource, edgeSource] = await Promise.all([
  read("web/cloud-api-adapter.js"),
  read("web/claw-api.js"),
  read("scripts/Start_Cloud_Staging.py"),
  read("web/cloud-profile.js"),
  read("web/cloud-user-management.js"),
  read("supabase/functions/claw-api/index.ts"),
]);

const ref = "fbvzqdqjqcbjopuinknw";
const edgeBase = `https://${ref}.supabase.co/functions/v1/claw-api`;
assert.match(launcher, /apiBaseUrl.*functions\/v1\/claw-api/, "cloud host must inject the Edge API base URL");
assert.match(launcher, /window\.__CLAW_RUNTIME_MODE__=\"local\"/, "cloud host must replace the base local runtime mode");
assert.match(profileSource, /claw-cloud-bootstrap/, "profile must consume the application bootstrap event instead of fetching a duplicate bootstrap");
assert.ok(!profileSource.includes("fetch(`${config.apiBaseUrl}/api/bootstrap`"), "profile must not fetch bootstrap directly");
assert.match(usersSource, /window\.clawApi\.request/, "user management must use the common cloud adapter");
assert.ok(!usersSource.includes("fetch(`${config.apiBaseUrl}${path}`"), "user management must not bypass the common cloud adapter");
assert.ok(!usersSource.includes('request("/api/bootstrap")'), "user management must reuse the authenticated startup context instead of issuing a duplicate bootstrap");
for (const route of ["/api/bootstrap", "/api/settings", "/api/machines", "/api/closings", "/api/history", "/api/refills", "/api/reports", "/api/users"]) {
  assert.ok(edgeSource.includes(route), `Edge API must implement ${route}`);
}

const calls = [];
const context = {
  window: {
    __CLAW_RUNTIME_MODE__: "cloud-staging",
    __CLAW_CLOUD_CONFIG__: {
      mode: "cloud-staging",
      projectRef: ref,
      publishableKey: "synthetic-publishable-key",
      apiBaseUrl: edgeBase,
      getAccessToken: async () => "synthetic-session",
    },
  },
  fetch: async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  },
  console,
  URL,
};
vm.createContext(context);
vm.runInContext(adapterSource, context);
vm.runInContext(clawSource, context);
for (const route of ["/api/bootstrap", "/api/settings", "/api/machines", "/api/closings?limit=1", "/api/history", "/api/refills", "/api/reports/summary", "/api/users"]) {
  await context.window.clawApi.request(route);
}
assert.equal(context.window.clawApi.mode, "cloud", "cloud staging must bind the cloud adapter");
for (const call of calls) {
  assert.ok(call.url.startsWith(edgeBase), `cloud request must use the Edge API base: ${call.url}`);
  assert.ok(!call.url.startsWith("http://localhost:3001/api/"), `cloud request must not reach the static host: ${call.url}`);
  assert.equal(call.options.headers.Authorization, "Bearer synthetic-session", "cloud request must use the authenticated session");
  assert.equal(call.options.headers.apikey, "synthetic-publishable-key", "cloud request must use only the browser-safe publishable key");
}
for (const unsafePath of ["/api", "http://localhost:3001/api/bootstrap", "http://127.0.0.1:3001/api/bootstrap", "//localhost:3001/api/bootstrap"]) {
  await assert.rejects(() => context.window.clawApi.request(unsafePath), /Cloud API routing is unavailable/);
}

const localCalls = [];
const localContext = { window: { __CLAW_RUNTIME_MODE__: "local" }, fetch: async (url) => { localCalls.push(url); return { ok: true, status: 200, json: async () => ({ ok: true }) }; }, console, URL };
vm.createContext(localContext);
vm.runInContext(clawSource, localContext);
await localContext.window.clawApi.request("/api/bootstrap");
assert.deepEqual(localCalls, ["/api/bootstrap"], "LOCAL must retain same-origin FastAPI routing");

console.log("PASS - cloud API routing contract; all representative cloud routes use the approved Edge endpoint.");

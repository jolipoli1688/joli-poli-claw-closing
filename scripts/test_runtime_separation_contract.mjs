"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [index, launcher, localConfig, edge, cloudAdapter, clawAdapter] = await Promise.all([
  read("../web/index.html"),
  read("./Start_Cloud_Staging.py"),
  read("../local_backend/config.py"),
  read("../supabase/functions/claw-api/index.ts"),
  read("../web/cloud-api-adapter.js"),
  read("../web/claw-api.js"),
]);

assert.ok(!index.includes("cloud-runtime.js"), "LOCAL HTML must not load the cloud Auth runtime");
assert.ok(!index.includes("cloud-api-adapter.js"), "LOCAL HTML must not load the cloud adapter");
assert.ok(!index.includes("__CLAW_CLOUD_CONFIG__"), "LOCAL HTML must not inject cloud configuration");
assert.match(index, /Loading your workspace/, "LOCAL loading copy must be implementation-neutral");
assert.ok(!index.includes("Loading the Excel database"), "LOCAL loading copy must not expose database details");

assert.match(localConfig, /CLAW_RUNTIME_MODE/, "local backend must require an explicit runtime mode");
assert.match(localConfig, /RUNTIME_MODE != "local"/, "local backend must reject a non-local mode");
assert.match(localConfig, /refuses cloud configuration/, "local backend must reject cloud configuration");

assert.match(launcher, /RUNTIME_MODE = "cloud-staging"/, "cloud host must have one canonical cloud mode");
assert.match(launcher, /Cloud configuration is unavailable/, "missing cloud configuration must show a cloud-specific error");
assert.match(launcher, /Loading your workspace/, "cloud loading copy must be implementation-neutral");
assert.match(launcher, /cloud-api-adapter\.js/, "only the cloud host may inject the cloud adapter");
for (const forbidden of ["local_data", "claw_machine_database", "machine_images", "Claw_Closing_App", "openpyxl", ".xlsx"]) {
  assert.ok(!launcher.includes(forbidden), `cloud host must not reference ${forbidden}`);
  assert.ok(!edge.includes(forbidden), `cloud Edge API must not reference ${forbidden}`);
}
assert.match(edge, /const IMAGE_BUCKET = "machine-style-images"/, "cloud images must use the private staging bucket");
assert.match(edge, /createSignedUrl/, "cloud image reads must remain signed/private");

const response = (body, ok = true, status = ok ? 200 : 503) => ({ ok, status, json: async () => body });
const cloudConfig = {
  mode: "cloud-staging",
  projectRef: "fbvzqdqjqcbjopuinknw",
  apiBaseUrl: "https://fbvzqdqjqcbjopuinknw.supabase.co/functions/v1/claw-api",
  getAccessToken: async () => "synthetic-session",
};
const cloudContext = { window: { __CLAW_CLOUD_CONFIG__: cloudConfig }, fetch: async () => response({ detail: "Cloud API unavailable." }, false), console, URL };
vm.createContext(cloudContext);
vm.runInContext(cloudAdapter, cloudContext);
vm.runInContext(clawAdapter, cloudContext);
await assert.rejects(() => cloudContext.window.clawApi.request("/api/bootstrap"), /Cloud API unavailable/);
assert.equal(cloudContext.window.clawApi.mode, "cloud", "cloud staging must bind the cloud adapter only");

const missingCloudAdapter = { window: { __CLAW_CLOUD_CONFIG__: cloudConfig }, fetch: async () => response({}), console, URL };
vm.createContext(missingCloudAdapter);
assert.throws(() => vm.runInContext(clawAdapter, missingCloudAdapter), /cloud adapter was not loaded/, "cloud configuration must never fall back to local");

const duplicateAdapter = { window: { clawApi: { mode: "local-backend" } }, fetch: async () => response({}), console, URL };
vm.createContext(duplicateAdapter);
assert.throws(() => vm.runInContext(clawAdapter, duplicateAdapter), /already active/, "two adapters must fail fast");

console.log("PASS - strict local/cloud runtime separation contract; no network access attempted.");

"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cloudSource = await readFile(path.join(projectRoot, "web", "cloud-api-adapter.js"), "utf8");
const clawSource = await readFile(path.join(projectRoot, "web", "claw-api.js"), "utf8");

const response = (body, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => body });
const runAdapter = ({ cloudConfig, fetch }) => {
  const context = { window: { __CLAW_CLOUD_CONFIG__: cloudConfig }, fetch, console };
  vm.createContext(context);
  if (cloudConfig?.mode === "cloud") vm.runInContext(cloudSource, context);
  vm.runInContext(clawSource, context);
  return context.window.clawApi;
};

let localRequest;
const local = runAdapter({
  fetch: async (pathValue, options) => {
    localRequest = { pathValue, options };
    return response({ ok: true });
  },
});
assert.equal(local.mode, "local-backend");
await local.request("/api/runtime", { headers: { "X-Regression": "yes" } });
assert.equal(localRequest.pathValue, "/api/runtime");
assert.equal(localRequest.options.headers["Content-Type"], "application/json");
assert.equal(localRequest.options.headers["X-Regression"], "yes");

let cloudRequest;
const cloud = runAdapter({
  cloudConfig: { mode: "cloud", apiBaseUrl: "https://staging.example.invalid/api/", getAccessToken: async () => "session-token" },
  fetch: async (pathValue, options) => {
    cloudRequest = { pathValue, options };
    return response({ ok: true });
  },
});
assert.equal(cloud.mode, "cloud");
await cloud.request("/api/bootstrap", { headers: { "X-Regression": "yes" } });
assert.equal(cloudRequest.pathValue, "https://staging.example.invalid/api/api/bootstrap");
assert.equal(cloudRequest.options.headers.Authorization, "Bearer session-token");
assert.equal(cloudRequest.options.headers["Content-Type"], "application/json");
assert.equal(cloudRequest.options.headers["X-Regression"], "yes");

const noToken = runAdapter({
  cloudConfig: { mode: "cloud", apiBaseUrl: "https://staging.example.invalid", getAccessToken: async () => "" },
  fetch: async () => response({ ok: true }),
});
await assert.rejects(() => noToken.request("/api/bootstrap"), /Sign in is required/);

console.log("PASS - local/cloud adapter contract; no network access attempted.");

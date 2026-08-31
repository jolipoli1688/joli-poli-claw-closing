"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const [app, cloudAdapter, facade] = await Promise.all([
  readFile(new URL("../web/assets/app.js", import.meta.url), "utf8"),
  readFile(new URL("../web/cloud-api-adapter.js", import.meta.url), "utf8"),
  readFile(new URL("../web/claw-api.js", import.meta.url), "utf8"),
]);

assert.match(app, /function desktopUpdaterSupported\(\) \{ return !isCloudStaging\(\); \}/, "the shared UI must make desktop updater support mode-explicit");
assert.match(app, /if \(!desktopUpdaterSupported\(\)\) \{\s*button\.hidden = true;/, "Cloud must hide the desktop update control");
assert.match(app, /if \(!desktopUpdaterSupported\(\)\) \{\s*state\.updateStatus = \{ enabled: false, supported: false, available: false, configured: false, downloaded: false \};/, "Cloud update checks must resolve locally without fetch");
assert.match(app, /if \(desktopUpdaterSupported\(\)\) \{\s*await restoreAfterUpdate\(\);\s*checkForUpdates\(false\);/, "only LOCAL startup may poll the desktop updater");

const calls = [];
const context = {
  window: {
    __CLAW_RUNTIME_MODE__: "cloud-staging",
    __CLAW_CLOUD_CONFIG__: {
      mode: "cloud-staging",
      projectRef: "fbvzqdqjqcbjopuinknw",
      publishableKey: "synthetic-publishable-key",
      apiBaseUrl: "https://fbvzqdqjqcbjopuinknw.supabase.co/functions/v1/claw-api",
      getAccessToken: async () => "synthetic-session",
    },
  },
  fetch: async url => { calls.push(String(url)); return { ok: true, status: 200, json: async () => ({}) }; },
  console,
  URL,
};
vm.createContext(context);
vm.runInContext(cloudAdapter, context);
vm.runInContext(facade, context);
for (const route of ["/api/update/status", "/api/update/check", "/api/update/download", "/api/update/install", "/api/update/apply"]) {
  await assert.rejects(() => context.window.clawApi.request(route), /Desktop software updates are unavailable in Cloud Staging/);
}
assert.deepEqual(calls, [], "Cloud updater routes must be rejected before any fetch call");

console.log("PASS - Cloud excludes desktop updater routes before fetch; Local updater startup remains enabled.");

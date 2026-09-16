"use strict";

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const deploy = path.join(root, "vercel-deploy");
const builder = readFileSync(path.join(root, "scripts", "build_vercel_production_bundle.mjs"), "utf8");
const gitignore = readFileSync(path.join(root, ".gitignore"), "utf8");
for (const file of ["index.html", "assets/styles.css", "assets/app.js", "assets/brand-logo.png", "assets/zxing-browser.min.js", "cloud-runtime.js", "cloud-api-adapter.js", "cloud-profile.js", "cloud-user-management.js", "claw-api.js", "vercel.json"]) {
  assert.ok(existsSync(path.join(deploy, file)), `production bundle must contain ${file}`);
}

const html = readFileSync(path.join(deploy, "index.html"), "utf8");
assert.match(html, /window\.__CLAW_RUNTIME_MODE__="cloud-staging"/, "bundle must select Cloud staging mode");
assert.doesNotMatch(html, /window\.__CLAW_RUNTIME_MODE__="local"|local-uat-1/, "bundle must not contain the LOCAL runtime");
assert.match(html, /window\.__CLAW_CLOUD_CONFIG__=\{"mode":"cloud-staging","projectRef":"fbvzqdqjqcbjopuinknw","supabaseUrl":"https:\/\/fbvzqdqjqcbjopuinknw\.supabase\.co","publishableKey":"[^"]+","apiBaseUrl":"https:\/\/fbvzqdqjqcbjopuinknw\.supabase\.co\/functions\/v1\/claw-api"\}/, "bundle must contain only the approved browser Cloud configuration");
for (const resource of ["/assets/styles.css", "/assets/app.js", "/assets/brand-logo.png", "/assets/zxing-browser.min.js", "/cloud-runtime.js", "/cloud-api-adapter.js", "/claw-api.js", "/cloud-profile.js", "/cloud-user-management.js"]) assert.ok(html.includes(`src="${resource}`) || html.includes(`href="${resource}`), `bundle must root-load ${resource}`);
assert.match(readFileSync(path.join(deploy, "cloud-runtime.js"), "utf8"), /src="\/assets\/brand-logo\.png"/, "runtime logo must resolve from the deployment root");
assert.deepEqual(JSON.parse(readFileSync(path.join(deploy, "vercel.json"), "utf8")), { rewrites: [{ source: "/(.*)", destination: "/index.html" }] }, "bundle needs only an SPA fallback rewrite");
assert.match(builder, /const vercelLink = path\.join\(output, "\.vercel"\)[\s\S]*?mkdtempSync[\s\S]*?cpSync\(vercelLink[\s\S]*?finally[\s\S]*?cpSync\(path\.join\(vercelLinkBackup, "\.vercel"\), vercelLink/, "bundle rebuild must preserve and restore the existing local Vercel link without hardcoding it");
assert.match(gitignore, /(?:^|\r?\n)\.vercel\/(?:\r?\n|$)/, "Vercel project metadata must stay ignored by Git");

console.log("PASS - Vercel production bundle root paths, Cloud runtime, and static SPA routing contract.");

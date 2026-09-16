"use strict";

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = path.join(root, "web");
const output = path.join(root, "vercel-deploy");
const projectRef = "fbvzqdqjqcbjopuinknw";
const environment = path.join(root, ".env.cloud-staging.local");

function publishableKey() {
  if (!existsSync(environment)) throw new Error("Missing .env.cloud-staging.local; cannot create a Cloud bundle.");
  const values = {};
  for (const rawLine of readFileSync(environment, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    const key = (separator < 0 ? line : line.slice(0, separator)).trim();
    const value = separator < 0 ? "" : line.slice(separator + 1).trim();
    if (/SERVICE_ROLE|SECRET|PASSWORD|TOKEN/i.test(key)) throw new Error("Cloud bundle configuration may contain only the publishable key.");
    if (key !== "CLAW_SUPABASE_PUBLISHABLE_KEY") throw new Error(`Unsupported Cloud bundle configuration key: ${key}`);
    values[key] = value;
  }
  if (!values.CLAW_SUPABASE_PUBLISHABLE_KEY) throw new Error("Cloud bundle publishable key is blank.");
  return values.CLAW_SUPABASE_PUBLISHABLE_KEY;
}

const key = publishableKey();
const config = JSON.stringify({
  mode: "cloud-staging",
  projectRef,
  supabaseUrl: `https://${projectRef}.supabase.co`,
  publishableKey: key,
  apiBaseUrl: `https://${projectRef}.supabase.co/functions/v1/claw-api`,
});

let html = readFileSync(path.join(web, "index.html"), "utf8");
html = html.replaceAll('href="./assets/', 'href="/assets/').replaceAll('src="./assets/', 'src="/assets/');
const localRuntime = '<script>window.__CLAW_RUNTIME_MODE__="local";</script>\n  <script src="./claw-api.js?v=2.1.78-local-uat-1"></script>';
const cloudRuntime = `<script>window.__CLAW_RUNTIME_MODE__="cloud-staging";window.__CLAW_CLOUD_CONFIG__=${config};</script>\n  <script src="/cloud-runtime.js?v=2.1.78-cloud-runtime-2"></script>\n  <script src="/cloud-api-adapter.js?v=2.1.78-cloud-routing-3"></script>\n  <script src="/claw-api.js?v=2.1.78-cloud-runtime-2"></script>\n  <script src="/cloud-profile.js?v=2.1.78-cloud-runtime-2"></script>\n  <script src="/cloud-user-management.js?v=2.1.78-cloud-runtime-2"></script>`;
if (!html.includes(localRuntime)) throw new Error("The accepted local runtime marker was not found in web/index.html.");
html = html.replace(localRuntime, cloudRuntime).replaceAll('src="./assets/', 'src="/assets/');
if (html.includes('window.__CLAW_RUNTIME_MODE__="local"') || html.includes('./claw-api.js?v=2.1.78-local-uat-1')) throw new Error("Local runtime leaked into the production bundle.");

rmSync(output, { recursive: true, force: true });
mkdirSync(path.join(output, "assets"), { recursive: true });
for (const file of ["app.js", "styles.css", "brand-logo.png", "zxing-browser.min.js"]) cpSync(path.join(web, "assets", file), path.join(output, "assets", file));
for (const file of ["claw-api.js", "cloud-api-adapter.js", "cloud-profile.js", "cloud-user-management.js"]) cpSync(path.join(web, file), path.join(output, file));
const cloudRuntimeSource = readFileSync(path.join(web, "cloud-runtime.js"), "utf8").replaceAll('src="./assets/', 'src="/assets/');
writeFileSync(path.join(output, "cloud-runtime.js"), cloudRuntimeSource, "utf8");
writeFileSync(path.join(output, "index.html"), html, "utf8");
writeFileSync(path.join(output, "vercel.json"), `${JSON.stringify({ rewrites: [{ source: "/(.*)", destination: "/index.html" }] }, null, 2)}\n`, "utf8");

console.log("PASS - Vercel Cloud production bundle generated without local runtime or server credentials.");

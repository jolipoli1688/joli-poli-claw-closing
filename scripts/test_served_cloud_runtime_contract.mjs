"use strict";

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ref = "fbvzqdqjqcbjopuinknw";
const edgeBase = `https://${ref}.supabase.co/functions/v1/claw-api`;

const hostProgram = String.raw`
import importlib.util, os
from http.server import ThreadingHTTPServer
from pathlib import Path
root = Path.cwd()
spec = importlib.util.spec_from_file_location("cloud_host", root / "scripts" / "Start_Cloud_Staging.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
os.environ["CLAW_RUNTIME_MODE"] = "cloud-staging"
os.environ["CLAW_SUPABASE_URL"] = "https://fbvzqdqjqcbjopuinknw.supabase.co"
os.environ["CLAW_SUPABASE_PUBLISHABLE_KEY"] = "synthetic-browser-safe-key"
server = ThreadingHTTPServer(("127.0.0.1", 0), module.Handler)
print(server.server_address[1], flush=True)
server.serve_forever()
`;

const child = spawn("python", ["-c", hostProgram], { cwd: root, stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
let buffer = "";
const port = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("Timed out starting the Cloud host generator.")), 5000);
  child.once("error", reject);
  child.stdout.on("data", chunk => {
    buffer += chunk;
    const match = buffer.match(/^(\d+)\r?\n/);
    if (match) { clearTimeout(timeout); resolve(Number(match[1])); }
  });
});

try {
  const documentResponse = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(documentResponse.status, 200, "the actual Cloud host response must be successful");
  const html = await documentResponse.text();
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map(match => ({
    attributes: match[1],
    inline: match[2],
    src: /\bsrc\s*=\s*(["'])(.*?)\1/i.exec(match[1])?.[2] || "",
  }));

  assert.match(scripts[0]?.inline || "", /__CLAW_RUNTIME_MODE__="cloud-staging"/, "Cloud marker must be the first executable configuration");
  assert.match(scripts[1]?.inline || "", /__CLAW_CLOUD_CONFIG__/, "browser-safe Cloud config must follow the marker");
  assert.ok(!scripts.some(script => script.src.includes("local-uat")), "Cloud HTML must not carry a Local-UAT cache version");
  assert.deepEqual(scripts.slice(2).map(script => script.src), [
    "./cloud-runtime.js?v=2.1.78-cloud-runtime-2",
    "./cloud-api-adapter.js?v=2.1.78-cloud-routing-3",
    "./claw-api.js?v=2.1.78-cloud-runtime-2",
    "./cloud-profile.js?v=2.1.78-cloud-runtime-2",
    "./cloud-user-management.js?v=2.1.78-cloud-runtime-2",
    "./assets/app.js?v=2.1.78-profile-refill-fix-1",
  ], "the actual served Cloud response must load runtime, adapter, facade, helpers, then app");
  for (const script of scripts.slice(2)) assert.ok(!/\b(?:defer|async|type\s*=\s*["']module["'])\b/i.test(script.attributes), "Cloud execution order must not be relaxed by async, defer, or module attributes");

  const externalScripts = await Promise.all(scripts.filter(script => script.src).map(async script => ({
    ...script,
    source: await (await fetch(`http://127.0.0.1:${port}/${script.src.replace(/^\.\//, "")}`)).text(),
  })));

  const execute = async ({ authenticated }) => {
    const documentListeners = new Map();
    const windowListeners = new Map();
    class Element {
      constructor(withFormElements = true) {
        this.dataset = {};
        this.style = {};
        this.hidden = false;
        this.classList = { add() {}, remove() {}, toggle() {} };
        this.elements = withFormElements ? { password: new Element(false) } : {};
      }
      querySelector() { return new Element(false); }
      querySelectorAll() { return []; }
      addEventListener() {}
      appendChild() {}
      remove() {}
      setAttribute() {}
      removeAttribute() {}
      focus() {}
    }
    const fakeDocument = {
      body: new Element(false),
      head: new Element(false),
      addEventListener(type, listener) { (documentListeners.get(type) || documentListeners.set(type, []).get(type)).push(listener); },
      removeEventListener() {},
      getElementById() { return new Element(false); },
      querySelector() { return new Element(false); },
      querySelectorAll() { return []; },
      createElement() { return new Element(false); },
    };
    const calls = [];
    const storage = new Map();
    if (authenticated) storage.set(`joli-poli-claw:${ref}:session`, JSON.stringify({ access_token: "synthetic-session", expires_at: Math.floor(Date.now() / 1000) + 3600 }));
    const window = {
      addEventListener(type, listener) { (windowListeners.get(type) || windowListeners.set(type, []).get(type)).push(listener); },
      dispatchEvent(event) { for (const listener of windowListeners.get(event.type) || []) listener(event); },
    };
    const context = {
      window, document: fakeDocument, console, URL, Promise, setTimeout, clearTimeout,
      localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
      Event: class Event { constructor(type) { this.type = type; } },
      CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
      fetch: async (url, options = {}) => {
        calls.push({ url: String(url), options });
        throw new Error("stop after captured request");
      },
    };
    vm.createContext(context);
    for (const script of scripts.filter(script => !script.src)) vm.runInContext(script.inline, context);
    for (const script of externalScripts) vm.runInContext(script.source, context, { filename: script.src });
    for (const listener of documentListeners.get("DOMContentLoaded") || []) listener({ type: "DOMContentLoaded" });
    await new Promise(resolve => setTimeout(resolve, 20));
    return { calls, context };
  };

  const beforeLogin = await execute({ authenticated: false });
  assert.deepEqual(beforeLogin.calls, [], "before login, the served Cloud runtime must make no business or same-origin API request");
  const afterLogin = await execute({ authenticated: true });
  const bootstrapCalls = afterLogin.calls.filter(call => call.url.endsWith("/api/bootstrap"));
  assert.equal(bootstrapCalls.length, 1, "the served Cloud runtime must issue one intentional bootstrap after an authenticated session");
  assert.equal(bootstrapCalls[0].url, `${edgeBase}/api/bootstrap`, "Cloud bootstrap must target the approved Edge endpoint");
  await assert.rejects(() => afterLogin.context.window.clawApi.request("/api/update/status"), /Desktop software updates are unavailable in Cloud Staging/);
  assert.equal(afterLogin.calls.filter(call => call.url.includes("/api/update")).length, 0, "the served Cloud runtime must reject updater routes before fetch");
  assert.ok(!afterLogin.calls.some(call => /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/api\//.test(call.url) || call.url.startsWith("/api/")), "Cloud runtime must never fetch a same-origin application API");

  console.log("PASS - actual served Cloud HTML order and runtime fetch capture; zero pre-login bootstrap and one authenticated Edge bootstrap.");
} finally {
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), new Promise(resolve => setTimeout(resolve, 2000))]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

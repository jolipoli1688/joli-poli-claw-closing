"use strict";

import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stagingRef = "fbvzqdqjqcbjopuinknw";
const LOCAL_RUNTIME_MODE = "local";
const CLOUD_RUNTIME_MODE = "cloud-staging";
const mode = process.argv[2];

if (!new Set(["local", "cloud"]).has(mode)) {
  console.error("Usage: node scripts/dev.mjs <local|cloud>");
  process.exitCode = 2;
} else {
  start(mode);
}

function start(selectedMode) {
  const port = selectedMode === "local" ? 3000 : 3001;
  const label = selectedMode === "local" ? "LOCAL development" : "CLOUD STAGING";
  const conflict = listeningProcess(port);
  if (conflict) {
    console.error(`${label} was not started: port ${port} is already in use by ${conflict.name} (PID ${conflict.pid}).`);
    process.exitCode = 1;
    return;
  }

  const env = selectedMode === "local" ? localEnvironment() : cloudEnvironment();
  if (!env) return;

  const command = selectedMode === "local" ? "py" : "python";
  const args = selectedMode === "local"
    ? ["-3", "local_backend/app.py", "--server", "--port", String(port)]
    : ["scripts/Start_Cloud_Staging.py"];
  const child = spawn(command, args, { cwd: root, env, stdio: "inherit", windowsHide: false });
  child.on("error", (error) => {
    console.error(`${label} was not started: ${error.message}`);
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    if (signal) console.error(`${label} stopped by ${signal}.`);
    process.exitCode = code ?? 1;
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => child.kill(signal));
  }
  console.log(`${label} starting at http://localhost:${port}/`);
}

function localEnvironment() {
  const env = safeEnvironment();
  env.CLAW_RUNTIME_MODE = LOCAL_RUNTIME_MODE;
  env.CLAW_LOCAL_DATA_MODE = "uat";
  env.CLAW_LOCAL_DATA_DIR = path.join(root, "local_data", "uat");
  return env;
}

function cloudEnvironment() {
  const configPath = path.join(root, ".env.cloud-staging.local");
  if (!existsSync(configPath)) {
    console.error("CLOUD STAGING was not started: .env.cloud-staging.local is missing. Copy .env.cloud-staging.example and set the browser-safe publishable key.");
    process.exitCode = 1;
    return null;
  }
  const values = parseBrowserConfig(readFileSync(configPath, "utf8"));
  if (!values) return null;
  const env = safeEnvironment();
  env.CLAW_RUNTIME_MODE = CLOUD_RUNTIME_MODE;
  env.CLAW_SUPABASE_URL = `https://${stagingRef}.supabase.co`;
  env.CLAW_SUPABASE_PUBLISHABLE_KEY = values.CLAW_SUPABASE_PUBLISHABLE_KEY;
  return env;
}

function parseBrowserConfig(source) {
  const values = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    const key = (separator < 0 ? line : line.slice(0, separator)).trim();
    const value = separator < 0 ? "" : line.slice(separator + 1).trim();
    if (/SERVICE_ROLE|SECRET|PASSWORD|TOKEN/i.test(key)) {
      console.error("CLOUD STAGING was not started: .env.cloud-staging.local contains a server-only key name.");
      process.exitCode = 1;
      return null;
    }
    if (key !== "CLAW_SUPABASE_PUBLISHABLE_KEY") {
      console.error(`CLOUD STAGING was not started: unsupported browser configuration key ${key}.`);
      process.exitCode = 1;
      return null;
    }
    values[key] = value;
  }
  if (!values.CLAW_SUPABASE_PUBLISHABLE_KEY) {
    console.error("CLOUD STAGING was not started: CLAW_SUPABASE_PUBLISHABLE_KEY is blank.");
    process.exitCode = 1;
    return null;
  }
  return values;
}

function safeEnvironment() {
  const env = { ...process.env };
  for (const key of [
    "CLAW_RUNTIME_MODE",
    "CLAW_LOCAL_DATA_MODE",
    "CLAW_LOCAL_DATA_DIR",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
    "CLAW_SUPABASE_URL",
    "CLAW_SUPABASE_PUBLISHABLE_KEY",
  ]) delete env[key];
  return env;
}

function listeningProcess(port) {
  if (process.platform !== "win32") return null;
  let output;
  try {
    output = execFileSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8", windowsHide: true });
  } catch {
    console.error(`Unable to verify whether port ${port} is available; refusing to start.`);
    process.exitCode = 1;
    return { pid: "unknown", name: "unknown process" };
  }
  const match = output.match(new RegExp(`^\\s*TCP\\s+\\S*:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)\\s*$`, "mi"));
  if (!match) return null;
  const pid = match[1];
  let name = "unknown process";
  try {
    const task = execFileSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { encoding: "utf8", windowsHide: true });
    const taskMatch = task.match(/^"([^"]+)"/m);
    if (taskMatch) name = taskMatch[1];
  } catch {
    // The PID remains enough to identify the conflict safely.
  }
  return { pid, name };
}

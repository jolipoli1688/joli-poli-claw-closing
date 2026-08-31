"use strict";

import { randomUUID } from "node:crypto";
import { rm, mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runsRoot = path.resolve(projectRoot, "local_data", "regression-runs");
const runDirectory = path.resolve(runsRoot, randomUUID());
const backendPath = path.join(projectRoot, "local_backend", "app.py");
const regressionPath = path.join(projectRoot, "scripts", "Run_Local_Parity_Regression.mjs");
let server;
let port = 0;

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const assertSafeRunDirectory = () => {
  const relative = path.relative(runsRoot, runDirectory);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing unsafe regression cleanup target: ${runDirectory}`);
  }
};

const allocateLoopbackPort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const address = probe.address();
    probe.close((error) => error ? reject(error) : resolve(address.port));
  });
});

const waitForExit = (child, timeoutMs) => new Promise((resolve) => {
  if (!child || child.exitCode !== null) {
    resolve(true);
    return;
  }
  const timer = setTimeout(() => resolve(false), timeoutMs);
  child.once("exit", () => {
    clearTimeout(timer);
    resolve(true);
  });
});

const runCommand = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { ...options, windowsHide: true });
  child.once("error", reject);
  child.once("exit", (code) => resolve(code ?? 1));
});

const waitForReady = async (baseUrl, expectedDirectory) => {
  const deadline = Date.now() + 30_000;
  let lastError = "not started";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/runtime`);
      const runtime = await response.json();
      if (response.ok && runtime.mode === "test" && runtime.data_directory === expectedDirectory) {
        return;
      }
      lastError = `unexpected runtime ${JSON.stringify(runtime)}`;
    } catch (error) {
      lastError = error.message;
    }
    await delay(200);
  }
  throw new Error(`isolated regression backend did not become ready: ${lastError}`);
};

const stopServer = async (baseUrl) => {
  if (!server || server.exitCode !== null) return;
  await fetch(`${baseUrl}/api/shutdown`, { method: "POST" }).catch(() => {});
  if (await waitForExit(server, 8_000)) return;
  const exitCode = await runCommand("taskkill", ["/PID", String(server.pid), "/T", "/F"]);
  if (exitCode !== 0 && server.exitCode === null) {
    throw new Error(`Could not stop isolated regression backend PID ${server.pid}.`);
  }
  if (!await waitForExit(server, 8_000)) {
    throw new Error(`Isolated regression backend PID ${server.pid} survived cleanup.`);
  }
};

const verifyPortReleased = async () => {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(port, "127.0.0.1", resolve);
  });
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
};

try {
  assertSafeRunDirectory();
  await mkdir(runDirectory, { recursive: true });
  port = await allocateLoopbackPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const expectedDirectory = path.relative(projectRoot, runDirectory).split(path.sep).join("/");
  const runtimeEnvironment = {
    ...process.env,
    CLAW_RUNTIME_MODE: "local",
    CLAW_LOCAL_DATA_MODE: "test",
    CLAW_LOCAL_DATA_DIR: runDirectory,
  };
  for (const key of ["CLAW_SUPABASE_URL", "CLAW_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"]) delete runtimeEnvironment[key];

  console.log(`Starting fresh isolated regression fixture: ${expectedDirectory}`);
  console.log(`Regression backend: ${baseUrl}`);
  server = spawn("py", ["-3", backendPath, "--server", "--port", String(port)], {
    cwd: projectRoot,
    env: runtimeEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let startupOutput = "";
  server.stdout.on("data", (chunk) => { startupOutput += chunk; });
  server.stderr.on("data", (chunk) => { startupOutput += chunk; });
  server.once("error", (error) => { startupOutput += error.message; });

  await waitForReady(baseUrl, expectedDirectory).catch((error) => {
    throw new Error(`${error.message}${startupOutput ? `\\n${startupOutput.trim()}` : ""}`);
  });
  const regressionExitCode = await runCommand(process.execPath, [regressionPath], {
    cwd: projectRoot,
    env: {
      ...runtimeEnvironment,
      LOCAL_APP_URL: baseUrl,
      CLAW_EXPECTED_DATA_DIRECTORY: expectedDirectory,
    },
    stdio: "inherit",
  });
  if (regressionExitCode !== 0) {
    throw new Error(`local parity regression failed with exit code ${regressionExitCode}`);
  }
  console.log("Local parity regression passed.");
} finally {
  const baseUrl = port ? `http://127.0.0.1:${port}` : "";
  let cleanupError;
  try {
    await stopServer(baseUrl);
    if (port) await verifyPortReleased();
  } catch (error) {
    cleanupError = error;
  }
  try {
    assertSafeRunDirectory();
    await rm(runDirectory, { recursive: true, force: true });
  } catch (error) {
    cleanupError ||= error;
  }
  if (cleanupError) throw cleanupError;
}

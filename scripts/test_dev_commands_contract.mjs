"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const runner = await readFile(new URL("./dev.mjs", import.meta.url), "utf8");
const batch = await readFile(new URL("../Start_Cloud_Staging.bat", import.meta.url), "utf8");

assert.equal(packageJson.scripts.dev, "node scripts/dev.mjs local");
assert.equal(packageJson.scripts["dev:cloud"], "node scripts/dev.mjs cloud");
assert.match(runner, /CLAW_LOCAL_DATA_MODE = "uat"/);
assert.match(runner, /CLAW_LOCAL_DATA_DIR = path\.join\(root, "local_data", "uat"\)/);
assert.match(runner, /CLAW_RUNTIME_MODE = LOCAL_RUNTIME_MODE/);
assert.match(runner, /CLAW_RUNTIME_MODE = CLOUD_RUNTIME_MODE/);
assert.match(runner, /"CLAW_LOCAL_DATA_MODE"/);
assert.match(runner, /local_backend\/app\.py/);
assert.match(runner, /Start_Cloud_Staging\.py/);
assert.match(runner, /fbvzqdqjqcbjopuinknw/);
assert.match(runner, /\.env\.cloud-staging\.local/);
assert.match(runner, /SERVICE_ROLE\|SECRET\|PASSWORD\|TOKEN/);
assert.match(runner, /port \$\{port\} is already in use by/);
assert.match(runner, /3000/);
assert.match(runner, /3001/);
assert.match(batch, /call npm\.cmd run dev:cloud/);
assert.ok(!batch.includes("Start_Cloud_Staging.py"), "batch must not maintain an independent cloud host");
assert.ok(!batch.includes("SUPABASE_SERVICE_ROLE_KEY"), "batch must not handle server-only credentials");
console.log("PASS - local/cloud npm development command contract");

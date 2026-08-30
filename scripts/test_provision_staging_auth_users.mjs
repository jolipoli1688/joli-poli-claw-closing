"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./provision_staging_auth_users.mjs", import.meta.url), "utf8");
assert.match(source, /\/auth\/v1\/admin\/users/, "must use the server-side Auth Admin endpoint");
assert.match(source, /email_confirm: true/, "fixture accounts must be email-confirmed");
assert.match(source, /STG_STAFF_PASSWORD/, "passwords must come from environment variables");
assert.match(source, /PROJECT_REF = "fbvzqdqjqcbjopuinknw"/, "must pin the approved project");
assert.ok(!/StgClaw!|sb_secret_|service_role\s*=/.test(source), "must not hard-code credentials");
console.log("PASS - staging Auth provisioner is server-only and secret-free");

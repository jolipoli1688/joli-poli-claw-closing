"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./provision_staging_auth_users.mjs", import.meta.url), "utf8");
assert.match(source, /auth\.admin\.listUsers/, "must inspect identities through the server-side Auth Admin client");
assert.match(source, /auth\.admin\.createUser/, "must create identities through the server-side Auth Admin client");
assert.match(source, /email_confirm: true/, "fixture accounts must be email-confirmed");
assert.match(source, /STG_DEVELOPER_USERNAME/, "developer username must come from environment variables");
assert.match(source, /STG_DEVELOPER_PASSWORD/, "developer password must come from environment variables");
assert.match(source, /@claw\.internal/, "internal Auth email must be derived by the provisioner");
assert.match(source, /role: "developer"/, "bootstrap must create only a Developer");
assert.match(source, /PROJECT_REF = "fbvzqdqjqcbjopuinknw"/, "must pin the approved project");
assert.ok(!/STG_(?:STAFF|MANAGER|HO|ADMIN)_PASSWORD|StgClaw!|sb_secret_|service_role\s*=/.test(source), "must not hard-code old or secret credentials");
console.log("PASS - staging Auth provisioner is server-only and secret-free");

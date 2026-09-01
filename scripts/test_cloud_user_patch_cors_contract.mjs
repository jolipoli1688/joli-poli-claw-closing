"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const edge = await readFile(new URL("../supabase/functions/claw-api/index.ts", import.meta.url), "utf8");

const optionsResponse = edge.match(/if \(req\.method === "OPTIONS"\) return new Response\(null, \{ headers: \{ ([\s\S]*?) \} \}\);/)?.[1] || "";
assert.match(optionsResponse, /"Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS"/, "Cloud User Management PATCH preflight must permit PATCH");
assert.match(edge, /path\.startsWith\("\/api\/users\/"\) && req\.method === "PATCH"/, "Cloud User Management must retain its PATCH route");
assert.match(edge, /if \(!developer\(ctx\)\) return fail\("Developer role required\.", 403\);/, "PATCH authorization must remain Developer-only");

console.log("PASS - Cloud User Management PATCH preflight permits PATCH without changing Developer authorization.");

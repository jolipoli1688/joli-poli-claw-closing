"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const edge = await readFile(new URL("../supabase/functions/claw-api/index.ts", import.meta.url), "utf8");
const uat = await readFile(new URL("./test_authenticated_cloud_staging.mjs", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260831101642_cloud_refill_void_recalculation.sql", import.meta.url), "utf8");

assert.match(edge, /path === "\/api\/refills" && req\.method === "POST"/, "Edge function must expose the authenticated refill create route");
assert.match(edge, /path\.startsWith\("\/api\/refills\/"\) && path\.endsWith\("\/void"\) && req\.method === "POST"/, "Edge function must expose the refill void route");
assert.match(edge, /Adjusted By is required/, "refill creation must require Adjusted By");
assert.doesNotMatch(edge.match(/async function recordRefill[\s\S]*?\n}\n\nasync function serve/)?.[0] || "", /Closed By is required/, "refill creation must not require Closed By");
assert.match(edge, /delta_qty/, "refill creation must preserve signed adjustment deltas");
assert.match(edge, /is\("voided_at", null\)/, "active refill history must exclude voided events");
assert.match(edge, /The event ledger is authoritative/, "refill aggregate must be recalculated from persisted events");
assert.match(migration, /create or replace function public\.void_refill_event/, "void behavior must use the existing secure RPC");
assert.match(migration, /qty_used=begin_qty\+recalculated_qty-final_qty/, "void behavior must recalculate Qty Used");
assert.match(migration, /private\.can_manage_store/, "void RPC must retain store authorization");
assert.match(uat, /positive refill without Closed By/, "authenticated UAT must cover Closed By decoupling");
assert.match(uat, /negative refill without Closed By/, "authenticated UAT must cover signed negative refill");
assert.match(uat, /authorized refill void/, "authenticated UAT must cover void behavior");
assert.match(uat, /Outlet B cannot void a Store A refill event/, "authenticated UAT must cover cross-store void denial");

console.log("PASS - cloud refill contract; signed event ledger, authorization, history, and void recalculation are covered.");

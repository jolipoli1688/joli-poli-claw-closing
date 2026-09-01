"use strict";

import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const current = new URL("../supabase/migrations/20260901050154_allow_same_date_replacement_after_void.sql", import.meta.url);
const previous = new URL("../supabase/migrations/20260831130023_allow_same_date_replacement_after_void.sql", import.meta.url);

await access(current);
await assert.rejects(access(previous), /ENOENT/, "the superseded local migration filename must not remain");
const migration = await readFile(current, "utf8");
assert.match(migration, /drop constraint if exists daily_closings_store_id_report_date_key/, "reconciled migration must preserve the deployed SQL");
assert.match(migration, /create unique index if not exists uq_daily_closings_store_report_date_active/, "reconciled migration must preserve the active-closing index");

console.log("PASS - local migration path matches deployed version 20260901050154 without changing SQL.");

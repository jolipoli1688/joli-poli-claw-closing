"use strict";

import { createClient } from "@supabase/supabase-js";

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = required.filter(name => !process.env[name]);
if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);

const baseUrl = process.env.SUPABASE_URL.replace(/\/$/, "");
if (baseUrl !== "https://fbvzqdqjqcbjopuinknw.supabase.co") throw new Error("Duplicate-draft diagnostics are restricted to the approved staging project.");

const service = createClient(baseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const { data, error } = await service
  .from("daily_closings")
  .select("id,store_id,report_date,closing_code,updated_at,stores!inner(code,name),closing_machine_entries(id,closing_product_entries(id))")
  .eq("status", "draft")
  .order("store_id")
  .order("report_date")
  .order("updated_at");
if (error) throw new Error(error.message);

const byStore = new Map();
for (const closing of data || []) {
  const rows = byStore.get(closing.store_id) || [];
  const machines = closing.closing_machine_entries || [];
  rows.push({
    draft_id: closing.id,
    report_date: closing.report_date,
    closing_code: closing.closing_code,
    machine_count: machines.length,
    product_count: machines.reduce((total, machine) => total + (machine.closing_product_entries || []).length, 0),
    updated_at: closing.updated_at,
  });
  byStore.set(closing.store_id, rows);
}

const duplicates = [...byStore.entries()]
  .filter(([, drafts]) => drafts.length > 1)
  .map(([storeId, drafts]) => ({ store_id: storeId, drafts }));
console.log(JSON.stringify({ duplicate_store_count: duplicates.length, duplicates }, null, 2));

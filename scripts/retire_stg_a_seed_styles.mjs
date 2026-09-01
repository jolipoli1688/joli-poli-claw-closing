// Controlled, one-purpose staging cleanup.  This file does nothing unless both
// an explicit command argument and the confirmation environment variable are set.
import { createClient } from "@supabase/supabase-js";

const projectRef = "fbvzqdqjqcbjopuinknw";
const expectedUrl = `https://${projectRef}.supabase.co`;
const expectedBarcodes = ["STG-A-RED", "STG-A-BLUE"];
const execute = process.argv.includes("--execute");

if (!execute) {
  console.log("Dry guard: no changes made. Re-run with --execute and CLAW_RETIRE_STG_A_SEED_STYLES=confirm.");
  process.exit(0);
}
if (process.env.CLAW_RETIRE_STG_A_SEED_STYLES !== "confirm") throw new Error("Set CLAW_RETIRE_STG_A_SEED_STYLES=confirm to authorize this exact staging cleanup.");
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
if (process.env.SUPABASE_URL.replace(/\/$/, "") !== expectedUrl) throw new Error("This cleanup is locked to the approved staging project.");

const admin = createClient(expectedUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const styles = await admin.from("machine_styles").select("id,barcode,machines!inner(store_id,stores!inner(code))").in("barcode", expectedBarcodes);
if (styles.error) throw new Error(styles.error.message);
const targets = (styles.data || []).filter(style => style.machines?.stores?.code === "STG-A");
if (targets.length !== 2 || expectedBarcodes.some(code => !targets.some(style => style.barcode === code))) throw new Error("Expected exactly STG-A-RED and STG-A-BLUE on STG-A; no update was made.");

const retired = await admin.from("machine_styles").update({ is_active: false, updated_at: new Date().toISOString() }).in("id", targets.map(style => style.id)).select("id,barcode");
if (retired.error || retired.data?.length !== 2) throw new Error(retired.error?.message || "Expected exactly two master styles to retire.");
console.log(`Retired only ${retired.data.map(style => style.barcode).sort().join(", ")} on STG-A. Historical rows and active drafts were not changed.`);

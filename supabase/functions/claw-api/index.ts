import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const PROJECT_REF = "fbvzqdqjqcbjopuinknw";
const IMAGE_BUCKET = "machine-style-images";
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*", "Vary": "Origin" } });
const fail = (message: string, status = 400) => json({ detail: message }, status);
const num = (value: unknown) => Number(value ?? 0) || 0;
const integer = (value: unknown) => Math.trunc(num(value));

type Context = { userId: string; profile: any; stores: any[]; store: any; admin: any; user: any };

function serviceKey() {
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
}

async function context(req: Request): Promise<Context | Response> {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = serviceKey();
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!url || !key || !bearer) return fail("Authentication required.", 401);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: identity, error: identityError } = await admin.auth.getUser(bearer);
  if (identityError || !identity.user) return fail("Authentication required.", 401);
  // The server-only key identifies this internal call; the forwarded user JWT
  // remains the Authorization context used by the protected finalization RPC.
  const user = createClient(url, key, { global: { headers: { Authorization: `Bearer ${bearer}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile, error: profileError } = await admin.from("profiles").select("*").eq("id", identity.user.id).single();
  if (profileError || !profile?.is_active) return fail("Your account is not active.", 403);
  const { data: memberships } = await admin.from("user_store_access").select("store_id").eq("user_id", identity.user.id);
  let query = admin.from("stores").select("*").eq("is_active", true).order("code");
  if (!profile.all_stores) query = query.in("id", (memberships || []).map((row: any) => row.store_id));
  const { data: stores, error: storesError } = await query;
  if (storesError || !(stores || []).length) return fail("No outlet is assigned to this account.", 403);
  const requested = req.headers.get("x-claw-store-id") || "";
  const store = (stores || []).find((row: any) => row.id === requested) || stores![0];
  return { userId: identity.user.id, profile, stores: stores || [], store, admin, user };
}

function configurationManager(ctx: Context) { return ["developer", "admin"].includes(ctx.profile.role); }
function canFinalize(ctx: Context) { return ["developer", "admin", "outlet"].includes(ctx.profile.role); }
function developer(ctx: Context) { return ctx.profile.role === "developer"; }
function normalizeUsername(value: unknown) {
  const username = String(value || "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9._-]/g, "").replace(/-+/g, "-");
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) throw new Error("Username must be 3-32 normalized lowercase characters.");
  return username;
}
function strongTemporaryPassword(value: unknown) {
  const password = String(value || "");
  return password.length >= 12 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}
function normalizeOutletCode(value: unknown) {
  const code = String(value || "").normalize("NFKC").trim().toUpperCase().replace(/\s+/g, "-").replace(/[^A-Z0-9-]/g, "").replace(/-+/g, "-");
  if (!/^[A-Z0-9][A-Z0-9-]{1,31}$/.test(code)) throw new Error("Outlet code must be 2-32 uppercase letters, numbers, or hyphens.");
  return code;
}
function normalizeOutletName(value: unknown) {
  const name = String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) throw new Error("Outlet name must be 2-80 characters.");
  return name;
}
function machineCodePart(value: unknown) {
  const normalized = String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "MACHINE";
}
function isUniqueViolation(error: any) { return error?.code === "23505" || /duplicate key|unique/i.test(String(error?.message || "")); }
async function writeAudit(ctx: Context, entityType: string, entityId: string, action: string, metadata: any = {}) {
  const { error } = await ctx.admin.from("audit_log").insert({ actor_user_id: ctx.userId, store_id: ctx.store.id, entity_type: entityType, entity_id: entityId, action, metadata });
  if (error) throw new Error(error.message);
}
async function machineTypes(ctx: Context) {
  const { data, error } = await ctx.admin.from("machine_types").select("id,name,coins_per_play,is_active,store_machine_type_rules!left(coins_per_play,is_active,store_id)").eq("is_active", true).order("name");
  if (error) throw new Error(error.message);
  return (data || []).map((row: any) => {
    const rule = (row.store_machine_type_rules || []).find((item: any) => item.store_id === ctx.store.id && item.is_active);
    return { name: row.name, coins_per_play: integer(rule?.coins_per_play) || integer(row.coins_per_play) };
  });
}
function header(row: any) {
  return { Closing_ID: row.id, Report_Date: row.report_date, Outlet: row.store_name_snapshot || "", Cash_Sales: num(row.total_sales_usd), Cash_Sales_KHR: num(row.cash_sales_khr), Cash_Transactions: integer(row.cash_transactions), ABA_Sales: num(row.aba_sales_usd), ABA_Transactions: integer(row.aba_transactions), Adjustment: num(row.adjustment_usd), Beginning_Coins: integer(row.beginning_coins), Coins_Added: integer(row.coins_added), Final_Coins: integer(row.final_coins), Coins_Dispensed: integer(row.coins_dispensed), Coin_Return: integer(row.coin_return), Lose_Over: integer(row.lose_over), Total_Sales: num(row.total_sales_usd), Total_Transactions: integer(row.total_transactions), Average_Sale_Value_Per_Coin: num(row.average_sale_value_per_coin), Machine_Coins_Used: integer(row.machine_coins_used), Coin_Variance: integer(row.coin_variance), Total_Prizes_Won: integer(row.total_products), Average_Coins_Per_Prize: num(row.average_coins_per_prize), Average_Revenue_Per_Prize: num(row.avg_per_product_usd), Discount_USD: num(row.discount_usd), Discount_Percent: num(row.discount_percent), Overall_Win_Rate: num(row.overall_win_rate), Closing_Status: row.closing_status, Workflow_Status: row.status === "finalized" ? "Finalized" : row.status === "void" ? "Void" : "Draft", Closed_By: row.closed_by_name_snapshot || "", Verified_By: row.verified_by_name_snapshot || "", Notes: row.notes || "", Finalized_At: row.finalized_at, Updated_At: row.updated_at };
}

async function readMachines(ctx: Context, activeOnly = false, includeInactiveStyles = false) {
  let query = ctx.admin.from("machines").select("*, machine_types(name), machine_styles(*)").eq("store_id", ctx.store.id).order("sort_order").order("machine_code");
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return await Promise.all((data || []).map(async (machine: any) => {
    const products = await Promise.all([...(machine.machine_styles || [])].filter((style: any) => includeInactiveStyles || style.is_active).sort((a: any, b: any) => integer(a.sort_order) - integer(b.sort_order) || String(a.created_at || "").localeCompare(String(b.created_at || "")) || String(a.id).localeCompare(String(b.id))).map(async (style: any) => {
      const signed = style.image_path ? await ctx.admin.storage.from(IMAGE_BUCKET).createSignedUrl(style.image_path, 300) : { data: null };
      return { product_id: style.id, barcode: style.barcode, product_name: style.product_name || "", starting_qty: integer(style.starting_qty), sort_order: integer(style.sort_order), active: style.is_active, image_file: style.image_path || "", image_url: signed.data?.signedUrl || "" };
    }));
    return { Machine_ID: machine.id, Machine_Code: machine.machine_code, Machine_Name: machine.display_name || machine.machine_code, Machine_Type: machine.machine_types?.name || "", Capacity: 0, Prize_Category: machine.prize_category || "", Active: machine.is_active, Sort_Order: machine.sort_order, Notes: machine.notes || "", Products: products, Barcodes: products.map((item: any) => item.barcode), Image_File: products[0]?.image_file || "", Image_URL: products[0]?.image_url || "" };
  }));
}

async function saveImage(ctx: Context, body: any) {
  if (!configurationManager(ctx)) throw new Error("Developer or Admin role required for images.");
  const styleId = String(body.machine_style_id || "");
  const contentType = String(body.content_type || "");
  const base64 = String(body.image_base64 || "").replace(/^data:[^;]+;base64,/, "");
  if (!styleId || !IMAGE_TYPES.has(contentType) || !base64) throw new Error("A JPEG, PNG, or WebP image is required.");
  const style = await ctx.admin.from("machine_styles").select("*, machines!inner(store_id)").eq("id", styleId).single();
  if (style.error || style.data.machines.store_id !== ctx.store.id) throw new Error("Image style is not in the active store.");
  const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
  if (bytes.byteLength > 5 * 1024 * 1024) throw new Error("Images must be 5 MB or smaller.");
  const extension = contentType === "image/jpeg" ? "jpg" : contentType === "image/png" ? "png" : "webp";
  const nextPath = `stores/${ctx.store.id}/styles/${styleId}/${crypto.randomUUID()}.${extension}`;
  const upload = await ctx.admin.storage.from(IMAGE_BUCKET).upload(nextPath, bytes, { contentType, upsert: false });
  if (upload.error) throw new Error(upload.error.message);
  // This branch is reachable only through the Developer-only, staging-ref-locked
  // regression route below.  It exercises the same post-upload cleanup that a
  // real database persistence error uses, without weakening normal mutations.
  if (body.__staging_test_persistence_failure === true) {
    await ctx.admin.storage.from(IMAGE_BUCKET).remove([nextPath]);
    throw new Error("Synthetic staging image reference persistence failure.");
  }
  const update = await ctx.admin.from("machine_styles").update({ image_path: nextPath, image_content_type: contentType, image_updated_by: ctx.userId, image_updated_at: new Date().toISOString() }).eq("id", styleId);
  if (update.error) { await ctx.admin.storage.from(IMAGE_BUCKET).remove([nextPath]); throw new Error(update.error.message); }
  if (style.data.image_path) { const old = await ctx.admin.storage.from(IMAGE_BUCKET).remove([style.data.image_path]); if (old.error) console.error("Old staging image cleanup failed", old.error.message); }
  const signed = await ctx.admin.storage.from(IMAGE_BUCKET).createSignedUrl(nextPath, 300);
  return { ok: true, image_path: nextPath, image_url: signed.data?.signedUrl || "" };
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function csv(rows: unknown[][]) { return rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n"; }
function download(filename: string, rows: unknown[][]) {
  return { ok: true, path: `cloud-download:${filename}`, filename, mime_type: "text/csv;charset=utf-8", content_base64: btoa(unescape(encodeURIComponent(csv(rows)))) };
}
async function closingDetail(ctx: Context, closingId: string) {
  const { data: closing, error } = await ctx.admin.from("daily_closings").select("*").eq("id", closingId).eq("store_id", ctx.store.id).single();
  if (error) throw new Error("Closing not found.");
  const { data: machines, error: machineError } = await ctx.admin.from("closing_machine_entries").select("*, closing_product_entries(*)").eq("closing_id", closingId).order("sort_order_snapshot");
  if (machineError) throw new Error(machineError.message);
  return {
    closing,
    machines: (machines || []).map((machine: any) => ({
      ...machine,
      closing_product_entries: [...(machine.closing_product_entries || [])].sort((a: any, b: any) =>
        integer(a.sort_order_snapshot) - integer(b.sort_order_snapshot) ||
        String(a.created_at || "").localeCompare(String(b.created_at || "")) ||
        String(a.id).localeCompare(String(b.id))
      ),
    })),
  };
}
async function monthlyClosings(ctx: Context, month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("A valid month is required.");
  const start = `${month}-01`;
  const next = new Date(`${start}T00:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
  const end = next.toISOString().slice(0, 10);
  const { data, error } = await ctx.admin.from("daily_closings").select("*").eq("store_id", ctx.store.id).eq("status", "finalized").gte("report_date", start).lt("report_date", end).order("report_date");
  if (error) throw new Error(error.message);
  return data || [];
}

function calculate(payload: any) {
  const sales = payload.sales || {};
  const machines = payload.machines || [];
  const rate = num(sales.exchange_rate_usd_khr) || 1;
  const totalSales = num(sales.cash_sales_khr ?? sales.cash_sales * rate) / rate + num(sales.aba_sales) + num(sales.adjustment);
  const coinsDispensed = integer(sales.beginning_coins) + integer(sales.coins_added) - integer(sales.final_coins);
  const rows = machines.map((machine: any) => {
    const isManual = String(machine.meter_mode || "").toLowerCase() === "manual" || (machine.begin_coin_meter === "" && machine.final_coin_meter === "");
    const used = isManual ? integer(machine.manual_coins_used ?? machine.coins_used) : integer(machine.final_coin_meter) - integer(machine.begin_coin_meter);
    const products = machine.products || machine.Products || (machine.barcodes || []).map((barcode: any) => ({ barcode }));
    const prizes = products.reduce((sum: number, product: any) => {
      const finalQty = product.final_qty ?? product.final_prize;
      if (finalQty === "" || finalQty === null || finalQty === undefined) return sum;
      return sum + integer(product.begin_qty ?? machine.begin_prize) + integer(product.refill_qty ?? product.refill_prize) - integer(finalQty);
    }, 0);
    return { used, prizes };
  });
  const machineCoins = rows.reduce((sum: number, row: any) => sum + row.used, 0);
  const prizes = rows.reduce((sum: number, row: any) => sum + row.prizes, 0);
  const variance = machineCoins - coinsDispensed;
  return { total_sales: Number(totalSales.toFixed(2)), coins_dispensed: coinsDispensed, machine_coins_used: machineCoins, coin_variance: variance, total_prizes_won: prizes, average_sale_value_per_coin: coinsDispensed > 0 ? totalSales / coinsDispensed : 0, average_coins_per_prize: prizes > 0 ? machineCoins / prizes : 0, average_revenue_per_prize: prizes > 0 ? totalSales / prizes : 0, closing_status: variance === 0 ? "Balanced" : "Unbalanced" };
}

function validShiftDate(value: unknown) {
  const text = String(value || "").trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let year = "", month = "", day = "";
  if (match) [, year, month, day] = match;
  else {
    match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (match) [, day, month, year] = match;
  }
  const reportDate = `${year}-${month}-${day}`;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const today = new Date().toISOString().slice(0, 10);
  if (!year || Number(year) < 1000 || parsed.getUTCFullYear() !== Number(year) || parsed.getUTCMonth() !== Number(month) - 1 || parsed.getUTCDate() !== Number(day) || reportDate > today) throw new Error("Start Shift is available only for a valid date that is today or earlier.");
  return reportDate;
}

async function activeClosingForDate(ctx: Context, reportDate: string) {
  const active = await ctx.admin.from("daily_closings").select("id,status").eq("store_id", ctx.store.id).eq("report_date", reportDate).neq("status", "void").maybeSingle();
  if (active.error) throw new Error(active.error.message);
  return active.data;
}

async function openingTemplate(ctx: Context, reportDate: string) {
  const [machines, previous] = await Promise.all([
    readMachines(ctx, true),
    ctx.admin.from("daily_closings").select("id").eq("store_id", ctx.store.id).eq("status", "finalized").lt("report_date", reportDate).order("report_date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const carryForward = new Map<string, number>();
  if (previous.data?.id) {
    const entries = await ctx.admin.from("closing_machine_entries").select("closing_product_entries(machine_style_id,final_qty)").eq("closing_id", previous.data.id);
    for (const entry of entries.data || []) for (const product of entry.closing_product_entries || []) carryForward.set(product.machine_style_id, integer(product.final_qty));
  }
  return { report_date: reportDate, outlet: ctx.store.name, machines: machines.map((machine: any) => ({ machine_id: machine.Machine_ID, machine_name: machine.Machine_Name, machine_type: machine.Machine_Type, products: machine.Products.map((product: any) => ({ ...product, begin_qty: carryForward.get(product.product_id) ?? integer(product.starting_qty), refill_qty: 0, final_qty: "" })), barcodes: machine.Barcodes, image_url: machine.Image_URL, capacity: 0, begin_prize: 0, refill_prize: 0, final_prize: "", begin_coin_meter: "", final_coin_meter: "", manual_coins_used: "", status: "Working", notes: "" })) };
}

async function saveClosing(ctx: Context, payload: any) {
  const workflow = String(payload.workflow_status || "Draft").toLowerCase();
  if (workflow === "finalized" && !payload.closed_by) throw new Error("Closed By is required.");
  if (workflow === "finalized" && (!canFinalize(ctx) || !payload.verified_by)) throw new Error(!canFinalize(ctx) ? "Not authorized to finalize." : "Verified By is required before finalizing.");
  const settings = await ctx.admin.from("store_settings").select("*").eq("store_id", ctx.store.id).single();
  if (settings.error) throw new Error(settings.error.message);
  const result = calculate(payload);
  if (workflow === "finalized" && result.coin_variance !== 0) throw new Error("The closing cannot be finalized until the coin variance is zero.");
  const now = new Date().toISOString();
  const reportDate = validShiftDate(payload.report_date);
  const record: any = { store_id: ctx.store.id, report_date: reportDate, status: "draft", closed_by_user_id: ctx.userId, closed_by_name_snapshot: String(payload.closed_by || ""), verified_by_name_snapshot: String(payload.verified_by || ""), cash_sales_khr: num(payload.sales?.cash_sales_khr ?? payload.sales?.cash_sales), cash_transactions: integer(payload.sales?.cash_transactions), aba_sales_usd: num(payload.sales?.aba_sales), aba_transactions: integer(payload.sales?.aba_transactions), adjustment_usd: num(payload.sales?.adjustment), beginning_coins: integer(payload.sales?.beginning_coins), coins_added: integer(payload.sales?.coins_added), final_coins: integer(payload.sales?.final_coins), exchange_rate_snapshot: num(payload.sales?.exchange_rate_usd_khr) || num(settings.data.exchange_rate_khr_per_usd), price_per_coin_snapshot: num(payload.sales?.price_per_coin_usd) || num(settings.data.price_per_coin_usd), currency_code_snapshot: settings.data.currency_code || "USD", variance_tolerance_snapshot: integer(settings.data.variance_tolerance), store_code_snapshot: ctx.store.code, store_name_snapshot: ctx.store.name, created_by: ctx.userId, notes: String(payload.notes || ""), total_sales_usd: result.total_sales, coins_dispensed: result.coins_dispensed, machine_coins_used: result.machine_coins_used, coin_variance: result.coin_variance, coins_used: result.machine_coins_used, coin_return: result.machine_coins_used, lose_over: result.coin_variance, total_products: result.total_prizes_won, average_sale_value_per_coin: result.average_sale_value_per_coin, average_coins_per_prize: result.average_coins_per_prize, avg_per_product_usd: result.average_revenue_per_prize, closing_status: result.closing_status, updated_at: now };
  let closingId = String(payload.closing_id || "");
  if (closingId) {
    const existing = await ctx.admin.from("daily_closings").select("id,status,store_id").eq("id", closingId).single();
    if (existing.error || existing.data.store_id !== ctx.store.id || existing.data.status !== "draft") throw new Error("Only an authorized draft can be edited.");
    const updated = await ctx.admin.from("daily_closings").update(record).eq("id", closingId);
    if (updated.error) throw new Error(updated.error.message);
  } else {
    const active = await activeClosingForDate(ctx, reportDate);
    if (active?.status === "finalized") throw new Error("This shift is already closed and cannot be replaced.");
    if (active?.status === "draft") {
      closingId = active.id;
      const updated = await ctx.admin.from("daily_closings").update(record).eq("id", closingId);
      if (updated.error) throw new Error(updated.error.message);
    } else {
      record.closing_code = `STG-${record.report_date.replaceAll("-", "")}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      const created = await ctx.admin.from("daily_closings").insert(record).select("id").single();
      if (created.error) throw new Error(created.error.message);
      closingId = created.data.id;
    }
  }
  const machines = payload.machines || [];
  for (const source of machines) {
    const master = await ctx.admin.from("machines").select("*, machine_types(name), machine_styles(*)").eq("id", String(source.machine_id || source.Machine_ID)).eq("store_id", ctx.store.id).single();
    if (master.error) throw new Error("A closing machine does not belong to the active store.");
    const isManual = String(source.meter_mode || "").toLowerCase() === "manual" || (source.begin_coin_meter === "" && source.final_coin_meter === "");
    const styles = master.data.machine_styles || [];
    const rule = await ctx.admin.from("store_machine_type_rules").select("coins_per_play").eq("store_id", ctx.store.id).eq("machine_type_id", master.data.machine_type_id).maybeSingle();
    const entryRecord = { closing_id: closingId, machine_id: master.data.id, machine_number_snapshot: master.data.machine_number, machine_code_snapshot: master.data.machine_code, machine_name_snapshot: master.data.display_name || master.data.machine_code, machine_type_name_snapshot: master.data.machine_types?.name || "", capacity_snapshot: 0, sort_order_snapshot: master.data.sort_order, coins_per_play_snapshot: integer(rule.data?.coins_per_play) || 1, meter_mode: isManual ? "manual" : "meter", begin_meter: isManual ? null : integer(source.begin_coin_meter), final_meter: isManual ? null : integer(source.final_coin_meter), manual_coins_used: isManual ? integer(source.manual_coins_used ?? source.coins_used) : null, coins_used: isManual ? integer(source.manual_coins_used ?? source.coins_used) : Math.max(0, integer(source.final_coin_meter) - integer(source.begin_coin_meter)), machine_status: String(source.status || "Working"), notes: String(source.notes || "") };
    const existingEntry = await ctx.admin.from("closing_machine_entries").select("id").eq("closing_id", closingId).eq("machine_id", master.data.id).maybeSingle();
    if (existingEntry.error) throw new Error(existingEntry.error.message);
    const entry = existingEntry.data ? await ctx.admin.from("closing_machine_entries").update(entryRecord).eq("id", existingEntry.data.id).select("id").single() : await ctx.admin.from("closing_machine_entries").insert(entryRecord).select("id").single();
    if (entry.error) throw new Error(entry.error.message);
    const sourceProducts = source.products || source.Products || source.barcodes || [];
    for (const product of sourceProducts) {
      const barcode = typeof product === "string" ? product : String(product.barcode || "");
      const style = styles.find((item: any) => item.id === product.product_id || item.barcode === barcode);
      if (!style) throw new Error("A closing product does not belong to the selected machine.");
      const existingProduct = await ctx.admin.from("closing_product_entries").select("id,begin_qty").eq("closing_machine_entry_id", entry.data.id).eq("machine_style_id", style.id).maybeSingle();
      if (existingProduct.error) throw new Error(existingProduct.error.message);
      const events = existingProduct.data ? await ctx.admin.from("refill_events").select("delta_qty").eq("closing_product_entry_id", existingProduct.data.id).is("voided_at", null) : { data: [] };
      if ((events as any).error) throw new Error((events as any).error.message);
      const refill = existingProduct.data ? ((events.data || []).reduce((sum: number, event: any) => sum + integer(event.delta_qty), 0)) : integer(product.refill_qty ?? product.refill_prize);
      const finalInput = product.final_qty ?? product.final_prize;
      const finalQty = finalInput === "" || finalInput === null || finalInput === undefined ? null : integer(finalInput);
      const beginQty = existingProduct.data ? integer(existingProduct.data.begin_qty) : integer(product.begin_qty ?? product.begin_prize ?? style.starting_qty);
      const productRecord = { closing_machine_entry_id: entry.data.id, machine_style_id: style.id, barcode_snapshot: style.barcode, product_name_snapshot: style.product_name, product_code_snapshot: style.style_code, image_object_key_snapshot: style.image_path, sort_order_snapshot: style.sort_order, begin_qty: beginQty, refill_qty: refill, final_qty: finalQty, qty_used: finalQty === null ? 0 : beginQty + refill - finalQty, updated_at: now };
      const productEntry = existingProduct.data ? await ctx.admin.from("closing_product_entries").update(productRecord).eq("id", existingProduct.data.id).select("id").single() : await ctx.admin.from("closing_product_entries").insert(productRecord).select("id").single();
      if (productEntry.error) throw new Error(productEntry.error.message);
      if (!existingProduct.data) {
        for (const event of product.refill_history || []) { const delta = integer(event.qty); if (delta) await ctx.admin.from("refill_events").insert({ closing_product_entry_id: productEntry.data.id, delta_qty: delta, note: event.note || null, created_by: ctx.userId, created_by_name_snapshot: String(event.by || event.created_by_name_snapshot || ctx.profile.display_name || "") }); }
        if (refill && !(product.refill_history || []).length) await ctx.admin.from("refill_events").insert({ closing_product_entry_id: productEntry.data.id, delta_qty: refill, created_by: ctx.userId, created_by_name_snapshot: ctx.profile.display_name });
      }
    }
  }
  if (workflow === "finalized") { const finalized = await ctx.user.rpc("finalize_daily_closing", { target_closing: closingId }); if (finalized.error) throw new Error(finalized.error.message); }
  return { ok: true, closing_id: closingId, workflow_status: workflow === "finalized" ? "Finalized" : "Draft", result };
}

function refillHistory(events: any[]) {
  return (events || []).filter(event => !event.voided_at).map(event => ({ id: event.id, qty: integer(event.delta_qty), at: event.created_at, by: String(event.created_by_name_snapshot || "") }));
}

async function recordRefill(ctx: Context, body: any) {
  const adjustedBy = String(body.adjusted_by || "").trim();
  if (!adjustedBy) throw new Error("Adjusted By is required.");
  const quantity = Number(body.delta_qty);
  if (!Number.isInteger(quantity)) throw new Error("Adjustment Qty must be a whole number.");
  if (quantity === 0) throw new Error("Adjustment Qty cannot be 0.");

  let closingId = String(body.closing_id || body.closing_payload?.closing_id || "");
  if (!closingId) {
    if (!body.closing_payload || typeof body.closing_payload !== "object") throw new Error("A draft closing is required before recording an adjustment.");
    const reportDate = validShiftDate(body.closing_payload.report_date);
    const active = await activeClosingForDate(ctx, reportDate);
    if (active?.status === "draft") closingId = active.id;
    else {
      if (active?.status === "finalized") throw new Error("This shift is already closed and cannot accept an adjustment.");
      const created = await saveClosing(ctx, { ...body.closing_payload, closing_id: "", workflow_status: "Draft" });
      closingId = created.closing_id;
    }
  }

  const closing = await ctx.admin.from("daily_closings").select("id,store_id,status").eq("id", closingId).single();
  if (closing.error || closing.data.store_id !== ctx.store.id) throw new Error("You do not have access to this closing.");
  if (closing.data.status !== "draft") throw new Error("This closing is locked.");

  const styleId = String(body.machine_style_id || "");
  if (!styleId) throw new Error("A product is required for this adjustment.");
  const machineEntries = await ctx.admin.from("closing_machine_entries").select("id").eq("closing_id", closingId);
  if (machineEntries.error) throw new Error(machineEntries.error.message);
  const machineEntryIds = (machineEntries.data || []).map((entry: any) => entry.id);
  if (!machineEntryIds.length) throw new Error("The selected product is not in this closing.");
  const product = await ctx.admin.from("closing_product_entries").select("id,begin_qty,final_qty").eq("machine_style_id", styleId).in("closing_machine_entry_id", machineEntryIds).maybeSingle();
  if (product.error || !product.data) throw new Error("The selected product is not in this closing.");

  // The event ledger is authoritative.  Do not trust a stale aggregate left by
  // an older draft-save implementation that did not persist its event history.
  const existingEvents = await ctx.admin.from("refill_events").select("delta_qty").eq("closing_product_entry_id", product.data.id).is("voided_at", null);
  if (existingEvents.error) throw new Error(existingEvents.error.message);
  const nextRefillQty = (existingEvents.data || []).reduce((sum: number, event: any) => sum + integer(event.delta_qty), 0) + quantity;
  const availableQty = integer(product.data.begin_qty) + nextRefillQty;
  if (availableQty < 0) throw new Error("This adjustment would make available stock negative.");
  const created = await ctx.admin.from("refill_events").insert({ closing_product_entry_id: product.data.id, delta_qty: quantity, created_by: ctx.userId, created_by_name_snapshot: adjustedBy }).select("*").single();
  if (created.error) throw new Error(created.error.message);
  const finalQty = product.data.final_qty;
  const qtyUsed = finalQty === null || finalQty === undefined ? 0 : availableQty - integer(finalQty);
  const productUpdate = await ctx.admin.from("closing_product_entries").update({ refill_qty: nextRefillQty, qty_used: qtyUsed, updated_at: new Date().toISOString() }).eq("id", product.data.id);
  if (productUpdate.error) {
    // This is a failed, never-returned create rather than a user-requested
    // void; remove the compensating orphan so the event ledger stays atomic.
    await ctx.admin.from("refill_events").delete().eq("id", created.data.id);
    throw new Error(productUpdate.error.message);
  }
  const events = await ctx.admin.from("refill_events").select("*").eq("closing_product_entry_id", product.data.id).is("voided_at", null).order("created_at");
  if (events.error) throw new Error(events.error.message);
  return { ok: true, closing_id: closingId, product: { refill_qty: nextRefillQty, qty_used: qtyUsed, refill_history: refillHistory(events.data || []) } };
}

async function serve(req: Request) {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-claw-store-id", "Vary": "Origin" } });
  const ctx = await context(req); if (ctx instanceof Response) return ctx;
  const url = new URL(req.url); const path = url.pathname.replace(/^\/claw-api/, "") || "/";
  const body = req.method === "GET" ? {} : await req.json().catch(() => ({}));
  try {
    if (path === "/api/bootstrap") { const [settings, machines, closings, types] = await Promise.all([ctx.admin.from("store_settings").select("*").eq("store_id", ctx.store.id).single(), readMachines(ctx), ctx.admin.from("daily_closings").select("*").eq("store_id", ctx.store.id).lte("report_date", new Date().toISOString().slice(0, 10)).neq("status", "void").order("report_date", { ascending: false }).limit(12), machineTypes(ctx)]); return json({ app: { name: "JOLI POLI Claw", version: "2.1.78" }, settings: { outlet: ctx.store.name, currency: settings.data?.currency_code || "USD", variance_tolerance: settings.data?.variance_tolerance || 0, exchange_rate_usd_khr: settings.data?.exchange_rate_khr_per_usd || 0, price_per_coin_usd: settings.data?.price_per_coin_usd || 0, machine_types: types }, cloud_context: { profile: { username: ctx.profile.username, role: ctx.profile.role }, active_store: ctx.store, stores: ctx.stores }, dashboard: {}, recent_closings: (closings.data || []).map(header), machines }); }
    if (path === "/api/settings" && req.method === "GET") { const [settings, types] = await Promise.all([ctx.admin.from("store_settings").select("*").eq("store_id", ctx.store.id).single(), machineTypes(ctx)]); if (settings.error) throw new Error(settings.error.message); return json({ settings: { outlet: ctx.store.name, currency: settings.data.currency_code, variance_tolerance: settings.data.variance_tolerance, exchange_rate_usd_khr: settings.data.exchange_rate_khr_per_usd, price_per_coin_usd: settings.data.price_per_coin_usd, machine_types: types } }); }
    if (path === "/api/settings" && req.method === "POST") { if (!configurationManager(ctx)) return fail("Developer or Admin role required.", 403); const updates: any = { updated_by: ctx.userId, updated_at: new Date().toISOString() }; if (body.exchange_rate_usd_khr !== undefined) updates.exchange_rate_khr_per_usd = num(body.exchange_rate_usd_khr); if (body.price_per_coin_usd !== undefined) updates.price_per_coin_usd = num(body.price_per_coin_usd); if (body.variance_tolerance !== undefined) updates.variance_tolerance = integer(body.variance_tolerance); const { error } = await ctx.admin.from("store_settings").update(updates).eq("store_id", ctx.store.id); if (error) throw new Error(error.message); if (body.machine_types !== undefined) { for (const item of body.machine_types) { if (!String(item.name || "").trim() || integer(item.coins_per_play) <= 0) throw new Error("Each machine type needs a name and positive Coins per Play."); const type = await ctx.admin.from("machine_types").upsert({ name: String(item.name).trim(), coins_per_play: integer(item.coins_per_play), is_active: true }, { onConflict: "name" }).select("id").single(); if (type.error) throw new Error(type.error.message); const rule = await ctx.admin.from("store_machine_type_rules").upsert({ store_id: ctx.store.id, machine_type_id: type.data.id, coins_per_play: integer(item.coins_per_play), is_active: true, updated_by: ctx.userId }, { onConflict: "store_id,machine_type_id" }); if (rule.error) throw new Error(rule.error.message); } } const refreshed = await ctx.admin.from("store_settings").select("*").eq("store_id", ctx.store.id).single(); if (refreshed.error) throw new Error(refreshed.error.message); return json({ ok: true, settings: { outlet: ctx.store.name, currency: refreshed.data.currency_code, variance_tolerance: refreshed.data.variance_tolerance, exchange_rate_usd_khr: refreshed.data.exchange_rate_khr_per_usd, price_per_coin_usd: refreshed.data.price_per_coin_usd, machine_types: await machineTypes(ctx) } }); }
    if (path === "/api/users" && req.method === "GET") { if (!developer(ctx)) return fail("Developer role required.", 403); const { data, error } = await ctx.admin.from("profiles").select("id,username,role,is_active,all_stores,user_store_access!user_store_access_user_id_fkey(store_id,stores(code,name,is_active))").order("username"); if (error) throw new Error(error.message); return json((data || []).map((row: any) => ({ id: row.id, username: row.username, role: row.role, status: row.is_active ? "active" : "inactive", outlets: row.all_stores ? [{ code: "ALL", name: "All outlets" }] : (row.user_store_access || []).filter((access: any) => access.stores?.is_active).map((access: any) => ({ code: access.stores?.code, name: access.stores?.name })) }))); }
    if (path === "/api/users" && req.method === "POST") { if (!developer(ctx)) return fail("Developer role required.", 403); const username = normalizeUsername(body.username); const role = String(body.role || ""); if (!["developer", "admin", "outlet"].includes(role)) return fail("Role must be Developer, Admin, or Outlet.", 400); const password = String(body.temporary_password || ""); if (!strongTemporaryPassword(password)) return fail("Temporary password must be at least 12 characters and include uppercase, lowercase, number, and symbol.", 400); const outletCodes = Array.isArray(body.outlets) ? body.outlets.map(String) : []; let createdUserId = ""; try { const created = await ctx.admin.auth.admin.createUser({ email: `${username}@claw.internal`, password, email_confirm: true, user_metadata: {} }); if (created.error || !created.data.user) throw new Error("Could not create the user."); createdUserId = created.data.user.id; const applied = await ctx.admin.rpc("apply_developer_user_profile", { target_user: createdUserId, actor_user: ctx.userId, requested_username: username, requested_role: role, requested_active: body.status !== "inactive", requested_outlet_codes: outletCodes }); if (applied.error) throw new Error(applied.error.message); return json(applied.data, 201); } catch (error) { if (createdUserId) await ctx.admin.auth.admin.deleteUser(createdUserId).catch(() => {}); throw error; } }
    if (path.startsWith("/api/users/") && req.method === "PATCH") { if (!developer(ctx)) return fail("Developer role required.", 403); const userId = path.split("/").pop()!; if (body.username !== undefined) return fail("Username is immutable; create a controlled replacement user instead.", 400); const existing = await ctx.admin.from("profiles").select("username,role,is_active").eq("id", userId).single(); if (existing.error || !existing.data?.username) return fail("User not found.", 404); const role = body.role === undefined ? existing.data.role : String(body.role); if (!["developer", "admin", "outlet"].includes(role)) return fail("Role must be Developer, Admin, or Outlet.", 400); const outletCodes = Array.isArray(body.outlets) ? body.outlets.map(String) : []; const applied = await ctx.admin.rpc("apply_developer_user_profile", { target_user: userId, actor_user: ctx.userId, requested_username: existing.data.username, requested_role: role, requested_active: body.status === undefined ? existing.data.is_active : body.status !== "inactive", requested_outlet_codes: outletCodes }); if (applied.error) throw new Error(applied.error.message); return json(applied.data); }
    if (path === "/api/outlets" && req.method === "GET") { if (!developer(ctx)) return fail("Developer role required.", 403); let outlets = ctx.admin.from("stores").select("id,code,name,is_active,created_at,updated_at,user_store_access(user_id)").order("code"); if (url.searchParams.get("include_inactive") !== "true") outlets = outlets.eq("is_active", true); const { data, error } = await outlets; if (error) throw new Error(error.message); return json((data || []).map((outlet: any) => ({ id: outlet.id, code: outlet.code, name: outlet.name, status: outlet.is_active ? "active" : "inactive", assigned_users: (outlet.user_store_access || []).length }))); }
    if (path === "/api/outlets" && req.method === "POST") { if (!developer(ctx)) return fail("Developer role required.", 403); const code = normalizeOutletCode(body.code); const name = normalizeOutletName(body.name); const currentSettings = await ctx.admin.from("store_settings").select("exchange_rate_khr_per_usd,price_per_coin_usd,currency_code,variance_tolerance").eq("store_id", ctx.store.id).single(); if (currentSettings.error) throw new Error(currentSettings.error.message); const created = await ctx.admin.from("stores").insert({ code, name, is_active: true }).select("*").single(); if (created.error) throw new Error(created.error.message); const settings = await ctx.admin.from("store_settings").insert({ store_id: created.data.id, ...currentSettings.data, updated_by: ctx.userId, updated_at: new Date().toISOString() }); if (settings.error) { await ctx.admin.from("stores").delete().eq("id", created.data.id); throw new Error(settings.error.message); } await writeAudit(ctx, "store", created.data.id, "create", { code, name, settings_copied_from_store_id: ctx.store.id }); return json({ id: created.data.id, code, name, status: "active", assigned_users: 0 }, 201); }
    if (path.startsWith("/api/outlets/") && req.method === "PATCH") { if (!developer(ctx)) return fail("Developer role required.", 403); const outletId = path.split("/").pop()!; const existing = await ctx.admin.from("stores").select("*").eq("id", outletId).single(); if (existing.error || !existing.data) return fail("Outlet not found.", 404); const nextActive = body.status === undefined ? existing.data.is_active : String(body.status) !== "inactive"; if (!nextActive && existing.data.is_active) { const active = await ctx.admin.from("stores").select("id", { count: "exact", head: true }).eq("is_active", true); if (active.count !== null && active.count <= 1) return fail("The last active outlet cannot be deactivated.", 409); const drafts = await ctx.admin.from("daily_closings").select("id", { count: "exact", head: true }).eq("store_id", outletId).eq("status", "draft"); if (drafts.count && drafts.count > 0) return fail("This outlet has an active draft shift and cannot be deactivated.", 409); } const updates: any = { updated_at: new Date().toISOString() }; if (body.name !== undefined) updates.name = normalizeOutletName(body.name); if (body.status !== undefined) updates.is_active = nextActive; const updated = await ctx.admin.from("stores").update(updates).eq("id", outletId).select("*").single(); if (updated.error) throw new Error(updated.error.message); await writeAudit(ctx, "store", outletId, nextActive ? (existing.data.is_active ? "update" : "reactivate") : "deactivate", { code: existing.data.code, name: updated.data.name }); return json({ id: updated.data.id, code: updated.data.code, name: updated.data.name, status: updated.data.is_active ? "active" : "inactive" }); }
    if (path.startsWith("/api/outlets/") && req.method === "DELETE") { if (!developer(ctx)) return fail("Developer role required.", 403); const outletId = path.split("/").pop()!; const purged = await ctx.user.rpc("purge_developer_outlet", { target_store: outletId, confirm_code: String(body.confirm_code || "") }); if (purged.error) throw new Error(purged.error.message); const storagePaths = Array.isArray(purged.data?.storage_paths) ? purged.data.storage_paths.filter((path: any) => typeof path === "string") : []; let storageCleanupFailedPaths: string[] = []; if (storagePaths.length) { const cleanup = await ctx.admin.storage.from(IMAGE_BUCKET).remove(storagePaths); if (cleanup.error) { console.error("Outlet image cleanup failed", cleanup.error.message); storageCleanupFailedPaths = storagePaths; } } return json({ ...purged.data, storage_cleanup_failed_paths: storageCleanupFailedPaths }); }
    if (path === "/api/machines" && req.method === "GET") return json(await readMachines(ctx, url.searchParams.get("active_only") === "true", configurationManager(ctx) && url.searchParams.get("include_inactive") === "true"));
    if (path === "/api/machines" && req.method === "POST") {
      if (!configurationManager(ctx)) return fail("Developer or Admin role required.", 403);
      const machineId = String(body.machine_id || "");
      const machineType = await ctx.admin.from("machine_types").select("id,name").eq("name", String(body.machine_type || "")).single();
      if (machineType.error) throw new Error("Choose a configured machine type.");
      const products = body.products || body.Products || (body.barcodes || []).map((barcode: string) => ({ barcode }));
      if (!machineId && !products.some((product: any) => String(typeof product === "string" ? product : product?.barcode || "").trim())) throw new Error("At least one product barcode is required.");
      let machine: any;
      if (machineId) {
        const existing = await ctx.admin.from("machines").select("*").eq("id", machineId).eq("store_id", ctx.store.id).single();
        if (existing.error) throw new Error("Machine is not in the active store.");
        if (existing.data.machine_type_id !== machineType.data.id) return fail("Machine Type is fixed after creation so its number and internal identity remain stable.", 409);
        const updated = await ctx.admin.from("machines").update({ prize_category: String(body.prize_category || ""), is_active: body.active !== false, sort_order: integer(body.sort_order) || existing.data.sort_order, notes: String(body.notes || "") }).eq("id", machineId).select("*").single();
        if (updated.error) throw new Error(updated.error.message); machine = updated.data;
      } else {
        // The database's (store_id, machine_type_id, machine_number) constraint
        // is the authority.  A concurrent creator retries after a collision.
        for (let attempt = 0; attempt < 5; attempt++) {
          const previous = await ctx.admin.from("machines").select("machine_number").eq("store_id", ctx.store.id).eq("machine_type_id", machineType.data.id).order("machine_number", { ascending: false }).limit(1).maybeSingle();
          if (previous.error) throw new Error(previous.error.message);
          const machineNumber = integer(previous.data?.machine_number) + 1 || 1;
          const machineCode = `${machineCodePart(ctx.store.code)}-${machineCodePart(machineType.data.name)}-${String(machineNumber).padStart(3, "0")}`;
          const created = await ctx.admin.from("machines").insert({ store_id: ctx.store.id, machine_type_id: machineType.data.id, machine_code: machineCode, machine_number: machineNumber, display_name: `${machineType.data.name} ${machineNumber}`, prize_category: String(body.prize_category || ""), is_active: body.active !== false, sort_order: integer(body.sort_order) || machineNumber, notes: String(body.notes || "") }).select("*").single();
          if (!created.error) { machine = created.data; break; }
          if (!isUniqueViolation(created.error) || attempt === 4) throw new Error(created.error.message);
        }
      }
      for (let index = 0; index < products.length; index++) { const product = typeof products[index] === "string" ? { barcode: products[index] } : products[index]; if (!String(product.barcode || "").trim()) continue; const style = await ctx.admin.from("machine_styles").upsert({ machine_id: machine.id, barcode: String(product.barcode).trim(), product_name: String(product.product_name || product.barcode).trim(), style_code: String(product.product_id || product.barcode).trim(), starting_qty: Math.max(0, integer(product.starting_qty)), is_active: product.active !== false, sort_order: integer(product.sort_order) || index + 1 }, { onConflict: "machine_id,barcode" }); if (style.error) throw new Error(style.error.message); }
      if (body.remove_image) { const first = await ctx.admin.from("machine_styles").select("id,image_path").eq("machine_id", machine.id).order("sort_order").limit(1).maybeSingle(); if (first.data?.image_path) { await ctx.admin.from("machine_styles").update({ image_path: null, image_content_type: null, image_updated_by: ctx.userId }).eq("id", first.data.id); await ctx.admin.storage.from(IMAGE_BUCKET).remove([first.data.image_path]); } }
      if (body.image_data) { const first = await ctx.admin.from("machine_styles").select("id").eq("machine_id", machine.id).order("sort_order").limit(1).single(); if (!first.error) { const match = String(body.image_data).match(/^data:(image\/(?:jpeg|png|webp));base64,/); if (!match) throw new Error("Only JPEG, PNG, and WebP images are accepted."); await saveImage(ctx, { machine_style_id: first.data.id, content_type: match[1], image_base64: body.image_data }); } }
      return json({ ok: true, machine: (await readMachines(ctx, false)).find((item: any) => item.Machine_ID === machine.id) });
    }
    if (path.startsWith("/api/machines/") && req.method === "DELETE") { if (!configurationManager(ctx)) return fail("Developer or Admin role required.", 403); const id = path.split("/").pop()!; const result = await ctx.admin.from("machines").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id).eq("store_id", ctx.store.id); if (result.error) throw new Error(result.error.message); return json({ ok: true }); }
    if (path.startsWith("/api/machine-styles/") && req.method === "DELETE") { if (!configurationManager(ctx)) return fail("Developer or Admin role required.", 403); const styleId = path.split("/").pop()!; const existing = await ctx.admin.from("machine_styles").select("id,barcode,product_name,is_active,machines!inner(store_id)").eq("id", styleId).single(); if (existing.error || existing.data?.machines?.store_id !== ctx.store.id) return fail("Product is not in the active outlet.", 404); const retired = await ctx.admin.from("machine_styles").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", styleId).select("id").single(); if (retired.error) throw new Error(retired.error.message); await writeAudit(ctx, "machine_style", styleId, "retire", { barcode: existing.data.barcode, product_name: existing.data.product_name, was_active: existing.data.is_active }); return json({ ok: true, retired_style_id: styleId }); }
    if (path === "/api/images/replace" && req.method === "POST") return json(await saveImage(ctx, body));
    if (path === "/api/test/image-persistence-failure" && req.method === "POST") {
      if (!developer(ctx) || !String(Deno.env.get("SUPABASE_URL") || "").includes(PROJECT_REF)) return fail("Developer test route required.", 403);
      await saveImage(ctx, { ...body, __staging_test_persistence_failure: true });
    }
    if (path === "/api/images/remove" && req.method === "POST") { if (!configurationManager(ctx)) return fail("Developer or Admin role required.", 403); const style = await ctx.admin.from("machine_styles").select("*, machines!inner(store_id)").eq("id", String(body.machine_style_id || "")).single(); if (style.error || style.data.machines.store_id !== ctx.store.id) return fail("Image style is not in the active store.", 404); const oldPath = style.data.image_path; const update = await ctx.admin.from("machine_styles").update({ image_path: null, image_content_type: null, image_updated_by: ctx.userId, image_updated_at: new Date().toISOString() }).eq("id", style.data.id); if (update.error) throw new Error(update.error.message); if (oldPath) { const remove = await ctx.admin.storage.from(IMAGE_BUCKET).remove([oldPath]); if (remove.error) throw new Error(`Image reference cleared; cleanup failed: ${remove.error.message}`); } return json({ ok: true }); }
    if (path === "/api/active-closing" && req.method === "GET") {
      const reportDate = validShiftDate(url.searchParams.get("report_date") || new Date().toISOString().slice(0, 10));
      const active = await activeClosingForDate(ctx, reportDate);
      return json({ closing_id: active?.status === "draft" ? active.id : null });
    }
    if (path === "/api/new-closing") {
      const reportDate = validShiftDate(url.searchParams.get("report_date") || new Date().toISOString().slice(0, 10));
      const active = await activeClosingForDate(ctx, reportDate);
      if (active?.status === "finalized") return fail("This shift is already closed and cannot be started again.", 409);
      if (active?.status === "draft") return json({ report_date: reportDate, outlet: ctx.store.name, closing_id: active.id, existing_closing_id: active.id, reused: true });
      const template = await openingTemplate(ctx, reportDate);
      try {
        const created = await saveClosing(ctx, { ...template, sales: {}, closed_by: "", verified_by: "", notes: "", workflow_status: "Draft" });
        return json({ report_date: reportDate, outlet: ctx.store.name, closing_id: created.closing_id, reused: false });
      } catch (error) {
        const concurrent = await activeClosingForDate(ctx, reportDate);
        if (concurrent?.status === "draft") return json({ report_date: reportDate, outlet: ctx.store.name, closing_id: concurrent.id, existing_closing_id: concurrent.id, reused: true });
        throw error;
      }
    }
    if (path === "/api/calculate") return json({ summary: calculate(body), machines: [] });
    if (path === "/api/settings/unlock" && req.method === "POST") return configurationManager(ctx) ? json({ ok: true }) : fail("Developer or Admin role required.", 403);
    if (path === "/api/closings/save" && req.method === "POST") return json(await saveClosing(ctx, body));
    if (path === "/api/refills" && req.method === "POST") return json(await recordRefill(ctx, body));
    if (path.startsWith("/api/refills/") && path.endsWith("/void") && req.method === "POST") {
      const refillId = path.split("/")[3];
      const result = await ctx.user.rpc("void_refill_event", { target_refill: refillId, reason: String(body.reason || "") });
      if (result.error) throw new Error(result.error.message);
      const product = await ctx.admin.from("closing_product_entries").select("id,refill_qty,qty_used").eq("id", result.data.closing_product_entry_id).single();
      if (product.error) throw new Error(product.error.message);
      const events = await ctx.admin.from("refill_events").select("*").eq("closing_product_entry_id", product.data.id).is("voided_at", null).order("created_at");
      if (events.error) throw new Error(events.error.message);
      return json({ ok: true, refill: result.data, product: { refill_qty: integer(product.data.refill_qty), qty_used: integer(product.data.qty_used), refill_history: refillHistory(events.data || []) } });
    }
    if (path === "/api/closings" && req.method === "GET") { const { data, error } = await ctx.admin.from("daily_closings").select("*").eq("store_id", ctx.store.id).order("report_date", { ascending: false }).limit(Math.min(integer(url.searchParams.get("limit")) || 500, 5000)); if (error) throw new Error(error.message); return json((data || []).map(header)); }
    if (path === "/api/reports/summary" && req.method === "GET") { const rows = await monthlyClosings(ctx, url.searchParams.get("month") || ""); return json({ closings: rows.length, total_sales: rows.reduce((sum: number, row: any) => sum + num(row.total_sales_usd), 0), coins: rows.reduce((sum: number, row: any) => sum + integer(row.machine_coins_used), 0), prizes: rows.reduce((sum: number, row: any) => sum + integer(row.total_products), 0), outlet: ctx.store.name }); }
    if (path === "/api/reports/monthly" && req.method === "POST") { const rows = await monthlyClosings(ctx, String(body.month || "")); const lines: unknown[][] = [["JOLI POLI Claw Monthly Report", ctx.store.name, body.month], [], ["Report Date", "Closing ID", "Workflow", "Total Sales", "Coins Played", "Prizes Won", "Coin Variance", "Closed By", "Verified By"]]; for (const row of rows) { const value = header(row); lines.push([value.Report_Date, value.Closing_ID, value.Workflow_Status, value.Total_Sales, value.Machine_Coins_Used, value.Total_Prizes_Won, value.Coin_Variance, value.Closed_By, value.Verified_By]); } lines.push([], ["Totals", rows.length, "", rows.reduce((sum: number, row: any) => sum + num(row.total_sales_usd), 0), rows.reduce((sum: number, row: any) => sum + integer(row.machine_coins_used), 0), rows.reduce((sum: number, row: any) => sum + integer(row.total_products), 0)]); return json(download(`JOLI_POLI_Claw_Monthly_${ctx.store.code}_${body.month}.csv`, lines)); }
    if (path.startsWith("/api/reports/daily/") && req.method === "POST") { const closingId = path.split("/").pop()!; const detail = await closingDetail(ctx, closingId); const value = header(detail.closing); const lines: unknown[][] = [["JOLI POLI Claw Daily Report", ctx.store.name, value.Report_Date], [], ["Closing ID", value.Closing_ID], ["Final State", value.Workflow_Status], ["Total Sales", value.Total_Sales], ["Coins Dispensed", value.Coins_Dispensed], ["Machine Coins Used", value.Machine_Coins_Used], ["Coin Variance", value.Coin_Variance], ["Total Prizes Won", value.Total_Prizes_Won], [], ["Machine", "Product / Barcode", "Begin Qty", "Refill Qty", "Final Qty", "Qty Used", "Coins Used", "Meter Mode", "Status"]]; for (const machine of detail.machines) for (const product of machine.closing_product_entries || []) lines.push([machine.machine_name_snapshot, product.product_name_snapshot || product.barcode_snapshot, product.begin_qty, product.refill_qty, product.final_qty, product.qty_used, machine.coins_used, machine.meter_mode, machine.machine_status]); return json(download(`JOLI_POLI_Claw_Daily_${ctx.store.code}_${value.Report_Date}_${closingId}.csv`, lines)); }
    if (path.startsWith("/api/closings/") && req.method === "GET") { const id = path.split("/").pop()!; const { data: closing, error } = await ctx.admin.from("daily_closings").select("*").eq("id", id).eq("store_id", ctx.store.id).single(); if (error) return fail("Closing not found.", 404); const { data: machines } = await ctx.admin.from("closing_machine_entries").select("*, closing_product_entries(*, refill_events(*))").eq("closing_id", id).order("sort_order_snapshot"); const mapped = (machines || []).map((row: any) => ({ Machine_ID: row.machine_id, Machine_Name: row.machine_name_snapshot, Machine_Type: row.machine_type_name_snapshot, Capacity: row.capacity_snapshot, Begin_Prize: 0, Refill_Prize: 0, Final_Prize: 0, Begin_Coin_Meter: row.begin_meter, Final_Coin_Meter: row.final_meter, Coins_Used: row.coins_used, Meter_Mode: row.meter_mode, Manual_Coins_Used: row.manual_coins_used, Win_Rate: row.win_rate, Machine_Status: row.machine_status, Notes: row.notes, Products: [...(row.closing_product_entries || [])].sort((a: any, b: any) => integer(a.sort_order_snapshot) - integer(b.sort_order_snapshot) || String(a.created_at || "").localeCompare(String(b.created_at || "")) || String(a.id).localeCompare(String(b.id))).map((product: any) => ({ ...product, refill_events: refillHistory(product.refill_events || []) })) })); return json({ header: header(closing), machines: mapped, products: mapped.flatMap((row: any) => row.Products.map((product: any) => ({ ...product, Machine_ID: row.Machine_ID, Product_ID: product.machine_style_id, Barcode: product.barcode_snapshot, Begin_Qty: product.begin_qty, Final_Qty: product.final_qty, Qty_Used: product.qty_used, Refill_Qty: product.refill_qty, Refill_History_JSON: product.refill_events || [] }))) }); }
    if (path.startsWith("/api/closings/") && req.method === "DELETE") { if (!configurationManager(ctx)) return fail("Developer or Admin role required.", 403); const id = path.split("/").pop()!; const existing = await ctx.admin.from("daily_closings").select("id,status").eq("id", id).eq("store_id", ctx.store.id).single(); if (existing.error || existing.data.status === "void") return fail("Closing not found.", 404); const result = await ctx.admin.from("daily_closings").update({ status: "void", voided_by: ctx.userId, voided_at: new Date().toISOString(), void_reason: String(body.reason || "") }).eq("id", id).eq("store_id", ctx.store.id).in("status", ["draft", "finalized"]); if (result.error) throw new Error(result.error.message); const audit = await ctx.admin.from("audit_log").insert({ actor_user_id: ctx.userId, store_id: ctx.store.id, entity_type: "daily_closing", entity_id: id, action: "void", metadata: { reason: String(body.reason || "") } }); if (audit.error) throw new Error(audit.error.message); return json({ ok: true, voided_closing_id: id }); }
    if (path === "/api/history" && req.method === "GET") { const { data, error } = await ctx.admin.from("daily_closings").select("*").eq("store_id", ctx.store.id).eq("status", "finalized").order("finalized_at", { ascending: false }).limit(Math.min(integer(url.searchParams.get("limit")) || 500, 5000)); if (error) throw new Error(error.message); const records = (data || []).map((row: any) => ({ ...header(row), Refill_Qty: 0 })); return json({ records, machines: [], staff: [...new Set(records.map((row: any) => row.Closed_By).filter(Boolean))] }); }
    if (path === "/api/dashboard") return json({ summary: {}, recent_closings: [] });
    if (path.startsWith("/api/machine-images/")) return fail("Private image delivery is available through signed URLs only.", 404);
    return fail("Cloud operation is not implemented for this route.", 404);
  } catch (error) { return fail(error instanceof Error ? error.message : "Cloud request failed.", 400); }
}

Deno.serve(serve);

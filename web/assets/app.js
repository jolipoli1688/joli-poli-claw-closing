"use strict";

const state = {
  bootstrap: null,
  page: "closing",
  renderGeneration: 0,
  closing: null,
  closingReadOnly: false,
  closingId: null,
  closingStatus: "Draft",
  calculateTimer: null,
  history: [],
  machines: [],
  bulkMode: false,
  bulkSelection: new Set(),
  bulkAnchor: null,
  bulkDragging: false,
  updateStatus: null,
  updateChecking: false,
  sidebarCollapsed: false,
  appSettings: null,
  settingsEdit: { setup: false, machineTypes: false },
  closingStructureEdit: false,
  closingReview: false,
};

const pageMeta = {
  dashboard: ["Dashboard", ""],
  closing: ["Daily Closing", ""],
  history: ["Closing History", "Review drafts, finalized closings, and exported reports"],
  settings: ["Settings", "Configure exchange rate, coin price, and machine play rules"],
};

const UI_NAVIGATION_STORAGE_PREFIX = "clawClosing.ui-navigation.v1";
const UI_NAVIGATION_PAGE_TO_APP_PAGE = { dashboard: "dashboard", "daily-closing": "closing", "closing-history": "history", settings: "settings" };
const UI_NAVIGATION_APP_PAGE_TO_PAGE = Object.fromEntries(Object.entries(UI_NAVIGATION_PAGE_TO_APP_PAGE).map(([persisted, page]) => [page, persisted]));
const UI_NAVIGATION_TAB_TO_DASHBOARD_VIEW = { "primary-outcomes": "outcomes", "store-detail": "store" };
const UI_NAVIGATION_DASHBOARD_VIEW_TO_TAB = Object.fromEntries(Object.entries(UI_NAVIGATION_TAB_TO_DASHBOARD_VIEW).map(([persisted, view]) => [view, persisted]));

function uiNavigationUserScope(bootstrap = state.bootstrap) {
  const userId = String(window.clawCloudAuth?.session?.()?.user?.id || "").trim();
  if (userId) return `cloud:${userId}`;
  const username = String(bootstrap?.cloud_context?.profile?.username || "").trim();
  if (username) return `cloud-profile:${username}`;
  return `local:${String(bootstrap?.settings?.outlet || "default").trim() || "default"}`;
}

function uiNavigationStorageKey(bootstrap = state.bootstrap) {
  return `${UI_NAVIGATION_STORAGE_PREFIX}:${encodeURIComponent(uiNavigationUserScope(bootstrap))}`;
}

function clearInvalidUiNavigationState(bootstrap = state.bootstrap) {
  try { localStorage.removeItem(uiNavigationStorageKey(bootstrap)); } catch (_error) {}
}

function normalizePersistedDashboardFilters(value, bootstrap = state.bootstrap) {
  const fallback = dashboardDefaultFilters();
  const from = displayToIsoDate(value?.from);
  const to = displayToIsoDate(value?.to);
  if (!from || !to || from > to) return fallback;
  const context = bootstrap?.cloud_context || {};
  const stores = Array.isArray(context.stores) ? context.stores.filter(store => store?.is_active !== false) : [];
  const role = String(context.profile?.role || "").toLowerCase();
  const activeStoreId = String(context.active_store?.id || stores[0]?.id || "");
  let storeId = String(value?.store_id || "all");
  if (role === "outlet") storeId = activeStoreId;
  else if (stores.length && storeId !== "all" && !stores.some(store => String(store.id) === storeId)) storeId = "all";
  return { from, to, store_id: storeId || "all" };
}

function loadUiNavigationState(bootstrap = state.bootstrap) {
  let parsed;
  try {
    const raw = localStorage.getItem(uiNavigationStorageKey(bootstrap));
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch (_error) {
    clearInvalidUiNavigationState(bootstrap);
    return null;
  }
  const page = UI_NAVIGATION_PAGE_TO_APP_PAGE[parsed?.page];
  // Retired, invalid, or absent Dashboard tab state
  // must continue into Primary Outcomes instead of blocking startup.
  const dashboardView = UI_NAVIGATION_TAB_TO_DASHBOARD_VIEW[parsed?.dashboardTab] || "outcomes";
  if (!page || !pageMeta[page]) {
    clearInvalidUiNavigationState(bootstrap);
    return null;
  }
  const from = displayToIsoDate(parsed?.dashboardFilters?.from);
  const to = displayToIsoDate(parsed?.dashboardFilters?.to);
  if (!from || !to || from > to) clearInvalidUiNavigationState(bootstrap);
  return { page, dashboardView, dashboardFilters: normalizePersistedDashboardFilters(parsed.dashboardFilters, bootstrap) };
}

function saveUiNavigationState() {
  const page = UI_NAVIGATION_APP_PAGE_TO_PAGE[state.page];
  const dashboardTab = UI_NAVIGATION_DASHBOARD_VIEW_TO_TAB[dashboardView];
  if (!page || !dashboardTab) return;
  const dashboardFiltersToSave = normalizePersistedDashboardFilters(dashboardFilters || dashboardDefaultFilters());
  try { localStorage.setItem(uiNavigationStorageKey(), JSON.stringify({ page, dashboardTab, dashboardFilters: dashboardFiltersToSave })); } catch (_error) {}
}

const navItems = [
  ["dashboard", "layout-dashboard", "Dashboard"],
  ["closing", "clipboard-check", "Daily Closing"],
  ["history", "history", "Closing History"],
  ["settings", "settings", "Settings"],
];

const iconPaths = {
  "layout-dashboard": '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  "clipboard-check": '<rect width="14" height="18" x="5" y="3" rx="2"/><path d="M9 3V2h6v1"/><path d="m9 13 2 2 4-4"/>',
  "history": '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
  "boxes": '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  "chart-column": '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  "plus": '<path d="M5 12h14"/><path d="M12 5v14"/>',
  "circle-dollar-sign": '<circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/>',
  "dollar": '<line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/>',
  "coins": '<circle cx="8" cy="8" r="5"/><path d="M18 8a5 5 0 0 1 0 10 5 5 0 0 1-4.5-2.8"/><path d="M8 5v6"/><path d="M6.5 6.5h2.25a1.25 1.25 0 0 1 0 2.5H7.25a1.25 1.25 0 0 0 0 2.5H9.5"/>',
  "scale": '<path d="m16 16 3-8 3 8a5 5 0 0 1-6 0"/><path d="m2 16 3-8 3 8a5 5 0 0 1-6 0"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h18"/>',
  "gift": '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8A2.5 2.5 0 1 1 12 6.5V8Z"/><path d="M16.5 8A2.5 2.5 0 1 0 12 6.5V8Z"/>',
  "calendar": '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  "store": '<path d="M3 9l2-5h14l2 5"/><path d="M5 9v10h14V9"/><path d="M9 19v-6h6v6"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/>',
  "sliders-horizontal": '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
  "search": '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  "arrow-up": '<path d="m18 15-6-6-6 6"/><path d="M12 9v12"/>',
  "arrow-down": '<path d="m6 9 6 6 6-6"/><path d="M12 15V3"/>',
  "chevrons-up-down": '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
  "file": '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5Z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M14 13h2"/><path d="M14 17h2"/>',
  "folder": '<path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="m8 13 2 2 4-4"/>',
  "edit": '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  "check": '<path d="m5 12 4 4L19 6"/>',
  "x": '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  "alert": '<path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  "refresh": '<path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5"/>',
  "download": '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  "printer": '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  "cloud-download": '<path d="M12 13v8"/><path d="m8 17 4 4 4-4"/><path d="M20.4 17.5A5 5 0 0 0 18 8.2 7 7 0 0 0 4.3 10.9 4.5 4.5 0 0 0 5.5 19H7"/>',
  "settings": '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"/><circle cx="12" cy="12" r="3"/>',
  "rotate-cw": '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
  "mouse-pointer": '<path d="M12.586 12.586 19 19"/><path d="M3.588 2.488 10.5 20l2.13-6.37L19 11.5Z"/>',
  "copy-down": '<path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><rect x="4" y="18" width="16" height="3" rx="1"/>',
  "eraser": '<path d="m7 21-4-4a2.8 2.8 0 0 1 0-4L12.6 3.4a2 2 0 0 1 2.8 0l5.2 5.2a2 2 0 0 1 0 2.8L11 21Z"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
  "panel-left-close": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m16 15-3-3 3-3"/>',
  "panel-left-open": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m14 9 3 3-3 3"/>',
  "barcode": '<path d="M3 5v14"/><path d="M8 5v14"/><path d="M12 5v14"/><path d="M17 5v14"/><path d="M21 5v14"/>',
  "image": '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  "tag": '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42Z"/><circle cx="7.5" cy="7.5" r="1"/>',
  "percent": '<line x1="19" x2="5" y1="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  "trophy": '<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0Z"/><path d="M5 6H3v2a4 4 0 0 0 4 4"/><path d="M19 6h2v2a4 4 0 0 1-4 4"/>',
  "trash": '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 15H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/>',
};

function icon(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.file}</svg>`;
}

async function api(path, options = {}) {
  if (!window.clawApi || typeof window.clawApi.request !== "function") {
    throw new Error("Browser compatibility adapter is unavailable.");
  }
  return window.clawApi.request(path, options);
}

function isCloudStaging() { return window.__CLAW_CLOUD_CONFIG__?.mode === "cloud-staging"; }
function desktopUpdaterSupported() { return !isCloudStaging(); }

function money(value) { return `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function number(value, digits = 0) { return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }); }
function isoToday() { return new Date().toISOString().slice(0, 10); }
function monthToday() { return new Date().toISOString().slice(0, 7); }
function displayToIsoDate(value) {
  const text = String(value || "").trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let year, month, day;
  if (match) [, year, month, day] = match;
  else {
    match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (!match) return "";
    [, day, month, year] = match;
  }
  const y = Number(year), m = Number(month), d = Number(day);
  const candidate = new Date(Date.UTC(y, m - 1, d));
  if (y < 1000 || candidate.getUTCFullYear() !== y || candidate.getUTCMonth() !== m - 1 || candidate.getUTCDate() !== d) return "";
  return `${year}-${month}-${day}`;
}
function isoToDisplayDate(value) { const iso = displayToIsoDate(value); return iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : String(value || ""); }
function canonicalClosingDate(value) { const iso = displayToIsoDate(value); if (!iso) throw new Error("Report Date must be a valid calendar date."); return iso; }
function dateDisplay(value) { return isoToDisplayDate(value); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }

function machineBarcodes(machine) {
  const value = machine?.barcodes ?? machine?.Barcodes ?? [];
  if (Array.isArray(value)) return [...new Set(value.map(item => String(item ?? "").trim()).filter(Boolean))];
  return String(value || "").split(/[\r\n,;|]+/).map(item => item.trim()).filter(Boolean);
}

function machineImageUrl(machine) {
  return String(machine?.image_url || machine?.Image_URL || "");
}

function machineThumbnail(machine, size = "small") {
  const url = machineImageUrl(machine);
  if (url) return `<img class="machine-thumb ${size}" src="${escapeHtml(url)}" alt="${escapeHtml(machine?.machine_name || machine?.Machine_Name || "Machine")}">`;
  return `<div class="machine-thumb-placeholder ${size}">${icon("image", size === "large" ? 28 : 18)}</div>`;
}

function barcodeChips(codes, limit = 4) {
  const list = Array.isArray(codes) ? codes : [];
  if (!list.length) return '<span class="barcode-empty">No code</span>';
  const visible = list.slice(0, limit).map(code => `<span class="barcode-chip">${escapeHtml(code)}</span>`).join("");
  const extra = list.length > limit ? `<span class="barcode-more">+${list.length - limit}</span>` : "";
  return visible + extra;
}

function toast(title, message, type = "success") {
  const root = document.getElementById("toastRoot");
  const element = document.createElement("div");
  element.className = `toast ${type}`;
  element.innerHTML = `<div class="toast-icon">${icon(type === "error" ? "alert" : "check", 16)}</div><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p></div>`;
  root.appendChild(element);
  setTimeout(() => element.remove(), 4600);
}

function clearReviewTopActions() {
  const existing = document.getElementById("reviewTopActions");
  if (existing) existing.remove();
}

function setActions(html = "") {
  clearReviewTopActions();
  document.getElementById("pageActions").innerHTML = html;
}

function renderReviewTopActions(html = "") {
  clearReviewTopActions();
  if (state.page !== "closing") return;
  const topbarActions = document.querySelector(".topbar-actions");
  const printButton = document.getElementById("globalPrintButton");
  if (!topbarActions || !html) return;
  const slot = document.createElement("div");
  slot.id = "reviewTopActions";
  slot.className = "review-top-actions";
  slot.innerHTML = html;
  topbarActions.insertBefore(slot, printButton || topbarActions.firstChild);
}

function renderPrintButton() {
  const button = document.getElementById("globalPrintButton");
  if (!button) return;
  const visible = state.page === "closing" && Boolean(state.closing);
  button.hidden = !visible;
  if (!visible) return;
  button.disabled = false;
  button.innerHTML = `${icon("printer", 16)} Print`;
  button.onclick = printClosingPdf;
}

async function printClosingPdf() {
  const button = document.getElementById("globalPrintButton");
  if (!state.closing || !button) return;
  const oldHtml = button.innerHTML;
  try {
    button.disabled = true;
    button.innerHTML = `${icon("printer", 16)} Preparing…`;
    // Print the actual Daily Closing DOM so the PDF/print output matches the UI.
    // The print stylesheet hides navigation/actions and adapts the same UI to A4 landscape.
    document.body.classList.add("printing-daily-closing");
    document.documentElement.classList.add("printing-daily-closing");
    // Let layout and images settle before WebView2 opens the native print dialog.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.print();
  } catch (error) {
    toast("Cannot open print dialog", error.message || "Printing is not available on this computer.", "error");
  } finally {
    // afterprint is not guaranteed in every embedded WebView version, so also clean up here.
    setTimeout(() => {
      document.body.classList.remove("printing-daily-closing");
      document.documentElement.classList.remove("printing-daily-closing");
      button.disabled = false;
      button.innerHTML = oldHtml || `${icon("printer", 16)} Print`;
    }, 350);
  }
}

window.addEventListener("afterprint", () => {
  document.body.classList.remove("printing-daily-closing");
  document.documentElement.classList.remove("printing-daily-closing");
  const button = document.getElementById("globalPrintButton");
  if (button) {
    button.disabled = false;
    button.innerHTML = `${icon("printer", 16)} Print`;
  }
});

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderUpdateButton() {
  const button = document.getElementById("globalUpdateButton");
  if (!button) return;
  if (!desktopUpdaterSupported()) {
    button.hidden = true;
    button.onclick = null;
    return;
  }
  const status = state.updateStatus;
  button.hidden = false;
  button.classList.toggle("available", Boolean(status?.available));
  button.classList.toggle("checking", state.updateChecking);
  if (state.updateChecking) {
    button.innerHTML = `${icon("refresh", 16)} Checking…`;
  } else if (status?.available) {
    button.innerHTML = `${icon("cloud-download", 16)} Update v${escapeHtml(status.version)}`;
  } else if (status && !status.configured && !status.downloaded) {
    button.innerHTML = `${icon("settings", 16)} Set up updates`;
  } else {
    button.innerHTML = `${icon("cloud-download", 16)} Updates`;
  }
  button.onclick = openUpdateCenter;
}

async function checkForUpdates(showErrors = false) {
  if (!desktopUpdaterSupported()) {
    state.updateStatus = { enabled: false, supported: false, available: false, configured: false, downloaded: false };
    return state.updateStatus;
  }
  if (state.updateChecking) return state.updateStatus;
  state.updateChecking = true;
  renderUpdateButton();
  try {
    state.updateStatus = await api("/api/update/status");
    if (showErrors && state.updateStatus.error) throw new Error(state.updateStatus.error);
    return state.updateStatus;
  } catch (error) {
    if (showErrors) toast("Cannot check for updates", error.message, "error");
    return state.updateStatus;
  } finally {
    state.updateChecking = false;
    renderUpdateButton();
  }
}

function updateSourceLabel(status) {
  if (status?.source === "github") return `GitHub · ${status.source_label}`;
  if (status?.source === "manifest") return "Online update manifest";
  if (status?.source === "local") return "Local update package";
  return "Not configured";
}

async function showUpdateConfiguration() {
  const config = await api("/api/update/config");
  const body = `<div class="update-config-copy"><p>Configure this once. Future releases will download and install from inside the application.</p></div>
    <div class="field"><label>GitHub repository</label><input id="updateGithubRepo" class="input" placeholder="owner/repository" value="${escapeHtml(config.github_repo || "")}"><small>Recommended. The latest GitHub Release must contain an asset named ClawClosing_Update.zip.</small></div>
    <div class="update-or">or</div>
    <div class="field"><label>Update manifest URL</label><input id="updateManifestUrl" class="input" placeholder="https://example.com/claw-closing/update.json" value="${escapeHtml(config.manifest_url || "")}"><small>Use this when updates are hosted outside GitHub.</small></div>`;
  showModal("Automatic update source", body, "Save & Check", async () => {
    const githubRepo = document.getElementById("updateGithubRepo").value.trim();
    const manifestUrl = document.getElementById("updateManifestUrl").value.trim();
    if (!githubRepo && !manifestUrl) throw new Error("Enter a GitHub repository or a manifest URL.");
    await api("/api/update/config", { method: "POST", body: JSON.stringify({ github_repo: githubRepo, manifest_url: manifestUrl, auto_check: true }) });
    closeModal();
    await checkForUpdates(true);
    await openUpdateCenter();
  });
}

async function openUpdateCenter() {
  if (!desktopUpdaterSupported()) return;
  const status = await checkForUpdates(true);
  if (!status) return;
  if (!status.configured && !status.downloaded) {
    await showUpdateConfiguration();
    return;
  }
  if (status.error) {
    showModal("Update source needs attention", `<div class="update-state error-state">${icon("alert", 24)}<div><strong>Unable to read the update channel</strong><p>${escapeHtml(status.error)}</p><p class="update-source">${escapeHtml(status.source_label || "")}</p></div></div>`, "Change Source", async () => { closeModal(); await showUpdateConfiguration(); });
    return;
  }
  if (!status.available) {
    showModal("Application is up to date", `<div class="update-state success-state">${icon("check", 24)}<div><strong>JOLI POLI Claw Closing v${escapeHtml(status.current_version)}</strong><p>You already have the latest available version.</p><p class="update-source">${escapeHtml(updateSourceLabel(status))}</p></div></div>`, "Close", async () => closeModal());
    return;
  }
  const notes = (status.release_notes || []).map(item => `<li>${escapeHtml(item)}</li>`).join("");
  const size = formatBytes(status.size);
  showModal(`Update v${status.version} available`, `<div class="update-state available-state">${icon("cloud-download", 26)}<div><strong>Ready to update automatically</strong><p>The application will preserve the Excel database, reports, backups, and your current work.</p></div></div><div class="update-details"><div><span>Installed</span><strong>v${escapeHtml(status.current_version)}</strong></div><div><span>Available</span><strong>v${escapeHtml(status.version)}</strong></div><div><span>Source</span><strong>${escapeHtml(updateSourceLabel(status))}</strong></div>${size ? `<div><span>Download</span><strong>${escapeHtml(size)}</strong></div>` : ""}</div>${notes ? `<div class="release-notes"><strong>What changed</strong><ul>${notes}</ul></div>` : ""}`, "Update Now", beginAutomaticUpdate);
}

function captureUpdateResume() {
  const resume = {
    saved_at: Date.now(),
    page: state.page,
    closing: state.closing,
    closing_id: state.closingId,
    closing_status: state.closingStatus,
    closing_read_only: state.closingReadOnly,
  };
  localStorage.setItem("clawClosingUpdateResume", JSON.stringify(resume));
}

async function restoreAfterUpdate() {
  const raw = localStorage.getItem("clawClosingUpdateResume");
  if (!raw) return false;
  localStorage.removeItem("clawClosingUpdateResume");
  try {
    const resume = JSON.parse(raw);
    if (!resume.saved_at || Date.now() - Number(resume.saved_at) > 24 * 60 * 60 * 1000) return false;
    if (resume.closing) {
      state.closing = resume.closing;
      state.closingId = resume.closing_id || null;
      state.closingStatus = resume.closing_status || "Draft";
      state.closingReadOnly = Boolean(resume.closing_read_only);
    }
    const page = pageMeta[resume.page] ? resume.page : "closing";
    if (page !== state.page) await navigate(page);
    else if (page === "closing" && state.closing) renderClosing();
    toast("Update completed", `JOLI POLI Claw Closing is now running v${state.bootstrap.app.version}.`);
    return true;
  } catch (_error) {
    return false;
  }
}

function showUpdatingScreen(version) {
  closeModal();
  document.body.insertAdjacentHTML("beforeend", `<div id="updateOverlay" class="update-overlay"><div class="update-progress-card"><div class="update-progress-icon">${icon("rotate-cw", 24)}</div><div><strong>Installing v${escapeHtml(version || "latest")}</strong><span>Saving your screen, updating the application, and restarting automatically…</span></div></div></div>`);
}

async function beginAutomaticUpdate() {
  if (!desktopUpdaterSupported()) throw new Error("Desktop software updates are unavailable in this browser workspace.");
  const status = state.updateStatus || await checkForUpdates(true);
  if (!status?.available) throw new Error("No newer update is available.");
  captureUpdateResume();
  showUpdatingScreen(status.version);
  try {
    if (!status.downloaded) {
      await api("/api/update/download", { method: "POST", body: "{}" });
    }
    await api("/api/update/apply", { method: "POST", body: "{}" });
  } catch (error) {
    document.getElementById("updateOverlay")?.remove();
    localStorage.removeItem("clawClosingUpdateResume");
    toast("Update failed", error.message, "error");
  }
}
function setMeta(page) {
  const [title, subtitle] = pageMeta[page];
  const shell = document.getElementById("appShell");
  if (shell) shell.dataset.activePage = page;
  document.getElementById("pageTitle").textContent = title;
  document.getElementById("pageSubtitle").textContent = subtitle;
  renderPrintButton();
}

const SIDEBAR_STORAGE_KEY = "clawClosingSidebarCollapsed";

function applySidebarState() {
  const shell = document.getElementById("appShell");
  const toggle = document.getElementById("sidebarToggle");
  if (!shell || !toggle) return;
  shell.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  const action = state.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar";
  toggle.innerHTML = icon(state.sidebarCollapsed ? "panel-left-open" : "panel-left-close", 18);
  toggle.setAttribute("aria-label", action);
  toggle.title = action;
}

function initialiseSidebar() {
  state.sidebarCollapsed = localStorage.getItem(SIDEBAR_STORAGE_KEY) !== "false";
  document.getElementById("sidebarToggle").addEventListener("click", () => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(state.sidebarCollapsed));
    applySidebarState();
  });
  applySidebarState();
}

function renderNav() {
  const nav = document.getElementById("sidebarNav");
  nav.innerHTML = navItems.map(([page, iconName, label]) => `<button class="nav-button ${state.page === page ? "active" : ""}" data-page="${page}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"><span class="nav-icon">${icon(iconName, 21)}</span><span class="nav-label">${escapeHtml(label)}</span></button>`).join("");
  nav.querySelectorAll("button").forEach(button => button.addEventListener("click", () => navigate(button.dataset.page)));
}

async function navigate(page, options = {}) {
  const { persist = true, forceRender = false } = options;
  if (!pageMeta[page]) return;
  if (state.page === page && !forceRender) {
    if (persist) saveUiNavigationState();
    return;
  }
  state.renderGeneration += 1;
  state.page = page;
  if (persist) saveUiNavigationState();
  document.querySelectorAll(".page").forEach(element => { element.hidden = element.id !== `page-${page}`; });
  setMeta(page);
  renderNav();
  setActions("");
  if (page === "dashboard") await renderDashboard();
  if (page === "closing") {
    if (String(state.closingStatus || "").toLowerCase() === "draft" && state.closing) renderClosing();
    else await ensureClosingPage();
  }
  if (page === "history") await renderHistory();
  if (page === "reports") await renderReports();
  if (page === "settings") await renderSettings();
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}


function canonicalMachineTypeName(value, machineId = "") {
  const text = String(value || "").trim();
  const aliases = new Map([
    ["claw / plush", "Claw"],
    ["claw/plush", "Claw"],
    ["claw", "Claw"],
    ["keychain", "Keychain"],
    ["roller", "Roller"],
  ]);
  if (text) return aliases.get(text.toLowerCase()) || text;
  const prefix = String(machineId || "").split("-", 1)[0].toUpperCase();
  return ({ CL: "Claw", KC: "Keychain", RL: "Roller" })[prefix] || "";
}

function configuredMachineTypes() {
  const settings = state.appSettings || state.bootstrap?.settings || {};
  const list = Array.isArray(settings.machine_types) ? settings.machine_types : [];
  return list.length ? list : [
    { name: "Claw", coins_per_play: 1 },
    { name: "Keychain", coins_per_play: 1 },
    { name: "Roller", coins_per_play: 3 },
  ];
}

function machineTypeRuleCoins(machineOrType) {
  const machineType = typeof machineOrType === "object"
    ? canonicalMachineTypeName(machineOrType?.machine_type || machineOrType?.Machine_Type, machineOrType?.machine_id || machineOrType?.Machine_ID)
    : canonicalMachineTypeName(machineOrType);
  const match = configuredMachineTypes().find(item => String(item.name || "").trim().toLowerCase() === machineType.toLowerCase());
  const coins = Number(match?.coins_per_play || 0);
  return Number.isFinite(coins) && coins > 0 ? coins : 0;
}

function businessSettingNumber(key, fallback) {
  const settings = state.appSettings || state.bootstrap?.settings || {};
  const value = Number(settings?.[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function exchangeRateKHR() { return businessSettingNumber("exchange_rate_usd_khr", 4100); }
function pricePerCoinUSD() { return businessSettingNumber("price_per_coin_usd", 0.3125); }

function machineTypeOptions(currentType = "", allowLegacy = false) {
  const canonicalCurrent = canonicalMachineTypeName(currentType);
  const items = configuredMachineTypes().map(item => String(item.name || "").trim()).filter(Boolean);
  if (allowLegacy && canonicalCurrent && !items.some(name => name.toLowerCase() === canonicalCurrent.toLowerCase())) items.push(canonicalCurrent);
  return items.map(name => `<option value="${escapeHtml(name)}" ${name.toLowerCase() === canonicalCurrent.toLowerCase() ? "selected" : ""}>${escapeHtml(name)}</option>`).join("");
}

function configuredMachineTypeRow(item = { name: "", coins_per_play: 1 }, editing = false) {
  const disabled = editing ? "" : "disabled";
  return `<div class="machine-type-setting-row ${editing ? "is-editing" : "is-view-only"}">
    <div class="field"><label>Machine Type</label><input class="input machine-type-name" value="${escapeHtml(item.name || "")}" placeholder="Example: Roller" ${disabled}></div>
    <div class="field"><label>Play Rule</label><div class="settings-equation compact"><span>1 Play</span><span>=</span><input class="input machine-type-coins" type="number" min="1" step="1" value="${escapeHtml(String(item.coins_per_play || 1))}" ${disabled}><span class="coin-unit">coin</span></div></div>
    ${editing ? `<button type="button" class="icon-button remove-machine-type" title="Remove machine type">${icon("trash", 16)}</button>` : '<span class="settings-row-spacer"></span>'}
  </div>`;
}

function readSettingsForm() {
  const machineTypes = [...document.querySelectorAll(".machine-type-setting-row")].map(row => ({
    name: row.querySelector(".machine-type-name").value.trim(),
    coins_per_play: row.querySelector(".machine-type-coins").value,
  }));
  return {
    exchange_rate_usd_khr: document.getElementById("settingExchangeRate")?.value,
    price_per_coin_usd: document.getElementById("settingCoinPrice")?.value,
    machine_types: machineTypes,
  };
}

function bindMachineTypeSettingRows() {
  const list = document.getElementById("machineTypeSettingList");
  if (!list) return;
  list.querySelectorAll(".remove-machine-type").forEach(button => {
    button.onclick = () => {
      if (list.querySelectorAll(".machine-type-setting-row").length <= 1) {
        toast("Machine type required", "Keep at least one machine type.", "error");
        return;
      }
      button.closest(".machine-type-setting-row")?.remove();
    };
  });
}

async function saveSettingsPayload(payload, message, section) {
  try {
    const result = await api("/api/settings", { method: "POST", body: JSON.stringify(payload) });
    state.appSettings = result.settings;
    if (state.bootstrap?.settings) Object.assign(state.bootstrap.settings, result.settings);
    if (section === "setup") state.settingsEdit.setup = false;
    if (section === "machineTypes") state.settingsEdit.machineTypes = false;
    toast("Settings saved", message);
    await renderSettings();
  } catch (error) {
    toast("Cannot save settings", error.message, "error");
  }
}

function saveSetupFromPage() {
  const form = readSettingsForm();
  return saveSettingsPayload({
    exchange_rate_usd_khr: form.exchange_rate_usd_khr,
    price_per_coin_usd: form.price_per_coin_usd,
  }, "Exchange rate and coin price were saved locally.", "setup");
}

function saveMachineTypesFromPage() {
  const form = readSettingsForm();
  return saveSettingsPayload({ machine_types: form.machine_types }, "Machine play rules were saved locally.", "machineTypes");
}

async function renderSettings() {
  setActions("");
  const page = document.getElementById("page-settings");
  try {
    const response = await api("/api/settings");
    state.appSettings = response.settings || {};
  } catch (error) {
    page.innerHTML = `<article class="card section-card"><div class="empty-state"><strong>Cannot load settings</strong><span>${escapeHtml(error.message)}</span></div></article>`;
    return;
  }

  const settings = state.appSettings || {};
  const machineTypes = configuredMachineTypes();
  const setupEditing = Boolean(state.settingsEdit.setup);
  const machineTypesEditing = Boolean(state.settingsEdit.machineTypes);
  const setupDisabled = setupEditing ? "" : "disabled";

  page.innerHTML = `<div class="settings-page">
    <article class="card section-card settings-card ${setupEditing ? "settings-editing" : "settings-view-only"}">
      <div class="section-heading settings-heading">
        <div><h2>Setup</h2><p>Configure the local currency and coin selling price used by JOLI POLI.</p></div>
        ${setupEditing
          ? `<button class="btn btn-primary" id="saveSetupSettings">${icon("check", 16)} Save</button>`
          : `<button class="btn btn-secondary" id="editSetupSettings">${icon("edit", 16)} Edit</button>`}
      </div>
      <div class="settings-form-grid">
        <div class="settings-control">
          <div class="settings-control-copy"><strong>Exchange rate (USD)</strong><span>Enter how many KHR equal 1 US dollar.</span></div>
          <div class="settings-equation"><span>1 USD</span><span>=</span><input id="settingExchangeRate" class="input" type="number" min="0.0001" step="0.01" value="${escapeHtml(String(settings.exchange_rate_usd_khr ?? 4100))}" ${setupDisabled}><span>KHR</span></div>
        </div>
        <div class="settings-control">
          <div class="settings-control-copy"><strong>Price / Coin</strong><span>Enter the USD selling price for one coin.</span></div>
          <div class="settings-equation"><span>1 Coin</span><span>=</span><input id="settingCoinPrice" class="input" type="number" min="0.0001" step="0.0001" value="${escapeHtml(String(settings.price_per_coin_usd ?? 0.3125))}" ${setupDisabled}><span>USD</span></div>
        </div>
      </div>
    </article>

    <article class="card section-card settings-card ${machineTypesEditing ? "settings-editing" : "settings-view-only"}">
      <div class="section-heading settings-heading">
        <div><h2>Type Machine</h2><p>Set how many coins are required for one play. Machine creation uses only types saved here.</p></div>
        <div class="settings-heading-actions">
          ${machineTypesEditing ? `<button class="btn btn-secondary" id="addMachineTypeSetting">${icon("plus", 16)} Add</button><button class="btn btn-primary" id="saveMachineTypeSettings">${icon("check", 16)} Save</button>` : `<button class="btn btn-secondary" id="editMachineTypeSettings">${icon("edit", 16)} Edit</button>`}
        </div>
      </div>
      <div id="machineTypeSettingList" class="machine-type-setting-list">${machineTypes.map(item => configuredMachineTypeRow(item, machineTypesEditing)).join("")}</div>
    </article>
  </div>`;

  if (setupEditing) {
    document.getElementById("saveSetupSettings").onclick = saveSetupFromPage;
    document.getElementById("settingExchangeRate")?.focus();
  } else {
    document.getElementById("editSetupSettings").onclick = () => { state.settingsEdit.setup = true; renderSettings(); };
  }

  if (machineTypesEditing) {
    bindMachineTypeSettingRows();
    document.getElementById("addMachineTypeSetting").onclick = () => {
      const list = document.getElementById("machineTypeSettingList");
      list.insertAdjacentHTML("beforeend", configuredMachineTypeRow({ name: "", coins_per_play: 1 }, true));
      bindMachineTypeSettingRows();
      list.querySelector(".machine-type-setting-row:last-child .machine-type-name")?.focus();
    };
    document.getElementById("saveMachineTypeSettings").onclick = saveMachineTypesFromPage;
  } else {
    document.getElementById("editMachineTypeSettings").onclick = () => { state.settingsEdit.machineTypes = true; renderSettings(); };
  }
}

function kpiCard(label, value, iconName, accent, soft, caption = "") {
  return `<article class="card kpi-card" style="--accent:${accent};--soft:${soft}"><div class="kpi-top"><span class="kpi-label">${label}</span><span class="kpi-icon">${icon(iconName, 17)}</span></div><div class="kpi-value">${value}</div>${caption ? `<div class="kpi-caption">${caption}</div>` : ""}</article>`;
}

function closingStatusPill(status) {
  const normalized = String(status || "Draft").toLowerCase();
  const className = normalized.includes("final") ? "status-finalized" : normalized.includes("balance") ? "status-balanced" : normalized.includes("work") ? "status-working" : normalized.includes("active") ? "status-active" : normalized.includes("draft") ? "status-draft" : "status-variance";
  return `<span class="status-pill ${className}">${escapeHtml(status || "—")}</span>`;
}

async function renderDashboardLegacyV2200() {
  setActions("");
  const data = await api("/api/dashboard");
  const summary = data.summary || {};
  const latest = summary.latest || {};
  const page = document.getElementById("page-dashboard");
  page.innerHTML = `
    <div class="kpi-grid">
      ${kpiCard("Month Sales", money(summary.month_total_sales), "circle-dollar-sign", "#2f6bff", "#eef4ff", `${number(summary.month_closings)} finalized closings`)}
      ${kpiCard("Coins Played", number(summary.month_coins), "coins", "#10a8c4", "#ebfbfe", "Current month")}
      ${kpiCard("Prizes Won", number(summary.month_prizes), "gift", "#f63d68", "#fff0f4", "Current month")}
      ${kpiCard("Latest Sales", money(latest.Total_Sales), "circle-dollar-sign", "#7a4dff", "#f4f0ff", latest.Report_Date || "No closing yet")}
      ${kpiCard("Latest Variance", `${Number(latest.Coin_Variance || 0) >= 0 ? "+" : ""}${number(latest.Coin_Variance)}`, "scale", "#079455", "#ecfdf3", latest.Closing_Status || "No closing yet")}
      ${kpiCard("Revenue / Prize", money(latest.Average_Revenue_Per_Prize), "gift", "#ef7d00", "#fff4e8", "Latest finalized closing")}
    </div>
    <div class="dashboard-grid">
      <article class="card summary-panel">
        <h2>Latest finalized closing</h2><p>Financial control and machine performance at a glance</p>
        ${latest.Closing_ID ? `<div class="latest-closing"><div class="metric"><span>Closing ID</span><strong>${escapeHtml(latest.Closing_ID)}</strong></div><div class="metric"><span>Total transactions</span><strong>${number(latest.Total_Transactions)}</strong></div><div class="metric"><span>Coins per prize</span><strong>${number(latest.Average_Coins_Per_Prize, 2)}</strong></div><div class="metric"><span>Closed by</span><strong>${escapeHtml(latest.Closed_By || "—")}</strong></div><div class="metric"><span>Verified by</span><strong>${escapeHtml(latest.Verified_By || "—")}</strong></div><div class="metric"><span>Status</span><strong>${closingStatusPill(latest.Closing_Status)}</strong></div></div>` : `<div class="table-empty">No finalized closing is available yet.</div>`}
      </article>
      <article class="card section-card">
        <div class="section-heading"><div><h2>Recent closing activity</h2><p>Latest drafts and finalized records</p></div></div>
        <div class="data-table-wrap"><table class="data-table" style="min-width:560px"><thead><tr><th>Date</th><th>ID</th><th>Sales</th><th>Status</th></tr></thead><tbody>${(data.recent_closings || []).slice(0,7).map(row => `<tr data-closing-id="${escapeHtml(row.Closing_ID)}"><td>${escapeHtml(row.Report_Date || "")}</td><td>${escapeHtml(row.Closing_ID || "")}</td><td>${money(row.Total_Sales)}</td><td>${closingStatusPill(row.Workflow_Status)}</td></tr>`).join("") || `<tr><td colspan="4" class="table-empty">No closing records yet.</td></tr>`}</tbody></table></div>
      </article>
    </div>`;
  page.querySelectorAll("tr[data-closing-id]").forEach(row => row.addEventListener("dblclick", () => openClosing(row.dataset.closingId)));
}

let dashboardFilters = null;
let dashboardView = "outcomes";
let dashboardFilterPanelOpen = false;
let dashboardData = null;
let dashboardDataKey = "";
let dashboardDetailState = { search: "", storeId: "all", minimum: "", week: 1, sortKey: "total", direction: "desc" };
let primaryOutcomesSalesData = null;
let primaryOutcomesSalesKey = "";
let primaryOutcomesSalesLoading = false;
let primaryOutcomesSalesError = null;
let primaryOutcomesSalesRequest = 0;
let primaryOutcomesSalesChartSize = { width: 0, height: 0 };
let primaryOutcomesSalesChartResizeObserver = null;
let primaryOutcomesSalesAnimatedKey = "";
let primaryOutcomesSalesAnimationFrame = 0;

function dashboardDefaultFilters() {
  return { ...dashboardCalendarMonthRange(), store_id: "all" };
}

function dashboardCalendarMonthRange(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const format = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return { from: format(new Date(year, month, 1)), to: format(new Date(year, month + 1, 0)) };
}

function dashboardDateLabel(value, weekday = false) {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("en-GB", weekday ? { weekday: "short" } : { day: "2-digit", month: "short" }).format(date);
}

function dashboardStoreDailySalesValue(value) {
  const sales = Number(value);
  return Number.isFinite(sales) && sales > 0 ? dashboardReferenceMoney(sales, true) : "";
}

function dashboardStoreDailyTrend(currentValue, previousValue) {
  const current = Number(currentValue), previous = Number(previousValue);
  if (!Number.isFinite(current) || !Number.isFinite(previous) || current <= 0 || previous <= 0 || current === previous) return "";
  return current > previous ? "up" : "down";
}

function dashboardReferenceMoney(value, compact = false) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", notation: compact ? "compact" : "standard",
    minimumFractionDigits: compact ? 0 : 2, maximumFractionDigits: compact ? 1 : 2,
  }).format(Number(value || 0));
}

function dashboardKpiCard(label, value, iconName, tone) {
  return `<article data-kpi-card data-kpi-presentation="dashboard" class="dashboard-stat-card dashboard-kpi-${tone}"><div class="dashboard-kpi-content"><span class="dashboard-kpi-accent" aria-hidden="true"></span><div class="dashboard-kpi-copy"><span class="dashboard-kpi-label">${escapeHtml(label)}</span><strong class="dashboard-kpi-value">${escapeHtml(value)}</strong></div><span class="dashboard-kpi-icon-tile" aria-hidden="true">${icon(iconName, 15)}</span></div></article>`;
}

function dashboardResponse(data) {
  const kpis = data?.kpis;
  const numericKpis = ["total_sales", "quantity", "average_per_product", "discount"];
  const validTrend = Array.isArray(data?.daily_trend) && data.daily_trend.every(row => /^\d{4}-\d{2}-\d{2}$/.test(String(row?.date || "")) && Number.isFinite(Number(row?.sales)));
  const validStores = Array.isArray(data?.store_performance) && data.store_performance.every(row => /^\d{4}-\d{2}-\d{2}$/.test(String(row?.date || "")) && String(row?.store_id || "") && typeof row?.store_code === "string" && typeof row?.store_name === "string" && ["total_sales", "quantity", "average_per_product", "discount"].every(key => Number.isFinite(Number(row?.[key]))));
  if (typeof data?.has_data !== "boolean" || !kpis || !numericKpis.every(key => Number.isFinite(Number(kpis[key]))) || !validTrend || !validStores) throw new Error("Dashboard response is incomplete.");
  return data;
}

function primaryOutcomesSalesDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date).replace(/ /g, "-");
}

function primaryOutcomesSalesDay(value) { return String(Number(String(value).slice(8, 10))); }

function primaryOutcomesSalesValidDate(value) {
  const text = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return date.getUTCFullYear() === Number(text.slice(0, 4)) && date.getUTCMonth() === Number(text.slice(5, 7)) - 1 && date.getUTCDate() === Number(text.slice(8, 10));
}

function primaryOutcomesSalesUnit(value) {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(value, 1)));
  const normalized = value / magnitude;
  return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
}

function primaryOutcomesSalesAxis(values) {
  const largest = Math.max(0, ...values.map(value => Number(value) || 0));
  const step = primaryOutcomesSalesUnit((largest || 1) / 4);
  const intervals = Math.max(4, Math.ceil(largest / step));
  const maximum = intervals * step;
  return { maximum, ticks: Array.from({ length: intervals + 1 }, (_, index) => Number((index * step).toFixed(8))) };
}

function primaryOutcomesSalesSpline(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
  if (points.length === 2) return `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}L${points[1].x.toFixed(2)},${points[1].y.toFixed(2)}`;
  const slopes = points.slice(0, -1).map((point, index) => (points[index + 1].y - point.y) / (points[index + 1].x - point.x));
  const tangents = points.map((point, index) => {
    if (index === 0) return slopes[0];
    if (index === points.length - 1) return slopes.at(-1);
    const previous = slopes[index - 1], next = slopes[index];
    if (previous * next <= 0) return 0;
    const previousWidth = point.x - points[index - 1].x, nextWidth = points[index + 1].x - point.x;
    return (previousWidth + nextWidth) / ((2 * nextWidth + previousWidth) / previous + (nextWidth + 2 * previousWidth) / next);
  });
  let path = `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index], next = points[index + 1], width = next.x - current.x;
    path += `C${(current.x + width / 3).toFixed(2)},${(current.y + tangents[index] * width / 3).toFixed(2)} ${(next.x - width / 3).toFixed(2)},${(next.y - tangents[index + 1] * width / 3).toFixed(2)} ${next.x.toFixed(2)},${next.y.toFixed(2)}`;
  }
  return path;
}

function primaryOutcomesSalesLabels(length) {
  return Array.from({ length: Math.max(0, Number(length) || 0) }, (_, index) => index);
}

function renderPrimaryOutcomesSalesChart(rows, animationKey) {
  const width = primaryOutcomesSalesChartSize.width || 960, height = primaryOutcomesSalesChartSize.height || 270, left = 52, right = 16, top = 14, bottom = 36;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const numericRows = rows.filter(row => typeof row.sales === "number" && Number.isFinite(row.sales));
  const axis = primaryOutcomesSalesAxis(numericRows.map(row => row.sales));
  const points = rows.map((row, index) => ({ row, x: rows.length === 1 ? left + plotWidth / 2 : left + plotWidth * index / (rows.length - 1), y: typeof row.sales === "number" && Number.isFinite(row.sales) ? top + plotHeight - Math.max(0, row.sales) / axis.maximum * plotHeight : null }));
  const segments = [];
  points.forEach((point, index) => {
    if (point.y === null) return;
    if (index > 0 && points[index - 1].y !== null) segments.at(-1).push(point);
    else segments.push([point]);
  });
  const paths = segments.map(segment => {
    const line = primaryOutcomesSalesSpline(segment);
    return { line, area: `${line}L${segment.at(-1).x.toFixed(2)},${top + plotHeight}L${segment[0].x.toFixed(2)},${top + plotHeight}Z` };
  });
  const xLabels = primaryOutcomesSalesLabels(rows.length).map(index => {
    const point = points[index];
    return `<text class="primary-outcomes-daily-sales-label" x="${point.x}" y="${height - 9}" text-anchor="middle">${escapeHtml(primaryOutcomesSalesDay(point.row.date))}</text>`;
  }).join("");
  const grids = axis.ticks.map(tick => `<line x1="${left}" y1="${top + plotHeight - plotHeight * tick / axis.maximum}" x2="${width - right}" y2="${top + plotHeight - plotHeight * tick / axis.maximum}"/><text class="primary-outcomes-daily-sales-label" x="${left - 10}" y="${top + plotHeight - plotHeight * tick / axis.maximum + 4}" text-anchor="end">${escapeHtml(dashboardReferenceMoney(tick, true))}</text>`).join("");
  const hitTargets = points.filter(point => point.y !== null).map(point => `<g data-primary-sales-key="${escapeHtml(point.row.date)}"><line class="primary-outcomes-daily-sales-guide" x1="${point.x}" x2="${point.x}" y1="${top}" y2="${top + plotHeight}" hidden/><circle class="primary-outcomes-daily-sales-hover" cx="${point.x}" cy="${point.y}" r="0"/><circle class="primary-outcomes-daily-sales-target" cx="${point.x}" cy="${point.y}" r="14" data-primary-sales-date="${escapeHtml(primaryOutcomesSalesDate(point.row.date))}" data-primary-sales-value="${escapeHtml(dashboardReferenceMoney(point.row.sales))}"/></g>`).join("");
  const awaitingAnimation = animationKey !== primaryOutcomesSalesAnimatedKey ? " is-awaiting-animation" : "";
  return `<div class="primary-outcomes-daily-sales-plot"><div class="primary-outcomes-daily-sales-canvas"><svg class="primary-outcomes-daily-sales-svg${awaitingAnimation}" data-primary-sales-animation-key="${escapeHtml(animationKey)}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily Sales Trend"><defs><linearGradient id="primaryOutcomesSalesArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2563a6" stop-opacity=".18"/><stop offset="1" stop-color="#2563a6" stop-opacity="0"/></linearGradient></defs><g class="primary-outcomes-daily-sales-grid">${grids}</g><g class="primary-outcomes-daily-sales-series">${paths.map(path => `<path class="primary-outcomes-daily-sales-fill" d="${path.area}"/><path class="primary-outcomes-daily-sales-line-shadow" d="${path.line}"/><path class="primary-outcomes-daily-sales-line" d="${path.line}"/>`).join("")}</g><g class="primary-outcomes-daily-sales-x-axis">${xLabels}</g><g class="primary-outcomes-daily-sales-interaction">${hitTargets}</g></svg><aside class="primary-outcomes-daily-sales-tooltip" role="status" hidden></aside></div></div>`;
}

function schedulePrimaryOutcomesSalesAnimation(host, animationKey) {
  if (!animationKey || animationKey === primaryOutcomesSalesAnimatedKey) return;
  cancelAnimationFrame(primaryOutcomesSalesAnimationFrame);
  primaryOutcomesSalesAnimationFrame = requestAnimationFrame(() => {
    const chart = host?.querySelector(`.primary-outcomes-daily-sales-svg[data-primary-sales-animation-key="${CSS.escape(animationKey)}"]`);
    if (!chart || animationKey === primaryOutcomesSalesAnimatedKey) return;
    const paths = [...chart.querySelectorAll(".primary-outcomes-daily-sales-line-shadow,.primary-outcomes-daily-sales-line")];
    const fills = [...chart.querySelectorAll(".primary-outcomes-daily-sales-fill")];
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reducedMotion || !paths.length) {
      chart.classList.remove("is-awaiting-animation");
      primaryOutcomesSalesAnimatedKey = animationKey;
      return;
    }
    paths.forEach(path => {
      const length = path.getTotalLength();
      path.style.strokeDasharray = `${length}`;
      path.style.strokeDashoffset = `${length}`;
      path.style.transition = "none";
    });
    fills.forEach(fill => { fill.style.opacity = "0"; fill.style.transition = "none"; });
    chart.classList.remove("is-awaiting-animation");
    void chart.getBoundingClientRect();
    requestAnimationFrame(() => {
      paths.forEach(path => { path.style.transition = "stroke-dashoffset 900ms cubic-bezier(.22,1,.36,1)"; path.style.strokeDashoffset = "0"; });
      fills.forEach(fill => { fill.style.transition = "opacity 600ms cubic-bezier(.16,1,.3,1) 120ms"; fill.style.opacity = "1"; });
      primaryOutcomesSalesAnimatedKey = animationKey;
    });
  });
}

function observePrimaryOutcomesSalesChart(host) {
  const canvas = host?.querySelector(".primary-outcomes-daily-sales-canvas");
  if (!canvas) return;
  const syncSize = () => {
    const rect = canvas.getBoundingClientRect();
    const width = Math.round(rect.width * 100) / 100, height = Math.round(rect.height * 100) / 100;
    if (width < 1 || height < 1 || (width === primaryOutcomesSalesChartSize.width && height === primaryOutcomesSalesChartSize.height)) return;
    primaryOutcomesSalesChartSize = { width, height };
    renderDashboardCached();
  };
  primaryOutcomesSalesChartResizeObserver?.disconnect();
  if (typeof ResizeObserver === "function") {
    primaryOutcomesSalesChartResizeObserver = new ResizeObserver(syncSize);
    primaryOutcomesSalesChartResizeObserver.observe(canvas);
  } else window.addEventListener("resize", syncSize, { once: true });
  syncSize();
}

function bindPrimaryOutcomesSalesTooltip(host) {
  const tooltip = host?.querySelector(".primary-outcomes-daily-sales-tooltip");
  const frame = host?.querySelector(".primary-outcomes-daily-sales-canvas");
  if (!tooltip || !frame) return;
  const hide = () => { tooltip.hidden = true; };
  host.querySelectorAll(".primary-outcomes-daily-sales-target").forEach(point => {
    point.addEventListener("pointerenter", event => {
      point.previousElementSibling?.classList.add("is-active");
      point.parentElement?.querySelector(".primary-outcomes-daily-sales-guide")?.removeAttribute("hidden");
      const rect = frame.getBoundingClientRect();
      tooltip.innerHTML = `<strong>${escapeHtml(point.dataset.primarySalesDate || "")}</strong><span><em>Sales</em><b>${escapeHtml(point.dataset.primarySalesValue || "$0.00")}</b></span>`;
      tooltip.hidden = false;
      tooltip.style.left = `${Math.max(8, Math.min(rect.width - 136, event.clientX - rect.left - 62))}px`;
      tooltip.style.top = `${Math.max(8, event.clientY - rect.top - 76)}px`;
    });
    point.addEventListener("pointerleave", () => { point.previousElementSibling?.classList.remove("is-active"); point.parentElement?.querySelector(".primary-outcomes-daily-sales-guide")?.setAttribute("hidden", ""); hide(); });
  });
}

function primaryOutcomesSalesResponse(data) {
  const period = data?.period;
  const validRows = Array.isArray(data?.rows) && data.rows.every(row => primaryOutcomesSalesValidDate(row?.date) && (row?.sales === null || Number.isFinite(row?.sales)));
  const total = Number(data?.totalSales);
  const calculatedTotal = validRows ? data.rows.reduce((sum, row) => sum + (typeof row.sales === "number" ? row.sales : 0), 0) : NaN;
  if (!period || !primaryOutcomesSalesValidDate(period.dateFrom) || !primaryOutcomesSalesValidDate(period.dateTo) || typeof period.label !== "string" || !Number.isInteger(period.dayCount) || period.dayCount < 1 || typeof period.isFullMonth !== "boolean" || !Number.isFinite(total) || !validRows || period.dayCount !== data.rows.length || Math.abs(calculatedTotal - total) > .005 || typeof data?.hasData !== "boolean") throw new Error("Daily Sales Trend response is incomplete.");
  return data;
}

function primaryOutcomesSalesDataKey(filters) { return `${filters.store_id || "all"}|${filters.from}|${filters.to}`; }

function renderPrimaryOutcomesDailySalesTrend(filters) {
  const overview = primaryOutcomesSalesKey === primaryOutcomesSalesDataKey(filters) ? primaryOutcomesSalesData : null;
  const period = overview?.period;
  const dayCount = period?.dayCount || 30;
  const header = `<header class="primary-outcomes-daily-sales-header"><div><h2>Daily Sales Trend</h2><p>${dayCount}-day sales overview</p>${period ? `<small>Showing ${escapeHtml(primaryOutcomesSalesDate(period.dateFrom))} to ${escapeHtml(primaryOutcomesSalesDate(period.dateTo))}</small>` : ""}</div><div class="primary-outcomes-daily-sales-badges"><span>${dayCount} days</span>${period ? `<b>${escapeHtml(period.label)}</b>` : ""}</div></header>`;
  if (!overview && primaryOutcomesSalesLoading) return `<article class="primary-outcomes-daily-sales" data-primary-outcomes-daily-sales>${header}<div class="primary-outcomes-daily-sales-loading" aria-label="Loading Daily Sales Trend"><span></span><span></span><i></i></div></article>`;
  if (!overview && primaryOutcomesSalesError) return `<article class="primary-outcomes-daily-sales" data-primary-outcomes-daily-sales>${header}<div class="primary-outcomes-daily-sales-unavailable"><strong>Daily Sales Trend is temporarily unavailable</strong><button class="btn btn-secondary" id="primaryOutcomesSalesRetry" type="button">Retry</button></div></article>`;
  if (!overview) return "";
  const content = overview.hasData ? renderPrimaryOutcomesSalesChart(overview.rows, primaryOutcomesSalesDataKey(filters)) : `<div class="primary-outcomes-daily-sales-empty"><strong>No sales recorded for ${escapeHtml(period.label)}</strong></div>`;
  return `<article class="primary-outcomes-daily-sales" data-primary-outcomes-daily-sales>${header}${content}</article>`;
}

async function loadPrimaryOutcomesSales(filters, retry = false) {
  const renderGeneration = state.renderGeneration;
  const key = primaryOutcomesSalesDataKey(filters);
  if (!retry && primaryOutcomesSalesKey === key && primaryOutcomesSalesData && !primaryOutcomesSalesError) return;
  const request = ++primaryOutcomesSalesRequest;
  primaryOutcomesSalesLoading = true;
  primaryOutcomesSalesError = null;
  renderDashboardCached();
  try {
    const query = new URLSearchParams({ from: filters.from, to: filters.to, store_id: filters.store_id || "all" });
    const data = primaryOutcomesSalesResponse(await api(`/api/analytics/dashboard/daily-trend?${query.toString()}`));
    if (request !== primaryOutcomesSalesRequest || renderGeneration !== state.renderGeneration || state.page !== "dashboard") return;
    primaryOutcomesSalesData = data;
    primaryOutcomesSalesKey = key;
  } catch (error) {
    if (request !== primaryOutcomesSalesRequest || renderGeneration !== state.renderGeneration || state.page !== "dashboard") return;
    primaryOutcomesSalesError = error;
  } finally {
    if (request === primaryOutcomesSalesRequest) {
      primaryOutcomesSalesLoading = false;
      if (renderGeneration === state.renderGeneration && state.page === "dashboard") renderDashboardCached();
    }
  }
}

function dashboardStoreOptions() {
  const role = cloudProfileRoleV2186();
  const stores = activeCloudOutletsV2186();
  const active = activeCloudStoreV2186();
  const fixedOutlet = role === "outlet";
  if (!dashboardFilters) dashboardFilters = dashboardDefaultFilters();
  if (fixedOutlet) dashboardFilters.store_id = String(active?.id || stores[0]?.id || "");
  if (!fixedOutlet && dashboardFilters.store_id !== "all" && !stores.some(store => String(store.id) === String(dashboardFilters.store_id))) dashboardFilters.store_id = "all";
  const options = fixedOutlet
    ? stores.filter(store => String(store.id) === String(dashboardFilters.store_id))
    : [{ id: "all", name: "All Stores" }, ...stores];
  return { role, stores, fixedOutlet, options };
}

function dashboardStoreMatrix(rows) {
  const dates = [...new Set(rows.map(row => String(row.date)))];
  // Reference StoreByDateTable uses W1–W5 as scroll shortcuts.  Keep every
  // month date mounted in the centre pane; never slice the matrix columns.
  const weeks = Array.from({ length: Math.ceil(dates.length / 7) }, (_, index) => ({ number: index + 1, dates: dates.slice(index * 7, index * 7 + 7) }));
  const weekLabels = ["W1", "W2", "W3", "W4", "W5"];
  const activeWeek = weeks[Math.max(0, Math.min(weeks.length - 1, Number(dashboardDetailState.week || 1) - 1))] || { number: 1, dates };
  const visibleDates = dates;
  const outletWidth = 156, dateWidth = 112, totalWidth = 156;
  const stores = new Map();
  rows.forEach(row => {
    const id = String(row.store_id);
    if (!stores.has(id)) stores.set(id, { id, name: String(row.store_name || row.store_code || "Store"), cells: new Map() });
    stores.get(id).cells.set(String(row.date), Number(row.total_sales || 0));
  });
  const query = dashboardDetailState.search.trim().toLowerCase();
  const minimum = Number(dashboardDetailState.minimum || 0);
  const totalFor = outlet => dates.reduce((sum, date) => sum + Number(outlet.cells.get(date) || 0), 0);
  const outlets = [...stores.values()].filter(outlet => (!query || `${outlet.name} ${outlet.id}`.toLowerCase().includes(query)) && (dashboardDetailState.storeId === "all" || outlet.id === dashboardDetailState.storeId) && totalFor(outlet) >= minimum);
  const sortKey = dashboardDetailState.sortKey;
  const direction = dashboardDetailState.direction === "asc" ? 1 : -1;
  outlets.sort((left, right) => {
    const leftValue = sortKey === "outlet" ? left.name : sortKey === "total" ? totalFor(left) : Number(left.cells.get(sortKey) || 0);
    const rightValue = sortKey === "outlet" ? right.name : sortKey === "total" ? totalFor(right) : Number(right.cells.get(sortKey) || 0);
    return (typeof leftValue === "string" ? leftValue.localeCompare(rightValue) : leftValue - rightValue) * direction;
  });
  const grandTotal = outlets.reduce((sum, outlet) => sum + totalFor(outlet), 0);
  const sortIcon = key => icon(sortKey !== key ? "chevrons-up-down" : direction === 1 ? "arrow-up" : "arrow-down", 14);
  const range = activeWeek.dates.length ? `W${activeWeek.number} · ${isoToDisplayDate(activeWeek.dates[0])} to ${isoToDisplayDate(activeWeek.dates.at(-1))}` : "";
  const trend = (outlet, date, index) => {
    if (index === 0) return "";
    const direction = dashboardStoreDailyTrend(outlet.cells.get(date), outlet.cells.get(visibleDates[index - 1]));
    return direction ? `<span class="dashboard-store-trend is-${direction}" aria-label="${direction === "up" ? "Sales increased" : "Sales decreased"}">${icon(direction === "up" ? "arrow-up" : "arrow-down", 13)}</span>` : "";
  };
  const moneyCell = value => dashboardReferenceMoney(value, true);
  const dateTotals = date => moneyCell(outlets.reduce((sum, outlet) => sum + Number(outlet.cells.get(date) || 0), 0));
  return `<article class="dashboard-store-sales-card" data-dashboard-store-detail><header class="dashboard-store-sales-header"><div><h2>Store Sales Performance by Date</h2></div><div class="dashboard-store-detail-toolbar"><label class="dashboard-store-search">${icon("search", 14)}<input id="dashboardStoreSearch" class="input" value="${escapeHtml(dashboardDetailState.search)}" placeholder="Search outlet..." aria-label="Search outlet"></label><select id="dashboardStoreLocal" class="select" aria-label="Store detail outlet"><option value="all">All</option>${[...stores.values()].map(outlet => `<option value="${escapeHtml(outlet.id)}" ${outlet.id === dashboardDetailState.storeId ? "selected" : ""}>${escapeHtml(outlet.name)}</option>`).join("")}</select><input id="dashboardMinimumTotal" class="input dashboard-minimum-total" inputmode="decimal" value="${escapeHtml(dashboardDetailState.minimum)}" placeholder="Minimum month total (>= 100)" aria-label="Minimum month total"></div><span class="dashboard-display-range">${icon("calendar", 14)}Displaying: ${escapeHtml(isoToDisplayDate(dates[0] || ""))} to ${escapeHtml(isoToDisplayDate(dates.at(-1) || ""))}</span></header><div class="dashboard-store-week-row" role="group" aria-label="Displayed week">${weeks.map((week, index) => `<button type="button" class="dashboard-week-button ${week.number === activeWeek.number ? "is-active" : ""}" data-dashboard-week="${week.number}" aria-pressed="${week.number === activeWeek.number}">${weekLabels[index] || `W${week.number}`}</button>`).join("")}<span class="dashboard-week-range">${escapeHtml(range)}</span></div><div data-store-sales-grid class="dashboard-store-sales-grid"><div class="dashboard-store-outlet-pane"><table><thead><tr><th class="dashboard-store-grid-header"><button type="button" class="dashboard-sort-header" data-dashboard-sort="outlet">Outlet${sortIcon("outlet")}</button></th></tr></thead><tbody>${outlets.map(outlet => `<tr class="dashboard-store-grid-row"><td class="dashboard-store-grid-cell" title="${escapeHtml(outlet.name)}">${escapeHtml(outlet.name)}</td></tr>`).join("") || `<tr><td class="dashboard-store-grid-cell dashboard-store-empty">No outlet sales found.</td></tr>`}</tbody><tfoot><tr><td class="dashboard-store-grid-summary">Grand Total</td></tr></tfoot></table></div><div class="dashboard-store-date-pane" tabindex="0"><table class="dashboard-store-date-table" style="width:${visibleDates.length * dateWidth}px;min-width:${visibleDates.length * dateWidth}px"><thead><tr>${visibleDates.map(date => `<th class="dashboard-store-grid-header"><button type="button" class="dashboard-sort-header dashboard-store-date-sort" data-dashboard-sort="${escapeHtml(date)}"><span class="dashboard-store-date-heading"><span>${escapeHtml(dashboardDateLabel(date))}</span><small>${escapeHtml(dashboardDateLabel(date, true))}</small></span>${sortIcon(date)}</button></th>`).join("")}</tr></thead><tbody>${outlets.map(outlet => `<tr class="dashboard-store-grid-row">${visibleDates.map((date, index) => `<td class="dashboard-store-grid-cell"><span class="dashboard-store-daily-value">${dashboardStoreDailySalesValue(outlet.cells.get(date))}</span>${trend(outlet, date, index)}</td>`).join("")}</tr>`).join("") || `<tr><td class="dashboard-store-grid-cell dashboard-store-empty" colspan="${Math.max(1, visibleDates.length)}">No outlet sales found.</td></tr>`}</tbody><tfoot><tr>${visibleDates.map(date => `<td class="dashboard-store-grid-summary">${dateTotals(date)}</td>`).join("")}</tr></tfoot></table></div><div class="dashboard-store-total-pane"><table><thead><tr><th class="dashboard-store-grid-header"><button type="button" class="dashboard-sort-header" data-dashboard-sort="total">Month Total${sortIcon("total")}</button></th></tr></thead><tbody>${outlets.map(outlet => `<tr class="dashboard-store-grid-row"><td class="dashboard-store-grid-cell">${moneyCell(totalFor(outlet))}</td></tr>`).join("") || `<tr><td class="dashboard-store-grid-cell dashboard-store-empty">—</td></tr>`}</tbody><tfoot><tr><td class="dashboard-store-grid-summary">${moneyCell(grandTotal)}</td></tr></tfoot></table></div></div></article>`;
}

function dashboardShell(fixedOutlet, options, filters) {
  const tab = (id, label) => `<button type="button" class="dashboard-view-tab ${dashboardView === id ? "is-active" : ""}" data-dashboard-view="${id}" aria-pressed="${dashboardView === id}">${label}</button>`;
  return `<div data-dashboard-page class="dashboard-page"><header class="dashboard-page-controls"><nav class="dashboard-view-tabs" aria-label="Dashboard views">${tab("outcomes", "Primary Outcomes")}${tab("store", "Store Detail")}</nav><button type="button" id="dashboardFiltersToggle" class="dashboard-filters-toggle ${dashboardFilterPanelOpen ? "is-active" : ""}" aria-expanded="${dashboardFilterPanelOpen}">${icon("sliders-horizontal", 14)}Filters Active</button></header>${dashboardFilterPanelOpen ? `<section data-filter-toolbar class="dashboard-filter-toolbar" aria-label="Dashboard filters"><div class="dashboard-filters"><label><span>Date From</span><input id="dashboardFrom" class="input" value="${escapeHtml(dateDisplay(filters.from))}" inputmode="numeric" placeholder="DD-MM-YYYY" aria-label="Date From"></label><label><span>Date To</span><input id="dashboardTo" class="input" value="${escapeHtml(dateDisplay(filters.to))}" inputmode="numeric" placeholder="DD-MM-YYYY" aria-label="Date To"></label><label><span>Store</span><select id="dashboardStore" class="select" ${fixedOutlet ? "disabled" : ""}>${options.map(store => `<option value="${escapeHtml(store.id)}" ${String(store.id) === String(filters.store_id) ? "selected" : ""}>${escapeHtml(store.name || store.code || "Store")}</option>`).join("")}</select></label></div><div class="dashboard-filter-actions"><button class="btn btn-primary" id="dashboardApply" type="button">Apply</button><button class="btn btn-secondary" id="dashboardReset" type="button">Reset</button></div></section>` : ""}<div id="dashboardResult" class="dashboard-result-loading" role="status" aria-label="Loading dashboard"><span class="loading-dots" aria-hidden="true"><span></span><span></span><span></span></span><span class="claw-sr-only">Loading dashboard</span></div></div>`;
}

function dashboardPrimaryOutcomes(data, filters) {
  const kpis = data.kpis;
  return `<section class="dashboard-fixed-layout"><section class="dashboard-system-section"><p class="dashboard-section-label">Primary outcomes</p><div data-kpi-tier="primary" class="dashboard-kpi-grid">${dashboardKpiCard("Sales", money(kpis.total_sales), "circle-dollar-sign", "sales")}${dashboardKpiCard("QTY", number(kpis.quantity), "boxes", "quantity")}${dashboardKpiCard("AVG / Product", money(kpis.average_per_product), "chart-column", "average")}${dashboardKpiCard("Discount", money(kpis.discount), "percent", "discount")}</div>${renderPrimaryOutcomesDailySalesTrend(filters)}</section></section>`;
}

function dashboardPanelMarkup(data, filters) {
  const kpis = data.kpis, stores = data.store_performance, hasData = data.has_data === true;
  if (dashboardView === "outcomes") return dashboardPrimaryOutcomes(data, filters);
  if (dashboardView === "store") return `<section class="dashboard-fixed-layout"><section class="dashboard-system-section">${hasData ? dashboardStoreMatrix(stores) : `<article class="dashboard-store-sales-card"><header class="dashboard-store-sales-header"><h2>Store Sales Performance by Date</h2></header><div class="dashboard-empty"><span class="dashboard-empty-icon">${icon("chart-column", 16)}</span><strong>No finalized closing data for this period.</strong></div></article>`}</section></section>`;
  return "";
}

function bindDashboardDetailControls() {
  document.querySelectorAll("[data-dashboard-week]").forEach(button => button.addEventListener("click", () => {
    dashboardDetailState.week = Number(button.dataset.dashboardWeek || 1);
    renderDashboardCached();
    requestAnimationFrame(() => {
      const pane = document.querySelector(".dashboard-store-date-pane");
      const headers = [...document.querySelectorAll(".dashboard-store-date-table .dashboard-store-grid-header")];
      const target = headers[(dashboardDetailState.week - 1) * 7];
      if (pane && target) pane.scrollTo({ left: Math.max(0, target.offsetLeft - 8), behavior: "smooth" });
    });
  }));
  document.querySelectorAll("[data-dashboard-sort]").forEach(button => button.addEventListener("click", () => { const key = button.dataset.dashboardSort; dashboardDetailState = { ...dashboardDetailState, sortKey: key, direction: dashboardDetailState.sortKey === key && dashboardDetailState.direction === "desc" ? "asc" : "desc" }; renderDashboardCached(); }));
  const update = event => {
    const focusedId = event?.target?.id || "";
    const cursor = Number.isInteger(event?.target?.selectionStart) ? event.target.selectionStart : null;
    dashboardDetailState = { ...dashboardDetailState, search: document.getElementById("dashboardStoreSearch")?.value || "", storeId: document.getElementById("dashboardStoreLocal")?.value || "all", minimum: document.getElementById("dashboardMinimumTotal")?.value || "" };
    renderDashboardCached();
    const replacement = focusedId && document.getElementById(focusedId);
    if (replacement && cursor !== null) { replacement.focus(); replacement.setSelectionRange(cursor, cursor); }
  };
  document.getElementById("dashboardStoreSearch")?.addEventListener("input", update);
  document.getElementById("dashboardStoreLocal")?.addEventListener("change", update);
  document.getElementById("dashboardMinimumTotal")?.addEventListener("input", update);
  applyDashboardStoreMonthTotalMoney();
}

function applyDashboardStoreMonthTotalMoney() {
  const sourceRows = dashboardData?.store_performance;
  if (!Array.isArray(sourceRows)) return;
  const dates = [...new Set(sourceRows.map(row => String(row.date)))];
  const stores = new Map();
  sourceRows.forEach(row => {
    const id = String(row.store_id);
    if (!stores.has(id)) stores.set(id, { id, name: String(row.store_name || row.store_code || "Store"), cells: new Map() });
    stores.get(id).cells.set(String(row.date), Number(row.total_sales || 0));
  });
  const query = dashboardDetailState.search.trim().toLowerCase();
  const minimum = Number(dashboardDetailState.minimum || 0);
  const totalFor = outlet => dates.reduce((sum, date) => sum + Number(outlet.cells.get(date) || 0), 0);
  const direction = dashboardDetailState.direction === "asc" ? 1 : -1;
  const outlets = [...stores.values()].filter(outlet => (!query || `${outlet.name} ${outlet.id}`.toLowerCase().includes(query)) && (dashboardDetailState.storeId === "all" || outlet.id === dashboardDetailState.storeId) && totalFor(outlet) >= minimum);
  outlets.sort((left, right) => {
    const key = dashboardDetailState.sortKey;
    const leftValue = key === "outlet" ? left.name : key === "total" ? totalFor(left) : Number(left.cells.get(key) || 0);
    const rightValue = key === "outlet" ? right.name : key === "total" ? totalFor(right) : Number(right.cells.get(key) || 0);
    return (typeof leftValue === "string" ? leftValue.localeCompare(rightValue) : leftValue - rightValue) * direction;
  });
  document.querySelectorAll(".dashboard-store-total-pane tbody .dashboard-store-grid-cell").forEach((cell, index) => { if (outlets[index]) cell.textContent = dashboardReferenceMoney(totalFor(outlets[index])); });
  const summary = document.querySelector(".dashboard-store-total-pane tfoot .dashboard-store-grid-summary");
  if (summary) summary.textContent = dashboardReferenceMoney(outlets.reduce((sum, outlet) => sum + totalFor(outlet), 0));
}

function renderDashboardCached() {
  if (state.page !== "dashboard") return;
  const result = document.getElementById("dashboardResult");
  if (!result) return;
  if (!dashboardData) return;
  result.className = "dashboard-results";
  result.innerHTML = dashboardPanelMarkup(dashboardData, dashboardFilters);
  if (dashboardView === "outcomes") {
    bindPrimaryOutcomesSalesTooltip(result);
    observePrimaryOutcomesSalesChart(result);
    schedulePrimaryOutcomesSalesAnimation(result, primaryOutcomesSalesDataKey(dashboardFilters));
    document.getElementById("primaryOutcomesSalesRetry")?.addEventListener("click", () => { void loadPrimaryOutcomesSales(dashboardFilters, true); });
  }
  bindDashboardDetailControls();
}

async function renderDashboard() {
  if (!isCloudStaging()) return renderDashboardLegacyV2200();
  const renderGeneration = state.renderGeneration;
  // The global Outlet selector already lives in the persistent topbar. Put the
  // analytical filter action beside it rather than creating a second context.
  setActions(`<button type="button" id="dashboardFiltersTopbar" class="dashboard-filters-toggle ${dashboardFilterPanelOpen ? "is-active" : ""}" aria-expanded="${dashboardFilterPanelOpen}">${icon("sliders-horizontal", 14)}Filters Active</button>`);
  const page = document.getElementById("page-dashboard");
  const { fixedOutlet, options } = dashboardStoreOptions();
  const filters = dashboardFilters;
  page.innerHTML = dashboardShell(fixedOutlet, options, filters);
  const apply = () => {
    const from = displayToIsoDate(document.getElementById("dashboardFrom")?.value);
    const to = displayToIsoDate(document.getElementById("dashboardTo")?.value);
    if (!from || !to || from > to) { toast("Invalid dashboard dates", "Use valid DD-MM-YYYY dates with Date From on or before Date To.", "error"); return; }
    dashboardFilters = { from, to, store_id: fixedOutlet ? filters.store_id : document.getElementById("dashboardStore").value || "all" };
    saveUiNavigationState();
    void renderDashboard();
  };
  document.querySelectorAll("[data-dashboard-view]").forEach(button => button.addEventListener("click", () => { dashboardView = button.dataset.dashboardView === "store" ? "store" : "outcomes"; saveUiNavigationState(); if (dashboardView === "outcomes") void loadPrimaryOutcomesSales(dashboardFilters); renderDashboardCached(); page.querySelectorAll("[data-dashboard-view]").forEach(item => { const active = item.dataset.dashboardView === dashboardView; item.classList.toggle("is-active", active); item.setAttribute("aria-pressed", String(active)); }); }));
  const toggleFilters = () => { dashboardFilterPanelOpen = !dashboardFilterPanelOpen; void renderDashboard(); };
  document.getElementById("dashboardFiltersToggle").onclick = toggleFilters;
  document.getElementById("dashboardFiltersTopbar").onclick = toggleFilters;
  document.getElementById("dashboardApply")?.addEventListener("click", apply);
  document.getElementById("dashboardReset")?.addEventListener("click", () => { dashboardFilters = dashboardDefaultFilters(); if (fixedOutlet) dashboardFilters.store_id = filters.store_id; dashboardDetailState = { search: "", storeId: "all", minimum: "", week: 1, sortKey: "total", direction: "desc" }; dashboardData = null; dashboardDataKey = ""; saveUiNavigationState(); void renderDashboard(); });
  const key = `${filters.from}:${filters.to}:${filters.store_id || "all"}`;
  if (dashboardView === "outcomes") void loadPrimaryOutcomesSales(filters);
  if (dashboardData) renderDashboardCached();
  if (dashboardData && dashboardDataKey === key) { renderDashboardCached(); return; }
  try {
    const query = new URLSearchParams({ from: filters.from, to: filters.to, store_id: filters.store_id || "all" });
    const data = dashboardResponse(await api(`/api/dashboard?${query.toString()}`));
    if (renderGeneration !== state.renderGeneration || state.page !== "dashboard") return;
    dashboardData = data;
    dashboardDataKey = key;
    renderDashboardCached();
  } catch (error) {
    if (renderGeneration !== state.renderGeneration || state.page !== "dashboard") return;
    const result = document.getElementById("dashboardResult");
    result.className = "dashboard-error-state";
    result.innerHTML = `<span class="dashboard-error-icon">${icon("alert", 18)}</span><strong>Unable to load dashboard data.</strong><button class="btn btn-secondary" id="dashboardRetry" type="button">Retry</button>`;
    document.getElementById("dashboardRetry").onclick = () => { void renderDashboard(); };
  }
}

function defaultSales() {
  return { cash_sales: 0, cash_transactions: 0, aba_sales: 0, aba_transactions: 0, adjustment: 0, beginning_coins: 0, coins_added: 0, final_coins: 0 };
}

async function newClosing() {
  state.closingId = null;
  state.closingStatus = "Draft";
  state.closingReadOnly = false;
  const data = await api(`/api/new-closing?report_date=${isoToday()}`);
  state.closing = { report_date: dateDisplay(data.report_date), outlet: data.outlet, closed_by: "", verified_by: "", notes: "", sales: defaultSales(), machines: data.machines };
  if (state.page !== "closing") await navigate("closing"); else renderClosing();
}

async function ensureClosingPage() {
  if (!state.closing) await newClosing(); else renderClosing();
}

function inputField(label, key, value, type = "number", extra = "") {
  return `<div class="field"><label for="field-${key}">${label}</label><input id="field-${key}" class="input closing-field" data-key="${key}" type="${type}" value="${escapeHtml(value)}" ${extra}></div>`;
}

function machineNaturalId(machine) {
  return String(machine?.machine_id || machine?.Machine_ID || "").trim();
}

function stableMachineComparator(left, right) {
  const configuredOrder = new Map(configuredMachineTypes().map((item, index) => [String(item.name || "").trim().toLowerCase(), index]));
  const leftType = canonicalMachineTypeName(left?.machine_type || left?.Machine_Type, machineNaturalId(left)) || "Other";
  const rightType = canonicalMachineTypeName(right?.machine_type || right?.Machine_Type, machineNaturalId(right)) || "Other";
  const leftTypeOrder = configuredOrder.has(leftType.toLowerCase()) ? configuredOrder.get(leftType.toLowerCase()) : 999;
  const rightTypeOrder = configuredOrder.has(rightType.toLowerCase()) ? configuredOrder.get(rightType.toLowerCase()) : 999;
  if (leftTypeOrder !== rightTypeOrder) return leftTypeOrder - rightTypeOrder;
  const typeCompare = leftType.localeCompare(rightType, undefined, { numeric: true, sensitivity: "base" });
  if (typeCompare !== 0) return typeCompare;
  return machineNaturalId(left).localeCompare(machineNaturalId(right), undefined, { numeric: true, sensitivity: "base" });
}

function groupMachines(machines) {
  const groups = new Map();
  [...machines].sort(stableMachineComparator).forEach(machine => {
    const type = canonicalMachineTypeName(machine?.machine_type || machine?.Machine_Type, machineNaturalId(machine)) || "Other";
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push(machine);
  });
  return groups;
}

function renderMachineRows(machines) {
  const bulkColumns = {
    begin_prize: 0,
    refill_prize: 1,
    final_prize: 2,
    begin_coin_meter: 3,
    final_coin_meter: 4,
    notes: 5,
  };
  const bulkInput = (machine, index, field, type = "number", extraClass = "") => {
    const value = field === "notes" ? escapeHtml(machine[field] || "") : String(Math.max(0, Number(machine[field]) || 0));
    const min = type === "number" ? ' min="0"' : "";
    return `<input class="table-input machine-input bulk-cell ${extraClass}" data-field="${field}" data-cell-key="${index}:${field}" data-bulk-row="${index}" data-bulk-col="${bulkColumns[field]}" data-bulk-type="${type === "number" ? "number" : "text"}" type="${type}"${min} value="${value}">`;
  };

  let rowIndex = 0;
  let html = "";
  for (const [type, rows] of groupMachines(machines)) {
    html += `<tr class="group-row"><td colspan="11">${escapeHtml(type)} · ${rows.length} machines</td></tr>`;
    for (const machine of rows) {
      const index = rowIndex++;
      const codes = machineBarcodes(machine);
      html += `<tr data-index="${index}">
        <td class="align-left"><div class="machine-identity">${machineThumbnail(machine)}<div><strong>${escapeHtml(machine.machine_name)}</strong><div class="machine-id">${escapeHtml(machine.machine_id)}</div></div></div></td>
        <td><div class="barcode-cell"><div class="barcode-chip-list">${barcodeChips(codes, 3)}</div><button class="mini-code-button quick-code" type="button" data-machine-id="${escapeHtml(machine.machine_id)}">${icon("plus", 12)} Code</button></div></td>
        <td>${bulkInput(machine, index, "begin_prize")}</td>
        <td>${bulkInput(machine, index, "refill_prize")}</td>
        <td>${bulkInput(machine, index, "final_prize")}</td>
        <td class="calc-won">0</td>
        <td>${bulkInput(machine, index, "begin_coin_meter")}</td>
        <td>${bulkInput(machine, index, "final_coin_meter")}</td>
        <td class="calc-coins">0</td>
        <td><select class="table-select machine-input" data-field="status"><option ${machine.status === "Working" ? "selected" : ""}>Working</option><option ${machine.status === "Maintenance" ? "selected" : ""}>Maintenance</option><option ${machine.status === "Out of Service" ? "selected" : ""}>Out of Service</option></select></td>
        <td>${bulkInput(machine, index, "notes", "text", "notes-input")}</td>
      </tr>`;
    }
  }
  return html;
}

function renderClosing() {
  const c = state.closing;
  setActions(`<button class="btn btn-primary" id="newClosingBtn">${icon("plus", 17)} Start Shift</button>`);
  document.getElementById("newClosingBtn").onclick = newClosing;
  const page = document.getElementById("page-closing");
  page.innerHTML = `
    <article class="card closing-overview-card">
      <div class="closing-overview-row">
        <div class="closing-overview-copy">
          <div class="closing-overview-title-row"><span class="closing-overview-kicker">Closing</span>${state.closingId ? closingStatusPill(state.closingStatus) : ""}</div>
          <h2>Closing details</h2>
          <p>Date, outlet and staff verification.</p>
        </div>
        <div class="closing-overview-fields closing-details-grid">
          ${inputField("Report Date", "report_date", c.report_date, "text", 'placeholder="DD-MM-YYYY"')}
          ${inputField("Outlet", "outlet", c.outlet, "text")}
          ${inputField("Closed By", "closed_by", c.closed_by, "text")}
          ${inputField("Verified By", "verified_by", c.verified_by, "text")}
        </div>
      </div>
      <div class="closing-overview-row closing-payment-row">
        <div class="closing-overview-copy">
          <span class="closing-overview-kicker">Control</span>
          <h2>Payment & coins</h2>
          <p>Enter totals only. Performance values calculate automatically.</p>
        </div>
        <div class="closing-overview-fields closing-payment-grid">
          ${inputField("Cash Sales (KHR)", "cash_sales", c.sales.cash_sales)}
          ${inputField("ABA QR Sales ($)", "aba_sales", c.sales.aba_sales)}
          ${inputField("Beginning Coins", "beginning_coins", c.sales.beginning_coins)}
          ${inputField("Coins Added", "coins_added", c.sales.coins_added)}
          ${inputField("Final Coins", "final_coins", c.sales.final_coins)}
        </div>
      </div>
    </article>
    <div id="closingKpis" class="kpi-grid closing-kpi-grid"></div>
    <article class="card section-card machine-section">
      <div class="section-heading"><div><h2>Machine readings</h2><p>Beginning values carry forward from the latest finalized closing.</p></div><div class="machine-heading-actions"><span>${c.machines.length} active machines</span><button class="btn btn-secondary btn-compact" id="bulkSelectToggle">${icon("mouse-pointer", 15)} Multi-select</button></div></div>
      <div id="bulkEditBar" class="bulk-edit-bar" hidden>
        <div class="bulk-summary"><strong id="bulkSelectedCount">0 cells selected</strong><span>Click-drag cells, Shift-click a range, or click a column header.</span></div>
        <div class="bulk-controls"><input id="bulkValue" class="input bulk-value" placeholder="Value for selected cells"><button class="btn btn-primary btn-compact" id="bulkApplyBtn">Apply</button><button class="btn btn-secondary btn-compact" id="bulkFillBtn">${icon("copy-down", 15)} Fill from first</button><button class="btn btn-secondary btn-compact" id="bulkClearBtn">${icon("eraser", 15)} Clear</button><button class="btn btn-ghost btn-compact" id="bulkDoneBtn">Done</button></div>
      </div>
      <div class="data-table-wrap"><table class="data-table machine-table"><colgroup><col style="width:18%"><col style="width:14%"><col style="width:7%"><col style="width:7%"><col style="width:7%"><col style="width:5%"><col style="width:8%"><col style="width:8%"><col style="width:6%"><col style="width:9%"><col style="width:11%"></colgroup><thead><tr><th>Machine</th><th>Barcode</th><th class="bulk-column-header" data-bulk-field="begin_prize">Begin Prize</th><th class="bulk-column-header" data-bulk-field="refill_prize">Refill</th><th class="bulk-column-header" data-bulk-field="final_prize">Final Prize</th><th>Won</th><th class="bulk-column-header" data-bulk-field="begin_coin_meter">Begin Meter</th><th class="bulk-column-header" data-bulk-field="final_coin_meter">Final Meter</th><th>Coins Used</th><th>Status</th><th class="bulk-column-header" data-bulk-field="notes">Notes</th></tr></thead><tbody>${renderMachineRows(c.machines)}</tbody></table></div>
    </article>
    <article class="card section-card"><div class="field"><label>Shift Notes & Exceptions</label><textarea id="closingNotes" class="textarea" placeholder="Optional notes for the closing report">${escapeHtml(c.notes || "")}</textarea></div></article>
    <div class="closing-actions"><div class="action-status"><span id="closingValidation">Ready for entry</span></div><div class="action-buttons"><button class="btn btn-secondary" id="saveDraftBtn">${icon("file", 16)} Save Draft</button><button class="btn btn-success" id="finalizeBtn">${icon("check", 16)} Finalize Closing</button></div></div>`;

  resetBulkSelection();
  page.querySelectorAll(".closing-field").forEach(input => input.addEventListener("input", onClosingField));
  page.querySelectorAll(".machine-input").forEach(input => input.addEventListener("input", onMachineField));
  page.querySelectorAll(".quick-code").forEach(button => {
    button.addEventListener("click", () => {
      const machine = state.closing.machines.find(item => item.machine_id === button.dataset.machineId);
      if (machine) showMachineCodesModal(machine);
    });
  });
  setupBulkSelection(page);
  document.getElementById("closingNotes").addEventListener("input", event => { state.closing.notes = event.target.value; });
  document.getElementById("saveDraftBtn").onclick = () => saveClosing("Draft");
  document.getElementById("finalizeBtn").onclick = () => confirmFinalize();
  setClosingReadOnly(state.closingReadOnly);
  recalculateClosing();
}

const BULK_FIELD_ORDER = ["begin_prize", "refill_prize", "final_prize", "begin_coin_meter", "final_coin_meter", "notes"];

function resetBulkSelection() {
  state.bulkMode = false;
  state.bulkSelection = new Set();
  state.bulkAnchor = null;
  state.bulkDragging = false;
}

function setupBulkSelection(page) {
  const toggle = document.getElementById("bulkSelectToggle");
  const done = document.getElementById("bulkDoneBtn");
  const apply = document.getElementById("bulkApplyBtn");
  const fill = document.getElementById("bulkFillBtn");
  const clear = document.getElementById("bulkClearBtn");
  const valueInput = document.getElementById("bulkValue");

  if (toggle) toggle.addEventListener("click", () => setBulkMode(!state.bulkMode));
  if (done) done.addEventListener("click", () => setBulkMode(false));
  if (apply && valueInput) apply.addEventListener("click", () => applyBulkValue(valueInput.value));
  if (fill) fill.addEventListener("click", fillBulkFromFirst);
  if (clear) clear.addEventListener("click", clearBulkValues);
  if (valueInput) valueInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyBulkValue(valueInput.value);
    }
  });

  page.querySelectorAll(".bulk-cell").forEach(cell => {
    cell.addEventListener("pointerdown", handleBulkPointerDown);
    cell.addEventListener("pointerenter", handleBulkPointerEnter);
  });
  page.querySelectorAll(".bulk-column-header").forEach(header => {
    header.addEventListener("click", handleBulkHeaderClick);
  });

  const bulkPasteHost = page.querySelector(".machine-table, [data-mobile-machine-cards]");
  if (bulkPasteHost) bulkPasteHost.addEventListener("paste", event => {
    if (!state.bulkMode || state.bulkSelection.size === 0 || event.target === valueInput) return;
    const pasted = event.clipboardData?.getData("text")?.trim();
    if (!pasted) return;
    event.preventDefault();
    valueInput.value = pasted.split(/\r?\n/)[0];
    applyBulkValue(valueInput.value);
  });

  document.addEventListener("pointerup", endBulkDrag);
  updateBulkSelectionUi();
}

function setBulkMode(enabled) {
  if (state.closingReadOnly && enabled) return;
  state.bulkMode = enabled;
  if (!enabled) {
    state.bulkSelection.clear();
    state.bulkAnchor = null;
    state.bulkDragging = false;
  }
  updateBulkSelectionUi();
}

function endBulkDrag() {
  state.bulkDragging = false;
}

function handleBulkPointerDown(event) {
  const cell = event.currentTarget;
  const requested = state.bulkMode || event.ctrlKey || event.metaKey || event.shiftKey;
  if (!requested || state.closingReadOnly) return;
  if (!state.bulkMode) state.bulkMode = true;
  event.preventDefault();

  const key = cell.dataset.cellKey;
  if (event.shiftKey && state.bulkAnchor) {
    selectBulkRectangle(state.bulkAnchor, key, event.ctrlKey || event.metaKey);
  } else if (event.ctrlKey || event.metaKey) {
    if (state.bulkSelection.has(key)) state.bulkSelection.delete(key);
    else state.bulkSelection.add(key);
    state.bulkAnchor = key;
  } else {
    state.bulkSelection.clear();
    state.bulkSelection.add(key);
    state.bulkAnchor = key;
  }
  state.bulkDragging = true;
  updateBulkSelectionUi();
}

function handleBulkPointerEnter(event) {
  if (!state.bulkMode || !state.bulkDragging || state.closingReadOnly) return;
  const cell = event.currentTarget;
  state.bulkSelection.add(cell.dataset.cellKey);
  updateBulkSelectionUi();
}

function handleBulkHeaderClick(event) {
  if (!state.bulkMode || state.closingReadOnly) return;
  const field = event.currentTarget.dataset.bulkField;
  const keys = [...document.querySelectorAll(`.bulk-cell[data-field="${field}"]`)].map(cell => cell.dataset.cellKey);
  const toggleColumn = event.ctrlKey || event.metaKey;
  const allSelected = keys.every(key => state.bulkSelection.has(key));
  if (!toggleColumn) state.bulkSelection.clear();
  keys.forEach(key => toggleColumn && allSelected ? state.bulkSelection.delete(key) : state.bulkSelection.add(key));
  state.bulkAnchor = keys[0] || null;
  updateBulkSelectionUi();
}

function selectBulkRectangle(anchorKey, targetKey, additive = false) {
  const anchor = document.querySelector(`.bulk-cell[data-cell-key="${anchorKey}"]`);
  const target = document.querySelector(`.bulk-cell[data-cell-key="${targetKey}"]`);
  if (!anchor || !target) return;
  if (!additive) state.bulkSelection.clear();
  const rowMin = Math.min(Number(anchor.dataset.bulkRow), Number(target.dataset.bulkRow));
  const rowMax = Math.max(Number(anchor.dataset.bulkRow), Number(target.dataset.bulkRow));
  const colMin = Math.min(Number(anchor.dataset.bulkCol), Number(target.dataset.bulkCol));
  const colMax = Math.max(Number(anchor.dataset.bulkCol), Number(target.dataset.bulkCol));
  document.querySelectorAll(".bulk-cell").forEach(cell => {
    const row = Number(cell.dataset.bulkRow);
    const col = Number(cell.dataset.bulkCol);
    if (row >= rowMin && row <= rowMax && col >= colMin && col <= colMax) state.bulkSelection.add(cell.dataset.cellKey);
  });
}

function selectedBulkCells() {
  return [...document.querySelectorAll(".bulk-cell")]
    .filter(cell => state.bulkSelection.has(cell.dataset.cellKey))
    .sort((a, b) => Number(a.dataset.bulkRow) - Number(b.dataset.bulkRow) || Number(a.dataset.bulkCol) - Number(b.dataset.bulkCol));
}

function updateBulkSelectionUi() {
  const table = document.querySelector(".machine-table");
  const toggle = document.getElementById("bulkSelectToggle");
  const bar = document.getElementById("bulkEditBar");
  const count = document.getElementById("bulkSelectedCount");
  if (!table || !toggle || !bar || !count) return;

  table.classList.toggle("bulk-mode", state.bulkMode);
  toggle.classList.toggle("active", state.bulkMode);
  toggle.innerHTML = `${icon("eraser", 15)} Clear Selection`;
  bar.hidden = !state.bulkMode;

  document.querySelectorAll(".bulk-cell").forEach(cell => {
    const selected = state.bulkSelection.has(cell.dataset.cellKey);
    cell.classList.toggle("bulk-selected", selected);
    cell.closest("td")?.classList.toggle("bulk-selected-cell", selected);
  });

  const cells = selectedBulkCells();
  const fields = new Set(cells.map(cell => cell.dataset.field));
  const label = fields.size === 1 ? bulkFieldLabel([...fields][0]) : fields.size > 1 ? `${fields.size} fields` : "";
  count.textContent = `${cells.length} ${cells.length === 1 ? "cell" : "cells"} selected${label ? ` · ${label}` : ""}`;
  ["bulkApplyBtn", "bulkFillBtn", "bulkClearBtn"].forEach(id => {
    const button = document.getElementById(id);
    if (button) button.disabled = cells.length === 0 || state.closingReadOnly;
  });
}

function bulkFieldLabel(field) {
  return ({
    begin_prize: "Begin Prize",
    refill_prize: "Refill",
    final_prize: "Final Prize",
    begin_coin_meter: "Begin Meter",
    final_coin_meter: "Final Meter",
    notes: "Notes",
  })[field] || field;
}

function setBulkCellValue(cell, value) {
  const row = cell.closest("tr[data-index]");
  if (!row) return;
  const machine = state.closing.machines[Number(row.dataset.index)];
  const field = cell.dataset.field;
  const normalized = cell.dataset.bulkType === "number" ? String(Math.max(0, Number(value) || 0)) : String(value ?? "");
  cell.value = normalized;
  machine[field] = normalized;
}

function validateBulkValue(cells, value) {
  const types = new Set(cells.map(cell => cell.dataset.bulkType));
  if (types.size > 1) {
    toast("Select compatible cells", "Numeric fields and Notes cannot be updated together.", "error");
    return false;
  }
  if (types.has("number") && String(value).trim() !== "" && !Number.isFinite(Number(value))) {
    toast("Enter a number", "The selected machine fields accept numbers only.", "error");
    return false;
  }
  return true;
}

function applyBulkValue(value) {
  const cells = selectedBulkCells();
  if (!cells.length || !validateBulkValue(cells, value)) return;
  cells.forEach(cell => setBulkCellValue(cell, value));
  scheduleCalculation();
  toast("Bulk update applied", `${cells.length} selected ${cells.length === 1 ? "cell was" : "cells were"} updated.`);
  updateBulkSelectionUi();
}

function fillBulkFromFirst() {
  const cells = selectedBulkCells();
  if (!cells.length) return;
  const value = cells[0].value;
  if (!validateBulkValue(cells, value)) return;
  cells.forEach(cell => setBulkCellValue(cell, value));
  const input = document.getElementById("bulkValue");
  if (input) input.value = value;
  scheduleCalculation();
  toast("Filled from first cell", `${cells.length} selected ${cells.length === 1 ? "cell was" : "cells were"} updated.`);
}

function clearBulkValues() {
  const cells = selectedBulkCells();
  if (!cells.length) return;
  cells.forEach(cell => setBulkCellValue(cell, cell.dataset.bulkType === "number" ? 0 : ""));
  const input = document.getElementById("bulkValue");
  if (input) input.value = "";
  scheduleCalculation();
  toast("Selected cells cleared", `${cells.length} selected ${cells.length === 1 ? "cell was" : "cells were"} reset.`);
}

function handleBulkKeyboard(event) {
  if (!state.bulkMode || state.bulkSelection.size === 0 || state.page !== "closing") return;
  const target = event.target;
  if (target?.id === "bulkValue") return;
  if (event.key === "Escape") {
    event.preventDefault();
    setBulkMode(false);
  } else if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    clearBulkValues();
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
    event.preventDefault();
    fillBulkFromFirst();
  }
}

document.addEventListener("keydown", handleBulkKeyboard);

function onClosingField(event) {
  const key = event.target.dataset.key;
  const value = event.target.value;
  if (["report_date", "outlet", "closed_by", "verified_by"].includes(key)) {
    state.closing[key] = value;
    if (key === "report_date" && !state.closingId) scheduleOpeningReload(value);
  } else {
    state.closing.sales[key] = value;
  }
  scheduleCalculation();
}

let openingReloadTimer = null;
function scheduleOpeningReload(value) {
  clearTimeout(openingReloadTimer);
  const reportDate = displayToIsoDate(value);
  if (!reportDate) return;
  openingReloadTimer = setTimeout(async () => {
    try {
      const data = await api(`/api/new-closing?report_date=${encodeURIComponent(reportDate)}`);
      state.closing.machines = data.machines;
      renderClosing();
    } catch (error) { toast("Invalid date", error.message, "error"); }
  }, 350);
}

function onMachineField(event) {
  const row = event.target.closest("tr[data-index]");
  const machine = state.closing.machines[Number(row.dataset.index)];
  machine[event.target.dataset.field] = event.target.value;
  scheduleCalculation();
}

function scheduleCalculation() {
  clearTimeout(state.calculateTimer);
  state.calculateTimer = setTimeout(recalculateClosing, 40);
}

function numeric(value) { const parsed = Number(String(value ?? "0").replace(/,/g, "")); return Number.isFinite(parsed) ? parsed : 0; }

function calculateLocal() {
  const s = state.closing.sales;
  const totalSales = numeric(s.cash_sales) + numeric(s.aba_sales) + numeric(s.adjustment);
  const coinsDispensed = numeric(s.beginning_coins) + numeric(s.coins_added) - numeric(s.final_coins);
  let machineCoins = 0;
  let prizes = 0;
  const machineResults = state.closing.machines.map(machine => {
    const won = numeric(machine.begin_prize) + numeric(machine.refill_prize) - numeric(machine.final_prize);
    const used = numeric(machine.final_coin_meter) - numeric(machine.begin_coin_meter);
    machineCoins += used; prizes += won;
    return { won, used };
  });
  const variance = machineCoins - coinsDispensed;
  return { totalSales, coinsDispensed, machineCoins, variance, prizes, revenuePerPrize: prizes > 0 ? totalSales / prizes : 0, machineResults };
}

function recalculateClosing() {
  if (!state.closing) return;
  const result = calculateLocal();
  document.getElementById("closingKpis").innerHTML = [
    kpiCard("Total Sales", money(result.totalSales), "circle-dollar-sign", "#2f6bff", "#eef4ff"),
    kpiCard("Coins Dispensed", number(result.coinsDispensed), "coins", "#10a8c4", "#ebfbfe"),
    kpiCard("Machine Coins", number(result.machineCoins), "coins", "#7a4dff", "#f4f0ff"),
    kpiCard("Coin Variance", `${result.variance >= 0 ? "+" : ""}${number(result.variance)}`, "scale", result.variance === 0 ? "#079455" : "#d92d20", result.variance === 0 ? "#ecfdf3" : "#fef3f2"),
    kpiCard("Prizes Won", number(result.prizes), "gift", "#f63d68", "#fff0f4"),
    kpiCard("Revenue / Prize", money(result.revenuePerPrize), "circle-dollar-sign", "#ef7d00", "#fff4e8"),
  ].join("");
  document.querySelectorAll("tr[data-index]").forEach(row => {
    const item = result.machineResults[Number(row.dataset.index)];
    row.querySelector(".calc-won").textContent = number(item.won);
    row.querySelector(".calc-coins").textContent = number(item.used);
  });
  const validation = document.getElementById("closingValidation");
  if (result.variance === 0) { validation.textContent = "Coin control is balanced"; validation.style.color = "#067647"; }
  else { validation.textContent = `Lose / Over: ${result.variance >= 0 ? "+" : ""}${number(result.variance)}`; validation.style.color = "#b42318"; }
}

function setClosingReadOnly(readOnly) {
  if (readOnly && state.bulkMode) setBulkMode(false);
  document.querySelectorAll("#page-closing input, #page-closing select, #page-closing textarea").forEach(element => element.disabled = readOnly);
  const draft = document.getElementById("saveDraftBtn");
  const finalize = document.getElementById("finalizeBtn");
  const bulkToggle = document.getElementById("bulkSelectToggle");
  if (draft) draft.disabled = readOnly;
  if (finalize) finalize.disabled = readOnly;
  if (bulkToggle) bulkToggle.disabled = readOnly;
  document.querySelectorAll("#page-closing .quick-code").forEach(button => {
    button.disabled = readOnly;
  });
}

function closingPayload(workflowStatus) {
  const rate = exchangeRateKHR();
  const coinPrice = pricePerCoinUSD();
  const cashSalesKHR = numeric(state.closing.sales.cash_sales);
  return {
    closing_id: state.closingId,
    workflow_status: workflowStatus,
    report_date: canonicalClosingDate(state.closing.report_date),
    outlet: state.closing.outlet,
    closed_by: state.closing.closed_by,
    verified_by: state.closing.verified_by,
    notes: state.closing.notes,
    sales: {
      ...state.closing.sales,
      adjustment: 0,
      cash_sales_khr: cashSalesKHR,
      cash_sales: rate > 0 ? cashSalesKHR / rate : 0,
      exchange_rate_usd_khr: rate,
      price_per_coin_usd: coinPrice,
    },
    machines: state.closing.machines,
  };
}

async function saveClosing(status) {
  try {
    const button = status === "Finalized" ? document.getElementById("finalizeBtn") : document.getElementById("saveDraftBtn");
    button.disabled = true;
    const result = await api("/api/closings/save", { method: "POST", body: JSON.stringify(closingPayload(status)) });
    state.closingId = result.closing_id;
    state.closingStatus = result.workflow_status;
    state.closingReadOnly = status === "Finalized";
    renderClosing();
    toast(status === "Finalized" ? "Closing finalized" : "Draft saved", status === "Finalized" ? `${result.closing_id} was finalized and the Excel report was created.` : `${result.closing_id} was saved successfully.`);
  } catch (error) { toast("Cannot save closing", error.message, "error"); }
}

function confirmFinalize() {
  showConfirm("Finalize closing?", "After finalization, this closing becomes read-only and an Excel report is created.", () => saveClosing("Finalized"));
}

async function openClosing(closingId) {
  try {
    const data = await api(`/api/closings/${encodeURIComponent(closingId)}`);
    const h = data.header;
    const masterMap = new Map(state.machines.map(machine => [String(machine.Machine_ID), machine]));
    state.closingId = closingId;
    state.closingStatus = h.Workflow_Status || "Draft";
    state.closingReadOnly = state.closingStatus === "Finalized";
    state.closing = {
      report_date: dateDisplay(h.Report_Date), outlet: h.Outlet || "", invoice_no: h.Closing_Code || "", closed_by: h.Closed_By || "", verified_by: h.Verified_By || "", notes: h.Notes || "",
      sales: { cash_sales: h.Cash_Sales_KHR ?? (numeric(h.Cash_Sales || 0) * numeric(h.Exchange_Rate_USD_KHR || exchangeRateKHR())), cash_transactions: h.Cash_Transactions || 0, aba_sales: h.ABA_Sales || 0, aba_transactions: h.ABA_Transactions || 0, adjustment: h.Adjustment || 0, beginning_coins: h.Beginning_Coins || 0, coins_added: h.Coins_Added || 0, final_coins: h.Final_Coins || 0 },
      machines: data.machines.map(row => { const master = masterMap.get(String(row.Machine_ID)) || {}; return { machine_id: row.Machine_ID, machine_name: row.Machine_Name, machine_type: row.Machine_Type, barcodes: machineBarcodes(master), image_url: machineImageUrl(master), capacity: row.Capacity || master.Capacity || 0, begin_prize: row.Begin_Prize || 0, refill_prize: row.Refill_Prize || 0, final_prize: row.Final_Prize || 0, begin_coin_meter: row.Begin_Coin_Meter || 0, final_coin_meter: row.Final_Coin_Meter || 0, status: row.Machine_Status || "Working", notes: row.Notes || "" }; }),
    };
    if (state.page !== "closing") await navigate("closing"); else renderClosing();
  } catch (error) { toast("Cannot open closing", error.message, "error"); }
}

function historyKpiCard(label, value, iconName, tone = "blue") {
  return `<article class="card history-kpi-card history-kpi-${tone}"><div><span>${escapeHtml(label)}</span><strong>${value}</strong></div><span class="history-kpi-icon">${icon(iconName, 18)}</span></article>`;
}

function historyFinalizedTime(row) {
  const raw = String(row.Finalized_At || row.Updated_At || "");
  const time = raw.length >= 16 ? raw.slice(11, 16) : "—";
  return time;
}

function historyDateLabel(value) {
  const raw = String(value || "").slice(0, 10);
  if (!raw) return "—";
  const parts = raw.split("-");
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return raw;
}

function historyDayLabel(value) {
  const raw = String(value || "").slice(0, 10);
  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw || "Unknown date";
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
}

function closingInvoiceNo(source) {
  const value = source?.Closing_Code ?? source?.closing_code ?? source?.invoice_no ?? "";
  return String(value || "").trim() || "—";
}

function historyFilterRows() {
  const query = String(document.getElementById("historySearch")?.value || "").trim().toLowerCase();
  const dateFrom = String(document.getElementById("historyDateFrom")?.value || "");
  const dateTo = String(document.getElementById("historyDateTo")?.value || "");
  const machine = String(document.getElementById("historyMachine")?.value || "");
  const staff = String(document.getElementById("historyStaff")?.value || "");
  return (state.history || []).filter(row => {
    const reportDate = String(row.Report_Date || "").slice(0, 10);
    if (dateFrom && reportDate < dateFrom) return false;
    if (dateTo && reportDate > dateTo) return false;
    if (machine && !(row.Machine_Ids || []).map(String).includes(machine)) return false;
    if (staff && String(row.Closed_By || "") !== staff) return false;
    if (query) {
      const haystack = [
        row.Report_Date, row.Finalized_At, closingInvoiceNo(row), row.Closed_By, row.Verified_By,
        ...(row.Machine_Ids || []), ...(row.Barcodes || [])
      ].join(" ").toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

function renderHistoryKpis(rows) {
  const target = document.getElementById("historyKpis");
  if (!target) return;
  const sales = rows.reduce((sum, row) => sum + numeric(row.Total_Sales), 0);
  const coins = rows.reduce((sum, row) => sum + numeric(row.Machine_Coins_Used), 0);
  const products = rows.reduce((sum, row) => sum + numeric(row.Total_Prizes_Won), 0);
  const refill = rows.reduce((sum, row) => sum + numeric(row.Refill_Qty), 0);
  target.innerHTML = [
    historyKpiCard("Total Sales", money(sales), "circle-dollar-sign", "blue"),
    historyKpiCard("Coins Used", number(coins), "coins", "gold"),
    historyKpiCard("Products Used", number(products), "boxes", "cyan"),
    historyKpiCard("Refill Qty", `+${number(refill)}`, "refresh", "violet"),
  ].join("");
}

async function renderHistory() {
  setActions("");
  const snapshot = await api("/api/history?limit=1000");
  state.history = snapshot.records || [];
  const page = document.getElementById("page-history");
  page.classList.remove("history-print-detail");
  const machineOptions = (snapshot.machines || []).map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  const staffOptions = (snapshot.staff || []).map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  page.innerHTML = `
    <div id="historyKpis" class="history-kpi-grid"></div>
    <article class="card section-card history-records-card">
      <div class="history-toolbar">
        <div><h2>Finalized Closing History</h2><p id="historyRecordCount">${state.history.length} finalized closings</p></div>
        <div class="history-search-wrap"><input id="historySearch" class="input search" placeholder="Search Invoice No, machine, barcode, or staff..."></div>
      </div>
      <div class="history-filters">
        <div class="field"><label>From</label><input id="historyDateFrom" class="input" type="date"></div>
        <div class="field"><label>To</label><input id="historyDateTo" class="input" type="date"></div>
        <div class="field"><label>Machine</label><select id="historyMachine" class="select"><option value="">All machines</option>${machineOptions}</select></div>
        <div class="field"><label>Closed By</label><select id="historyStaff" class="select"><option value="">All staff</option>${staffOptions}</select></div>
        <button id="historyClearFilters" class="btn btn-secondary history-clear" type="button">Clear</button>
      </div>
      <div class="data-table-wrap history-table-wrap"><table class="data-table history-table"><thead><tr>
        <th>Date / Time</th><th>Invoice No</th><th>Sales</th><th>Coins Used</th><th>Products</th><th>Refill</th><th>Lose / Over</th><th>Closed / Verified</th><th>Actions</th>
      </tr></thead><tbody id="historyRows"></tbody></table></div>
    </article>`;

  const refresh = () => {
    const rows = historyFilterRows();
    renderHistoryKpis(rows);
    renderHistoryRows(rows);
    const count = document.getElementById("historyRecordCount");
    if (count) count.textContent = `${rows.length} finalized closing${rows.length === 1 ? "" : "s"}`;
  };
  ["historySearch", "historyDateFrom", "historyDateTo", "historyMachine", "historyStaff"].forEach(id => {
    document.getElementById(id)?.addEventListener(id === "historySearch" ? "input" : "change", refresh);
  });
  document.getElementById("historyClearFilters").onclick = () => {
    ["historySearch", "historyDateFrom", "historyDateTo", "historyMachine", "historyStaff"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    refresh();
  };
  refresh();
}

function hideHistoryContextMenu() {
  document.getElementById("historyContextMenu")?.remove();
}

function showHistoryContextMenu(event, row) {
  event.preventDefault();
  event.stopPropagation();
  hideHistoryContextMenu();
  const menu = document.createElement("div");
  menu.id = "historyContextMenu";
  menu.className = "history-context-menu";
  menu.innerHTML = '<button type="button" class="history-context-void">' + icon("trash", 14) + '<span>Void Bill</span></button>';
  document.body.appendChild(menu);
  const width = menu.offsetWidth || 154;
  const height = menu.offsetHeight || 42;
  menu.style.left = Math.max(8, Math.min(event.clientX, window.innerWidth - width - 10)) + "px";
  menu.style.top = Math.max(8, Math.min(event.clientY, window.innerHeight - height - 10)) + "px";
  menu.querySelector(".history-context-void").onclick = clickEvent => {
    clickEvent.stopPropagation();
    hideHistoryContextMenu();
    showVoidClosingModal(row);
  };
  setTimeout(() => document.addEventListener("click", hideHistoryContextMenu, { once: true }), 0);
  window.addEventListener("resize", hideHistoryContextMenu, { once: true });
  window.addEventListener("scroll", hideHistoryContextMenu, { once: true, capture: true });
}

function renderHistoryRows(rows) {
  hideHistoryContextMenu();
  const body = document.getElementById("historyRows");
  if (!body) return;
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="9" class="table-empty">No finalized closings match the selected filters.</td></tr>`;
    return;
  }
  const counts = new Map();
  rows.forEach(row => { const day = String(row.Report_Date || "").slice(0,10); counts.set(day, (counts.get(day) || 0) + 1); });
  let previousDay = "";
  const html = [];
  rows.forEach(row => {
    const day = String(row.Report_Date || "").slice(0,10);
    if (day !== previousDay) {
      html.push(`<tr class="history-day-row"><td colspan="9"><strong>${escapeHtml(historyDayLabel(day))}</strong><span>${counts.get(day)} closing${counts.get(day) === 1 ? "" : "s"}</span></td></tr>`);
      previousDay = day;
    }
    const variance = Number(row.Coin_Variance || 0);
    const refill = Number(row.Refill_Qty || 0);
    html.push(`<tr class="history-record-row" data-id="${escapeHtml(row.Closing_ID || "")}" title="Right-click for bill options">
      <td><strong>${escapeHtml(historyDateLabel(day))}</strong><span>${escapeHtml(historyFinalizedTime(row))}</span></td>
      <td><strong>${escapeHtml(closingInvoiceNo(row))}</strong></td>
      <td>${money(row.Total_Sales)}</td>
      <td>${number(row.Machine_Coins_Used)}</td>
      <td>${number(row.Total_Prizes_Won)}</td>
      <td>${refill > 0 ? `<span class="history-refill-pill">+${number(refill)}</span>` : "—"}</td>
      <td><span class="history-variance ${variance === 0 ? "is-balanced" : "has-variance"}">${variance >= 0 ? "+" : ""}${number(variance)}</span></td>
      <td><strong>${escapeHtml(row.Closed_By || "—")}</strong><span>${escapeHtml(row.Verified_By || "—")}</span></td>
      <td><div class="history-row-actions"><button class="btn btn-secondary btn-compact history-view" data-id="${escapeHtml(row.Closing_ID)}">View</button></div></td>
    </tr>`);
  });
  body.innerHTML = html.join("");
  body.querySelectorAll(".history-view").forEach(button => button.onclick = () => showHistoryDetail(button.dataset.id));
  body.querySelectorAll(".history-record-row").forEach(record => {
    record.addEventListener("contextmenu", event => {
      const row = (state.history || []).find(item => String(item.Closing_ID) === String(record.dataset.id));
      if (row) showHistoryContextMenu(event, row);
    });
  });
}

function historyRefillEvents(product) {
  const raw = product.Refill_History_JSON;
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : []; } catch (_error) { return []; }
}

function historyRefillCell(product) {
  const qty = Number(product.Refill_Qty || 0);
  if (qty <= 0) return "—";
  const events = historyRefillEvents(product);
  if (!events.length) return `<span class="history-refill-pill">+${number(qty)}</span>`;
  const eventHtml = events.map(event => `<div><strong>+${number(event.qty)}</strong><span>${escapeHtml(event.by || "—")} · ${escapeHtml(String(event.at || "").replace("T", " ").slice(0,16) || "—")}</span></div>`).join("");
  return `<details class="history-refill-details"><summary>+${number(qty)}</summary><div class="history-refill-events">${eventHtml}</div></details>`;
}

async function showHistoryDetail(closingId) {
  try {
    const data = await api(`/api/closings/${encodeURIComponent(closingId)}`);
    const h = data.header || {};
    const machines = data.machines || [];
    const products = data.products || [];
    const machineMap = new Map(machines.map(row => [String(row.Machine_ID), row]));
    const totalRefill = products.reduce((sum, item) => sum + numeric(item.Refill_Qty), 0);
    const totalPlays = machines.reduce((sum, item) => { const rule = numeric(item.Play_Rule_Coins); return sum + (rule > 0 ? numeric(item.Coins_Used) / rule : 0); }, 0);
    const overallWinRate = numeric(h.Total_Prizes_Won) > 0 && totalPlays > 0 ? totalPlays / numeric(h.Total_Prizes_Won) : null;
    const page = document.getElementById("page-history");
    setActions(`<button class="btn btn-secondary" id="historyBackTop">Back</button><button class="btn btn-secondary" id="historyPrint">${icon("print",16)} Print</button><button class="btn btn-primary" id="historyExport">${icon("folder",16)} Export Excel</button>`);
    page.innerHTML = `
      <article class="card history-detail-head">
        <div><span class="history-detail-kicker">FINALIZED CLOSING</span><h2>${escapeHtml(closingId)}</h2><p>${escapeHtml(historyDateLabel(h.Report_Date))} · ${escapeHtml(historyFinalizedTime(h))}</p></div>
        <div class="history-detail-staff"><div><span>Closed By</span><strong>${escapeHtml(h.Closed_By || "—")}</strong></div><div><span>Verified By</span><strong>${escapeHtml(h.Verified_By || "—")}</strong></div></div>
      </article>
      <div class="history-detail-kpis">
        ${historyKpiCard("Sales", money(h.Total_Sales), "circle-dollar-sign", "blue")}
        ${historyKpiCard("Coins Used", number(h.Machine_Coins_Used), "coins", "gold")}
        ${historyKpiCard("Products Used", number(h.Total_Prizes_Won), "boxes", "cyan")}
        ${historyKpiCard("Refill Qty", `+${number(totalRefill)}`, "refresh", "violet")}
        ${historyKpiCard("Lose / Over", `${Number(h.Coin_Variance || 0) >= 0 ? "+" : ""}${number(h.Coin_Variance)}`, "scale", Number(h.Coin_Variance || 0) === 0 ? "green" : "red")}
        ${historyKpiCard("Win Rate", overallWinRate === null ? "—" : number(overallWinRate, 2), "trophy", "blue")}
      </div>
      <article class="card section-card history-detail-card">
        <div class="section-heading"><div><h2>Machine & Product Audit</h2><p>Final quantities, refill activity, machine coins, and win rate from this closing.</p></div></div>
        <div class="data-table-wrap"><table class="data-table history-detail-table"><thead><tr><th>Machine</th><th>Product / Barcode</th><th>Begin</th><th>Refill</th><th>Final</th><th>Qty Used</th><th>Coins Used</th><th>Win Rate</th></tr></thead><tbody>
          ${products.map(product => { const machine = machineMap.get(String(product.Machine_ID)) || {}; return `<tr><td><strong>${escapeHtml(product.Machine_ID || "—")}</strong></td><td><div class="history-product-cell">${product.Image_File ? `<img src="/api/machine-images/${encodeURIComponent(product.Image_File)}" alt="">` : ""}<strong>${escapeHtml(product.Barcode || "—")}</strong></div></td><td>${number(product.Begin_Qty)}</td><td>${historyRefillCell(product)}</td><td>${number(product.Final_Qty)}</td><td><strong>${number(product.Qty_Used)}</strong></td><td>${number(machine.Coins_Used)}</td><td>${machine.Win_Rate === null || machine.Win_Rate === undefined || machine.Win_Rate === "" ? "—" : number(machine.Win_Rate, 2)}</td></tr>`; }).join("") || `<tr><td colspan="8" class="table-empty">No product details are stored for this closing.</td></tr>`}
        </tbody></table></div>
      </article>
      ${h.Notes ? `<article class="card history-detail-notes"><span>Shift Notes</span><p>${escapeHtml(h.Notes)}</p></article>` : ""}`;

    const goBack = () => renderHistory();
    document.getElementById("historyBackTop").onclick = goBack;
    document.getElementById("historyPrint").onclick = () => {
      page.classList.add("history-print-detail");
      window.addEventListener("afterprint", () => page.classList.remove("history-print-detail"), { once: true });
      window.print();
    };
    document.getElementById("historyExport").onclick = async () => {
      try { const result = await api(`/api/history/${encodeURIComponent(closingId)}/export`, { method: "POST" }); toast("Excel report opened", result.report_name || `${closingId}.xlsx`); }
      catch (error) { toast("Cannot open Excel report", error.message, "error"); }
    };
  } catch (error) { toast("Cannot open closing history", error.message, "error"); }
}

function showVoidClosingModal(row) {
  showModal(
    "Void Bill",
    `<div class="history-delete-warning"><strong>This voids the finalized bill and removes it from operational history.</strong><p>Active dependent Drafts are removed automatically. A newer finalized bill will still block the void to protect the stock chain.</p></div>
     <div class="history-delete-summary"><div><span>Invoice No</span><strong>${escapeHtml(closingInvoiceNo(row))}</strong></div><div><span>Date / Time</span><strong>${escapeHtml(historyDateLabel(row.Report_Date))} · ${escapeHtml(historyFinalizedTime(row))}</strong></div><div><span>Sales</span><strong>${money(row.Total_Sales)}</strong></div><div><span>Products</span><strong>${number(row.Total_Prizes_Won)}</strong></div></div>
     <div class="field"><label for="historyDeleteReason">Void Reason</label><textarea id="historyDeleteReason" class="textarea" rows="3" maxlength="250" placeholder="Required: explain why this bill is being voided"></textarea></div>`,
    "Void Bill",
    async () => {
      const reason = String(document.getElementById("historyDeleteReason")?.value || "").trim();
      if (reason.length < 3) { toast("Void reason required", "Enter a short reason before voiding this bill.", "error"); return; }
      try {
        const result = await api(`/api/closings/${encodeURIComponent(row.Closing_ID)}`, { method: "DELETE", body: JSON.stringify({ reason, remove_dependent_drafts: true }) });
        closeModal();
        toast("Bill voided", `${closingInvoiceNo(row)} was voided${result.report_deleted ? " and its Excel report was removed" : ""}${(result.report_delete_errors || []).length ? ". The report file is still open or could not be removed." : "."}`);
        await renderHistory();
      } catch (error) { toast("Cannot void bill", error.message, "error"); }
    }
  );
  const confirm = document.querySelector("#modalRoot .btn-primary");
  if (confirm) confirm.classList.add("history-danger-button");
  setTimeout(() => document.getElementById("historyDeleteReason")?.focus(), 0);
}

function barcodeEditorRows(codes = []) {
  const values = codes.length ? codes : [""];
  return values.map((code, index) => `<div class="barcode-editor-row">
    <span class="barcode-sequence">${index + 1}</span>
    <input class="input barcode-code-input" value="${escapeHtml(code)}" placeholder="Scan or enter barcode">
    <button class="icon-button remove-barcode-code" type="button" title="Remove code">${icon("trash", 15)}</button>
  </div>`).join("");
}

function refreshBarcodeSequence(container) {
  container.querySelectorAll(".barcode-editor-row").forEach((row, index) => {
    row.querySelector(".barcode-sequence").textContent = String(index + 1);
  });
  container.querySelectorAll(".remove-barcode-code").forEach(button => {
    button.disabled = container.querySelectorAll(".barcode-editor-row").length <= 1;
  });
}

function bindBarcodeEditor(container) {
  const addButton = container.querySelector(".add-barcode-code");
  const rows = container.querySelector(".barcode-editor-rows");
  const bindRemove = () => {
    rows.querySelectorAll(".remove-barcode-code").forEach(button => {
      button.onclick = () => {
        button.closest(".barcode-editor-row")?.remove();
        refreshBarcodeSequence(container);
      };
    });
  };
  addButton.onclick = () => {
    rows.insertAdjacentHTML("beforeend", barcodeEditorRows([""]));
    bindRemove();
    refreshBarcodeSequence(container);
    rows.querySelector(".barcode-editor-row:last-child .barcode-code-input")?.focus();
  };
  bindRemove();
  refreshBarcodeSequence(container);
}

function collectBarcodeCodes(container) {
  const codes = [...container.querySelectorAll(".barcode-code-input")]
    .map(input => input.value.trim())
    .filter(Boolean);
  return [...new Set(codes)];
}

function machineSavePayload(machine, barcodes, extra = {}) {
  return {
    machine_id: machine?.Machine_ID || machine?.machine_id || "",
    machine_name: machine?.Machine_Name || machine?.machine_name || "",
    machine_type: machine?.Machine_Type || machine?.machine_type || "",
    capacity: machine?.Capacity ?? machine?.capacity ?? 0,
    prize_category: machine?.Prize_Category || "",
    sort_order: machine?.Sort_Order ?? 1,
    active: machine?.Active !== false,
    notes: machine?.Notes || "",
    barcodes,
    ...extra,
  };
}

async function showMachineCodesModal(closingMachine) {
  let master = state.machines.find(item => String(item.Machine_ID) === String(closingMachine.machine_id));
  if (!master) {
    state.machines = await api("/api/machines?active_only=false");
    master = state.machines.find(item => String(item.Machine_ID) === String(closingMachine.machine_id));
  }
  if (!master) {
    toast("Machine not found", "Use Daily Closing → Edit to add or save this machine first.", "error");
    return;
  }

  const modalId = "machine-code-editor";
  showModal(
    `Barcode Codes · ${master.Machine_Name}`,
    `<div id="${modalId}" class="barcode-editor">
      <div class="barcode-editor-copy">
        <div class="barcode-large-icon">${icon("barcode", 22)}</div>
        <div><strong>Add one or more codes</strong><p>Use Add Code for code 1, 2, 3, and more. Duplicate codes are removed automatically.</p></div>
      </div>
      <div class="barcode-editor-rows">${barcodeEditorRows(machineBarcodes(master))}</div>
      <button class="btn btn-secondary btn-compact add-barcode-code" type="button">${icon("plus", 14)} Add Code</button>
    </div>`,
    "Save Codes",
    async () => {
      const container = document.getElementById(modalId);
      const codes = collectBarcodeCodes(container);
      const result = await api("/api/machines", {
        method: "POST",
        body: JSON.stringify(machineSavePayload(master, codes)),
      });
      const updated = result.machine;
      const index = state.machines.findIndex(item => String(item.Machine_ID) === String(updated.Machine_ID));
      if (index >= 0) state.machines[index] = updated;
      closingMachine.barcodes = machineBarcodes(updated);
      closingMachine.image_url = machineImageUrl(updated);
      closeModal();
      renderClosing();
      toast("Barcode codes saved", `${updated.Machine_Name} now has ${closingMachine.barcodes.length} code${closingMachine.barcodes.length === 1 ? "" : "s"}.`);
    }
  );
  bindBarcodeEditor(document.getElementById(modalId));
}

function showMachineModal(machine) {
  const isEdit = Boolean(machine);
  const modalId = "machine-editor";
  const existingImage = machineImageUrl(machine);
  let pendingImageData = "";
  let removeImage = false;

  showModal(`${isEdit ? "Edit" : "Add"} Machine`, `<div id="${modalId}" class="machine-editor">
    <div class="machine-image-editor">
      <div class="machine-image-preview ${existingImage ? "has-image" : ""}" id="machineImagePreview">
        ${existingImage ? `<img src="${escapeHtml(existingImage)}" alt="${escapeHtml(machine?.Machine_Name || "Machine")}">` : icon("image", 34)}
      </div>
      <div class="machine-image-actions">
        <strong>Machine image</strong>
        <p>Upload a JPG, PNG, or WEBP image up to 5 MB.</p>
        <input id="m-image" type="file" accept="image/jpeg,image/png,image/webp" hidden>
        <div class="machine-image-buttons">
          <button id="m-image-select" class="btn btn-secondary btn-compact" type="button">${icon("image", 15)} Upload Image</button>
          <button id="m-image-remove" class="btn btn-ghost btn-compact" type="button" ${existingImage ? "" : "disabled"}>${icon("trash", 15)} Remove</button>
        </div>
        <div id="m-image-progress" class="upload-progress" hidden aria-live="polite"><span id="m-image-progress-text">Reading image...</span><div class="upload-progress-track"><div id="m-image-progress-indicator" class="upload-progress-indicator"></div></div></div>
      </div>
    </div>
    <div class="grid-2">
      <div class="field"><label>Machine ID</label><input id="m-id" class="input" value="${escapeHtml(machine?.Machine_ID || "")}" ${isEdit ? "readonly" : ""}></div>
      <div class="field"><label>Machine Type</label><select id="m-type" class="select">${typeOptions}</select><small class="field-help">Available types are managed in Settings → Type Machine.</small></div>
      
      <div class="field"><label>Prize Category</label><input id="m-category" class="input" value="${escapeHtml(machine?.Prize_Category || "Plush Toy")}"></div>
      <div class="field"><label>Sort Order</label><input id="m-order" class="input" type="number" min="1" value="${escapeHtml(machine?.Sort_Order || 1)}"></div>
      <div class="field"><label>Status</label><select id="m-active" class="select"><option value="true" ${machine?.Active !== false ? "selected" : ""}>Active</option><option value="false" ${machine?.Active === false ? "selected" : ""}>Inactive</option></select></div>
      <div class="field grid-span-2"><label>Notes</label><input id="m-notes" class="input" value="${escapeHtml(machine?.Notes || "")}"></div>
    </div>
    <div class="barcode-editor machine-barcode-editor">
      <div class="barcode-editor-header"><div><label>Barcode Codes</label><p>Add code 1, 2, 3, and as many additional codes as needed.</p></div><button class="btn btn-secondary btn-compact add-barcode-code" type="button">${icon("plus", 14)} Add Code</button></div>
      <div class="barcode-editor-rows">${barcodeEditorRows(machineBarcodes(machine))}</div>
    </div>
  </div>`, "Save Machine", async () => {
    const container = document.getElementById(modalId);
    const machineId = document.getElementById("m-id").value.trim();
    const selectedType = document.getElementById("m-type").value.trim();
    if (!selectedType) throw new Error("Choose a Machine Type from Settings.");
    const result = await api("/api/machines", {
      method: "POST",
      body: JSON.stringify({
        machine_id: machineId,
        machine_type: selectedType,
        capacity: 0,
        prize_category: document.getElementById("m-category").value,
        sort_order: document.getElementById("m-order").value,
        active: document.getElementById("m-active").value === "true",
        notes: document.getElementById("m-notes").value,
        barcodes: collectBarcodeCodes(container),
        image_data: pendingImageData,
        remove_image: removeImage,
      }),
    });
    const updated = result.machine;
    const closingMachine = state.closing?.machines?.find(item => String(item.machine_id) === String(updated.Machine_ID));
    if (closingMachine) {
      closingMachine.machine_name = updated.Machine_Name;
      closingMachine.machine_type = updated.Machine_Type;
      closingMachine.capacity = updated.Capacity;
      closingMachine.barcodes = machineBarcodes(updated);
      closingMachine.image_url = machineImageUrl(updated);
    }
    closeModal();
    toast("Machine saved", "The image, barcode codes, and machine details were saved locally.");
    if (state.page === "closing") renderClosing();
  });

  const container = document.getElementById(modalId);
  bindBarcodeEditor(container);

  const fileInput = document.getElementById("m-image");
  const selectButton = document.getElementById("m-image-select");
  const removeButton = document.getElementById("m-image-remove");
  const preview = document.getElementById("machineImagePreview");
  const progress = document.getElementById("m-image-progress");
  const progressText = document.getElementById("m-image-progress-text");
  const progressIndicator = document.getElementById("m-image-progress-indicator");

  selectButton.onclick = () => fileInput.click();
  fileInput.onchange = () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast("Image is too large", "Choose a machine image smaller than 5 MB.", "error");
      fileInput.value = "";
      return;
    }
    progress.hidden = false;
    progressText.textContent = "Reading image...";
    progressIndicator.style.width = "38%";
    const reader = new FileReader();
    reader.onprogress = event => {
      if (!event.lengthComputable) return;
      const percent = Math.max(1, Math.round((event.loaded / event.total) * 100));
      progressText.textContent = `Reading image... ${percent}%`;
      progressIndicator.style.width = `${percent}%`;
      progressIndicator.style.animation = "none";
    };
    reader.onload = () => {
      pendingImageData = String(reader.result || "");
      removeImage = false;
      preview.classList.add("has-image");
      preview.innerHTML = `<img src="${escapeHtml(pendingImageData)}" alt="Machine preview">`;
      removeButton.disabled = false;
      progressText.textContent = "Image ready to save";
      progressIndicator.style.width = "100%";
    };
    reader.onerror = () => { progress.hidden = true; toast("Cannot read image", "Choose another image file.", "error"); };
    reader.readAsDataURL(file);
  };
  removeButton.onclick = () => {
    pendingImageData = "";
    removeImage = true;
    fileInput.value = "";
    preview.classList.remove("has-image");
    preview.innerHTML = icon("image", 34);
    removeButton.disabled = true;
  };
}

async function renderReports() {
  setActions("");
  const page = document.getElementById("page-reports");
  page.innerHTML = `<article class="card section-card"><div class="section-heading"><div><h2>Monthly Excel report</h2><p>Summarize finalized closing records and machine performance.</p></div></div><div class="toolbar-row"><div class="toolbar-left"><div class="field month-input"><label>Month</label><input id="reportMonth" class="input" type="month" value="${monthToday()}"></div><button id="exportMonthly" class="btn btn-primary" style="margin-top:18px">${icon("download",16)} Export Monthly Report</button></div><div class="toolbar-right"><button id="openReports" class="btn btn-secondary">${icon("folder",16)} Reports Folder</button><button id="openDatabase" class="btn btn-secondary">${icon("folder",16)} Database Folder</button></div></div></article><div id="reportKpis" class="kpi-grid" style="grid-template-columns:repeat(4,minmax(0,1fr))"></div><article class="card section-card"><div class="section-heading"><div><h2>Report workflow</h2><p>The export reads finalized records only and does not modify the database.</p></div></div><div class="latest-closing"><div class="metric"><span>Daily report</span><strong>Created automatically when a closing is finalized</strong></div><div class="metric"><span>Monthly report</span><strong>Sales, coin, prize, and machine performance</strong></div><div class="metric"><span>Output folder</span><strong>Claw_Closing_App\reports</strong></div></div></article>`;
  document.getElementById("reportMonth").addEventListener("change", refreshReportSummary);
  document.getElementById("exportMonthly").onclick = exportMonthlyReport;
  document.getElementById("openReports").onclick = () => api("/api/open-folder", { method: "POST", body: JSON.stringify({target:"reports"}) });
  document.getElementById("openDatabase").onclick = () => api("/api/open-folder", { method: "POST", body: JSON.stringify({target:"database"}) });
  await refreshReportSummary();
}

async function refreshReportSummary() {
  const month = document.getElementById("reportMonth").value;
  try {
    const summary = await api(`/api/reports/summary?month=${month}`);
    document.getElementById("reportKpis").innerHTML = [
      kpiCard("Finalized Closings", number(summary.closings), "calendar", "#2f6bff", "#eef4ff"),
      kpiCard("Total Sales", money(summary.total_sales), "circle-dollar-sign", "#079455", "#ecfdf3"),
      kpiCard("Coins Played", number(summary.coins), "coins", "#7a4dff", "#f4f0ff"),
      kpiCard("Prizes Won", number(summary.prizes), "gift", "#f63d68", "#fff0f4"),
    ].join("");
  } catch (error) { toast("Cannot load report summary", error.message, "error"); }
}

async function exportMonthlyReport() {
  const button = document.getElementById("exportMonthly");
  const loading = setInlineButtonLoading(button, "Exporting...");
  try {
    const month = document.getElementById("reportMonth").value;
    const result = await api("/api/reports/monthly", { method: "POST", body: JSON.stringify({month}) });
    if (result.content_base64 && result.filename) {
      const binary = atob(result.content_base64);
      const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: result.mime_type || "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.click();
      URL.revokeObjectURL(url);
    }
    toast("Monthly report created", result.path);
  } catch (error) { toast("Cannot export report", error.message, "error"); }
  finally { if (loading) clearInlineButtonLoading(button); }
}

function showModal(title, body, saveLabel, onSave) {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `<div class="modal-backdrop"><div class="modal"><div class="modal-header"><h2>${escapeHtml(title)}</h2><button class="modal-close">${icon("x",18)}</button></div><div class="modal-body">${body}</div><div class="modal-footer"><button class="btn btn-secondary modal-cancel">Cancel</button><button class="btn btn-primary modal-save">${escapeHtml(saveLabel)}</button></div></div></div>`;
  root.querySelector(".modal-close").onclick = closeModal;
  root.querySelector(".modal-cancel").onclick = closeModal;
  root.querySelector(".modal-backdrop").addEventListener("click", event => { if (event.target.classList.contains("modal-backdrop")) closeModal(); });
  root.querySelector(".modal-save").onclick = async event => {
    const button = event.currentTarget;
    if (button.dataset.submitting === "true") return;
    button.dataset.submitting = "true";
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.dataset.loadingLabel = button.textContent;
    button.innerHTML = `<span class="loading-inline"><span class="loading-inline-spinner" aria-hidden="true"></span><span>Saving...</span></span>`;
    try {
      await onSave();
    } catch (error) {
      toast("Cannot complete action", error.message, "error");
    } finally {
      button.dataset.submitting = "false";
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.textContent = button.dataset.loadingLabel || saveLabel;
    }
  };
}
function closeModal() { document.getElementById("modalRoot").innerHTML = ""; }
function setInlineButtonLoading(button, label) {
  if (!button || button.dataset.loading === "true") return false;
  button.dataset.loading = "true";
  button.dataset.loadingLabel = button.textContent;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.innerHTML = `<span class="loading-inline"><span class="loading-inline-spinner" aria-hidden="true"></span><span>${escapeHtml(label)}</span></span>`;
  return true;
}
function clearInlineButtonLoading(button) {
  if (!button) return;
  button.disabled = false;
  button.removeAttribute("aria-busy");
  button.dataset.loading = "false";
  button.textContent = button.dataset.loadingLabel || button.textContent;
}
function finishInitialShellLoading() {
  const shell = document.getElementById("appShell");
  shell?.classList.remove("app-shell-loading");
  shell?.setAttribute("aria-busy", "false");
}
function showInitialLoadingError(error) {
  const page = document.getElementById(`page-${state.page}`) || document.getElementById("page-closing");
  if (page) page.innerHTML = `<article class="card section-card"><div class="empty-state"><strong>Cannot open the application</strong><span>${escapeHtml(error.message)}</span><button id="retryInitialLoad" class="btn btn-primary" type="button">Try again</button></div></article>`;
  document.getElementById("retryInitialLoad")?.addEventListener("click", () => window.location.reload());
  finishInitialShellLoading();
}
function showConfirm(title, message, onConfirm) { showModal(title, `<p style="margin:0;color:#475467;line-height:1.55">${escapeHtml(message)}</p>`, "Confirm", async () => { closeModal(); await onConfirm(); }); }

async function initialise() {
  try {
    state.bootstrap = await api("/api/bootstrap");
    if (isCloudStaging()) {
      window.clawCloudBootstrap = state.bootstrap;
      window.dispatchEvent(new CustomEvent("claw-cloud-bootstrap", { detail: state.bootstrap }));
    }
    state.appSettings = state.bootstrap.settings || {};
    state.machines = state.bootstrap.machines || [];
    document.getElementById("versionText").textContent = `Version ${state.bootstrap.app.version}`;
    const restoredNavigation = loadUiNavigationState(state.bootstrap);
    state.page = restoredNavigation?.page || "closing";
    dashboardView = restoredNavigation?.dashboardView || "outcomes";
    dashboardFilters = restoredNavigation?.dashboardFilters || dashboardDefaultFilters();
    initialiseSidebar();
    renderDeveloperOutletSwitcherV2187();
    renderUpdateButton();
    const initialPageRender = navigate(state.page, { persist: false, forceRender: true });
    finishInitialShellLoading();
    await initialPageRender;
    if (desktopUpdaterSupported()) {
      await restoreAfterUpdate();
      checkForUpdates(false);
    }
  } catch (error) {
    showInitialLoadingError(error);
  } finally {
    finishInitialShellLoading();
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    if (isCloudStaging()) {
      await window.clawCloudAuth?.ready;
      if (!window.clawCloudAuth?.session()) {
        finishInitialShellLoading();
        return;
      }
    }
    await initialise();
  } catch (error) {
    showInitialLoadingError(error);
  }
});


// WebView2 can occasionally ignore wheel input when the pointer is above a wide table.
// Redirect vertical wheel movement to the page while preserving modal and horizontal scrolling.
document.addEventListener("wheel", event => {
  const modal = event.target.closest(".modal");
  if (modal && modal.scrollHeight > modal.clientHeight) return;
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
  window.scrollBy({ top: event.deltaY, left: 0, behavior: "auto" });
  event.preventDefault();
}, { passive: false });

// v2.1.7 product-level inventory, product images, and dual meter/manual coin entry.
"use strict";

function productStableOrder(left, right) {
  const leftOrder = Number(left?.sort_order_snapshot ?? left?.Sort_Order_Snapshot ?? left?.sort_order ?? left?.Sort_Order ?? 0) || 0;
  const rightOrder = Number(right?.sort_order_snapshot ?? right?.Sort_Order_Snapshot ?? right?.sort_order ?? right?.Sort_Order ?? 0) || 0;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  const created = String(left?.created_at ?? left?.Created_At ?? "").localeCompare(String(right?.created_at ?? right?.Created_At ?? ""));
  if (created) return created;
  return String(left?.product_id ?? left?.Product_ID ?? left?.machine_style_id ?? left?.Machine_Style_ID ?? left?.id ?? left?.barcode ?? "").localeCompare(String(right?.product_id ?? right?.Product_ID ?? right?.machine_style_id ?? right?.Machine_Style_ID ?? right?.id ?? right?.barcode ?? ""));
}

function machineProducts(machine) {
  const raw = machine?.products ?? machine?.Products ?? [];
  const fallback = machineBarcodesLegacy(machine);
  const source = Array.isArray(raw) && raw.length ? raw : fallback.map((barcode, index) => ({ product_id: `legacy-${index + 1}`, barcode }));
  const seen = new Set();
  return [...source].sort(productStableOrder).map((item, index) => {
    const product = typeof item === "object" && item !== null ? item : { barcode: item };
    const barcode = String(product.barcode ?? product.Barcode ?? "").trim();
    const key = barcode.toLowerCase();
    if (barcode && seen.has(key)) return null;
    if (barcode) seen.add(key);
    return {
      product_id: String(product.product_id ?? product.Product_ID ?? product.id ?? `product-${index + 1}`),
      barcode,
      default_quantity: 0,
      image_file: String(product.image_file ?? product.Image_File ?? ""),
      image_url: String(product.image_url ?? product.Image_URL ?? ""),
      sort_order: product.sort_order_snapshot ?? product.Sort_Order_Snapshot ?? product.sort_order ?? product.Sort_Order ?? index + 1,
      begin_qty: product.begin_qty ?? product.Begin_Qty ?? 0,
      final_qty: product.final_qty ?? product.Final_Qty ?? product.begin_qty ?? product.Begin_Qty ?? 0,
    };
  }).filter(Boolean);
}

function machineBarcodesLegacy(machine) {
  const value = machine?.barcodes ?? machine?.Barcodes ?? [];
  if (Array.isArray(value)) return [...new Set(value.map(item => String(item ?? "").trim()).filter(Boolean))];
  return String(value || "").split(/[\r\n,;|]+/).map(item => item.trim()).filter(Boolean);
}

machineBarcodes = function(machine) {
  return machineProducts(machine).map(item => item.barcode).filter(Boolean);
};

function productImageUrl(product) {
  return String(product?.image_url || product?.Image_URL || "");
}

function productThumbnail(product, size = "small") {
  const url = productImageUrl(product);
  if (url) return `<img class="product-thumb ${size}" src="${escapeHtml(url)}" alt="${escapeHtml(product?.barcode || "Product")}">`;
  return `<div class="product-thumb-placeholder ${size}">${icon("image", size === "editor" ? 28 : 16)}</div>`;
}

function ensureClosingProducts(machine) {
  const products = machineProducts(machine);
  if (!products.length) {
    products.push({
      product_id: `product-${String(machine.machine_id || "machine").replace(/[^A-Za-z0-9]+/g, "-")}-1`,
      barcode: "",
      default_quantity: 0,
      image_file: "",
      image_url: "",
      begin_qty: 0,
      final_qty: 0,
    });
  }
  machine.products = products;
  machine.barcodes = products.map(item => item.barcode).filter(Boolean);
  return products;
}

function rawInputValue(value) {
  return value === null || value === undefined ? "" : String(value);
}

function productInput(machineIndex, productIndex, field, value, bulkRow, bulkCol) {
  return `<input class="table-input machine-input bulk-cell product-qty-input" data-machine-index="${machineIndex}" data-product-index="${productIndex}" data-field="${field}" data-cell-key="${machineIndex}:p${productIndex}:${field}" data-bulk-row="${bulkRow}" data-bulk-col="${bulkCol}" data-bulk-type="number" type="number" min="0" value="${escapeHtml(rawInputValue(value))}">`;
}

function machineInput(machineIndex, field, value, bulkRow, bulkCol, type = "number", extraClass = "") {
  const min = type === "number" ? ' min="0"' : "";
  return `<input class="table-input machine-input bulk-cell ${extraClass}" data-machine-index="${machineIndex}" data-field="${field}" data-cell-key="${machineIndex}:m:${field}" data-bulk-row="${bulkRow}" data-bulk-col="${bulkCol}" data-bulk-type="${type === "number" ? "number" : "text"}" type="${type}"${min} value="${escapeHtml(rawInputValue(value))}">`;
}

renderMachineRows = function(machines) {
  let html = "";
  let visualRow = 0;
  for (const [type, rows] of groupMachines(machines)) {
    html += `<tr class="group-row"><td colspan="10">${escapeHtml(type)} · ${rows.length} machines</td></tr>`;
    for (const machine of rows) {
      const machineIndex = machines.indexOf(machine);
      const products = ensureClosingProducts(machine);
      const rowSpan = Math.max(products.length, 1);
      products.forEach((product, productIndex) => {
        const first = productIndex === 0;
        const last = productIndex === products.length - 1;
        const bulkRow = visualRow++;
        const groupClasses = [
          "product-closing-row",
          first ? "machine-group-start" : "machine-group-middle",
          last ? "machine-group-end" : "",
        ].filter(Boolean).join(" ");
        html += `<tr class="${groupClasses}" data-machine-index="${machineIndex}" data-product-index="${productIndex}">
          ${first ? `<td rowspan="${rowSpan}" class="align-left machine-row-cell machine-group-cell machine-group-left"><div class="closing-machine-identity"><strong class="closing-machine-id">${escapeHtml(machine.machine_id)}</strong>${state.closingStructureEdit && !state.closingReadOnly ? `<div class="closing-machine-structure-actions"><button class="mini-action closing-edit-machine" type="button" data-machine-id="${escapeHtml(machine.machine_id)}">${icon("edit", 13)} Edit</button><button class="mini-action danger closing-delete-machine" type="button" data-machine-id="${escapeHtml(machine.machine_id)}">${icon("trash", 13)} Delete</button></div>` : ""}</div></td>` : ""}
          <td class="align-left product-barcode-cell"><div class="product-row-identity">${productThumbnail(product)}<div><strong>${escapeHtml(product.barcode || `Product ${productIndex + 1}`)}</strong></div></div></td>
          <td>${productInput(machineIndex, productIndex, "begin_qty", product.begin_qty, bulkRow, 0)}</td>
          <td>${productInput(machineIndex, productIndex, "final_qty", product.final_qty, bulkRow, 1)}</td>
          <td class="calc-product-used" data-machine-index="${machineIndex}" data-product-index="${productIndex}">0</td>
          ${first ? `<td rowspan="${rowSpan}" class="machine-meter-cell machine-group-cell">${machineInput(machineIndex, "begin_coin_meter", machine.begin_coin_meter, bulkRow, 2, "number", "meter-input")}</td>
          <td rowspan="${rowSpan}" class="machine-meter-cell machine-group-cell">${machineInput(machineIndex, "final_coin_meter", machine.final_coin_meter, bulkRow, 3, "number", "meter-input")}</td>
          <td rowspan="${rowSpan}" class="machine-meter-cell machine-group-cell"><div class="coins-used-control">${machineInput(machineIndex, "coins_used", machine.coins_used, bulkRow, 4, "number", "coins-used-input")}</div></td>
          <td rowspan="${rowSpan}" class="machine-meter-cell machine-group-cell"><div class="win-rate-control"><strong class="calc-win-rate" data-machine-index="${machineIndex}">—</strong></div></td>
          <td rowspan="${rowSpan}" class="machine-meter-cell machine-group-cell machine-group-right status-cell"><select class="table-select machine-input machine-status-select" data-machine-index="${machineIndex}" data-field="status"><option ${machine.status === "Working" ? "selected" : ""}>Working</option><option ${machine.status === "Maintenance" ? "selected" : ""}>Maintenance</option><option ${machine.status === "Out of Service" ? "selected" : ""}>Out of Service</option></select></td>` : ""}
        </tr>`;
      });
    }
  }
  return html;
};

renderClosing = function() {
  const c = state.closing;
  renderPrintButton();
  c.machines.forEach(ensureClosingProducts);
  if (state.closingReadOnly) state.closingStructureEdit = false;
  setActions(`<button class="btn btn-primary" id="newClosingBtn">${icon("plus", 17)} Start Shift</button>`);
  document.getElementById("newClosingBtn").onclick = newClosing;
  const page = document.getElementById("page-closing");
  page.innerHTML = `
    <article class="card closing-overview-card">
      <div class="closing-overview-row">
        <div class="closing-overview-copy">
          <div class="closing-overview-title-row"><span class="closing-overview-kicker">Closing</span>${state.closingId ? closingStatusPill(state.closingStatus) : ""}</div>
          <h2>Closing details</h2>
          <p>Date, outlet and staff verification.</p>
        </div>
        <div class="closing-overview-fields closing-details-grid">
          ${inputField("Report Date", "report_date", c.report_date, "text", 'placeholder="DD-MM-YYYY"')}
          ${inputField("Outlet", "outlet", c.outlet, "text")}
          ${inputField("Closed By", "closed_by", c.closed_by, "text")}
          ${inputField("Verified By", "verified_by", c.verified_by, "text")}
        </div>
      </div>
      <div class="closing-overview-row closing-payment-row">
        <div class="closing-overview-copy">
          <span class="closing-overview-kicker">Control</span>
          <h2>Payment & coins</h2>
          <p>Enter totals only. Performance values calculate automatically.</p>
        </div>
        <div class="closing-overview-fields closing-payment-grid">
          ${inputField("Cash Sales (KHR)", "cash_sales", c.sales.cash_sales)}
          ${inputField("ABA QR Sales ($)", "aba_sales", c.sales.aba_sales)}
          ${inputField("Beginning Coins", "beginning_coins", c.sales.beginning_coins)}
          ${inputField("Coins Added", "coins_added", c.sales.coins_added)}
          ${inputField("Final Coins", "final_coins", c.sales.final_coins)}
        </div>
      </div>
    </article>
    <div id="closingKpis" class="kpi-grid closing-kpi-grid"></div>
    <article class="card section-card machine-section">
      <div class="section-heading"><div><h2>Product quantities & machine meters</h2><p>Each barcode has its own Begin Qty, Final Qty, and Qty Used. Machine order stays fixed by Machine Type and Machine ID.</p></div><div class="machine-heading-actions"><span class="machine-count-badge">${c.machines.length} active machines</span><div class="machine-heading-buttons">${state.closingStructureEdit && !state.closingReadOnly ? `<button class="btn btn-primary btn-compact" id="addClosingMachine">${icon("plus", 15)} Add Machine</button><button class="btn btn-secondary btn-compact" id="closingStructureDone">${icon("check", 15)} Done</button>` : `<button class="btn btn-secondary btn-compact" id="bulkSelectToggle">${icon("mouse-pointer", 15)} Multi-select</button>${!state.closingReadOnly ? `<button class="btn btn-secondary btn-compact" id="closingStructureEdit">${icon("edit", 15)} Edit</button>` : ""}`}</div></div></div>
      ${state.closingStructureEdit && !state.closingReadOnly ? `<div class="structure-edit-banner"><div><strong>Machine structure edit mode</strong><span>Add, edit, or delete active machines here. Historical closing records stay preserved.</span></div></div>` : ""}
      <div id="bulkEditBar" class="bulk-edit-bar" hidden>
        <div class="bulk-summary"><strong id="bulkSelectedCount">0 cells selected</strong><span>Click-drag cells, Shift-click a range, or click a column header.</span></div>
        <div class="bulk-controls"><input id="bulkValue" class="input bulk-value" placeholder="Value for selected cells"><button class="btn btn-primary btn-compact" id="bulkApplyBtn">Apply</button><button class="btn btn-secondary btn-compact" id="bulkFillBtn">${icon("copy-down", 15)} Fill from first</button><button class="btn btn-secondary btn-compact" id="bulkClearBtn">${icon("eraser", 15)} Clear</button><button class="btn btn-ghost btn-compact" id="bulkDoneBtn">Done</button></div>
      </div>
      <div class="data-table-wrap"><table class="data-table machine-table product-closing-table"><colgroup><col style="width:11%"><col style="width:20%"><col style="width:8%"><col style="width:8%"><col style="width:6%"><col style="width:9%"><col style="width:9%"><col style="width:10%"><col style="width:9%"><col style="width:10%"></colgroup><thead><tr><th>Machine</th><th>Product / Barcode</th><th class="bulk-column-header" data-bulk-field="begin_qty">Begin Qty</th><th class="bulk-column-header" data-bulk-field="final_qty">Final Qty</th><th>Qty Used</th><th class="bulk-column-header" data-bulk-field="begin_coin_meter">Begin Meter</th><th class="bulk-column-header" data-bulk-field="final_coin_meter">Final Meter</th><th class="bulk-column-header" data-bulk-field="coins_used">Coins Used</th><th>Win Rate</th><th>Status</th></tr></thead><tbody>${renderMachineRows(c.machines)}</tbody></table></div>
    </article>
    <article class="card section-card"><div class="field"><label>Shift Notes & Exceptions</label><textarea id="closingNotes" class="textarea" placeholder="Optional notes for the closing report">${escapeHtml(c.notes || "")}</textarea></div></article>
    <div class="closing-actions"><div class="action-status"><span id="closingValidation">Ready for entry</span></div><div class="action-buttons"><button class="btn btn-secondary" id="saveDraftBtn">${icon("file", 16)} Save Draft</button><button class="btn btn-success" id="finalizeBtn">${icon("check", 16)} Finalize Closing</button></div></div>`;

  resetBulkSelection();
  page.querySelectorAll(".closing-field").forEach(input => input.addEventListener("input", onClosingField));
  page.querySelectorAll(".machine-input").forEach(input => input.addEventListener("input", onMachineField));
  setupBulkSelection(page);
  const structureEdit = document.getElementById("closingStructureEdit");
  if (structureEdit) structureEdit.onclick = async () => {
    setBulkMode(false);
    state.machines = await api("/api/machines?active_only=false");
    state.closingStructureEdit = true;
    renderClosing();
  };
  const structureDone = document.getElementById("closingStructureDone");
  if (structureDone) structureDone.onclick = () => {
    state.closingStructureEdit = false;
    renderClosing();
  };
  const addClosingMachine = document.getElementById("addClosingMachine");
  if (addClosingMachine) addClosingMachine.onclick = () => showMachineModal(null);
  page.querySelectorAll(".closing-edit-machine").forEach(button => button.onclick = async () => {
    let master = state.machines.find(item => String(item.Machine_ID) === String(button.dataset.machineId));
    if (!master) {
      state.machines = await api("/api/machines?active_only=false");
      master = state.machines.find(item => String(item.Machine_ID) === String(button.dataset.machineId));
    }
    if (master) showMachineModal(master);
  });
  page.querySelectorAll(".closing-delete-machine").forEach(button => button.onclick = async () => {
    const machineId = String(button.dataset.machineId || "");
    if (!machineId) return;
    if (!window.confirm(`Delete ${machineId} from active machines? Historical closing records and product data will be preserved.`)) return;
    try {
      await api(`/api/machines/${encodeURIComponent(machineId)}`, { method: "DELETE" });
      state.machines = await api("/api/machines?active_only=true");
      if (state.bootstrap) state.bootstrap.machines = state.machines;
      const closingMachine = state.closing.machines.find(item => String(item.machine_id) === machineId);
      if (closingMachine) closingMachine.inactive_configuration = true;
      toast("Machine deleted", `${machineId} was removed from active machines. Historical records were preserved.`);
      renderClosing();
    } catch (error) {
      toast("Cannot delete machine", error.message, "error");
    }
  });
  document.getElementById("closingNotes").addEventListener("input", event => { state.closing.notes = event.target.value; });
  document.getElementById("saveDraftBtn").onclick = () => saveClosing("Draft");
  document.getElementById("finalizeBtn").onclick = () => confirmFinalize();
  setClosingReadOnly(state.closingReadOnly);
  recalculateClosing();
};

onMachineField = function(event) {
  const machineIndex = Number(event.target.dataset.machineIndex);
  const machine = state.closing.machines[machineIndex];
  const productIndexText = event.target.dataset.productIndex;
  if (productIndexText !== undefined) {
    const product = ensureClosingProducts(machine)[Number(productIndexText)];
    product[event.target.dataset.field] = event.target.value;
  } else {
    machine[event.target.dataset.field] = event.target.value;
  }
  scheduleCalculation();
};

setBulkCellValue = function(cell, value) {
  const machine = state.closing.machines[Number(cell.dataset.machineIndex)];
  if (!machine) return;
  const field = cell.dataset.field;
  const normalized = cell.dataset.bulkType === "number" ? (String(value).trim() === "" ? "" : String(Math.max(0, Number(value) || 0))) : String(value ?? "");
  cell.value = normalized;
  if (cell.dataset.productIndex !== undefined) {
    ensureClosingProducts(machine)[Number(cell.dataset.productIndex)][field] = normalized;
  } else {
    machine[field] = normalized;
  }
};

bulkFieldLabel = function(field) {
  return ({
    begin_qty: "Begin Qty",
    final_qty: "Final Qty",
    begin_coin_meter: "Begin Meter",
    final_coin_meter: "Final Meter",
    coins_used: "Coins Used",
    notes: "Notes",
  })[field] || field;
};

calculateLocal = function() {
  const s = state.closing.sales;
  const exchangeRate = exchangeRateKHR();
  const coinPrice = pricePerCoinUSD();
  const cashSalesKHR = numeric(s.cash_sales);
  const cashSalesUSD = exchangeRate > 0 ? cashSalesKHR / exchangeRate : 0;
  const totalSales = cashSalesUSD + numeric(s.aba_sales);
  const coinsUsed = numeric(s.beginning_coins) + numeric(s.coins_added) - numeric(s.final_coins);
  let coinReturn = 0;
  let prizes = 0;
  let totalPlays = 0;
  const errors = [];
  const machineResults = state.closing.machines.map(machine => {
    const productResults = ensureClosingProducts(machine).map(product => {
      const begin = numeric(product.begin_qty);
      const finalQty = numeric(product.final_qty);
      const available = begin;
      const used = available - finalQty;
      const machineLabel = canonicalMachineTypeName(machine.machine_type, machine.machine_id) || machine.machine_id;
      if (finalQty > available) errors.push(`${machineLabel} · ${product.barcode || "product"}: Final Qty is greater than Begin Qty.`);
      prizes += used;
      return { used, invalid: used < 0 };
    });
    const machinePrizes = productResults.reduce((sum, item) => sum + Math.max(0, numeric(item.used)), 0);

    const beginText = String(machine.begin_coin_meter ?? "").trim();
    const finalText = String(machine.final_coin_meter ?? "").trim();
    const beginPresent = beginText !== "";
    const finalPresent = finalText !== "";
    let used = 0;
    let meterMode = "manual";
    let meterError = "";
    if (beginPresent && finalPresent) {
      meterMode = "meter";
      used = numeric(machine.final_coin_meter) - numeric(machine.begin_coin_meter);
      if (used < 0) meterError = "Final Meter cannot be lower than Begin Meter.";
    } else if (!beginPresent && !finalPresent) {
      meterMode = "manual";
      used = numeric(machine.coins_used);
    } else {
      meterMode = "incomplete";
      meterError = "Enter both meter values, or leave both blank and enter Coins Used manually.";
    }
    const machineLabel = canonicalMachineTypeName(machine.machine_type, machine.machine_id) || machine.machine_id;
    if (meterError) errors.push(`${machineLabel}: ${meterError}`);
    if (used < 0) errors.push(`${machineLabel}: Coins Used cannot be negative.`);
    const playRuleCoins = machineTypeRuleCoins(machine);
    const winRate = used >= 0 && playRuleCoins > 0 && machinePrizes > 0 ? used / playRuleCoins / machinePrizes : null;
    coinReturn += Math.max(0, used);
    if (playRuleCoins > 0 && used > 0) totalPlays += used / playRuleCoins;
    return { products: productResults, used, meterMode, meterError, machinePrizes, playRuleCoins, winRate };
  });
  const loseOver = coinReturn - coinsUsed;
  const expectedCoinRevenue = Math.max(0, coinsUsed) * coinPrice;
  const discount = Math.round((expectedCoinRevenue - totalSales) * 100) / 100;
  const discountPercent = expectedCoinRevenue > 0 ? (discount / expectedCoinRevenue) * 100 : null;
  const overallWinRate = prizes > 0 && totalPlays > 0 ? totalPlays / prizes : null;
  return {
    totalSales, cashSalesKHR, cashSalesUSD, exchangeRate, coinPrice,
    coinsUsed, coinReturn, loseOver, prizes,
    averagePerProduct: prizes > 0 ? totalSales / prizes : 0,
    expectedCoinRevenue, discount, discountPercent, overallWinRate, totalPlays,
    machineResults, errors,
    // Legacy aliases used by existing validation/save UI.
    coinsDispensed: coinsUsed, machineCoins: coinReturn, variance: loseOver, revenuePerPrize: prizes > 0 ? totalSales / prizes : 0,
  };
};

recalculateClosing = function() {
  if (!state.closing) return;
  const result = calculateLocal();
  const loseOverCaption = result.loseOver === 0 ? "Balanced" : (result.loseOver > 0 ? "Over" : "Lose");
  const discountPctText = result.discountPercent === null ? "—" : `${Math.abs(result.discountPercent).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  const discountClass = result.discount > 0 ? "kpi-discount-negative" : (result.discount < 0 ? "kpi-discount-positive" : "");
  document.getElementById("closingKpis").innerHTML = [
    kpiCard("Total Sales", money(result.totalSales), "circle-dollar-sign", "#2f6bff", "#eef4ff", `Cash ÷ ${number(result.exchangeRate)} + ABA`),
    kpiCard("Coins Used", number(result.coinsUsed), "coins", "#10a8c4", "#ebfbfe", "Coin stock used"),
    kpiCard("Coin Return", number(result.coinReturn), "coins", "#7a4dff", "#f4f0ff", "Machine coin total"),
    kpiCard("Lose / Over", `${result.loseOver >= 0 ? "+" : ""}${number(result.loseOver)}`, "scale", result.loseOver === 0 ? "#079455" : "#d92d20", result.loseOver === 0 ? "#ecfdf3" : "#fef3f2", loseOverCaption),
    kpiCard("Products Used", number(result.prizes), "gift", "#f63d68", "#fff0f4", "Qty Used"),
    kpiCard("AVG / Products", money(result.averagePerProduct), "circle-dollar-sign", "#ef7d00", "#fff4e8", "Sales ÷ products"),
    kpiCard("Discount", money(result.discount), "dollar", result.discount > 0 ? "#d92d20" : "#079455", result.discount > 0 ? "#fef3f2" : "#ecfdf3", `<span class="${discountClass}">${discountPctText}</span>`),
    kpiCard("Win Rate", result.overallWinRate === null ? "—" : Number(result.overallWinRate).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }), "gift", "#175cd3", "#eff8ff", result.overallWinRate === null ? "No wins yet" : "plays / win"),
  ].join("");

  result.machineResults.forEach((machineResult, machineIndex) => {
    machineResult.products.forEach((productResult, productIndex) => {
      const cell = document.querySelector(`.calc-product-used[data-machine-index="${machineIndex}"][data-product-index="${productIndex}"]`);
      if (cell) {
        cell.textContent = number(productResult.used);
        cell.classList.toggle("value-error", productResult.invalid);
      }
    });
    const coinsInput = document.querySelector(`.coins-used-input[data-machine-index="${machineIndex}"]`);
    const label = coinsInput?.closest(".coins-used-control")?.querySelector(".coins-mode-label");
    if (coinsInput) {
      coinsInput.classList.remove("meter-auto", "meter-manual", "error");
      if (machineResult.meterMode === "meter") {
        coinsInput.value = String(Math.max(0, machineResult.used));
        state.closing.machines[machineIndex].coins_used = coinsInput.value;
        coinsInput.readOnly = true;
        coinsInput.classList.add("meter-auto");
        if (label) label.textContent = "Auto";
      } else if (machineResult.meterMode === "manual") {
        coinsInput.readOnly = Boolean(state.closingReadOnly);
        coinsInput.classList.add("meter-manual");
        if (label) label.textContent = "Manual";
      } else {
        coinsInput.value = "";
        coinsInput.readOnly = true;
        coinsInput.classList.add("error");
        if (label) label.textContent = "Complete both meters";
      }
    }
    const winRateCell = document.querySelector(`.calc-win-rate[data-machine-index="${machineIndex}"]`);
    const winRateLabel = document.querySelector(`.win-rate-label[data-machine-index="${machineIndex}"]`);
    if (winRateCell) {
      winRateCell.textContent = machineResult.winRate === null ? "—" : Number(machineResult.winRate).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
      winRateCell.classList.toggle("not-configured", machineResult.playRuleCoins <= 0);
    }
    if (winRateLabel) {
      if (machineResult.playRuleCoins > 0) {
        const wins = machineResult.machinePrizes;
        winRateLabel.textContent = wins > 0 ? `${machineResult.playRuleCoins} coin${machineResult.playRuleCoins === 1 ? "" : "s"}/play · ${number(wins)} win${wins === 1 ? "" : "s"}` : `${machineResult.playRuleCoins} coin${machineResult.playRuleCoins === 1 ? "" : "s"}/play · no wins`;
      } else {
        winRateLabel.textContent = "Set play rule";
      }
    }
  });

  const validation = document.getElementById("closingValidation");
  if (result.errors.length) {
    validation.textContent = result.errors[0];
    validation.style.color = "#b42318";
  } else if (result.variance === 0) {
    validation.textContent = "Coin control is balanced";
    validation.style.color = "#067647";
  } else {
    validation.textContent = `Lose / Over: ${result.variance >= 0 ? "+" : ""}${number(result.variance)}`;
    validation.style.color = "#b42318";
  }
};

setClosingReadOnly = function(readOnly) {
  if (readOnly && state.bulkMode) setBulkMode(false);
  document.querySelectorAll("#page-closing input, #page-closing select, #page-closing textarea").forEach(element => element.disabled = readOnly);
  const draft = document.getElementById("saveDraftBtn");
  const finalize = document.getElementById("finalizeBtn");
  const bulkToggle = document.getElementById("bulkSelectToggle");
  if (draft) draft.disabled = readOnly;
  if (finalize) finalize.disabled = readOnly;
  if (bulkToggle) bulkToggle.disabled = readOnly;
  document.querySelectorAll("#page-closing .quick-code").forEach(button => { button.disabled = readOnly; });
  recalculateClosing();
};

saveClosing = async function(status) {
  const local = calculateLocal();
  if (local.errors.length) {
    toast("Check machine entry", local.errors[0], "error");
    return;
  }
  if (status === "Finalized") {
    const missingManual = state.closing.machines.find(machine => {
      const beginBlank = String(machine.begin_coin_meter ?? "").trim() === "";
      const finalBlank = String(machine.final_coin_meter ?? "").trim() === "";
      return beginBlank && finalBlank && String(machine.coins_used ?? "").trim() === "";
    });
    if (missingManual) {
      toast("Coins Used is required", `${canonicalMachineTypeName(missingManual.machine_type, missingManual.machine_id) || missingManual.machine_id}: enter Coins Used manually or enter both meter values.`, "error");
      return;
    }
  }
  try {
    const button = status === "Finalized" ? document.getElementById("finalizeBtn") : document.getElementById("saveDraftBtn");
    button.disabled = true;
    const result = await api("/api/closings/save", { method: "POST", body: JSON.stringify(closingPayload(status)) });
    state.closingId = result.closing_id;
    state.closingStatus = result.workflow_status;
    state.closingReadOnly = status === "Finalized";
    renderClosing();
    toast(status === "Finalized" ? "Closing finalized" : "Draft saved", status === "Finalized" ? `${result.closing_id} was finalized and the Excel report was created with product details.` : `${result.closing_id} was saved successfully.`);
  } catch (error) {
    toast("Cannot save closing", error.message, "error");
    const button = status === "Finalized" ? document.getElementById("finalizeBtn") : document.getElementById("saveDraftBtn");
    if (button) button.disabled = false;
  }
};

openClosing = async function(closingId) {
  try {
    const data = await api(`/api/closings/${encodeURIComponent(closingId)}`);
    const h = data.header;
    const masterMap = new Map(state.machines.map(machine => [String(machine.Machine_ID), machine]));
    const productGroups = new Map();
    (data.products || []).forEach(row => {
      const key = String(row.Machine_ID || "");
      if (!productGroups.has(key)) productGroups.set(key, []);
      const imageFile = String(row.Image_File || row.image_object_key_snapshot || "");
      const signedImageUrl = String(row.Image_URL || row.image_url || "");
      productGroups.get(key).push({
        product_id: row.Product_ID,
        barcode: row.Barcode || "",
        image_file: imageFile,
        // Cloud closing images are private Storage objects. Their Edge-issued
        // signed URL is the display value; local mode retains its existing route.
        image_url: signedImageUrl || (!isCloudStaging() && imageFile ? `/api/machine-images/${encodeURIComponent(imageFile)}` : ""),
        sort_order: row.sort_order_snapshot ?? row.Sort_Order_Snapshot ?? row.sort_order ?? row.Sort_Order,
        default_quantity: 0,
        begin_qty: row.Begin_Qty ?? 0,
        final_qty: row.Final_Qty ?? 0,
      });
    });
    state.closingId = closingId;
    state.closingStatus = h.Workflow_Status || "Draft";
    state.closingReadOnly = state.closingStatus === "Finalized";
    state.closing = {
      report_date: dateDisplay(h.Report_Date), outlet: h.Outlet || "", invoice_no: h.Closing_Code || "", closed_by: h.Closed_By || "", verified_by: h.Verified_By || "", notes: h.Notes || "",
      sales: { cash_sales: h.Cash_Sales_KHR ?? (numeric(h.Cash_Sales || 0) * numeric(h.Exchange_Rate_USD_KHR || exchangeRateKHR())), cash_transactions: h.Cash_Transactions || 0, aba_sales: h.ABA_Sales || 0, aba_transactions: h.ABA_Transactions || 0, adjustment: h.Adjustment || 0, beginning_coins: h.Beginning_Coins || 0, coins_added: h.Coins_Added || 0, final_coins: h.Final_Coins || 0 },
      machines: data.machines.map(row => {
        const master = masterMap.get(String(row.Machine_ID)) || {};
        const products = productGroups.get(String(row.Machine_ID)) || machineProducts(master).map((product, productIndex) => ({ ...product, begin_qty: productIndex === 0 ? (row.Begin_Prize || 0) : 0, final_qty: productIndex === 0 ? (row.Final_Prize || 0) : 0 }));
        const manualMode = String(row.Meter_Mode || "") === "manual";
        return {
          machine_id: row.Machine_ID,
          machine_name: row.Machine_Name,
          machine_type: row.Machine_Type,
          capacity: row.Capacity || master.Capacity || 0,
          products,
          barcodes: products.map(item => item.barcode).filter(Boolean),
          begin_coin_meter: manualMode ? "" : (row.Begin_Coin_Meter ?? ""),
          final_coin_meter: manualMode ? "" : (row.Final_Coin_Meter ?? ""),
          coins_used: row.Coins_Used ?? row.Manual_Coins_Used ?? "",
          status: row.Machine_Status || "Working",
          notes: row.Notes || "",
        };
      }),
    };
    if (state.page !== "closing") await navigate("closing"); else renderClosing();
  } catch (error) {
    toast("Cannot open closing", error.message, "error");
  }
};

function newProductEditorItem(index = 0) {
  return {
    product_id: `product-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    barcode: "",
    default_quantity: 0,
    image_file: "",
    image_url: "",
    image_data: "",
    remove_image: false,
  };
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      reject(new Error("Use a JPG, PNG, or WEBP image."));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      reject(new Error("Choose an image smaller than 5 MB."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("The image could not be read."));
    reader.readAsDataURL(file);
  });
}

function productCardMarkup(product, index) {
  const image = product.image_data || product.image_url;
  return `<article class="product-editor-card" data-product-index="${index}" tabindex="0">
    <div class="product-card-number">Product ${index + 1}</div>
    <div class="product-card-grid">
      <div class="product-image-column">
        <div class="product-image-preview ${image ? "has-image" : ""}">${image ? `<img src="${escapeHtml(image)}" alt="Product preview">` : icon("image", 30)}</div>
        <input class="product-image-file" type="file" accept="image/jpeg,image/png,image/webp" hidden>
        <div class="product-image-actions">
          <button class="btn btn-secondary btn-compact product-upload" type="button">${icon("image", 14)} Upload</button>
          <button class="btn btn-secondary btn-compact product-paste" type="button">Paste Clipboard</button>
          <button class="btn btn-ghost btn-compact product-remove-image" type="button" ${image ? "" : "disabled"}>Remove</button>
        </div>
        <small>JPG, PNG, WEBP · max 5 MB · Ctrl+V supported</small>
      </div>
      <div class="product-fields-column">
        <div class="field"><label>Barcode</label><input class="input product-barcode" value="${escapeHtml(product.barcode || "")}" placeholder="Scan or enter barcode"></div>
        
      </div>
      <div class="product-card-actions">${product.product_id && !String(product.product_id).startsWith("product-") ? '<button class="btn btn-ghost btn-compact product-retire" type="button">Retire</button>' : `<button class="icon-button product-delete" type="button" title="Remove unsaved product">${icon("trash", 16)}</button>`}</div>
    </div>
  </article>`;
}

function syncProductEditorValues(container, products) {
  container.querySelectorAll(".product-editor-card").forEach(card => {
    const index = Number(card.dataset.productIndex);
    if (!products[index]) return;
    products[index].barcode = card.querySelector(".product-barcode").value.trim();
    products[index].default_quantity = 0;
  });
}

function productBarcodeKey(product) {
  return String(product?.barcode || "").trim().toLocaleLowerCase();
}

function pendingCloudProductImageOperations(products) {
  return products.flatMap(product => {
    const barcode = String(product?.barcode || "").trim();
    if (!barcode) return [];
    if (String(product?.image_data || "").trim()) return [{ product, barcode, kind: "replace" }];
    if (product?.remove_image) return [{ product, barcode, kind: "remove" }];
    return [];
  });
}

function cloudMachineMetadataProducts(products) {
  // Image payloads are intentionally excluded from the metadata save. Cloud
  // image writes are per persisted machine_style_id immediately afterwards.
  return products.map(({ image_data, remove_image, ...product }) => product);
}

async function persistCloudProductImages(machine, operations) {
  const stylesByBarcode = new Map(machineProducts(machine).map(product => [productBarcodeKey(product), product]));
  for (const operation of operations) {
    const style = stylesByBarcode.get(productBarcodeKey(operation));
    if (!style?.product_id) throw new Error(`Machine details saved, but image upload failed for barcode ${operation.barcode}.`);
    try {
      if (operation.kind === "remove") {
        await api("/api/images/remove", { method: "POST", body: JSON.stringify({ machine_style_id: style.product_id }) });
        operation.product.remove_image = false;
        operation.product.image_url = "";
        operation.product.image_file = "";
      } else {
        const match = String(operation.product.image_data || "").match(/^data:(image\/(?:jpeg|png|webp));base64,/);
        if (!match) throw new Error("Use a JPG, PNG, or WEBP image.");
        const saved = await api("/api/images/replace", {
          method: "POST",
          body: JSON.stringify({ machine_style_id: style.product_id, content_type: match[1], image_base64: operation.product.image_data }),
        });
        operation.product.image_data = "";
        operation.product.remove_image = false;
        operation.product.image_file = saved.image_path || "";
        operation.product.image_url = saved.image_url || "";
      }
    } catch (error) {
      const detail = error?.message ? ` ${error.message}` : "";
      throw new Error(`Machine details saved, but image upload failed for barcode ${operation.barcode}.${detail}`);
    }
  }
}

async function pasteProductImage(card, products) {
  const index = Number(card.dataset.productIndex);
  try {
    if (!navigator.clipboard?.read) throw new Error("Click inside this product card and press Ctrl+V to paste the copied image.");
    const items = await navigator.clipboard.read();
    const imageType = items.flatMap(item => item.types).find(type => ["image/png", "image/jpeg", "image/webp"].includes(type));
    if (!imageType) throw new Error("The clipboard does not contain a supported image.");
    const item = items.find(entry => entry.types.includes(imageType));
    const blob = await item.getType(imageType);
    products[index].image_data = await readImageFile(new File([blob], `clipboard.${imageType.split("/")[1]}`, { type: imageType }));
    products[index].remove_image = false;
    return true;
  } catch (error) {
    toast("Paste image", error.message, "error");
    return false;
  }
}

function bindProductEditor(container, products, rerender) {
  container.querySelectorAll(".product-editor-card").forEach(card => {
    const index = Number(card.dataset.productIndex);
    const fileInput = card.querySelector(".product-image-file");
    card.querySelector(".product-upload").onclick = () => fileInput.click();
    fileInput.onchange = async () => {
      try {
        products[index].image_data = await readImageFile(fileInput.files?.[0]);
        products[index].remove_image = false;
        syncProductEditorValues(container, products);
        rerender(index);
      } catch (error) {
        toast("Cannot use image", error.message, "error");
      }
    };
    card.querySelector(".product-paste").onclick = async () => {
      syncProductEditorValues(container, products);
      if (await pasteProductImage(card, products)) rerender(index);
    };
    card.querySelector(".product-remove-image").onclick = () => {
      syncProductEditorValues(container, products);
      products[index].image_data = "";
      products[index].image_url = "";
      products[index].remove_image = true;
      rerender(index);
    };
    const removeUnsaved = card.querySelector(".product-delete");
    if (removeUnsaved) removeUnsaved.onclick = () => {
      syncProductEditorValues(container, products);
      products.splice(index, 1);
      rerender(Math.max(0, index - 1));
    };
    const retire = card.querySelector(".product-retire");
    if (retire) retire.onclick = async () => {
      syncProductEditorValues(container, products);
      const product = products[index];
      if (!window.confirm(`Retire ${product.barcode || "this product"}? Historical and active-shift rows will be preserved; future shifts will not include it.`)) return;
      try {
        await api(`/api/machine-styles/${encodeURIComponent(product.product_id)}`, { method: "DELETE", body: JSON.stringify({}) });
        products.splice(index, 1);
        rerender(Math.max(0, index - 1));
        toast("Product retired", "It remains visible in any active shift that already contains it.");
      } catch (error) { toast("Cannot retire product", error.message, "error"); }
    };
  });

  container.onpaste = async event => {
    const card = event.target.closest(".product-editor-card") || container.querySelector(".product-editor-card:focus-within");
    if (!card) return;
    const imageItem = [...(event.clipboardData?.items || [])].find(item => item.type.startsWith("image/"));
    if (!imageItem) return;
    event.preventDefault();
    const index = Number(card.dataset.productIndex);
    try {
      products[index].image_data = await readImageFile(imageItem.getAsFile());
      products[index].remove_image = false;
      syncProductEditorValues(container, products);
      rerender(index);
      toast("Image pasted", `Clipboard image attached to Product ${index + 1}.`);
    } catch (error) {
      toast("Cannot paste image", error.message, "error");
    }
  };
}

showMachineModal = function(machine) {
  const isEdit = Boolean(machine);
  const modalId = "machine-editor-v217";
  const currentType = canonicalMachineTypeName(machine?.Machine_Type, machine?.Machine_ID);
  const typeOptions = machineTypeOptions(currentType || configuredMachineTypes()[0]?.name || "", isEdit);
  let products = machineProducts(machine).map(item => ({ ...item, image_data: "", remove_image: false }));
  if (!products.length) products = [newProductEditorItem(0)];

  showModal(`${isEdit ? "Edit" : "Add"} Machine`, `<div id="${modalId}" class="machine-editor product-machine-editor">
    <div class="grid-2">
      <div class="field"><label>Machine Type</label><select id="m-type" class="select" ${isEdit ? "disabled" : ""}>${typeOptions}</select><small class="field-help">${isEdit ? "Machine Type is fixed after creation to preserve its identity." : "Machine number is assigned automatically inside the selected type."}</small></div>
      
      <div class="field"><label>Prize Category</label><input id="m-category" class="input" value="${escapeHtml(machine?.Prize_Category || "Plush Toy")}"></div>
      <div class="field"><label>Status</label><select id="m-active" class="select"><option value="true" ${machine?.Active !== false ? "selected" : ""}>Active</option><option value="false" ${machine?.Active === false ? "selected" : ""}>Inactive</option></select></div>
      <div class="field grid-span-2"><label>Notes</label><input id="m-notes" class="input" value="${escapeHtml(machine?.Notes || "")}"></div>
    </div>
    <section class="products-editor-section">
      <div class="barcode-editor-header"><div><label>Products inside this machine</label><p>Each product has its own barcode and image.</p></div><div class="product-template-actions">${isEdit ? '<button id="showInactiveProducts" class="btn btn-ghost btn-compact" type="button">Show inactive</button>' : ""}<button id="addProductCard" class="btn btn-secondary btn-compact" type="button">${icon("plus", 14)} Add Code</button></div></div>
      <div id="productEditorCards" class="product-editor-cards"></div>
    </section>
  </div>`, "Save Machine", async () => {
    const container = document.getElementById(modalId);
    syncProductEditorValues(container, products);
    const codes = products.map(item => item.barcode.trim()).filter(Boolean);
    const duplicate = codes.find((code, index) => codes.findIndex(item => item.toLowerCase() === code.toLowerCase()) !== index);
    if (duplicate) throw new Error(`Duplicate barcode: ${duplicate}`);
    const machineId = String(machine?.Machine_ID || "").trim();
    const selectedType = document.getElementById("m-type").value.trim();
    if (!selectedType) throw new Error("Choose a Machine Type from Settings.");
    const cloudImageOperations = isCloudStaging() ? pendingCloudProductImageOperations(products) : [];
    const payload = {
      machine_type: selectedType,
      capacity: 0,
      prize_category: document.getElementById("m-category").value,
      active: document.getElementById("m-active").value === "true",
      notes: document.getElementById("m-notes").value,
      products: isCloudStaging() ? cloudMachineMetadataProducts(products) : products,
    };
    if (machineId) payload.machine_id = machineId;
    const result = await api("/api/machines", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const confirmedMachines = await api("/api/machines?active_only=false");
    let updated = confirmedMachines.find(item => String(item.Machine_ID) === String(result.machine?.Machine_ID));
    if (!updated) throw new Error("Machine save was not confirmed by the active outlet.");
    if (cloudImageOperations.length) {
      await persistCloudProductImages(updated, cloudImageOperations);
      // Do not use temporary browser previews as the success condition. Read
      // back signed URLs from Cloud only after every image operation succeeds.
      const refreshedMachines = await api("/api/machines?active_only=false");
      confirmedMachines.splice(0, confirmedMachines.length, ...refreshedMachines);
      updated = confirmedMachines.find(item => String(item.Machine_ID) === String(result.machine?.Machine_ID));
      if (!updated) throw new Error("Machine image save was not confirmed by the active outlet.");
    }
    state.machines = confirmedMachines;
    if (state.bootstrap) state.bootstrap.machines = confirmedMachines;
    const closingMachine = state.closing?.machines?.find(item => String(item.machine_id) === String(updated.Machine_ID));
    if (closingMachine) {
      if (updated.Active === false) {
        state.closing.machines = state.closing.machines.filter(item => String(item.machine_id) !== String(updated.Machine_ID));
      } else {
        const currentById = new Map(ensureClosingProducts(closingMachine).map(item => [item.product_id, item]));
        closingMachine.machine_name = updated.Machine_Name;
        closingMachine.machine_type = updated.Machine_Type;
        closingMachine.sort_order = updated.Sort_Order;
        closingMachine.capacity = updated.Capacity;
        const nextProducts = machineProducts(updated).map(item => {
          const current = currentById.get(item.product_id);
          return current ? { ...item, begin_qty: current.begin_qty, refill_qty: current.refill_qty || 0, refill_history: current.refill_history || [], final_qty: current.final_qty } : { ...item, begin_qty: 0, refill_qty: 0, refill_history: [], final_qty: 0 };
        });
        // A retirement changes the master template only.  The in-progress
        // closing keeps its snapshot until it is finalized or voided.
        const nextIds = new Set(nextProducts.map(item => item.product_id));
        if (state.closingId && !state.closingReadOnly) currentById.forEach((current, productId) => { if (!nextIds.has(productId)) nextProducts.push(current); });
        closingMachine.products = nextProducts;
        closingMachine.barcodes = machineBarcodes(updated);
      }
    } else if (state.closing && updated.Active !== false) {
      const freshProducts = machineProducts(updated).map(item => ({ ...item, begin_qty: 0, refill_qty: 0, refill_history: [], final_qty: 0 }));
      state.closing.machines.push({
        machine_id: updated.Machine_ID,
        machine_name: updated.Machine_Name,
        machine_type: updated.Machine_Type,
        sort_order: updated.Sort_Order,
        capacity: updated.Capacity,
        products: freshProducts.length ? freshProducts : [{ product_id: `product-${updated.Machine_ID}-1`, barcode: "", default_quantity: 0, image_file: "", image_url: "", begin_qty: 0, final_qty: 0 }],
        barcodes: machineBarcodes(updated),
        begin_coin_meter: "",
        final_coin_meter: "",
        coins_used: "",
        status: "Working",
        notes: "",
      });
    }
    if (state.closing && state.closingId && !state.closingReadOnly) {
      scheduleAutosaveV2179();
      await flushAutosaveV2179();
    }
    if (isCloudStaging() && state.closingId) await openClosing(state.closingId);
    closeModal();
    toast("Machine saved", "Product barcodes, quantities, and images were confirmed for this outlet.");
    if (state.page === "closing") renderClosing();
  });

  document.querySelector("#modalRoot .modal")?.classList.add("product-modal");
  const container = document.getElementById(modalId);
  const cards = document.getElementById("productEditorCards");
  const renderCards = focusIndex => {
    cards.innerHTML = products.map(productCardMarkup).join("") || '<div class="empty-products">No products. Select Add Code.</div>';
    bindProductEditor(container, products, renderCards);
    const focusCard = cards.querySelector(`.product-editor-card[data-product-index="${focusIndex}"]`);
    focusCard?.querySelector(".product-barcode")?.focus();
  };
  document.getElementById("addProductCard").onclick = () => {
    syncProductEditorValues(container, products);
    products.push(newProductEditorItem(products.length));
    renderCards(products.length - 1);
  };
  const showInactive = document.getElementById("showInactiveProducts");
  if (showInactive) showInactive.onclick = async () => {
    try {
      const masters = await api("/api/machines?active_only=false&include_inactive=true");
      const refreshed = masters.find(item => String(item.Machine_ID) === String(machine?.Machine_ID));
      if (!refreshed) throw new Error("Machine not found.");
      syncProductEditorValues(container, products);
      products = machineProducts(refreshed).map(item => ({ ...item, image_data: "", remove_image: false }));
      renderCards(-1);
      showInactive.remove();
    } catch (error) { toast("Cannot show inactive products", error.message, "error"); }
  };
  renderCards(-1);
};

showMachineCodesModal = async function(closingMachine) {
  let master = state.machines.find(item => String(item.Machine_ID) === String(closingMachine.machine_id));
  if (!master) {
    state.machines = await api("/api/machines?active_only=false");
    master = state.machines.find(item => String(item.Machine_ID) === String(closingMachine.machine_id));
  }
  if (!master) {
    toast("Machine not found", "Use Daily Closing → Edit to add or save this machine first.", "error");
    return;
  }
  showMachineModal(master);
};


/* v2.1.22 — streamlined Daily Closing workflow + controlled report date */
function reportDateIso(value) {
  return displayToIsoDate(value) || isoToday();
}

function reportDateDisplay(value) {
  return dateDisplay(reportDateIso(value));
}

function shiftIsoDate(value, days) {
  const iso = reportDateIso(value);
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function closingDateControl(value) {
  const iso = reportDateIso(value);
  const locked = Boolean(state.closingId) || Boolean(state.closingReadOnly);
  const today = isoToday();
  return `<div class="field closing-date-field">
    <label>Report Date</label>
    <div class="closing-date-control ${locked ? "is-locked" : ""}">
      <button class="date-step-button" id="closingDatePrev" type="button" title="Previous day" ${locked ? "disabled" : ""}>‹</button>
      <label class="date-picker-shell" title="${locked ? "Date is locked after the first save" : "Choose report date"}">
        <span class="date-display-value">${escapeHtml(dateDisplay(iso))}</span>
        ${icon("calendar", 16)}
        <input id="closingDatePicker" class="date-native-picker" type="date" value="${escapeHtml(iso)}" max="${escapeHtml(today)}" ${locked ? "disabled" : ""}>
      </label>
      <button class="date-today-button" id="closingDateToday" type="button" ${locked || iso === today ? "disabled" : ""}>Today</button>
      <button class="date-step-button" id="closingDateNext" type="button" title="Next day" ${locked || iso >= today ? "disabled" : ""}>›</button>
    </div>
  </div>`;
}

function closingHasEnteredData() {
  if (!state.closing) return false;
  const sales = state.closing.sales || {};
  if ([sales.cash_sales, sales.aba_sales, sales.beginning_coins, sales.coins_added, sales.final_coins].some(value => numeric(value) !== 0)) return true;
  return state.closing.machines.some(machine => {
    if (String(machine.begin_coin_meter ?? "").trim() || String(machine.final_coin_meter ?? "").trim() || numeric(machine.coins_used) !== 0) return true;
    return ensureClosingProducts(machine).some(product => numeric(product.final_qty) !== numeric(product.begin_qty));
  });
}

async function applyClosingReportDate(iso) {
  if (!state.closing || state.closingId || state.closingReadOnly) return;
  const nextIso = reportDateIso(iso);
  if (nextIso > isoToday()) return;
  const oldIso = reportDateIso(state.closing.report_date);
  if (nextIso === oldIso) return;
  if (closingHasEnteredData() && !window.confirm("Changing the report date will reload opening machine quantities for the selected day. Continue?")) {
    renderClosing();
    return;
  }
  try {
    const data = await api(`/api/new-closing?report_date=${encodeURIComponent(nextIso)}`);
    state.closing.report_date = dateDisplay(nextIso);
    state.closing.machines = data.machines;
    state.bulkMode = false;
    state.bulkSelection.clear();
    renderClosing();
    toast("Report date changed", `Opening quantities loaded for ${dateDisplay(nextIso)}.`);
  } catch (error) {
    toast("Cannot change date", error.message, "error");
    renderClosing();
  }
}

function bindClosingDateControls() {
  const picker = document.getElementById("closingDatePicker");
  const prev = document.getElementById("closingDatePrev");
  const next = document.getElementById("closingDateNext");
  const today = document.getElementById("closingDateToday");
  if (picker) picker.onchange = () => applyClosingReportDate(picker.value);
  if (prev) prev.onclick = () => applyClosingReportDate(shiftIsoDate(state.closing.report_date, -1));
  if (next) next.onclick = () => applyClosingReportDate(shiftIsoDate(state.closing.report_date, 1));
  if (today) today.onclick = () => applyClosingReportDate(isoToday());
}

function workflowStepper(review = false) {
  return `<div class="closing-workflow-stepper">
    <div class="workflow-step ${review ? "complete" : "active"}"><span>1</span><div><strong>Closing Entry</strong><small>Sales, coins & staff</small></div></div>
    <div class="workflow-connector ${review ? "complete" : "active"}"></div>
    <div class="workflow-step ${review ? "complete" : "active"}"><span>2</span><div><strong>Machine Closing</strong><small>Products & meters</small></div></div>
    <div class="workflow-connector ${review ? "complete" : ""}"></div>
    <div class="workflow-step ${review ? "active" : ""}"><span>3</span><div><strong>Review</strong><small>Verify & finalize</small></div></div>
  </div>`;
}

function compactKpiItem(label, value, caption = "", tone = "", iconName = "file") {
  return `<div class="closing-summary-item ${tone}"><div class="closing-summary-head"><span>${escapeHtml(label)}</span><span class="closing-summary-icon">${icon(iconName, 16)}</span></div><strong>${value}</strong></div>`;
}

function renderCompactClosingSummary(result) {
  const discountPct = result.discountPercent === null ? "—" : `${Math.abs(result.discountPercent).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  const loseTone = result.loseOver < 0 ? "tone-alert" : (result.loseOver > 0 ? "tone-good" : "");
  const discountTone = result.discount > 0 ? "tone-alert" : (result.discount < 0 ? "tone-good" : "");
  const win = result.overallWinRate === null ? "—" : Number(result.overallWinRate).toLocaleString(undefined, { maximumFractionDigits: 2 });
  return [
    compactKpiItem("Sales", money(result.totalSales), "USD", "", "circle-dollar-sign"),
    compactKpiItem("Discount", money(result.discount), discountPct, discountTone, "percent"),
    compactKpiItem("Coins Used", number(result.coinsUsed), "stock", "", "coins"),
    compactKpiItem("Coin Return", number(result.coinReturn), "machines", "", "refresh"),
    compactKpiItem("Lose / Over", `${result.loseOver >= 0 ? "+" : ""}${number(result.loseOver)}`, result.loseOver === 0 ? "balanced" : (result.loseOver > 0 ? "over" : "lose"), loseTone, "scale"),
    compactKpiItem("Products", number(result.prizes), "used", "", "boxes"),
    compactKpiItem("Win Rate", win, result.overallWinRate === null ? "no wins" : "plays / win", "", "trophy"),
    compactKpiItem("AVG / Product", money(result.averagePerProduct), "sales / used", "", "tag"),
  ].join("");
}

async function retireMachineAndReloadDraftV2189(machineId) {
  const targetClosingId = String(state.closingId || "");
  invalidateAutosaveForVoidV2181();
  const result = await api(`/api/machines/${encodeURIComponent(machineId)}`, { method: "DELETE" });
  if (String(result?.machine_id || "") !== machineId || result?.retired !== true) throw new Error("The machine was not retired.");

  // Clear all selection references and remove the retired machine before the
  // authoritative read so no stale local row can be selected or autosaved.
  setBulkMode(false);
  if (state.closing?.machines) state.closing.machines = state.closing.machines.filter(machine => String(machine.machine_id) !== machineId);
  showInactiveMachinesV2188 = false;
  state.machines = await api("/api/machines?active_only=true");
  if (state.bootstrap) state.bootstrap.machines = state.machines;

  if (targetClosingId && state.closingId === targetClosingId && state.closing && !state.closingReadOnly) {
    await openClosing(targetClosingId);
  }
  autosaveDirtyV2179 = false;
  autosaveFailureV2179 = false;
  autosaveIndicatorV2179("Saved");
  return result;
}

function bindClosingStructureActions(page) {
  const structureEdit = document.getElementById("closingStructureEdit");
  if (structureEdit) structureEdit.onclick = async () => {
    setBulkMode(false);
    state.machines = await api("/api/machines?active_only=false");
    state.closingStructureEdit = true;
    renderClosing();
  };
  const structureDone = document.getElementById("closingStructureDone");
  if (structureDone) structureDone.onclick = () => { state.closingStructureEdit = false; renderClosing(); };
  const addClosingMachine = document.getElementById("addClosingMachine");
  if (addClosingMachine) addClosingMachine.onclick = () => showMachineModal(null);
  page.querySelectorAll(".closing-edit-machine").forEach(button => button.onclick = async () => {
    let master = state.machines.find(item => String(item.Machine_ID) === String(button.dataset.machineId));
    if (!master) {
      state.machines = await api("/api/machines?active_only=false");
      master = state.machines.find(item => String(item.Machine_ID) === String(button.dataset.machineId));
    }
    if (master) showMachineModal(master);
  });
  page.querySelectorAll(".closing-delete-machine").forEach(button => button.onclick = async () => {
    const machineId = String(button.dataset.machineId || "");
    if (!machineId) return;
    if (!window.confirm(`Delete ${machineId} from active machines? Historical closing records and product data will be preserved.`)) return;
    try {
      const result = await retireMachineAndReloadDraftV2189(machineId);
      const removed = Number(result.removed_draft_machine_entries || 0);
      toast("Machine deleted", `${machineId} was removed from active machines and ${removed} current Draft machine ${removed === 1 ? "entry" : "entries"} were removed. Historical records were preserved.`);
      renderClosing();
    } catch (error) { toast("Cannot delete machine", error.message, "error"); }
  });
}

function renderMachineClosingTable(c, review = false) {
  const actionBlock = review ? `<span class="machine-count-badge">${c.machines.length} machines</span>` : `<span class="machine-count-badge">${c.machines.length} active machines</span><div class="machine-heading-buttons">${state.closingStructureEdit && !state.closingReadOnly ? `<button class="btn btn-primary btn-compact" id="addClosingMachine">${icon("plus", 15)} Add Machine</button><button class="btn btn-secondary btn-compact" id="closingStructureDone">${icon("check", 15)} Done</button>` : `<button class="btn btn-secondary btn-compact" id="bulkSelectToggle">${icon("mouse-pointer", 15)} Multi-select</button>${!state.closingReadOnly ? `<button class="btn btn-secondary btn-compact" id="closingStructureEdit">${icon("settings", 15)} Manage Machines</button>` : ""}`}</div>`;
  return `<article class="card section-card machine-section ${review ? "review-machine-section" : ""}">
      <div class="section-heading"><div><h2>Machine Closing</h2></div><div class="machine-heading-actions">${actionBlock}</div></div>
      ${state.closingStructureEdit && !review && !state.closingReadOnly ? `<div class="structure-edit-banner"><div><strong>Machine setup mode</strong><span>Add, edit, or delete active machines. Historical closing records stay preserved.</span></div></div>` : ""}
      ${!review ? `<div id="bulkEditBar" class="bulk-edit-bar" hidden><div class="bulk-summary"><strong id="bulkSelectedCount">0 cells selected</strong><span>Click-drag cells, Shift-click a range, or click a column header.</span></div><div class="bulk-controls"><input id="bulkValue" class="input bulk-value" placeholder="Value for selected cells"><button class="btn btn-primary btn-compact" id="bulkApplyBtn">Apply</button><button class="btn btn-secondary btn-compact" id="bulkFillBtn">${icon("copy-down", 15)} Fill from first</button><button class="btn btn-secondary btn-compact" id="bulkClearBtn">${icon("eraser", 15)} Clear</button><button class="btn btn-ghost btn-compact" id="bulkDoneBtn">Done</button></div></div>` : ""}
      <div class="data-table-wrap"><table class="data-table machine-table product-closing-table"><colgroup><col style="width:11%"><col style="width:20%"><col style="width:8%"><col style="width:8%"><col style="width:6%"><col style="width:9%"><col style="width:9%"><col style="width:10%"><col style="width:9%"><col style="width:10%"></colgroup><thead><tr><th>Machine</th><th>Product / Barcode</th><th class="bulk-column-header" data-bulk-field="begin_qty">Begin Qty</th><th class="bulk-column-header" data-bulk-field="final_qty">Final Qty</th><th>Qty Used</th><th class="bulk-column-header" data-bulk-field="begin_coin_meter">Begin Meter</th><th class="bulk-column-header" data-bulk-field="final_coin_meter">Final Meter</th><th class="bulk-column-header" data-bulk-field="coins_used">Coins Used</th><th>Win Rate</th><th>Status</th></tr></thead><tbody>${renderMachineRows(c.machines)}</tbody></table></div>
    </article>`;
}

renderPrintButton = function() {
  const button = document.getElementById("globalPrintButton");
  if (!button) return;
  const visible = state.page === "closing" && Boolean(state.closing) && Boolean(state.closingReview);
  button.hidden = !visible;
  if (!visible) return;
  button.disabled = false;
  button.innerHTML = `${icon("printer", 16)} Print`;
  button.onclick = printClosingPdf;
};

newClosing = async function() {
  state.closingId = null;
  state.closingStatus = "Draft";
  state.closingReadOnly = false;
  state.closingReview = false;
  state.closingStructureEdit = false;
  const today = isoToday();
  const data = await api(`/api/new-closing?report_date=${today}`);
  state.closing = { report_date: dateDisplay(data.report_date), outlet: data.outlet, closed_by: "", verified_by: "", notes: "", sales: defaultSales(), machines: data.machines };
  if (state.page !== "closing") await navigate("closing"); else renderClosing();
};

function closingReviewIssues(result) {
  const items = [...result.errors];
  if (!String(state.closing.closed_by || "").trim()) items.push("Closed By is blank.");
  if (!String(state.closing.verified_by || "").trim()) items.push("Verified By is blank.");
  if (result.loseOver !== 0) items.push(`Lose / Over is ${result.loseOver >= 0 ? "+" : ""}${number(result.loseOver)} coins.`);
  return items;
}

function openClosingReview() {
  const result = calculateLocal();
  if (result.errors.length) toast("Review has entry warnings", result.errors[0], "error");
  state.closingStructureEdit = false;
  setBulkMode(false);
  state.closingReview = true;
  renderClosing();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderClosingReview() {
  const c = state.closing;
  const result = calculateLocal();
  const issues = closingReviewIssues(result);
  renderPrintButton();
  setActions(`<button class="btn btn-primary" id="newClosingBtn">${icon("plus", 17)} Start Shift</button>`);
  document.getElementById("newClosingBtn").onclick = newClosing;
  const page = document.getElementById("page-closing");
  page.innerHTML = `${workflowStepper(true)}
    <article class="card review-heading-card">
      <div><span class="review-kicker">Review Closing</span><h2>${escapeHtml(reportDateDisplay(c.report_date))} · ${escapeHtml(c.outlet || "—")}</h2></div>
      <div class="review-staff-grid"><div><span>Closed By</span><strong>${escapeHtml(c.closed_by || "—")}</strong></div><div><span>Verified By</span><strong>${escapeHtml(c.verified_by || "—")}</strong></div>${c.invoice_no ? `<div><span>Invoice No</span><strong>${escapeHtml(closingInvoiceNo(c))}</strong></div>` : ""}</div>
    </article>
    <div id="closingKpis" class="closing-summary-strip">${renderCompactClosingSummary(result)}</div>
    <article class="review-check-card ${issues.length ? "has-warning" : "is-clear"}">
      <div class="review-check-icon">${icon(issues.length ? "alert" : "check", 18)}</div>
      <div><strong>${issues.length ? `${issues.length} item${issues.length === 1 ? "" : "s"} to review` : "Ready to finalize"}</strong><p>${issues.length ? escapeHtml(issues[0]) : "No machine-entry errors detected. Coin control is balanced."}</p>${issues.length > 1 ? `<details><summary>Show all review items</summary><ul>${issues.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></details>` : ""}</div>
    </article>
    ${renderMachineClosingTable(c, true)}
    <article class="card review-notes-card"><span>Shift Notes & Exceptions</span><p>${escapeHtml(c.notes || "No notes")}</p></article>`;
  renderReviewTopActions(`${!state.closingReadOnly ? `<button class="btn btn-secondary" id="backToClosingEdit">${icon("edit", 16)} Back to Edit</button><button class="btn btn-secondary" id="saveDraftBtn">${icon("file", 16)} Save Draft</button><button class="btn btn-success" id="finalizeBtn">${icon("check", 16)} Finalize Closing</button>` : `<button class="btn btn-secondary" id="backToClosingEdit">Back to Closing</button>`}`);
  recalculateClosing();
  page.querySelectorAll("input, select, textarea").forEach(element => element.disabled = true);
  const back = document.getElementById("backToClosingEdit");
  if (back) back.onclick = () => { state.closingReview = false; renderClosing(); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const draft = document.getElementById("saveDraftBtn");
  if (draft) draft.onclick = () => saveClosing("Draft");
  const finalize = document.getElementById("finalizeBtn");
  if (finalize) finalize.onclick = () => confirmFinalize();
}

renderClosing = function() {
  const c = state.closing;
  c.machines.forEach(ensureClosingProducts);
  if (state.closingReadOnly && !state.closingReview) state.closingReview = true;
  if (state.closingReview) { renderClosingReview(); return; }
  renderPrintButton();
  if (state.closingReadOnly) state.closingStructureEdit = false;
  setActions(`<button class="btn btn-primary" id="newClosingBtn">${icon("plus", 17)} Start Shift</button>`);
  document.getElementById("newClosingBtn").onclick = newClosing;
  const page = document.getElementById("page-closing");
  const result = calculateLocal();
  page.innerHTML = `${workflowStepper(false)}
    <article class="card closing-entry-panel">
      <div class="closing-entry-row closing-meta-row">
        <div class="entry-row-label"><strong>Closing & Payment</strong></div>
        <div class="closing-meta-fields">
          ${closingDateControl(c.report_date)}
          ${inputField("Outlet", "outlet", c.outlet, "text")}
          ${inputField("Closed By", "closed_by", c.closed_by, "text")}
          ${inputField("Verified By", "verified_by", c.verified_by, "text")}
        </div>
      </div>
      <div class="closing-entry-row closing-payment-compact">
        <div class="entry-row-label"><strong>Sales & Coins</strong></div>
        <div class="closing-payment-fields">
          ${inputField("Cash Sales (KHR)", "cash_sales", c.sales.cash_sales)}
          ${inputField("ABA QR Sales ($)", "aba_sales", c.sales.aba_sales)}
          ${inputField("Beginning Coins", "beginning_coins", c.sales.beginning_coins)}
          ${inputField("Coins Added", "coins_added", c.sales.coins_added)}
          ${inputField("Final Coins", "final_coins", c.sales.final_coins)}
        </div>
      </div>
    </article>
    <div id="closingKpis" class="closing-summary-strip">${renderCompactClosingSummary(result)}</div>
    ${renderMachineClosingTable(c, false)}
    <article class="card closing-notes-compact"><div class="field"><label>Shift Notes & Exceptions</label><textarea id="closingNotes" class="textarea" placeholder="Optional notes for the closing report">${escapeHtml(c.notes || "")}</textarea></div></article>
    <div class="closing-actions"><div class="action-status"><span id="closingValidation">Ready for entry</span></div><div class="action-buttons"><button class="btn btn-secondary" id="saveDraftBtn">${icon("file", 16)} Save Draft</button><button class="btn btn-success" id="reviewClosingBtn">${icon("check", 16)} Review Closing</button></div></div>`;

  resetBulkSelection();
  page.querySelectorAll(".closing-field").forEach(input => input.addEventListener("input", onClosingField));
  page.querySelectorAll(".machine-input").forEach(input => input.addEventListener("input", onMachineField));
  setupBulkSelection(page);
  bindClosingDateControls();
  bindClosingStructureActions(page);
  document.getElementById("closingNotes").addEventListener("input", event => { state.closing.notes = event.target.value; });
  document.getElementById("saveDraftBtn").onclick = () => saveClosing("Draft");
  document.getElementById("reviewClosingBtn").onclick = openClosingReview;
  setClosingReadOnly(state.closingReadOnly);
  recalculateClosing();
};

// Re-render compact KPI strip instead of the legacy large KPI cards.
recalculateClosing = function() {
  if (!state.closing) return;
  const result = calculateLocal();
  const kpis = document.getElementById("closingKpis");
  if (kpis) kpis.innerHTML = renderCompactClosingSummary(result);
  result.machineResults.forEach((machineResult, machineIndex) => {
    machineResult.products.forEach((productResult, productIndex) => {
      const cell = document.querySelector(`.calc-product-used[data-machine-index="${machineIndex}"][data-product-index="${productIndex}"]`);
      if (cell) { cell.textContent = number(productResult.used); cell.classList.toggle("value-error", productResult.invalid); }
    });
    const coinsInput = document.querySelector(`.coins-used-input[data-machine-index="${machineIndex}"]`);
    const label = coinsInput?.closest(".coins-used-control")?.querySelector(".coins-mode-label");
    if (coinsInput) {
      coinsInput.classList.remove("meter-auto", "meter-manual", "error");
      if (machineResult.meterMode === "meter") {
        coinsInput.value = String(Math.max(0, machineResult.used));
        state.closing.machines[machineIndex].coins_used = coinsInput.value;
        coinsInput.readOnly = true;
        coinsInput.classList.add("meter-auto");
        if (label) label.textContent = "Auto";
      } else if (machineResult.meterMode === "manual") {
        coinsInput.readOnly = Boolean(state.closingReadOnly || state.closingReview);
        coinsInput.classList.add("meter-manual");
        if (label) label.textContent = "Manual";
      } else {
        coinsInput.value = "";
        coinsInput.readOnly = true;
        coinsInput.classList.add("error");
        if (label) label.textContent = "Complete both meters";
      }
    }
    const winRateCell = document.querySelector(`.calc-win-rate[data-machine-index="${machineIndex}"]`);
    const winRateLabel = document.querySelector(`.win-rate-label[data-machine-index="${machineIndex}"]`);
    if (winRateCell) {
      winRateCell.textContent = machineResult.winRate === null ? "—" : Number(machineResult.winRate).toLocaleString(undefined, { maximumFractionDigits: 2 });
      winRateCell.classList.toggle("not-configured", machineResult.playRuleCoins <= 0);
    }
    if (winRateLabel) {
      if (machineResult.playRuleCoins > 0) winRateLabel.textContent = machineResult.machinePrizes > 0 ? `${machineResult.playRuleCoins} coin${machineResult.playRuleCoins === 1 ? "" : "s"}/play · ${number(machineResult.machinePrizes)} win${machineResult.machinePrizes === 1 ? "" : "s"}` : `${machineResult.playRuleCoins} coin${machineResult.playRuleCoins === 1 ? "" : "s"}/play · no wins`;
      else winRateLabel.textContent = "Set play rule";
    }
  });
  const validation = document.getElementById("closingValidation");
  if (validation) {
    if (result.errors.length) { validation.textContent = result.errors[0]; validation.style.color = "#b42318"; }
    else if (result.loseOver === 0) { validation.textContent = "Coin control is balanced"; validation.style.color = "#067647"; }
    else { validation.textContent = `Lose / Over: ${result.loseOver >= 0 ? "+" : ""}${number(result.loseOver)}`; validation.style.color = "#b42318"; }
  }
};

// Keep drafts in Entry mode after save; finalized records move to Review mode.
saveClosing = async function(status) {
  const local = calculateLocal();
  if (local.errors.length) { toast("Check machine entry", local.errors[0], "error"); return; }
  if (status === "Finalized") {
    const missingManual = state.closing.machines.find(machine => {
      const beginBlank = String(machine.begin_coin_meter ?? "").trim() === "";
      const finalBlank = String(machine.final_coin_meter ?? "").trim() === "";
      return beginBlank && finalBlank && String(machine.coins_used ?? "").trim() === "";
    });
    if (missingManual) { toast("Coins Used is required", `${canonicalMachineTypeName(missingManual.machine_type, missingManual.machine_id) || missingManual.machine_id}: enter Coins Used manually or enter both meter values.`, "error"); return; }
  }
  try {
    const button = status === "Finalized" ? document.getElementById("finalizeBtn") : document.getElementById("saveDraftBtn");
    if (button) button.disabled = true;
    const result = await api("/api/closings/save", { method: "POST", body: JSON.stringify(closingPayload(status)) });
    state.closingId = result.closing_id;
    state.closingStatus = result.workflow_status;
    state.closingReadOnly = status === "Finalized";
    state.closingReview = status === "Finalized" ? true : state.closingReview;
    renderClosing();
    toast(status === "Finalized" ? "Closing finalized" : "Draft saved", status === "Finalized" ? `${result.closing_id} was finalized successfully.` : `${result.closing_id} was saved. Report Date is now locked.`);
    return true;
  } catch (error) {
    toast("Cannot save closing", error.message, "error");
    const button = status === "Finalized" ? document.getElementById("finalizeBtn") : document.getElementById("saveDraftBtn");
    if (button) button.disabled = false;
    return false;
  }
};

// Final override so opened finalized closings land directly in Review.
const openClosingV2121 = openClosing;
openClosing = async function(closingId) {
  await openClosingV2121(closingId);
  state.closingReview = Boolean(state.closingReadOnly);
  renderClosing();
};

// v2.1.37 - top closing actions and Excel-style rectangular multi-select.
resetBulkSelection = function() {
  state.bulkMode = false;
  state.bulkSelection = new Set();
  state.bulkAnchor = null;
  state.bulkDragging = false;
  state.bulkDragAnchor = null;
};

setBulkMode = function(enabled) {
  if (state.closingReadOnly && enabled) return;
  state.bulkMode = enabled;
  if (!enabled) {
    state.bulkSelection.clear();
    state.bulkAnchor = null;
    state.bulkDragging = false;
    state.bulkDragAnchor = null;
  }
  updateBulkSelectionUi();
};

endBulkDrag = function() {
  state.bulkDragging = false;
  state.bulkDragAnchor = null;
};

handleBulkPointerDown = function(event) {
  const cell = event.currentTarget;
  const requested = state.bulkMode || event.ctrlKey || event.metaKey || event.shiftKey;
  if (!requested || state.closingReadOnly) return;
  if (!state.bulkMode) state.bulkMode = true;
  event.preventDefault();

  const key = cell.dataset.cellKey;
  if (event.shiftKey && state.bulkAnchor) {
    selectBulkRectangle(state.bulkAnchor, key, event.ctrlKey || event.metaKey);
    state.bulkDragging = false;
    state.bulkDragAnchor = null;
  } else if (event.ctrlKey || event.metaKey) {
    if (state.bulkSelection.has(key)) state.bulkSelection.delete(key);
    else state.bulkSelection.add(key);
    state.bulkAnchor = key;
    state.bulkDragging = false;
    state.bulkDragAnchor = null;
  } else {
    state.bulkSelection.clear();
    state.bulkSelection.add(key);
    state.bulkAnchor = key;
    state.bulkDragAnchor = key;
    state.bulkDragging = true;
  }
  updateBulkSelectionUi();
};

handleBulkPointerEnter = function(event) {
  if (!state.bulkMode || !state.bulkDragging || state.closingReadOnly) return;
  const key = event.currentTarget.dataset.cellKey;
  selectBulkRectangle(state.bulkDragAnchor || state.bulkAnchor, key, false);
  updateBulkSelectionUi();
};

const setupBulkSelectionV2136 = setupBulkSelection;
setupBulkSelection = function(page) {
  setupBulkSelectionV2136(page);
  const hint = document.querySelector("#bulkEditBar .bulk-summary span");
  if (hint) hint.textContent = "Drag for a rectangular range. Shift-click extends. Ctrl-click adds or removes individual cells.";
};

const renderClosingV2136Layout = renderClosing;
renderClosing = function() {
  renderClosingV2136Layout();
  if (!state.closing || state.closingReview || state.closingReadOnly) return;

  const bottomActions = document.querySelector("#page-closing .closing-actions");
  if (bottomActions) bottomActions.remove();

  renderReviewTopActions(`<button class="btn btn-secondary" id="saveDraftBtn">${icon("file", 16)} Save Draft</button><button class="btn btn-success" id="reviewClosingBtn">${icon("check", 16)} Review Closing</button>`);
  const draft = document.getElementById("saveDraftBtn");
  const review = document.getElementById("reviewClosingBtn") || document.getElementById("closeShiftBtnV2180");
  if (draft) draft.onclick = () => saveClosing("Draft");
  if (review) review.onclick = openClosingReview;
};


// v2.1.38 - audited product refill workflow and finalized-quantity carry-forward UX.
function refillHistoryFor(product) {
  const value = product?.refill_history ?? product?.Refill_History_JSON ?? [];
  if (Array.isArray(value)) return value.filter(item => item && Number(item.qty) > 0);
  const text = String(value || "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.filter(item => item && Number(item.qty) > 0) : [];
  } catch (_error) {
    return [];
  }
}

function refillTotal(product) {
  const history = refillHistoryFor(product);
  if (history.length) return history.reduce((sum, item) => sum + Math.max(0, numeric(item.qty)), 0);
  return Math.max(0, numeric(product?.refill_qty ?? product?.Refill_Qty));
}

const ensureClosingProductsV2137Refill = ensureClosingProducts;
ensureClosingProducts = function(machine) {
  const products = ensureClosingProductsV2137Refill(machine);
  products.forEach(product => {
    product.refill_history = refillHistoryFor(product);
    product.refill_qty = refillTotal(product);
  });
  return products;
};

const calculateLocalV2137Refill = calculateLocal;
calculateLocal = function() {
  const snapshots = [];
  if (state.closing) {
    state.closing.machines.forEach(machine => {
      ensureClosingProducts(machine).forEach(product => {
        snapshots.push([product, product.begin_qty]);
        product.begin_qty = numeric(product.begin_qty) + refillTotal(product);
      });
    });
  }
  let result;
  try {
    result = calculateLocalV2137Refill();
  } finally {
    snapshots.forEach(([product, beginQty]) => { product.begin_qty = beginQty; });
  }
  if (result?.errors) {
    result.errors = result.errors.map(message => String(message).replace("Final Qty is greater than Begin Qty.", "Final Qty is greater than Begin Qty + Refill."));
  }
  return result;
};

/* v2.1.86 — Developer outlet context switching and guarded machine-type purge. */
function cloudProfileRoleV2186() {
  return String(state.bootstrap?.cloud_context?.profile?.role || "").toLowerCase();
}

function activeCloudOutletsV2186() {
  return (state.bootstrap?.cloud_context?.stores || []).filter(store => store?.is_active !== false);
}

function activeCloudStoreV2186() {
  return state.bootstrap?.cloud_context?.active_store || null;
}

async function switchCloudOutletV2186(targetStoreId) {
  if (!isCloudStaging() || cloudProfileRoleV2186() !== "developer") return;
  const target = activeCloudOutletsV2186().find(store => String(store.id) === String(targetStoreId));
  if (!target) throw new Error("The selected outlet is not available to this Developer account.");
  if (String(activeCloudStoreV2186()?.id || "") === String(target.id)) return;

  // Persist the old outlet first; then invalidate every queued callback before
  // any request can acquire the target outlet header.
  await flushPendingAutosaveForOutletSwitchV2186();
  invalidateAutosaveForVoidV2181();
  window.clawApi?.setActiveStoreId?.(target.id);
  state.closingId = null;
  state.closingStatus = null;
  state.closingReadOnly = false;
  state.closingReview = false;
  state.closingStructureEdit = false;
  state.closing = null;
  state.history = [];
  state.appSettings = null;
  await reloadBootstrapAfterVoidV2181();

  const active = activeCloudStoreV2186();
  if (String(active?.id || "") !== String(target.id)) throw new Error("The selected outlet is no longer authorized.");
  if (state.page === "closing") await ensureClosingPage();
  else if (state.page === "history") await renderHistory();
  else if (state.page === "reports") await renderReports();
  else if (state.page === "settings") await renderSettings();
  else if (state.page === "dashboard") await renderDashboard();
  toast("Outlet switched", `Now viewing ${active.name || active.code}.`);
}

function installCloudOutletSelectorV2186() {
  const outletField = document.getElementById("field-outlet");
  if (!outletField || !isCloudStaging()) return;
  // The persistent topbar selector owns the Developer's cloud-store context.
  // This Closing field is a synchronized display, never a second selector.
  const active = activeCloudStoreV2186();
  outletField.value = active?.name || active?.code || state.closing?.outlet || "";
  outletField.readOnly = true;
  outletField.setAttribute("aria-readonly", "true");
  outletField.closest(".outlet-edit-shell")?.querySelector(".outlet-edit-button")?.remove();
}

const renderClosingV2186OutletSelector = renderClosing;
renderClosing = function() {
  renderClosingV2186OutletSelector();
  installCloudOutletSelectorV2186();
};

function showMachineTypePurgeV2186(machineType) {
  const name = String(machineType?.name || "");
  const typeId = String(machineType?.id || "");
  if (!name || !typeId) return;
  showModal(
    "Delete Machine Type Permanently",
    `<p>This permanently removes <strong>${escapeHtml(name)}</strong>, its rules, machines, styles, and only its Void closing entries. Draft or Finalized history blocks this action.</p><div class="field"><label for="confirmMachineTypePurgeV2186">Type <strong>${escapeHtml(name)}</strong> to confirm</label><input id="confirmMachineTypePurgeV2186" class="input" autocomplete="off"></div>`,
    "Delete Permanently",
    async () => {
      const confirmation = String(document.getElementById("confirmMachineTypePurgeV2186")?.value || "");
      if (confirmation !== name) throw new Error("Type the exact machine type name to permanently delete it.");
      const result = await api(`/api/machine-types/${encodeURIComponent(typeId)}`, { method: "DELETE", body: JSON.stringify({ confirm_name: confirmation }) });
      await reloadBootstrapAfterVoidV2181();
      state.settingsEdit.machineTypes = false;
      closeModal();
      await renderSettings();
      const cleanup = Array.isArray(result.storage_cleanup_failed_paths) && result.storage_cleanup_failed_paths.length;
      toast(cleanup ? "Machine type deleted; image cleanup needs attention" : "Machine type deleted", cleanup ? "Database purge completed, but one or more exact image paths could not be removed." : `${name} was permanently deleted.`);
    }
  );
  setTimeout(() => document.getElementById("confirmMachineTypePurgeV2186")?.focus(), 0);
}

function installDeveloperMachineTypePurgeV2186() {
  if (!isCloudStaging() || cloudProfileRoleV2186() !== "developer") return;
  const types = configuredMachineTypes();
  document.querySelectorAll("#machineTypeSettingList .machine-type-setting-row").forEach((row, index) => {
    const type = types[index];
    if (!type?.id || row.querySelector(".delete-machine-type-permanently")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-ghost btn-compact delete-machine-type-permanently";
    button.textContent = "Delete Permanently";
    button.onclick = () => showMachineTypePurgeV2186(type);
    row.appendChild(button);
  });
}

const renderSettingsV2186MachineTypePurge = renderSettings;
renderSettings = async function() {
  const result = await renderSettingsV2186MachineTypePurge();
  installDeveloperMachineTypePurgeV2186();
  return result;
};

const closingHasEnteredDataV2137Refill = closingHasEnteredData;
closingHasEnteredData = function() {
  if (closingHasEnteredDataV2137Refill()) return true;
  return Boolean(state.closing?.machines?.some(machine => ensureClosingProducts(machine).some(product => refillTotal(product) > 0)));
};

renderMachineRows = function(machines) {
  let html = "";
  let visualRow = 0;
  for (const [type, rows] of groupMachines(machines)) {
    html += `<tr class="group-row"><td colspan="11">${escapeHtml(type)} · ${rows.length} machines</td></tr>`;
    for (const machine of rows) {
      const machineIndex = machines.indexOf(machine);
      const products = ensureClosingProducts(machine);
      const rowSpan = Math.max(products.length, 1);
      products.forEach((product, productIndex) => {
        const first = productIndex === 0;
        const last = productIndex === products.length - 1;
        const bulkRow = visualRow++;
        const groupClasses = [
          "product-closing-row",
          first ? "machine-group-start" : "machine-group-middle",
          last ? "machine-group-end" : "",
        ].filter(Boolean).join(" ");
        const refillQty = refillTotal(product);
        const historyCount = refillHistoryFor(product).length;
        html += `<tr class="${groupClasses}" data-machine-index="${machineIndex}" data-product-index="${productIndex}">
          ${first ? `<td rowspan="${rowSpan}" class="align-left machine-row-cell machine-group-cell machine-group-left"><div class="closing-machine-identity"><strong class="closing-machine-id">${escapeHtml(machine.machine_id)}</strong>${state.closingStructureEdit && !state.closingReadOnly ? `<div class="closing-machine-structure-actions"><button class="mini-action closing-edit-machine" type="button" data-machine-id="${escapeHtml(machine.machine_id)}">${icon("edit", 13)} Edit</button><button class="mini-action danger closing-delete-machine" type="button" data-machine-id="${escapeHtml(machine.machine_id)}">${icon("trash", 13)} Delete</button></div>` : ""}</div></td>` : ""}
          <td class="align-left product-barcode-cell"><div class="product-row-identity">${productThumbnail(product)}<div><strong>${escapeHtml(product.barcode || `Product ${productIndex + 1}`)}</strong></div></div></td>
          <td>${productInput(machineIndex, productIndex, "begin_qty", product.begin_qty, bulkRow, 0)}</td>
          <td class="refill-table-cell"><button type="button" class="refill-total-button ${refillQty > 0 ? "has-refill" : "no-refill"}" data-machine-index="${machineIndex}" data-product-index="${productIndex}" title="${historyCount ? `${historyCount} refill event${historyCount === 1 ? "" : "s"}` : "No refill recorded"}">${refillQty > 0 ? `+${number(refillQty)}` : icon("plus", 14)}</button></td>
          <td>${productInput(machineIndex, productIndex, "final_qty", product.final_qty, bulkRow, 1)}</td>
          <td class="calc-product-used" data-machine-index="${machineIndex}" data-product-index="${productIndex}">0</td>
          ${first ? `<td rowspan="${rowSpan}" class="machine-meter-cell machine-group-cell">${machineInput(machineIndex, "begin_coin_meter", machine.begin_coin_meter, bulkRow, 2, "number", "meter-input")}</td>
          <td rowspan="${rowSpan}" class="machine-meter-cell machine-group-cell">${machineInput(machineIndex, "final_coin_meter", machine.final_coin_meter, bulkRow, 3, "number", "meter-input")}</td>
          <td rowspan="${rowSpan}" class="machine-meter-cell machine-group-cell"><div class="coins-used-control">${machineInput(machineIndex, "coins_used", machine.coins_used, bulkRow, 4, "number", "coins-used-input")}</div></td>
          <td rowspan="${rowSpan}" class="machine-meter-cell machine-group-cell"><div class="win-rate-control"><strong class="calc-win-rate" data-machine-index="${machineIndex}">—</strong></div></td>
          <td rowspan="${rowSpan}" class="machine-meter-cell machine-group-cell machine-group-right status-cell"><select class="table-select machine-input machine-status-select" data-machine-index="${machineIndex}" data-field="status"><option ${machine.status === "Working" ? "selected" : ""}>Working</option><option ${machine.status === "Maintenance" ? "selected" : ""}>Maintenance</option><option ${machine.status === "Out of Service" ? "selected" : ""}>Out of Service</option></select></td>` : ""}
        </tr>`;
      });
    }
  }
  return html;
};

renderMachineClosingTable = function(c, review = false) {
  const actionBlock = review
    ? `<span class="machine-count-badge">${c.machines.length} machines</span>`
    : `<span class="machine-count-badge">${c.machines.length} active machines</span><div class="machine-heading-buttons">${state.closingStructureEdit && !state.closingReadOnly ? `<button class="btn btn-primary btn-compact" id="addClosingMachine">${icon("plus", 15)} Add Machine</button><button class="btn btn-secondary btn-compact" id="closingStructureDone">${icon("check", 15)} Done</button>` : `<button class="btn btn-secondary btn-compact" id="bulkSelectToggle">${icon("mouse-pointer", 15)} Multi-select</button>${!state.closingReadOnly ? `<button class="btn btn-secondary btn-compact" id="closingStructureEdit">${icon("settings", 15)} Manage Machines</button>` : ""}`}</div>`;
  return `<article class="card section-card machine-section ${review ? "review-machine-section" : ""}">
      <div class="section-heading"><div><h2>Machine Closing</h2></div><div class="machine-heading-actions">${actionBlock}</div></div>
      ${state.closingStructureEdit && !review && !state.closingReadOnly ? `<div class="structure-edit-banner"><div><strong>Machine setup mode</strong><span>Add, edit, or delete active machines. Historical closing records stay preserved.</span></div></div>` : ""}
      ${!review ? `<div id="bulkEditBar" class="bulk-edit-bar" hidden><div class="bulk-summary"><strong id="bulkSelectedCount">0 cells selected</strong><span>Drag for a rectangular range. Shift-click extends. Ctrl-click adds or removes individual cells.</span></div><div class="bulk-controls"><input id="bulkValue" class="input bulk-value" placeholder="Value for selected cells"><button class="btn btn-primary btn-compact" id="bulkApplyBtn">Apply</button><button class="btn btn-secondary btn-compact" id="bulkFillBtn">${icon("copy-down", 15)} Fill from first</button><button class="btn btn-secondary btn-compact" id="bulkClearBtn">${icon("eraser", 15)} Clear</button><button class="btn btn-ghost btn-compact" id="bulkDoneBtn">Done</button></div></div>` : ""}
      <div class="data-table-wrap"><table class="data-table machine-table product-closing-table refill-enabled-table"><colgroup><col style="width:10%"><col style="width:19%"><col style="width:7%"><col style="width:6%"><col style="width:7%"><col style="width:6%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:8%"><col style="width:10%"></colgroup><thead><tr><th>Machine</th><th>Product / Barcode</th><th class="bulk-column-header" data-bulk-field="begin_qty">Begin Qty</th><th>Refill</th><th class="bulk-column-header" data-bulk-field="final_qty">Final Qty</th><th>Qty Used</th><th class="bulk-column-header" data-bulk-field="begin_coin_meter">Begin Meter</th><th class="bulk-column-header" data-bulk-field="final_coin_meter">Final Meter</th><th class="bulk-column-header" data-bulk-field="coins_used">Coins Used</th><th>Win Rate</th><th>Status</th></tr></thead><tbody>${renderMachineRows(c.machines)}</tbody></table></div>
    </article>`;
};

function refillEventLabel(event) {
  const raw = String(event?.at || "");
  let when = raw;
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) when = parsed.toLocaleString([], { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }
  return { when: when || "—", by: String(event?.by || "Staff"), qty: Math.max(0, numeric(event?.qty)) };
}

function showRefillHistory(machineIndex, productIndex) {
  const machine = state.closing?.machines?.[Number(machineIndex)];
  const product = machine ? ensureClosingProducts(machine)[Number(productIndex)] : null;
  if (!machine || !product) return;
  const history = refillHistoryFor(product);
  const rows = history.length ? history.slice().reverse().map(item => {
    const event = refillEventLabel(item);
    return `<div class="refill-history-row"><div><strong>+${number(event.qty)}</strong><span>${escapeHtml(event.by)}</span></div><time>${escapeHtml(event.when)}</time></div>`;
  }).join("") : `<div class="refill-history-empty">No refill has been recorded for this product.</div>`;
  showModal(`Refill History · ${machineDisplayLabel(machine, state.closing?.machines || [])}`, `<div class="refill-history-head"><span>${productThumbnail(product, "small")}</span><div><strong>${escapeHtml(product.barcode || "Product")}</strong><p>Total refill: <b>+${number(refillTotal(product))}</b></p></div></div><div class="refill-history-list">${rows}</div>`, "Close", async () => closeModal());
  document.querySelector("#modalRoot .modal")?.classList.add("refill-history-modal");
}

function refillEditorRows(machine) {
  return ensureClosingProducts(machine).map((product, productIndex) => {
    const total = refillTotal(product);
    const history = refillHistoryFor(product);
    return `<div class="refill-editor-row" data-product-index="${productIndex}">
      <div class="refill-product">${productThumbnail(product, "small")}<div><strong>${escapeHtml(product.barcode || `Product ${productIndex + 1}`)}</strong><span>Begin ${number(product.begin_qty)} · Refilled ${number(total)}</span></div></div>
      <div class="refill-entry"><label>Add Qty</label><input class="input refill-add-input" data-product-index="${productIndex}" type="number" min="0" step="1" value="0"></div>
      <button type="button" class="refill-history-link" data-history-product="${productIndex}" ${history.length ? "" : "disabled"}>${history.length ? `${history.length} event${history.length === 1 ? "" : "s"}` : "No history"}</button>
    </div>`;
  }).join("");
}

function showRefillModal() {
  if (!state.closing || state.closingReadOnly || state.closingReview) return;
  if (!String(state.closing.closed_by || "").trim()) {
    toast("Closed By is required", "Enter the staff name before recording a refill so the refill history has an audit name.", "error");
    document.querySelector('[data-key="closed_by"]')?.focus();
    return;
  }
  if (!state.closing.machines.length) {
    toast("No active machines", "Add an active machine before recording a refill.", "error");
    return;
  }
  const options = state.closing.machines.map((machine, index) => `<option value="${index}">${escapeHtml(machineDisplayLabel(machine, state.closing?.machines || []))}</option>`).join("");
  const body = `<div class="refill-modal-copy"><strong>Record physical stock added during this closing.</strong><span>Beginning Qty stays unchanged. Qty Used = Begin Qty + Refill − Final Qty.</span></div><div class="field"><label>Machine</label><select id="refillMachineSelect" class="select">${options}</select></div><div id="refillProductRows" class="refill-editor-list"></div>`;
  showModal("Refill Products", body, "Save Refill", async () => {
    const machineIndex = Number(document.getElementById("refillMachineSelect")?.value || 0);
    const machine = state.closing.machines[machineIndex];
    const products = ensureClosingProducts(machine);
    const entries = [...document.querySelectorAll("#refillProductRows .refill-add-input")].map(input => ({ productIndex: Number(input.dataset.productIndex), qty: Math.max(0, Math.floor(numeric(input.value))) })).filter(item => item.qty > 0);
    if (!entries.length) throw new Error("Enter a refill quantity for at least one product.");
    const snapshots = entries.map(item => {
      const product = products[item.productIndex];
      return { product, refill_qty: product.refill_qty, refill_history: refillHistoryFor(product).slice() };
    });
    const timestamp = new Date().toISOString();
    const staff = String(state.closing.closed_by || "Staff").trim() || "Staff";
    let totalAdded = 0;
    entries.forEach(item => {
      const product = products[item.productIndex];
      const history = refillHistoryFor(product).slice();
      history.push({ qty: item.qty, at: timestamp, by: staff });
      product.refill_history = history;
      product.refill_qty = history.reduce((sum, event) => sum + Math.max(0, numeric(event.qty)), 0);
      totalAdded += item.qty;
    });
    try {
      const result = await api("/api/closings/save", { method: "POST", body: JSON.stringify(closingPayload("Draft")) });
      state.closingId = result.closing_id;
      state.closingStatus = result.workflow_status;
      closeModal();
      renderClosing();
      toast("Refill recorded", `${machineDisplayLabel(machine, state.closing?.machines || [])} · +${number(totalAdded)} product${totalAdded === 1 ? "" : "s"} added and saved to the draft.`);
    } catch (error) {
      snapshots.forEach(snapshot => {
        snapshot.product.refill_qty = snapshot.refill_qty;
        snapshot.product.refill_history = snapshot.refill_history;
      });
      throw error;
    }
  });
  document.querySelector("#modalRoot .modal")?.classList.add("refill-modal");
  const select = document.getElementById("refillMachineSelect");
  const rows = document.getElementById("refillProductRows");
  const renderRows = () => {
    const index = Number(select?.value || 0);
    const machine = state.closing.machines[index];
    if (rows) rows.innerHTML = refillEditorRows(machine);
    rows?.querySelectorAll("[data-history-product]").forEach(button => button.onclick = () => showRefillHistory(index, Number(button.dataset.historyProduct)));
  };
  if (select) select.onchange = renderRows;
  renderRows();
}

function bindRefillHistoryButtons() {
  document.querySelectorAll(".refill-total-button").forEach(button => {
    button.onclick = () => showRefillHistory(Number(button.dataset.machineIndex), Number(button.dataset.productIndex));
  });
}

function decorateReviewRefillSummary() {
  const page = document.getElementById("page-closing");
  if (!page || !state.closingReview) return;
  page.querySelector(".review-refill-card")?.remove();
  const rows = [];
  let total = 0;
  state.closing.machines.forEach(machine => {
    const machineTotal = ensureClosingProducts(machine).reduce((sum, product) => sum + refillTotal(product), 0);
    if (machineTotal > 0) {
      rows.push(`<div><span>${escapeHtml(machineDisplayLabel(machine, state.closing?.machines || []))}</span><strong>+${number(machineTotal)}</strong></div>`);
      total += machineTotal;
    }
  });
  if (!rows.length) return;
  const card = document.createElement("article");
  card.className = "card review-refill-card";
  card.innerHTML = `<div class="review-refill-head"><div><span>Refill Summary</span><strong>${rows.length} machine${rows.length === 1 ? "" : "s"}</strong></div><b>+${number(total)} total</b></div><div class="review-refill-grid">${rows.join("")}</div>`;
  const machineSection = page.querySelector(".review-machine-section");
  if (machineSection) page.insertBefore(card, machineSection);
}

const renderClosingV2137Refill = renderClosing;
renderClosing = function() {
  renderClosingV2137Refill();
  if (!state.closing) return;
  bindRefillHistoryButtons();
  if (state.closingReview) {
    decorateReviewRefillSummary();
    if (!state.closingReadOnly) {
      const pageActions = document.getElementById("pageActions");
      if (pageActions) pageActions.innerHTML = "";
    }
    return;
  }
  if (state.closingReadOnly) return;
  const pageActions = document.getElementById("pageActions");
  if (pageActions) pageActions.innerHTML = "";
  renderReviewTopActions(`<button class="btn btn-secondary" id="saveDraftBtn">${icon("file", 16)} Save Draft</button><button class="btn btn-secondary refill-top-button" id="refillClosingBtn">${icon("plus", 16)} Refill</button><button class="btn btn-success" id="reviewClosingBtn">${icon("check", 16)} Review Closing</button>`);
  const draft = document.getElementById("saveDraftBtn");
  const refill = document.getElementById("refillClosingBtn");
  const review = document.getElementById("reviewClosingBtn");
  if (draft) draft.onclick = () => saveClosing("Draft");
  if (refill) refill.onclick = showRefillModal;
  if (review) review.onclick = openClosingReview;
  bindRefillHistoryButtons();
};

const openClosingV2137Refill = openClosing;
openClosing = async function(closingId) {
  await openClosingV2137Refill(closingId);
  try {
    const data = await api(`/api/closings/${encodeURIComponent(closingId)}`);
    const byMachine = new Map();
    (data.products || []).forEach(row => {
      const machineId = String(row.Machine_ID || "");
      if (!byMachine.has(machineId)) byMachine.set(machineId, []);
      byMachine.get(machineId).push(row);
    });
    state.closing?.machines?.forEach(machine => {
      const rows = byMachine.get(String(machine.machine_id)) || [];
      ensureClosingProducts(machine).forEach(product => {
        const raw = rows.find(row => String(row.Product_ID || "").toLowerCase() === String(product.product_id || "").toLowerCase()) || rows.find(row => String(row.Barcode || "").toLowerCase() === String(product.barcode || "").toLowerCase());
        if (!raw) return;
        product.refill_qty = Math.max(0, numeric(raw.Refill_Qty));
        product.refill_history = refillHistoryFor({ Refill_History_JSON: raw.Refill_History_JSON });
      });
    });
  } catch (_error) {
    // Old closings without refill fields remain fully compatible.
  }
  renderClosing();
};



// v2.1.40 - preserve refill state through product normalization and keep Closing History finalized-only.
const machineProductsV2139RefillPreserve = machineProducts;
machineProducts = function(machine) {
  const existing = Array.isArray(machine?.products) ? machine.products.slice() : [];
  const products = machineProductsV2139RefillPreserve(machine);
  const byId = new Map(existing.map((item, index) => [String(item?.product_id ?? item?.Product_ID ?? item?.id ?? `product-${index + 1}`), item]));
  const byBarcode = new Map(existing.filter(item => String(item?.barcode ?? item?.Barcode ?? '').trim()).map(item => [String(item?.barcode ?? item?.Barcode ?? '').trim().toLowerCase(), item]));
  products.forEach((product, index) => {
    const source = byId.get(String(product.product_id || '')) || byBarcode.get(String(product.barcode || '').trim().toLowerCase()) || existing[index] || {};
    product.refill_qty = source.refill_qty ?? source.Refill_Qty ?? 0;
    product.refill_history = source.refill_history ?? source.Refill_History_JSON ?? [];
  });
  return products;
};

pageMeta.history[1] = 'Review finalized closings and exported reports';
const renderHistoryV2139AllStatuses = renderHistory;
renderHistory = async function() {
  await renderHistoryV2139AllStatuses();
  state.history = (state.history || []).filter(row => String(row?.Workflow_Status || '').toLowerCase() === 'finalized');
  const count = document.querySelector('#page-history .section-heading p');
  if (count) count.textContent = `${state.history.length} finalized record${state.history.length === 1 ? '' : 's'} in the Excel database`;
  renderHistoryRows(state.history);
};


// v2.1.41 - recover persisted active drafts after update/restart while keeping drafts out of Closing History.
const ensureClosingPageV2140DraftRecovery = ensureClosingPage;
ensureClosingPage = async function() {
  if (state.closing) { renderClosing(); return; }
  try {
    const rows = await api('/api/closings?limit=1000');
    const draft = (rows || []).find(row => String(row?.Workflow_Status || '').toLowerCase() === 'draft');
    if (draft?.Closing_ID) {
      await openClosing(draft.Closing_ID);
      state.closingReadOnly = false;
      state.closingReview = false;
      renderClosing();
      return;
    }
  } catch (_error) {}
  await ensureClosingPageV2140DraftRecovery();
};

const restoreAfterUpdateV2140DraftRecovery = restoreAfterUpdate;
restoreAfterUpdate = async function() {
  const restored = await restoreAfterUpdateV2140DraftRecovery();
  if (restored && state.closingId && String(state.closingStatus || '').toLowerCase() === 'draft') {
    try {
      await openClosing(state.closingId);
      state.closingReadOnly = false;
      state.closingReview = false;
      renderClosing();
    } catch (_error) {}
  }
  return restored;
};

const renderHistoryV2140DraftButton = renderHistory;
renderHistory = async function() {
  await renderHistoryV2140DraftButton();
  const activeDraft = state.closingId && String(state.closingStatus || '').toLowerCase() === 'draft';
  if (activeDraft) document.getElementById('historyNew')?.remove();
};


// v2.1.42 - keep Begin Qty immutable when refill is present and repair drafts affected by v2.1.38-v2.1.41.
function cloneClosingForRefillCalculationV2142(value) {
  try {
    if (typeof structuredClone === "function") return structuredClone(value);
  } catch (_error) {}
  return JSON.parse(JSON.stringify(value));
}

calculateLocal = function() {
  if (!state.closing) return calculateLocalV2137Refill();
  const originalClosing = state.closing;
  const calculationClosing = cloneClosingForRefillCalculationV2142(originalClosing);
  (calculationClosing.machines || []).forEach(machine => {
    (machine.products || []).forEach(product => {
      product.begin_qty = numeric(product.begin_qty) + refillTotal(product);
    });
  });
  state.closing = calculationClosing;
  let result;
  try {
    result = calculateLocalV2137Refill();
  } finally {
    state.closing = originalClosing;
  }
  if (result?.errors) {
    result.errors = result.errors.map(message => String(message).replace("Final Qty is greater than Begin Qty.", "Final Qty is greater than Begin Qty + Refill."));
  }
  return result;
};

function refillInflationFingerprintV2142(product) {
  const history = refillHistoryFor(product);
  let cumulative = 0;
  let minimumInflation = 0;
  history.forEach(event => {
    cumulative += Math.max(0, Math.floor(numeric(event?.qty)));
    minimumInflation += cumulative;
  });
  return { total: cumulative, minimumInflation };
}

async function repairInflatedRefillDraftV2142() {
  if (!state.closing || state.closingReadOnly || String(state.closingStatus || "").toLowerCase() !== "draft") return 0;
  if (state.refillBaselineRepairRunningV2142) return 0;
  const hasRefill = (state.closing.machines || []).some(machine => (machine.products || []).some(product => refillHistoryFor(product).length));
  if (!hasRefill) return 0;
  state.refillBaselineRepairRunningV2142 = true;
  try {
    const reportDate = String(state.closing.report_date || state.closing.reportDate || "").slice(0, 10);
    if (!reportDate) return 0;
    const baseline = await api("/api/new-closing?report_date=" + encodeURIComponent(reportDate));
    let repaired = 0;
    for (const machine of state.closing.machines || []) {
      const baseMachine = (baseline.machines || []).find(item => String(item.machine_id || "") === String(machine.machine_id || ""));
      if (!baseMachine) continue;
      const baseProducts = baseMachine.products || [];
      for (const [index, product] of (machine.products || []).entries()) {
        const history = refillHistoryFor(product);
        if (!history.length) continue;
        const baseProduct = baseProducts.find(item => String(item.product_id || "").toLowerCase() === String(product.product_id || "").toLowerCase())
          || baseProducts.find(item => String(item.barcode || "").toLowerCase() === String(product.barcode || "").toLowerCase())
          || baseProducts[index];
        if (!baseProduct) continue;
        const baselineQty = Math.max(0, Math.floor(numeric(baseProduct.begin_qty)));
        const currentQty = Math.max(0, Math.floor(numeric(product.begin_qty)));
        const fingerprint = refillInflationFingerprintV2142(product);
        const difference = currentQty - baselineQty;
        const matchesOldBug = fingerprint.total > 0
          && difference >= fingerprint.minimumInflation
          && (difference - fingerprint.minimumInflation) % fingerprint.total === 0;
        if (matchesOldBug) {
          product.begin_qty = baselineQty;
          repaired += 1;
        }
      }
    }
    if (repaired > 0) {
      try {
        const result = await api("/api/closings/save", { method: "POST", body: JSON.stringify(closingPayload("Draft")) });
        state.closingId = result.closing_id || state.closingId;
        state.closingStatus = result.workflow_status || state.closingStatus;
        toast("Refill quantity corrected", repaired + (repaired === 1 ? " product opening quantity was restored before continuing." : " product opening quantities were restored before continuing."));
      } catch (error) {
        toast("Refill correction needs saving", error?.message || "The corrected quantity is shown, but the Draft could not be saved automatically.", "error");
      }
    }
    return repaired;
  } catch (_error) {
    return 0;
  } finally {
    state.refillBaselineRepairRunningV2142 = false;
  }
}

const openClosingV2141ImmutableRefill = openClosing;
openClosing = async function(closingId) {
  await openClosingV2141ImmutableRefill(closingId);
  await repairInflatedRefillDraftV2142();
  renderClosing();
};

const showRefillHistoryV2141SingleClose = showRefillHistory;
showRefillHistory = function(machineIndex, productIndex) {
  showRefillHistoryV2141SingleClose(machineIndex, productIndex);
  const modal = document.querySelector("#modalRoot .refill-history-modal");
  const footer = modal?.querySelector(".modal-footer");
  if (footer) {
    const buttons = [...footer.querySelectorAll("button")];
    buttons.slice(0, -1).forEach(button => button.remove());
  }
};

// v2.1.43 - lock opening inventory and make refill state explicit.
const productInputV2142LockedBegin = productInput;
productInput = function(machineIndex, productIndex, field, value, bulkRow, bulkCol) {
  if (field === "begin_qty") {
    const qty = Math.max(0, numeric(value));
    return `<div class="begin-qty-readonly" data-machine-index="${machineIndex}" data-product-index="${productIndex}" title="Locked opening quantity · carried from the previous finalized Final Qty">${number(qty)}</div>`;
  }
  return productInputV2142LockedBegin(machineIndex, productIndex, field, value, bulkRow, bulkCol);
};

const renderClosingV2142LockedBegin = renderClosing;
renderClosing = function() {
  renderClosingV2142LockedBegin();
  const beginHeader = document.querySelector('#page-closing th[data-bulk-field="begin_qty"]');
  if (beginHeader) {
    beginHeader.classList.remove("bulk-column-header");
    beginHeader.removeAttribute("data-bulk-field");
    beginHeader.title = "Locked · automatically carried from the latest finalized Final Qty";
  }
  const refillHeader = [...document.querySelectorAll('#page-closing th')].find(cell => String(cell.textContent || "").trim() === "Refill");
  if (refillHeader) refillHeader.title = "No refill = nothing added yet. +Qty = refill already recorded. Click the status for history.";
};

const lockedBeginStyle = document.createElement("style");
lockedBeginStyle.dataset.v2143 = "locked-begin-refill-state";
lockedBeginStyle.textContent = `
  .begin-qty-readonly {
    min-height: 36px; width: 100%; display: flex; align-items: center; justify-content: center;
    border: 1px solid #d8dee8; border-radius: 8px; background: #f4f6f8; color: #111827;
    font-weight: 700; cursor: not-allowed; user-select: none; box-sizing: border-box;
  }
  .refill-total-button { min-width: 32px; min-height: 32px; height: 32px; padding: 0 9px; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; font-weight: 750; line-height: 1; white-space: nowrap; }
  .refill-total-button.no-refill { width: 32px; padding: 0; background: #ffffff; border: 1px solid #abefc6; color: #067647; }
  .refill-total-button.has-refill { min-width: 48px; background: #ecfdf3; border: 1px solid #abefc6; color: #067647; }
`;
document.head.appendChild(lockedBeginStyle);

// v2.1.44 - row-level refill entry/history and cleaner closing layout.
function refillHistoryRowsV2144(product) {
  const history = refillHistoryFor(product);
  if (!history.length) {
    return '<div class="refill-cell-empty">No refill history yet.</div>';
  }
  return history.slice().reverse().map(item => {
    const event = refillEventLabel(item);
    return `<div class="refill-cell-history-row"><div><strong>+${number(event.qty)}</strong><span>${escapeHtml(event.by)}</span></div><time>${escapeHtml(event.when)}</time></div>`;
  }).join('');
}

function showRefillProductModalV2144(machineIndex, productIndex) {
  const machine = state.closing?.machines?.[Number(machineIndex)];
  const product = machine ? ensureClosingProducts(machine)[Number(productIndex)] : null;
  if (!machine || !product) return;

  if (state.closingReadOnly || state.closingReview) {
    showRefillHistory(Number(machineIndex), Number(productIndex));
    return;
  }

  const history = refillHistoryFor(product);
  const total = refillTotal(product);
  const body = `
    <div class="refill-cell-product-head">
      ${productThumbnail(product, "small")}
      <div class="refill-cell-product-copy">
        <strong>${escapeHtml(product.barcode || `Product ${Number(productIndex) + 1}`)}</strong>
        <span>${escapeHtml(machineDisplayLabel(machine, state.closing?.machines || []))} · Begin Qty ${number(product.begin_qty)} · Current refill +${number(total)}</span>
      </div>
    </div>
    <div class="refill-cell-add-card">
      <div>
        <strong>Add refill</strong>
        <span>Beginning Qty stays locked. Add only the physical quantity refilled now.</span>
      </div>
      <input id="refillCellQtyV2144" class="input refill-cell-qty" type="number" min="0" step="1" value="0" aria-label="Add refill quantity">
    </div>
    <div class="refill-cell-history-section">
      <div class="refill-cell-history-head"><strong>Refill history</strong><span>${history.length} event${history.length === 1 ? '' : 's'} · Total +${number(total)}</span></div>
      <div class="refill-cell-history-list">${refillHistoryRowsV2144(product)}</div>
    </div>`;

  showModal(`Refill · ${machineDisplayLabel(machine, state.closing?.machines || [])}`, body, 'Save Refill', async () => {
    const qty = Math.max(0, Math.floor(numeric(document.getElementById('refillCellQtyV2144')?.value)));
    if (qty <= 0) throw new Error('Enter the quantity physically added.');
    const staff = String(state.closing?.closed_by || '').trim();
    if (!staff) throw new Error('Closed By is required before saving a refill.');

    const oldQty = product.refill_qty;
    const oldHistory = refillHistoryFor(product).slice();
    const nextHistory = oldHistory.slice();
    nextHistory.push({ qty, at: new Date().toISOString(), by: staff });
    product.refill_history = nextHistory;
    product.refill_qty = nextHistory.reduce((sum, event) => sum + Math.max(0, numeric(event.qty)), 0);

    try {
      const result = await api('/api/closings/save', { method: 'POST', body: JSON.stringify(closingPayload('Draft')) });
      state.closingId = result.closing_id;
      state.closingStatus = result.workflow_status;
      closeModal();
      renderClosing();
      toast('Refill recorded', `${machine.machine_id} · ${escapeHtml(product.barcode || 'Product')} · +${number(qty)} added.`);
    } catch (error) {
      product.refill_qty = oldQty;
      product.refill_history = oldHistory;
      throw error;
    }
  });

  document.querySelector('#modalRoot .modal')?.classList.add('refill-cell-modal');
  setTimeout(() => document.getElementById('refillCellQtyV2144')?.focus(), 0);
}

bindRefillHistoryButtons = function() {
  document.querySelectorAll('.refill-total-button').forEach(button => {
    const machineIndex = Number(button.dataset.machineIndex);
    const productIndex = Number(button.dataset.productIndex);
    const machine = state.closing?.machines?.[machineIndex];
    const product = machine ? ensureClosingProducts(machine)[productIndex] : null;
    const total = product ? refillTotal(product) : 0;
    button.innerHTML = total > 0 ? `<span>+${number(total)}</span>` : `${icon('plus', 14)}`;
    button.title = total > 0 ? 'Click to add another refill or view refill history' : 'Click to add refill';
    button.setAttribute('aria-label', button.title);
    button.onclick = () => showRefillProductModalV2144(machineIndex, productIndex);
  });
};

const renderClosingV2143RowRefill = renderClosing;
renderClosing = function() {
  renderClosingV2143RowRefill();
  document.getElementById('refillClosingBtn')?.remove();
  bindRefillHistoryButtons();
};


// v2.1.54 — normalize the final runtime Refill control so every row renders identically.
bindRefillHistoryButtons = function() {
  document.querySelectorAll('.refill-total-button').forEach(button => {
    const machineIndex = Number(button.dataset.machineIndex);
    const productIndex = Number(button.dataset.productIndex);
    const machine = state.closing?.machines?.[machineIndex];
    const product = machine ? ensureClosingProducts(machine)[productIndex] : null;
    const total = product ? refillTotal(product) : 0;
    const filled = total > 0;
    button.classList.toggle('has-refill', filled);
    button.classList.toggle('no-refill', !filled);
    button.textContent = filled ? '+' + number(total) : '+';
    button.title = filled ? 'Click to add another refill or view refill history' : 'Click to add refill';
    button.setAttribute('aria-label', button.title);
    button.onclick = () => showRefillProductModalV2144(machineIndex, productIndex);
  });
};


/* v2.1.58 — brand logo fallback */
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".brand-logo-image").forEach(image => {
    const fallback = () => { image.hidden = true; const host = image.parentElement; if (host) host.classList.add("logo-fallback"); };
    image.addEventListener("error", fallback, { once: true });
    if (image.complete && image.naturalWidth === 0) fallback();
  });
});

/* v2.1.79 mobile shell: one navigation tree, no duplicate page state or actions. */
function initialiseMobileNavigationV2206() {
  const shell = document.getElementById("appShell");
  const toggle = document.getElementById("mobileNavToggle");
  const backdrop = document.getElementById("mobileNavBackdrop");
  const mobile = typeof window.matchMedia === "function"
    ? window.matchMedia("(max-width: 767px)")
    : { matches: false, addEventListener() {} };
  if (!shell || !toggle || !backdrop || toggle.dataset.mobileNavigationBound === "true") return;
  toggle.dataset.mobileNavigationBound = "true";
  const close = () => {
    shell.classList.remove("mobile-nav-open");
    document.body.classList.remove("mobile-nav-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open navigation");
    backdrop.hidden = true;
  };
  const open = () => {
    if (!mobile.matches) return;
    shell.classList.add("mobile-nav-open");
    document.body.classList.add("mobile-nav-open");
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "Close navigation");
    backdrop.hidden = false;
  };
  toggle.addEventListener("click", () => shell.classList.contains("mobile-nav-open") ? close() : open());
  backdrop.addEventListener("click", close);
  document.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
  document.getElementById("sidebarNav")?.addEventListener("click", event => { if (event.target.closest(".nav-button")) close(); });
  mobile.addEventListener("change", () => { if (!mobile.matches) close(); });
}

document.addEventListener("DOMContentLoaded", initialiseMobileNavigationV2206);


// v2.1.59 — automatic Machine numbers; internal IDs remain hidden compatibility keys.
stableMachineComparator = function(left, right) {
  const configuredOrder = new Map(configuredMachineTypes().map((item, index) => [String(item.name || "").trim().toLowerCase(), index]));
  const leftType = canonicalMachineTypeName(left?.machine_type || left?.Machine_Type, machineNaturalId(left)) || "Other";
  const rightType = canonicalMachineTypeName(right?.machine_type || right?.Machine_Type, machineNaturalId(right)) || "Other";
  const leftTypeOrder = configuredOrder.has(leftType.toLowerCase()) ? configuredOrder.get(leftType.toLowerCase()) : 999;
  const rightTypeOrder = configuredOrder.has(rightType.toLowerCase()) ? configuredOrder.get(rightType.toLowerCase()) : 999;
  if (leftTypeOrder !== rightTypeOrder) return leftTypeOrder - rightTypeOrder;
  const typeCompare = leftType.localeCompare(rightType, undefined, { numeric: true, sensitivity: "base" });
  if (typeCompare !== 0) return typeCompare;
  const leftOrder = Number(left?.sort_order ?? left?.Sort_Order ?? 0) || 0;
  const rightOrder = Number(right?.sort_order ?? right?.Sort_Order ?? 0) || 0;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  const leftCreated = String(left?.Created_At || left?.created_at || "");
  const rightCreated = String(right?.Created_At || right?.created_at || "");
  if (leftCreated !== rightCreated) return leftCreated.localeCompare(rightCreated);
  return machineNaturalId(left).localeCompare(machineNaturalId(right), undefined, { numeric: true, sensitivity: "base" });
};

function machineDisplayNumber(machine, collection = []) {
  const id = machineNaturalId(machine);
  const type = canonicalMachineTypeName(machine?.machine_type || machine?.Machine_Type, id) || "Other";
  const rows = [...(collection || [])].filter(item => (canonicalMachineTypeName(item?.machine_type || item?.Machine_Type, machineNaturalId(item)) || "Other").toLowerCase() === type.toLowerCase()).sort(stableMachineComparator);
  const index = rows.findIndex(item => machineNaturalId(item) === id);
  return index >= 0 ? index + 1 : 0;
}

function machineDisplayLabel(machine, collection = []) {
  const id = machineNaturalId(machine);
  const type = canonicalMachineTypeName(machine?.machine_type || machine?.Machine_Type, id) || "Machine";
  const numberValue = machineDisplayNumber(machine, collection);
  return numberValue > 0 ? `${type} ${numberValue}` : type;
}

renderMachineRows = function(machines) {
  let html = "";
  let visualRow = 0;
  for (const [type, rows] of groupMachines(machines)) {
    html += `<tr class="group-row"><td colspan="11">${escapeHtml(type)} · ${rows.length} machines</td></tr>`;
    for (const [typeIndex, machine] of rows.entries()) {
      const machineIndex = machines.indexOf(machine);
      const products = ensureClosingProducts(machine);
      const rowSpan = Math.max(products.length, 1);
      products.forEach((product, productIndex) => {
        const first = productIndex === 0;
        const last = productIndex === products.length - 1;
        const bulkRow = visualRow++;
        const groupClasses = ["product-closing-row", first ? "machine-group-start" : "machine-group-middle", last ? "machine-group-end" : ""].filter(Boolean).join(" ");
        const refillQty = refillTotal(product);
        const historyCount = refillHistoryFor(product).length;
        html += `<tr class="${groupClasses}" data-machine-index="${machineIndex}" data-product-index="${productIndex}">
          ${first ? `<td rowspan="${rowSpan}" class="align-left machine-row-cell machine-group-cell machine-group-left"><div class="closing-machine-identity"><span class="machine-number-badge" title="${escapeHtml(type)} machine ${typeIndex + 1}">${typeIndex + 1}</span>${state.closingStructureEdit && !state.closingReadOnly ? `<div class="closing-machine-structure-actions"><button class="mini-action closing-edit-machine" type="button" data-machine-id="${escapeHtml(machine.machine_id)}">${icon("edit", 13)} Edit</button><button class="mini-action danger closing-delete-machine" type="button" data-machine-id="${escapeHtml(machine.machine_id)}">${icon("trash", 13)} Delete</button></div>` : ""}</div></td>` : ""}
          <td class="align-left product-barcode-cell"><div class="product-row-identity">${productThumbnail(product)}<div><strong>${escapeHtml(product.barcode || `Product ${productIndex + 1}`)}</strong></div></div></td>
          <td>${productInput(machineIndex, productIndex, "begin_qty", product.begin_qty, bulkRow, 0)}</td>
          <td class="refill-table-cell"><button type="button" class="refill-total-button ${refillQty > 0 ? "has-refill" : "no-refill"}" data-machine-index="${machineIndex}" data-product-index="${productIndex}" title="${historyCount ? `${historyCount} refill event${historyCount === 1 ? "" : "s"}` : "No refill recorded"}">${refillQty > 0 ? `+${number(refillQty)}` : icon("plus", 14)}</button></td>
          <td>${productInput(machineIndex, productIndex, "final_qty", product.final_qty, bulkRow, 1)}</td>
          <td class="calc-product-used" data-machine-index="${machineIndex}" data-product-index="${productIndex}">0</td>
          ${first ? `<td rowspan="${rowSpan}" class="machine-meter-cell machine-group-cell">${machineInput(machineIndex, "begin_coin_meter", machine.begin_coin_meter, bulkRow, 2, "number", "meter-input")}</td><td rowspan="${rowSpan}" class="machine-meter-cell machine-group-cell">${machineInput(machineIndex, "final_coin_meter", machine.final_coin_meter, bulkRow, 3, "number", "meter-input")}</td><td rowspan="${rowSpan}" class="machine-meter-cell machine-group-cell"><div class="coins-used-control">${machineInput(machineIndex, "coins_used", machine.coins_used, bulkRow, 4, "number", "coins-used-input")}</div></td><td rowspan="${rowSpan}" class="machine-meter-cell machine-group-cell"><div class="win-rate-control"><strong class="calc-win-rate" data-machine-index="${machineIndex}">—</strong></div></td><td rowspan="${rowSpan}" class="machine-meter-cell machine-group-cell machine-group-right status-cell"><select class="table-select machine-input machine-status-select" data-machine-index="${machineIndex}" data-field="status"><option ${machine.status === "Working" ? "selected" : ""}>Working</option><option ${machine.status === "Maintenance" ? "selected" : ""}>Maintenance</option><option ${machine.status === "Out of Service" ? "selected" : ""}>Out of Service</option></select></td>` : ""}
        </tr>`;
      });
    }
  }
  return html;
};

const renderHistoryV2159MachineNumbers = renderHistory;
renderHistory = async function() {
  await renderHistoryV2159MachineNumbers();
  const select = document.getElementById("historyMachine");
  if (select) {
    [...select.options].slice(1).forEach(option => {
      const master = (state.machines || []).find(item => String(item.Machine_ID || "") === String(option.value));
      option.textContent = master ? machineDisplayLabel(master, state.machines || []) : "Machine";
    });
  }
  const search = document.getElementById("historySearch");
  if (search) search.placeholder = "Search Closing ID, machine number, barcode, or staff...";
};

const showHistoryDetailV2159MachineNumbers = showHistoryDetail;
showHistoryDetail = async function(closingId) {
  await showHistoryDetailV2159MachineNumbers(closingId);
  document.querySelectorAll("#page-history .history-detail-table tbody tr").forEach(row => {
    const cell = row.cells?.[0];
    if (!cell) return;
    const internalId = String(cell.textContent || "").trim();
    const master = (state.machines || []).find(item => String(item.Machine_ID || "") === internalId);
    cell.innerHTML = `<strong class="history-machine-number">${escapeHtml(master ? machineDisplayLabel(master, state.machines || []) : "Machine")}</strong>`;
  });
};

const showRefillHistoryV2159MachineNumbers = showRefillHistory;
showRefillHistory = function(machineIndex, productIndex) {
  showRefillHistoryV2159MachineNumbers(machineIndex, productIndex);
  const machine = state.closing?.machines?.[Number(machineIndex)];
  const heading = document.querySelector("#modalRoot .modal-header h2");
  if (machine && heading) heading.textContent = `Refill History · ${machineDisplayLabel(machine, state.closing?.machines || [])}`;
};

const showRefillProductModalV2159MachineNumbers = showRefillProductModalV2144;
showRefillProductModalV2144 = function(machineIndex, productIndex) {
  showRefillProductModalV2159MachineNumbers(machineIndex, productIndex);
  const machine = state.closing?.machines?.[Number(machineIndex)];
  if (!machine) return;
  const label = machineDisplayLabel(machine, state.closing?.machines || []);
  const heading = document.querySelector("#modalRoot .modal-header h2");
  if (heading) heading.textContent = `Refill · ${label}`;
  const copy = document.querySelector("#modalRoot .refill-cell-product-copy span");
  if (copy) copy.textContent = copy.textContent.replace(/^.*? · Begin Qty/, label + " · Begin Qty");
};


// v2.1.60 — unified inside / outside / print component behavior.
historyKpiCard = function(label, value, iconName, tone = "blue") {
  return '<article class="card history-kpi-card history-kpi-' + tone + ' closing-summary-item"><div class="closing-summary-head"><span>' + escapeHtml(label) + '</span><span class="history-kpi-icon closing-summary-icon">' + icon(iconName, 18) + '</span></div><strong>' + value + '</strong></article>';
};

decorateReviewRefillSummary = function() {
  document.querySelector("#page-closing .review-refill-card")?.remove();
};

bindRefillHistoryButtons = function() {
  document.querySelectorAll('.refill-total-button').forEach(button => {
    const machineIndex = Number(button.dataset.machineIndex);
    const productIndex = Number(button.dataset.productIndex);
    const machine = state.closing?.machines?.[machineIndex];
    const product = machine ? ensureClosingProducts(machine)[productIndex] : null;
    const total = product ? refillTotal(product) : 0;
    const filled = total > 0;
    button.classList.toggle('has-refill', filled);
    button.classList.toggle('no-refill', !filled);
    button.innerHTML = filled
      ? '<span class="refill-value">+' + number(total) + '</span>'
      : icon('plus', 14) + '<span class="refill-add-label">Add</span>';
    button.title = filled ? 'Add another refill or view refill history' : 'Add refill';
    button.setAttribute('aria-label', button.title);
    button.onclick = () => showRefillProductModalV2144(machineIndex, productIndex);
  });
};


/* v2.1.62 - operational final-count workflow, inline validation, permanent Outlet edit, actual-view print */
let outletEditingV2162 = false;
let outletSavedValueV2162 = '';
function finalQtyPendingV2162(product) { if (!product) return false; const value=product.final_qty; return value===null||value===undefined||String(value).trim()===''; }
function pendingFinalRowsV2162(){const rows=[];(state.closing?.machines||[]).forEach((machine,machineIndex)=>{ensureClosingProducts(machine).forEach((product,productIndex)=>{if(finalQtyPendingV2162(product))rows.push({machine,product,machineIndex,productIndex});});});return rows;}
function withPendingFinalsAsAvailableV2162(callback){const restores=[];(state.closing?.machines||[]).forEach(machine=>{ensureClosingProducts(machine).forEach(product=>{if(!finalQtyPendingV2162(product))return;restores.push([product,product.final_qty]);product.final_qty=String(Math.max(0,numeric(product.begin_qty))+Math.max(0,refillTotal(product)));});});try{return callback();}finally{restores.forEach(([product,value])=>{product.final_qty=value;});}}
const calculateLocalV2161BeforePending=calculateLocal;calculateLocal=function(){return withPendingFinalsAsAvailableV2162(()=>calculateLocalV2161BeforePending());};
const closingHasEnteredDataV2161BeforePending=closingHasEnteredData;closingHasEnteredData=function(){const restores=[];(state.closing?.machines||[]).forEach(machine=>{ensureClosingProducts(machine).forEach(product=>{if(!finalQtyPendingV2162(product))return;restores.push([product,product.final_qty]);product.final_qty=String(Math.max(0,numeric(product.begin_qty)));});});try{return closingHasEnteredDataV2161BeforePending();}finally{restores.forEach(([product,value])=>{product.final_qty=value;});}};
const recalculateClosingV2161BeforePending=recalculateClosing;recalculateClosing=function(){recalculateClosingV2161BeforePending();pendingFinalRowsV2162().forEach(item=>{const cell=document.querySelector('.calc-product-used[data-machine-index="'+item.machineIndex+'"][data-product-index="'+item.productIndex+'"]');if(cell){cell.textContent='—';cell.classList.add('qty-used-pending');cell.title='Waiting for the actual Final Qty count';}});};
function clearStaffAlertV2162(key){const input=document.getElementById('field-'+key);if(!input)return;const field=input.closest('.field');input.classList.remove('required-field-error');input.removeAttribute('aria-invalid');field?.classList.remove('has-required-error');field?.querySelector('.field-alert-icon')?.remove();}
function markStaffAlertV2162(key,message){const input=document.getElementById('field-'+key);if(!input)return null;const field=input.closest('.field');input.classList.add('required-field-error');input.setAttribute('aria-invalid','true');field?.classList.add('has-required-error');let alert=field?.querySelector('.field-alert-icon');if(!alert&&field){alert=document.createElement('span');alert.className='field-alert-icon';alert.tabIndex=0;field.appendChild(alert);}if(alert){alert.innerHTML=icon('alert',14);alert.dataset.message=message;alert.title=message;alert.setAttribute('aria-label',message);}return input;}
function clearFinalQtyErrorsV2162(){document.querySelectorAll('#page-closing .product-qty-input[data-field="final_qty"]').forEach(input=>{input.classList.remove('final-required-error');if(input.title==='Enter the actual Final Qty count before Review')input.removeAttribute('title');});}
function markFinalQtyErrorsV2162(){clearFinalQtyErrorsV2162();let first=null;pendingFinalRowsV2162().forEach(item=>{const input=document.querySelector('.product-qty-input[data-field="final_qty"][data-machine-index="'+item.machineIndex+'"][data-product-index="'+item.productIndex+'"]');if(input){input.classList.add('final-required-error');input.title='Enter the actual Final Qty count before Review';if(!first)first=input;}});return first;}
function validateEntryForReviewV2162(scrollToProblem=true){const missing=[];if(!String(state.closing?.closed_by||'').trim())missing.push(['closed_by','Closed By is required before Review Closing.']);if(!String(state.closing?.verified_by||'').trim())missing.push(['verified_by','Verified By is required before Review Closing.']);['closed_by','verified_by'].forEach(key=>clearStaffAlertV2162(key));let firstStaff=null;missing.forEach(([key,message])=>{const input=markStaffAlertV2162(key,message);if(!firstStaff&&input)firstStaff=input;});if(missing.length){if(scrollToProblem&&firstStaff){firstStaff.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>firstStaff.focus(),220);}toast('Staff verification required',missing[0][1],'error');return false;}const firstFinal=markFinalQtyErrorsV2162();if(firstFinal){if(scrollToProblem){firstFinal.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>firstFinal.focus(),220);}toast('Final Qty required','Count and enter the actual Final Qty for every product before Review Closing.','error');return false;}return true;}
function enhanceRequiredFieldsV2162(){['closed_by','verified_by'].forEach(key=>{const input=document.getElementById('field-'+key);if(!input||input.dataset.v2162Validation)return;input.dataset.v2162Validation='1';input.addEventListener('input',()=>{if(String(input.value||'').trim())clearStaffAlertV2162(key);});});document.querySelectorAll('#page-closing .product-qty-input[data-field="final_qty"]').forEach(input=>{if(input.dataset.v2162Validation)return;input.dataset.v2162Validation='1';input.addEventListener('input',()=>{if(String(input.value||'').trim()!==''){input.classList.remove('final-required-error');input.removeAttribute('title');}});});}
function enhanceOutletControlV2162(){const input=document.getElementById('field-outlet');if(!input||input.closest('.outlet-edit-shell'))return;const field=input.closest('.field');if(!field)return;field.classList.add('outlet-field-v2162');outletSavedValueV2162=String(state.closing?.outlet||input.value||'');input.readOnly=!outletEditingV2162;input.classList.toggle('outlet-is-editing',outletEditingV2162);const shell=document.createElement('div');shell.className='outlet-edit-shell';input.parentNode.insertBefore(shell,input);shell.appendChild(input);const action=document.createElement('button');action.type='button';action.className='outlet-edit-button '+(outletEditingV2162?'is-saving':'');action.innerHTML=outletEditingV2162?icon('check',14)+'<span>Save</span>':icon('edit',14)+'<span>Edit</span>';action.title=outletEditingV2162?'Save Outlet permanently':'Edit Outlet';shell.appendChild(action);input.addEventListener('input',()=>{if(outletEditingV2162&&state.closing)state.closing.outlet=outletSavedValueV2162;});action.onclick=async()=>{if(!outletEditingV2162){outletEditingV2162=true;input.readOnly=false;input.classList.add('outlet-is-editing');action.classList.add('is-saving');action.innerHTML=icon('check',14)+'<span>Save</span>';action.title='Save Outlet permanently';input.focus();input.select();return;}const nextValue=String(input.value||'').trim();if(!nextValue){input.classList.add('required-field-error');toast('Outlet required','Enter an Outlet name before saving.','error');input.focus();return;}try{action.disabled=true;const result=await api('/api/settings',{method:'POST',body:JSON.stringify({outlet:nextValue})});state.appSettings=result.settings||state.appSettings||{};if(state.bootstrap?.settings)Object.assign(state.bootstrap.settings,result.settings||{},{outlet:nextValue});if(state.closing)state.closing.outlet=nextValue;outletSavedValueV2162=nextValue;outletEditingV2162=false;renderClosing();toast('Outlet saved',nextValue+' will be used automatically for new closings.');}catch(error){action.disabled=false;toast('Cannot save Outlet',error.message,'error');}};}
openClosingReview=function(){if(!validateEntryForReviewV2162(true))return;const result=calculateLocal();if(result.errors?.length){toast('Check machine closing',result.errors[0],'error');return;}state.closingStructureEdit=false;setBulkMode(false);state.closingReview=true;renderClosing();window.scrollTo({top:0,behavior:'smooth'});};
const confirmFinalizeV2161BeforeValidation=confirmFinalize;confirmFinalize=function(){const missingStaff=!String(state.closing?.closed_by||'').trim()||!String(state.closing?.verified_by||'').trim();const pendingFinal=pendingFinalRowsV2162().length>0;if(missingStaff||pendingFinal){state.closingReview=false;renderClosing();setTimeout(()=>validateEntryForReviewV2162(true),0);return;}confirmFinalizeV2161BeforeValidation();};
const renderClosingV2161BeforeUx=renderClosing;renderClosing=function(){renderClosingV2161BeforeUx();document.querySelectorAll('#page-closing .review-check-card').forEach(card=>card.remove());if(state.closing&&!state.closingReview){enhanceOutletControlV2162();enhanceRequiredFieldsV2162();recalculateClosing();}};
const openClosingV2161BeforePendingRestore=openClosing;openClosing=async function(closingId){await openClosingV2161BeforePendingRestore(closingId);try{const data=await api('/api/closings/'+encodeURIComponent(closingId));const byMachine=new Map();(data.products||[]).forEach(row=>{const key=String(row.Machine_ID||'');if(!byMachine.has(key))byMachine.set(key,[]);byMachine.get(key).push(row);});(state.closing?.machines||[]).forEach(machine=>{const rows=byMachine.get(String(machine.machine_id||''))||[];ensureClosingProducts(machine).forEach(product=>{const raw=rows.find(row=>String(row.Product_ID||'').toLowerCase()===String(product.product_id||'').toLowerCase())||rows.find(row=>String(row.Barcode||'').toLowerCase()===String(product.barcode||'').toLowerCase());if(!raw)return;if(raw.Final_Qty===null||raw.Final_Qty===undefined||String(raw.Final_Qty).trim()==='')product.final_qty='';});});}catch(_error){}renderClosing();};
showRefillProductModalV2144=function(machineIndex,productIndex){const machine=state.closing?.machines?.[Number(machineIndex)];const product=machine?ensureClosingProducts(machine)[Number(productIndex)]:null;if(!machine||!product)return;if(state.closingReadOnly||state.closingReview){showRefillHistory(Number(machineIndex),Number(productIndex));return;}const history=refillHistoryFor(product);const total=refillTotal(product);const machineLabel=machineDisplayLabel(machine,state.closing?.machines||[]);const body='<div class="refill-cell-product-head">'+productThumbnail(product,'small')+'<div class="refill-cell-product-copy"><strong>'+escapeHtml(product.barcode||('Product '+(Number(productIndex)+1)))+'</strong><span>'+escapeHtml(machineLabel)+' · Begin Qty '+number(product.begin_qty)+' · Current refill +'+number(total)+'</span></div></div><div class="refill-cell-add-card"><div><strong>Add refill</strong><span>Add only the physical quantity placed into this product now.</span></div><input id="refillCellQtyV2144" class="input refill-cell-qty" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" value="" placeholder="0" aria-label="Add refill quantity"></div><div class="refill-cell-history-section"><div class="refill-cell-history-head"><strong>Refill history</strong><span>'+history.length+' event'+(history.length===1?'':'s')+' · Total +'+number(total)+'</span></div><div class="refill-cell-history-list">'+refillHistoryRowsV2144(product)+'</div></div>';showModal('Refill · '+machineLabel,body,'Save Refill',async()=>{const quantityInput=document.getElementById('refillCellQtyV2144');const raw=String(quantityInput?.value||'').replace(/[^0-9]/g,'');const qty=Number(raw);if(!Number.isInteger(qty)||qty<=0)throw new Error('Enter a refill quantity greater than 0.');const staff=String(state.closing?.closed_by||'').trim();if(!staff)throw new Error('Closed By is required before saving a refill.');const oldQty=product.refill_qty;const oldHistory=refillHistoryFor(product).slice();const nextHistory=oldHistory.slice();nextHistory.push({qty:qty,at:new Date().toISOString(),by:staff});product.refill_history=nextHistory;product.refill_qty=nextHistory.reduce((sum,event)=>sum+Math.max(0,numeric(event.qty)),0);try{const result=await api('/api/closings/save',{method:'POST',body:JSON.stringify(closingPayload('Draft'))});state.closingId=result.closing_id;state.closingStatus=result.workflow_status;closeModal();renderClosing();toast('Refill recorded',machineLabel+' · '+(product.barcode||'Product')+' · +'+number(qty)+' added.');}catch(error){product.refill_qty=oldQty;product.refill_history=oldHistory;throw error;}});document.querySelector('#modalRoot .modal')?.classList.add('refill-cell-modal');const quantityInput=document.getElementById('refillCellQtyV2144');if(quantityInput){quantityInput.addEventListener('input',()=>{quantityInput.value=quantityInput.value.replace(/[^0-9]/g,'');});quantityInput.addEventListener('keydown',event=>{if(['-','+','e','E','.',','].includes(event.key))event.preventDefault();});setTimeout(()=>quantityInput.focus(),0);}};
document.addEventListener('wheel',event=>{const modal=event.target?.closest?.('.modal');if(!modal)return;let node=event.target;let scrollable=null;while(node&&node!==modal.parentElement){if(node.matches?.('.modal-body, .refill-cell-history-list, .product-editor-cards')&&node.scrollHeight>node.clientHeight+1){scrollable=node;break;}node=node.parentElement;}if(scrollable&&Math.abs(event.deltaY)>Math.abs(event.deltaX)){scrollable.scrollTop+=event.deltaY;event.preventDefault();event.stopImmediatePropagation();}},{capture:true,passive:false});
printClosingPdf=async function(){const button=document.getElementById('globalPrintButton');if(!state.closing||!state.closingReview||!button)return;try{button.disabled=true;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));window.print();}catch(error){toast('Cannot open print dialog',error.message||'Printing is not available on this computer.','error');}finally{button.disabled=false;}};


/* v2.1.63 */
function signedNumberV2163(value){const n=Number(value||0);return Number.isFinite(n)?Math.trunc(n):0;}
refillTotal=function(product){const history=refillHistoryFor(product);if(history.length)return history.reduce((sum,item)=>sum+signedNumberV2163(item?.qty),0);return signedNumberV2163(product?.refill_qty??product?.Refill_Qty??0);};
refillHistoryRowsV2144=function(product){const history=refillHistoryFor(product);if(!history.length)return '<div class="refill-cell-empty">No adjustment history yet.</div>';return history.slice().reverse().map(item=>{const event=refillEventLabel(item);const qty=signedNumberV2163(event.qty);const label=(qty>0?'+':'')+number(qty);const tone=qty>0?'positive':(qty<0?'negative':'neutral');return '<div class="refill-cell-history-row refill-'+tone+'"><div><strong>'+label+'</strong><span>'+escapeHtml(event.by)+'</span></div><time>'+escapeHtml(event.when)+'</time></div>';}).join('');};
showRefillProductModalV2144=function(machineIndex,productIndex){const machine=state.closing?.machines?.[Number(machineIndex)];const product=machine?ensureClosingProducts(machine)[Number(productIndex)]:null;if(!machine||!product)return;if(state.closingReadOnly||state.closingReview){showRefillHistory(Number(machineIndex),Number(productIndex));return;}const history=refillHistoryFor(product);const total=refillTotal(product);const machineLabel=machineDisplayLabel(machine,state.closing?.machines||[]);const totalLabel=(total>0?'+':'')+number(total);const body='<div class="refill-cell-product-head">'+productThumbnail(product,'small')+'<div class="refill-cell-product-copy"><strong>'+escapeHtml(product.barcode||('Product '+(Number(productIndex)+1)))+'</strong><span>'+escapeHtml(machineLabel)+' · Begin Qty '+number(product.begin_qty)+' · Adjustment '+totalLabel+'</span></div></div><div class="refill-cell-add-card"><div><strong>Adjust stock</strong><span>Use a positive number to add stock or a negative number to correct/remove stock.</span></div><input id="refillCellQtyV2144" class="input refill-cell-qty" type="text" inputmode="text" maxlength="7" autocomplete="off" value="" placeholder="+10 / -10" aria-label="Stock adjustment quantity"></div><div class="refill-cell-history-section"><div class="refill-cell-history-head"><strong>Adjustment history</strong><span>'+history.length+' event'+(history.length===1?'':'s')+' · Total '+totalLabel+'</span></div><div class="refill-cell-history-list">'+refillHistoryRowsV2144(product)+'</div></div>';showModal('Refill · '+machineLabel,body,'Save Adjustment',async()=>{const input=document.getElementById('refillCellQtyV2144');const raw=String(input?.value||'').trim();if(!/^[+-]?\d+$/.test(raw))throw new Error('Enter a whole number such as 10 or -10.');const qty=parseInt(raw,10);if(!qty)throw new Error('Adjustment cannot be 0.');const available=Math.max(0,numeric(product.begin_qty))+refillTotal(product)+qty;if(available<0)throw new Error('This adjustment would make available stock negative.');const staff=String(state.closing?.closed_by||'').trim();if(!staff)throw new Error('Closed By is required before saving an adjustment.');const oldQty=product.refill_qty;const oldHistory=refillHistoryFor(product).slice();const nextHistory=oldHistory.slice();nextHistory.push({qty:qty,at:new Date().toISOString(),by:staff});product.refill_history=nextHistory;product.refill_qty=nextHistory.reduce((sum,event)=>sum+signedNumberV2163(event.qty),0);try{const result=await api('/api/closings/save',{method:'POST',body:JSON.stringify(closingPayload('Draft'))});state.closingId=result.closing_id;state.closingStatus=result.workflow_status;closeModal();renderClosing();toast('Stock adjustment saved',machineLabel+' · '+(product.barcode||'Product')+' · '+(qty>0?'+':'')+number(qty)+'.');}catch(error){product.refill_qty=oldQty;product.refill_history=oldHistory;throw error;}});document.querySelector('#modalRoot .modal')?.classList.add('refill-cell-modal');const input=document.getElementById('refillCellQtyV2144');if(input){input.addEventListener('input',()=>{let v=input.value.replace(/[^0-9+-]/g,'');const neg=v.startsWith('-');v=v.replace(/[+-]/g,'');input.value=(neg?'-':'')+v;});setTimeout(()=>input.focus(),0);}};
bindRefillHistoryButtons=function(){document.querySelectorAll('.refill-total-button').forEach(button=>{const mi=Number(button.dataset.machineIndex),pi=Number(button.dataset.productIndex);const machine=state.closing?.machines?.[mi];const product=machine?ensureClosingProducts(machine)[pi]:null;const total=product?refillTotal(product):0;const history=product?refillHistoryFor(product):[];button.classList.remove('has-refill','no-refill','refill-positive','refill-negative','refill-zero');button.classList.add(total>0?'refill-positive':(total<0?'refill-negative':(history.length?'refill-zero':'no-refill')));button.textContent=history.length?((total>0?'+':'')+number(total)):'+ Add';button.title=history.length?'Add another adjustment or view history':'Add stock adjustment';button.setAttribute('aria-label',button.title);button.onclick=()=>showRefillProductModalV2144(mi,pi);});};
validateEntryForReviewV2162=function(scrollToProblem=true){['closed_by','verified_by'].forEach(key=>clearStaffAlertV2162(key));let first=null;if(!String(state.closing?.closed_by||'').trim())first=markStaffAlertV2162('closed_by','Closed By is required before Review Closing.');if(!String(state.closing?.verified_by||'').trim()){const el=markStaffAlertV2162('verified_by','Verified By is required before Review Closing.');if(!first)first=el;}if(first){if(scrollToProblem){first.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>first.focus(),220);}return false;}const final=markFinalQtyErrorsV2162();if(final){if(scrollToProblem){final.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>final.focus(),220);}return false;}return true;};
const renderClosingV2162BeforePermanentBulk=renderClosing;renderClosing=function(){renderClosingV2162BeforePermanentBulk();if(state.closing&&!state.closingReadOnly&&!state.closingReview&&!state.bulkMode){setBulkMode(true);}else if(state.closing&&!state.closingReadOnly&&!state.closingReview){document.querySelector('.machine-table')?.classList.add('bulk-mode');}bindRefillHistoryButtons();};
printClosingPdf=async function(){const button=document.getElementById('globalPrintButton');if(!state.closing||!state.closingReview||!button)return;try{button.disabled=true;document.body.classList.add('print-exact-v2163');await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));window.print();}catch(error){toast('Cannot open print dialog',error.message||'Printing is not available on this computer.','error');}finally{setTimeout(()=>document.body.classList.remove('print-exact-v2163'),250);button.disabled=false;}};


/* v2.1.64 - signed adjustment read path, required reset, live-view print clone, History/Daily parity */
function signedAdjustmentNumberV2164(value){const n=Number(value);return Number.isFinite(n)?Math.trunc(n):0;}
refillHistoryFor=function(product){let value=product?.refill_history??product?.Refill_History_JSON??[];if(!Array.isArray(value)){const text=String(value||'').trim();if(!text)return[];try{value=JSON.parse(text);}catch(_error){return[];}}if(!Array.isArray(value))return[];return value.map(item=>{if(!item||typeof item!=='object')return null;const qty=signedAdjustmentNumberV2164(item.qty);if(qty===0)return null;return{...item,qty:qty,at:String(item.at||item.timestamp||''),by:String(item.by||item.staff||'')};}).filter(Boolean);};
refillTotal=function(product){const history=refillHistoryFor(product);if(history.length)return history.reduce((sum,item)=>sum+signedAdjustmentNumberV2164(item.qty),0);return signedAdjustmentNumberV2164(product?.refill_qty??product?.Refill_Qty??0);};
refillEventLabel=function(event){const raw=String(event?.at||'');let when=raw;if(raw){const parsed=new Date(raw);if(!Number.isNaN(parsed.getTime()))when=parsed.toLocaleString([],{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});}return{when:when||'—',by:String(event?.by||'Staff'),qty:signedAdjustmentNumberV2164(event?.qty)};};
refillHistoryRowsV2144=function(product){const history=refillHistoryFor(product);if(!history.length)return '<div class="refill-cell-empty">No adjustment history yet.</div>';return history.slice().reverse().map(item=>{const event=refillEventLabel(item);const cls=event.qty>0?'refill-positive':'refill-negative';const label=(event.qty>0?'+':'')+number(event.qty);return '<div class="refill-cell-history-row '+cls+'"><div><strong>'+escapeHtml(label)+'</strong><span>'+escapeHtml(event.by)+'</span></div><time>'+escapeHtml(event.when)+'</time></div>';}).join('');};
showRefillHistory=function(machineIndex,productIndex){const machine=state.closing?.machines?.[Number(machineIndex)];const product=machine?ensureClosingProducts(machine)[Number(productIndex)]:null;if(!machine||!product)return;const history=refillHistoryFor(product);const total=refillTotal(product);const totalLabel=(total>0?'+':'')+number(total);const rows=history.length?history.slice().reverse().map(item=>{const event=refillEventLabel(item);const cls=event.qty>0?'refill-positive':'refill-negative';const label=(event.qty>0?'+':'')+number(event.qty);return '<div class="refill-history-row '+cls+'"><div><strong>'+escapeHtml(label)+'</strong><span>'+escapeHtml(event.by)+'</span></div><time>'+escapeHtml(event.when)+'</time></div>';}).join(''):'<div class="refill-history-empty">No stock adjustment has been recorded for this product.</div>';showModal('Adjustment History · '+machineDisplayLabel(machine,state.closing?.machines||[]),'<div class="refill-history-head"><span>'+productThumbnail(product,'small')+'</span><div><strong>'+escapeHtml(product.barcode||'Product')+'</strong><p>Total adjustment: <b class="'+(total<0?'refill-negative-text':'refill-positive-text')+'">'+escapeHtml(totalLabel)+'</b></p></div></div><div class="refill-history-list">'+rows+'</div>','Close',async()=>closeModal());document.querySelector('#modalRoot .modal')?.classList.add('refill-history-modal');};
const showRefillProductModalV2163NoHint=showRefillProductModalV2144;showRefillProductModalV2144=function(machineIndex,productIndex){showRefillProductModalV2163NoHint(machineIndex,productIndex);const input=document.getElementById('refillCellQtyV2144');if(input)input.removeAttribute('placeholder');};
bindRefillHistoryButtons=function(){document.querySelectorAll('.refill-total-button').forEach(button=>{const mi=Number(button.dataset.machineIndex),pi=Number(button.dataset.productIndex);const machine=state.closing?.machines?.[mi];const product=machine?ensureClosingProducts(machine)[pi]:null;const total=product?refillTotal(product):0;const history=product?refillHistoryFor(product):[];button.classList.remove('has-refill','no-refill','refill-positive','refill-negative','refill-zero');button.classList.add(total>0?'refill-positive':(total<0?'refill-negative':(history.length?'refill-zero':'no-refill')));button.textContent=history.length?((total>0?'+':'')+number(total)):'+ Add';button.title=history.length?'Add another stock adjustment or view adjustment history':'Add stock adjustment';button.setAttribute('aria-label',button.title);button.onclick=()=>showRefillProductModalV2144(mi,pi);});};
const closingHasEnteredDataV2163Signed=closingHasEnteredData;closingHasEnteredData=function(){if(closingHasEnteredDataV2163Signed())return true;return Boolean((state.closing?.machines||[]).some(machine=>ensureClosingProducts(machine).some(product=>refillHistoryFor(product).length>0||refillTotal(product)!==0)));};
const openClosingV2163SignedRestore=openClosing;openClosing=async function(closingId){await openClosingV2163SignedRestore(closingId);try{const data=await api('/api/closings/'+encodeURIComponent(closingId));const byMachine=new Map();(data.products||[]).forEach(row=>{const key=String(row.Machine_ID||'');if(!byMachine.has(key))byMachine.set(key,[]);byMachine.get(key).push(row);});(state.closing?.machines||[]).forEach(machine=>{const rows=byMachine.get(String(machine.machine_id||''))||[];ensureClosingProducts(machine).forEach(product=>{const raw=rows.find(row=>String(row.Product_ID||'').toLowerCase()===String(product.product_id||'').toLowerCase())||rows.find(row=>String(row.Barcode||'').toLowerCase()===String(product.barcode||'').toLowerCase());if(!raw)return;product.refill_history=refillHistoryFor({Refill_History_JSON:raw.Refill_History_JSON});product.refill_qty=product.refill_history.length?product.refill_history.reduce((sum,event)=>sum+signedAdjustmentNumberV2164(event.qty),0):signedAdjustmentNumberV2164(raw.Refill_Qty);});});}catch(_error){}renderClosing();};
function normalizeFilledRequiredCellsV2164(){document.querySelectorAll('#page-closing .product-qty-input[data-field="final_qty"]').forEach(input=>{const mi=Number(input.dataset.machineIndex),pi=Number(input.dataset.productIndex);const product=state.closing?.machines?.[mi]?ensureClosingProducts(state.closing.machines[mi])[pi]:null;const value=product?product.final_qty:input.value;if(value!==null&&value!==undefined&&String(value).trim()!==''){input.classList.remove('final-required-error');input.removeAttribute('aria-invalid');if(input.title==='Enter the actual Final Qty count before Review')input.removeAttribute('title');}});}
document.addEventListener('input',event=>{if(event.target?.matches?.('#page-closing .product-qty-input[data-field="final_qty"]'))normalizeFilledRequiredCellsV2164();},true);
document.addEventListener('change',event=>{if(event.target?.matches?.('#page-closing .product-qty-input[data-field="final_qty"]'))normalizeFilledRequiredCellsV2164();},true);
const updateBulkSelectionUiV2163Required=updateBulkSelectionUi;updateBulkSelectionUi=function(){updateBulkSelectionUiV2163Required();normalizeFilledRequiredCellsV2164();};
const applyBulkValueV2163Required=applyBulkValue;applyBulkValue=function(value){applyBulkValueV2163Required(value);normalizeFilledRequiredCellsV2164();};
const fillBulkFromFirstV2163Required=fillBulkFromFirst;fillBulkFromFirst=function(){fillBulkFromFirstV2163Required();normalizeFilledRequiredCellsV2164();};
const renderClosingV2163Required=renderClosing;renderClosing=function(){renderClosingV2163Required();normalizeFilledRequiredCellsV2164();bindRefillHistoryButtons();};
function copyLiveStyleTreeV2164(source){const clone=source.cloneNode(true);const src=[source,...source.querySelectorAll('*')];const dst=[clone,...clone.querySelectorAll('*')];let pseudoCss='';for(let i=0;i<src.length&&i<dst.length;i+=1){const s=src[i],d=dst[i];if('value'in s&&'value'in d)d.value=s.value;if('checked'in s&&'checked'in d)d.checked=s.checked;const style=getComputedStyle(s);for(let p=0;p<style.length;p+=1){const name=style[p];d.style.setProperty(name,style.getPropertyValue(name),'important');}['::before','::after'].forEach(pseudo=>{const ps=getComputedStyle(s,pseudo);const content=ps.getPropertyValue('content');if(!content||content==='none'||content==='normal')return;const key='p'+i;d.setAttribute('data-print-style-v2164',key);let declarations='';for(let x=0;x<ps.length;x+=1){const name=ps[x];declarations+=name+':'+ps.getPropertyValue(name)+'!important;';}pseudoCss+='[data-print-style-v2164="'+key+'"]'+pseudo+'{'+declarations+'}';});}clone.removeAttribute('id');clone.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));return{clone,pseudoCss};}
function destroyExactPrintV2164(){document.getElementById('exactPrintRootV2164')?.remove();document.body.classList.remove('exact-print-active-v2164');}
function buildExactPrintV2164(){destroyExactPrintV2164();const page=document.getElementById('page-closing');if(!page)return null;const topbar=document.querySelector('.topbar');const host=document.createElement('div');host.id='exactPrintRootV2164';host.style.display='none';const shadow=host.attachShadow({mode:'open'});const shell=document.createElement('div');shell.className='exact-print-shell-v2164';let pseudoCss='';if(topbar){const topCopy=copyLiveStyleTreeV2164(topbar);topCopy.clone.querySelectorAll('.topbar-actions,button').forEach(node=>node.remove());topCopy.clone.style.setProperty('position','static','important');topCopy.clone.style.setProperty('inset','auto','important');shell.appendChild(topCopy.clone);pseudoCss+=topCopy.pseudoCss;}const pageCopy=copyLiveStyleTreeV2164(page);pageCopy.clone.querySelectorAll('button,.review-top-actions,#reviewTopActions,.closing-actions,.machine-heading-buttons,.bulk-edit-bar,.structure-edit-banner').forEach(node=>node.remove());pageCopy.clone.style.setProperty('display','block','important');pageCopy.clone.style.setProperty('width','100%','important');pageCopy.clone.style.setProperty('max-width','none','important');pageCopy.clone.style.setProperty('margin','0','important');shell.appendChild(pageCopy.clone);pseudoCss+=pageCopy.pseudoCss;const width=Math.max(page.getBoundingClientRect().width,topbar?.getBoundingClientRect().width||0,900);const printable=1068;const scale=Math.min(1,printable/width);shell.style.setProperty('width',width+'px','important');shell.style.setProperty('zoom',String(scale),'important');shell.style.setProperty('background','#fff','important');const style=document.createElement('style');style.textContent=':host{display:block;background:#fff;color:#111827}.exact-print-shell-v2164{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;transform-origin:top left!important}.exact-print-shell-v2164 *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}'+pseudoCss;shadow.append(style,shell);document.body.appendChild(host);document.body.classList.add('exact-print-active-v2164');return host;}
printClosingPdf=async function(){const button=document.getElementById('globalPrintButton');if(!state.closing||!state.closingReview||!button)return;try{button.disabled=true;const root=buildExactPrintV2164();if(!root)throw new Error('Review page is not available.');await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));window.print();}catch(error){toast('Cannot open print dialog',error.message||'Printing is not available on this computer.','error');}finally{setTimeout(destroyExactPrintV2164,300);button.disabled=false;}};
historyKpiCard=function(label,value,iconName,tone='blue'){return '<article class="card history-kpi-card history-kpi-'+tone+' closing-summary-item"><div class="closing-summary-head"><span>'+escapeHtml(label)+'</span><span class="history-kpi-icon closing-summary-icon">'+icon(iconName,18)+'</span></div><strong>'+value+'</strong></article>';};
function applyHistoryDailyParityV2164(){document.querySelectorAll('#page-history .history-kpi-grid,#page-history .history-detail-kpis').forEach(grid=>grid.classList.add('closing-summary-strip'));document.querySelectorAll('#page-history .history-kpi-card').forEach(card=>card.classList.add('closing-summary-item'));}
const renderHistoryV2163DailyParity=renderHistory;renderHistory=async function(){await renderHistoryV2163DailyParity();applyHistoryDailyParityV2164();};
const showHistoryDetailV2163DailyParity=showHistoryDetail;showHistoryDetail=async function(closingId){await showHistoryDetailV2163DailyParity(closingId);applyHistoryDailyParityV2164();};



/* v2.1.65 - always-available range selection, immediate signed adjustments, history review parity, protected Settings edit */

// Range selection is always available. A normal single click still focuses the input;
// dragging, Shift-clicking, Ctrl-clicking, or clicking a column header activates the bulk range.
handleBulkPointerDown = function(event) {
  const cell = event.currentTarget;
  if (state.closingReadOnly || state.closingReview || !cell?.dataset?.cellKey) return;
  const key = cell.dataset.cellKey;
  const previousAnchor = state.bulkAnchor;
  state.bulkDragging = true;
  state.bulkPointerStartV2165 = key;
  state.bulkDragMovedV2165 = false;
  state.bulkPointerModifierV2165 = Boolean(event.shiftKey || event.ctrlKey || event.metaKey);

  if (event.shiftKey && previousAnchor) {
    event.preventDefault();
    state.bulkMode = true;
    selectBulkRectangle(previousAnchor, key, Boolean(event.ctrlKey || event.metaKey));
    state.bulkAnchor = previousAnchor;
    state.bulkDragMovedV2165 = true;
    updateBulkSelectionUi();
    return;
  }

  if (event.ctrlKey || event.metaKey) {
    event.preventDefault();
    state.bulkMode = true;
    if (state.bulkSelection.has(key)) state.bulkSelection.delete(key);
    else state.bulkSelection.add(key);
    state.bulkAnchor = key;
    state.bulkDragMovedV2165 = true;
    updateBulkSelectionUi();
    return;
  }

  // Normal clicks select the active cell without blocking ordinary field editing.
  state.bulkSelection.clear();
  state.bulkSelection.add(key);
  state.bulkAnchor = key;
  state.bulkMode = true;
  state.bulkPendingAnchorV2165 = key;
};

handleBulkPointerEnter = function(event) {
  if (!state.bulkDragging || state.closingReadOnly || state.closingReview) return;
  const targetKey = event.currentTarget?.dataset?.cellKey;
  const startKey = state.bulkPointerStartV2165;
  if (!startKey || !targetKey || startKey === targetKey) return;
  state.bulkDragMovedV2165 = true;
  state.bulkMode = true;
  state.bulkAnchor = startKey;
  selectBulkRectangle(startKey, targetKey, false);
  updateBulkSelectionUi();
};

endBulkDrag = function() {
  if (!state.bulkDragging) return;
  const moved = Boolean(state.bulkDragMovedV2165);
  const modified = Boolean(state.bulkPointerModifierV2165);
  const startKey = state.bulkPointerStartV2165;
  state.bulkDragging = false;
  state.bulkPointerStartV2165 = null;
  state.bulkPointerModifierV2165 = false;
  state.bulkDragMovedV2165 = false;
  state.bulkPendingAnchorV2165 = null;

  state.bulkMode = true;
  state.bulkAnchor = startKey || state.bulkAnchor;
  updateBulkSelectionUi();
};

handleBulkHeaderClick = function(event) {
  if (state.closingReadOnly || state.closingReview) return;
  const field = event.currentTarget?.dataset?.bulkField;
  if (!field) return;
  state.bulkMode = true;
  const keys = [...document.querySelectorAll(`.bulk-cell[data-field="${field}"]`)].map(cell => cell.dataset.cellKey);
  const toggleColumn = Boolean(event.ctrlKey || event.metaKey);
  const allSelected = keys.length > 0 && keys.every(key => state.bulkSelection.has(key));
  if (!toggleColumn) state.bulkSelection.clear();
  keys.forEach(key => toggleColumn && allSelected ? state.bulkSelection.delete(key) : state.bulkSelection.add(key));
  state.bulkAnchor = keys[0] || null;
  updateBulkSelectionUi();
};

// The old v2.1.63 wrapper forced Selection mode on every render. Keep the page clean;
// selection now activates automatically when the user actually drags/selects.
const renderClosingV2164BeforeAutoRange = renderClosing;
renderClosing = function() {
  renderClosingV2164BeforeAutoRange();
  if (state.closing && !state.closingReadOnly && !state.closingReview && state.bulkSelection.size === 0) {
    state.bulkMode = false;
    updateBulkSelectionUi();
  }
  bindRefillHistoryButtons();
};

refillEventLabel = function(event) {
  const raw = String(event?.at || '');
  let when = raw;
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) when = parsed.toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  return { when: when || '—', by: String(event?.by || '—'), qty: signedAdjustmentNumberV2164(event?.qty) };
};

// Adjustment no longer depends on Closed By. Draft persistence is allowed before staff names are filled.
showRefillProductModalV2144 = function(machineIndex, productIndex) {
  const machine = state.closing?.machines?.[Number(machineIndex)];
  const product = machine ? ensureClosingProducts(machine)[Number(productIndex)] : null;
  if (!machine || !product) return;
  if (state.closingReadOnly || state.closingReview) {
    showRefillHistory(Number(machineIndex), Number(productIndex));
    return;
  }

  const history = refillHistoryFor(product);
  const total = refillTotal(product);
  const machineLabel = machineDisplayLabel(machine, state.closing?.machines || []);
  const totalLabel = (total > 0 ? '+' : '') + number(total);
  const body = '<div class="refill-cell-product-head">' + productThumbnail(product, 'small') +
    '<div class="refill-cell-product-copy"><strong>' + escapeHtml(product.barcode || ('Product ' + (Number(productIndex) + 1))) +
    '</strong><span>' + escapeHtml(machineLabel) + ' · Begin Qty ' + number(product.begin_qty) + ' · Adjustment ' + totalLabel + '</span></div></div>' +
    '<div class="refill-cell-add-card"><div><strong>Adjust stock</strong><span>Use a positive number to add stock or a negative number to correct/remove stock.</span></div>' +
    '<input id="refillCellQtyV2144" class="input refill-cell-qty" type="text" inputmode="text" maxlength="7" autocomplete="off" value="" aria-label="Stock adjustment quantity"></div>' +
    '<div class="refill-cell-history-section"><div class="refill-cell-history-head"><strong>Adjustment history</strong><span>' + history.length +
    ' event' + (history.length === 1 ? '' : 's') + ' · Total ' + totalLabel + '</span></div><div class="refill-cell-history-list">' + refillHistoryRowsV2144(product) + '</div></div>';

  showModal('Refill · ' + machineLabel, body, 'Save Adjustment', async () => {
    const input = document.getElementById('refillCellQtyV2144');
    const raw = String(input?.value || '').trim();
    if (!/^[+-]?\d+$/.test(raw)) throw new Error('Enter a whole number such as 10 or -10.');
    const qty = parseInt(raw, 10);
    if (!qty) throw new Error('Adjustment cannot be 0.');
    const available = Math.max(0, numeric(product.begin_qty)) + refillTotal(product) + qty;
    if (available < 0) throw new Error('This adjustment would make available stock negative.');

    const staff = String(state.closing?.closed_by || '').trim();
    const oldQty = product.refill_qty;
    const oldHistory = refillHistoryFor(product).slice();
    const nextHistory = oldHistory.slice();
    nextHistory.push({ qty, at: new Date().toISOString(), by: staff });
    product.refill_history = nextHistory;
    product.refill_qty = nextHistory.reduce((sum, item) => sum + signedAdjustmentNumberV2164(item.qty), 0);

    // Update the visible Refill cell immediately, before the local Draft write finishes.
    bindRefillHistoryButtons();
    try {
      const result = await api('/api/closings/save', { method: 'POST', body: JSON.stringify(closingPayload('Draft')) });
      state.closingId = result.closing_id;
      state.closingStatus = result.workflow_status;
      closeModal();
      renderClosing();
      toast('Stock adjustment saved', machineLabel + ' · ' + (product.barcode || 'Product') + ' · ' + (qty > 0 ? '+' : '') + number(qty) + '.');
    } catch (error) {
      product.refill_qty = oldQty;
      product.refill_history = oldHistory;
      bindRefillHistoryButtons();
      throw error;
    }
  });

  document.querySelector('#modalRoot .modal')?.classList.add('refill-cell-modal');
  const input = document.getElementById('refillCellQtyV2144');
  if (input) {
    input.removeAttribute('placeholder');
    input.addEventListener('input', () => {
      let value = input.value.replace(/[^0-9+-]/g, '');
      const negative = value.startsWith('-');
      value = value.replace(/[+-]/g, '');
      input.value = (negative ? '-' : '') + value;
    });
    setTimeout(() => input.focus(), 0);
  }
};

// Final sign-aware binder. Higher-specificity CSS below guarantees negative adjustments are red.
bindRefillHistoryButtons = function() {
  document.querySelectorAll('#page-closing .refill-total-button').forEach(button => {
    const mi = Number(button.dataset.machineIndex);
    const pi = Number(button.dataset.productIndex);
    const machine = state.closing?.machines?.[mi];
    const product = machine ? ensureClosingProducts(machine)[pi] : null;
    const total = product ? refillTotal(product) : 0;
    const history = product ? refillHistoryFor(product) : [];
    const hasAdjustment = history.length > 0 || total !== 0;
    button.classList.remove('has-refill', 'no-refill', 'refill-positive', 'refill-negative', 'refill-zero');
    button.classList.add(total > 0 ? 'refill-positive' : (total < 0 ? 'refill-negative' : (hasAdjustment ? 'refill-zero' : 'no-refill')));
    button.textContent = hasAdjustment ? ((total > 0 ? '+' : '') + number(total)) : '+ Add';
    button.title = hasAdjustment ? 'Add another stock adjustment or view adjustment history' : 'Add stock adjustment';
    button.setAttribute('aria-label', button.title);
    button.onclick = () => showRefillProductModalV2144(mi, pi);
  });
};

function relaxExactPrintFlowV2165(root) {
  if (!root) return;
  root.querySelectorAll('.data-table-wrap').forEach(node => {
    node.style.setProperty('overflow', 'visible', 'important');
    node.style.setProperty('overflow-x', 'visible', 'important');
    node.style.setProperty('overflow-y', 'visible', 'important');
    node.style.setProperty('height', 'auto', 'important');
    node.style.setProperty('max-height', 'none', 'important');
    node.style.setProperty('min-height', '0', 'important');
  });
  root.querySelectorAll('.machine-section,.review-machine-section,.product-closing-table,tbody').forEach(node => {
    node.style.setProperty('height', 'auto', 'important');
    node.style.setProperty('max-height', 'none', 'important');
    node.style.setProperty('overflow', 'visible', 'important');
  });
  root.querySelectorAll('.product-closing-table thead').forEach(node => node.style.setProperty('display', 'table-header-group', 'important'));
}

buildExactPrintV2164 = function() {
  destroyExactPrintV2164();
  const page = document.getElementById('page-closing');
  if (!page) return null;
  const topbar = document.querySelector('.topbar');
  const host = document.createElement('div');
  host.id = 'exactPrintRootV2164';
  host.style.display = 'none';
  const shadow = host.attachShadow({ mode: 'open' });
  const shell = document.createElement('div');
  shell.className = 'exact-print-shell-v2164 exact-print-shell-v2165';
  let pseudoCss = '';

  if (topbar) {
    const topCopy = copyLiveStyleTreeV2164(topbar);
    topCopy.clone.querySelectorAll('.topbar-actions,button').forEach(node => node.remove());
    topCopy.clone.style.setProperty('position', 'static', 'important');
    topCopy.clone.style.setProperty('inset', 'auto', 'important');
    shell.appendChild(topCopy.clone);
    pseudoCss += topCopy.pseudoCss;
  }

  const pageCopy = copyLiveStyleTreeV2164(page);
  pageCopy.clone.querySelectorAll('button,.review-top-actions,#reviewTopActions,.closing-actions,.machine-heading-buttons,.bulk-edit-bar,.structure-edit-banner').forEach(node => node.remove());
  pageCopy.clone.style.setProperty('display', 'block', 'important');
  pageCopy.clone.style.setProperty('width', '100%', 'important');
  pageCopy.clone.style.setProperty('max-width', 'none', 'important');
  pageCopy.clone.style.setProperty('height', 'auto', 'important');
  pageCopy.clone.style.setProperty('max-height', 'none', 'important');
  pageCopy.clone.style.setProperty('overflow', 'visible', 'important');
  pageCopy.clone.style.setProperty('margin', '0', 'important');
  relaxExactPrintFlowV2165(pageCopy.clone);
  shell.appendChild(pageCopy.clone);
  pseudoCss += pageCopy.pseudoCss;

  const width = Math.max(page.getBoundingClientRect().width, topbar?.getBoundingClientRect().width || 0, 900);
  const printableLandscapePx = 1040;
  const scale = Math.min(1, printableLandscapePx / width);
  shell.style.setProperty('width', width + 'px', 'important');
  shell.style.setProperty('zoom', String(scale), 'important');
  shell.style.setProperty('height', 'auto', 'important');
  shell.style.setProperty('overflow', 'visible', 'important');
  shell.style.setProperty('background', '#fff', 'important');

  const style = document.createElement('style');
  style.textContent = ':host{display:block;background:#fff;color:#111827;overflow:visible!important}' +
    '.exact-print-shell-v2164{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;transform-origin:top left!important;overflow:visible!important;height:auto!important}' +
    '.exact-print-shell-v2164 *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}' + pseudoCss;
  shadow.append(style, shell);
  document.body.appendChild(host);
  document.body.classList.add('exact-print-active-v2164', 'exact-print-active-v2165');
  return host;
};

const destroyExactPrintV2164BaseV2165 = destroyExactPrintV2164;
destroyExactPrintV2164 = function() {
  destroyExactPrintV2164BaseV2165();
  document.body.classList.remove('exact-print-active-v2165');
};

function historyClosingMachinesV2165(data) {
  const machineRows = Array.isArray(data?.machines) ? data.machines : [];
  const productRows = Array.isArray(data?.products) ? data.products : [];
  const ids = [];
  const seen = new Set();
  [...machineRows, ...productRows].forEach(row => {
    const id = String(row?.Machine_ID ?? row?.machine_id ?? '').trim();
    if (id && !seen.has(id)) { seen.add(id); ids.push(id); }
  });

  return ids.map((id, index) => {
    const row = machineRows.find(item => String(item?.Machine_ID ?? item?.machine_id ?? '') === id) || {};
    const master = (state.machines || []).find(item => String(item?.Machine_ID || '') === id) || {};
    const rows = productRows.filter(item => String(item?.Machine_ID ?? item?.machine_id ?? '') === id);
    const fallbackProducts = Array.isArray(row.products) ? row.products : [];
    const sourceProducts = rows.length ? rows : fallbackProducts;
    const products = sourceProducts.map((item, productIndex) => {
      const imageFile = String(item?.Image_File ?? item?.image_file ?? item?.image_object_key_snapshot ?? '');
      const signedImageUrl = String(item?.Image_URL ?? item?.image_url ?? '');
      return {
        product_id: String(item?.Product_ID ?? item?.product_id ?? ('history-' + index + '-' + productIndex)),
        barcode: String(item?.Barcode ?? item?.barcode ?? ''),
        image_file: imageFile,
        image_url: signedImageUrl || (!isCloudStaging() && imageFile ? '/api/machine-images/' + encodeURIComponent(imageFile) : ''),
        begin_qty: item?.Begin_Qty ?? item?.begin_qty ?? 0,
        refill_qty: item?.Refill_Qty ?? item?.refill_qty ?? 0,
        refill_history: item?.Refill_History_JSON ?? item?.refill_history ?? [],
        final_qty: item?.Final_Qty ?? item?.final_qty ?? 0,
        history_qty_used: item?.Qty_Used ?? item?.qty_used,
      };
    });
    return {
      machine_id: id,
      machine_name: String(row?.Machine_Name ?? row?.machine_name ?? master?.Machine_Name ?? ''),
      machine_type: canonicalMachineTypeName(row?.Machine_Type ?? row?.machine_type ?? master?.Machine_Type, id) || 'Other',
      sort_order: row?.Sort_Order ?? master?.Sort_Order ?? index + 1,
      Created_At: row?.Created_At ?? master?.Created_At ?? '',
      begin_coin_meter: row?.Begin_Coin_Meter ?? row?.begin_coin_meter ?? 0,
      final_coin_meter: row?.Final_Coin_Meter ?? row?.final_coin_meter ?? 0,
      coins_used: row?.Coins_Used ?? row?.coins_used ?? 0,
      play_rule_coins: row?.Play_Rule_Coins ?? row?.play_rule_coins ?? 1,
      status: String(row?.Machine_Status ?? row?.status ?? 'Working'),
      history_win_rate: row?.Win_Rate ?? row?.win_rate,
      products,
    };
  });
}

function historySummaryResultV2165(header, machines) {
  const totalSales = numeric(header?.Total_Sales);
  const coinsUsed = numeric(header?.Machine_Coins_Used);
  const loseOver = numeric(header?.Coin_Variance);
  const storedReturn = header?.Coins_Dispensed;
  const coinReturn = storedReturn === null || storedReturn === undefined || storedReturn === '' ? coinsUsed + loseOver : numeric(storedReturn);
  const prizes = numeric(header?.Total_Prizes_Won);
  const pricePerCoin = numeric(state.appSettings?.price_per_coin_usd ?? state.bootstrap?.settings?.price_per_coin_usd ?? 0.3125);
  const expectedRevenue = coinsUsed * pricePerCoin;
  const discount = expectedRevenue - totalSales;
  const discountPercent = expectedRevenue > 0 ? (discount / expectedRevenue) * 100 : null;
  const totalPlays = machines.reduce((sum, machine) => {
    const rule = Math.max(1, numeric(machine.play_rule_coins));
    return sum + (numeric(machine.coins_used) / rule);
  }, 0);
  const overallWinRate = prizes > 0 && totalPlays > 0 ? totalPlays / prizes : null;
  return {
    totalSales,
    discount,
    discountPercent,
    coinsUsed,
    coinReturn,
    loseOver,
    prizes,
    overallWinRate,
    averagePerProduct: prizes > 0 ? totalSales / prizes : 0,
  };
}

function showHistoryAdjustmentV2165(machine, product) {
  const history = refillHistoryFor(product);
  const total = refillTotal(product);
  const totalLabel = (total > 0 ? '+' : '') + number(total);
  const rows = history.length ? refillHistoryRowsV2144(product) : '<div class="refill-cell-empty">No itemized adjustment history is stored for this older record.</div>';
  showModal(
    'Adjustment History · ' + machineDisplayLabel(machine, []),
    '<div class="refill-history-head"><span>' + productThumbnail(product, 'small') + '</span><div><strong>' + escapeHtml(product.barcode || 'Product') +
    '</strong><p>Total adjustment: <b class="' + (total < 0 ? 'refill-negative-text' : 'refill-positive-text') + '">' + escapeHtml(totalLabel) +
    '</b></p></div></div><div class="refill-history-list">' + rows + '</div>',
    'Close',
    async () => closeModal()
  );
  document.querySelector('#modalRoot .modal')?.classList.add('refill-history-modal');
}

showHistoryDetail = async function(closingId) {
  try {
    const data = await api('/api/closings/' + encodeURIComponent(closingId));
    const header = data.header || {};
    const machines = historyClosingMachinesV2165(data);
    const summary = historySummaryResultV2165(header, machines);
    const page = document.getElementById('page-history');
    setActions('<button class="btn btn-secondary" id="historyBackTop">Back</button><button class="btn btn-secondary" id="historyPrint">' + icon('print', 16) +
      ' Print</button><button class="btn btn-primary" id="historyExport">' + icon('folder', 16) + ' Export Excel</button>');

    page.innerHTML =
      '<article class="card review-heading-card history-detail-head history-daily-head"><div><span class="review-kicker">FINALIZED CLOSING</span><h2>' +
      escapeHtml(historyDateLabel(header.Report_Date)) + ' · ' + escapeHtml(header.Outlet || '—') + '</h2><p>' + escapeHtml(closingId) + ' · ' +
      escapeHtml(historyFinalizedTime(header)) + '</p></div><div class="review-staff-grid"><div><span>Closed By</span><strong>' +
      escapeHtml(header.Closed_By || '—') + '</strong></div><div><span>Verified By</span><strong>' + escapeHtml(header.Verified_By || '—') +
      '</strong></div><div><span>Closing ID</span><strong>' + escapeHtml(closingId) + '</strong></div></div></article>' +
      '<div class="closing-summary-strip history-daily-summary">' + renderCompactClosingSummary(summary) + '</div>' +
      renderMachineClosingTable({ machines }, true) +
      (header.Notes ? '<article class="card review-notes-card history-detail-notes"><span>Shift Notes</span><p>' + escapeHtml(header.Notes) + '</p></article>' : '');

    const machineSection = page.querySelector('.review-machine-section');
    if (machineSection) machineSection.classList.add('history-daily-machine');

    page.querySelectorAll('.history-daily-machine input,.history-daily-machine select').forEach(control => {
      control.disabled = true;
      control.setAttribute('aria-readonly', 'true');
    });

    page.querySelectorAll('.history-daily-machine .calc-product-used').forEach(cell => {
      const mi = Number(cell.dataset.machineIndex);
      const pi = Number(cell.dataset.productIndex);
      const product = machines?.[mi]?.products?.[pi];
      if (!product) return;
      const stored = product.history_qty_used;
      const calculated = numeric(product.begin_qty) + refillTotal(product) - numeric(product.final_qty);
      cell.textContent = number(stored === null || stored === undefined || stored === '' ? calculated : numeric(stored));
    });

    page.querySelectorAll('.history-daily-machine .calc-win-rate').forEach(cell => {
      const mi = Number(cell.dataset.machineIndex);
      const value = machines?.[mi]?.history_win_rate;
      cell.textContent = value === null || value === undefined || value === '' ? '—' : number(value, 2);
    });

    page.querySelectorAll('.history-daily-machine .refill-total-button').forEach(button => {
      const mi = Number(button.dataset.machineIndex);
      const pi = Number(button.dataset.productIndex);
      const machine = machines?.[mi];
      const product = machine?.products?.[pi];
      if (!machine || !product) return;
      const total = refillTotal(product);
      const history = refillHistoryFor(product);
      const hasAdjustment = history.length > 0 || total !== 0;
      button.classList.remove('has-refill', 'no-refill', 'refill-positive', 'refill-negative', 'refill-zero');
      button.classList.add(total > 0 ? 'refill-positive' : (total < 0 ? 'refill-negative' : (hasAdjustment ? 'refill-zero' : 'no-refill')));
      button.textContent = hasAdjustment ? ((total > 0 ? '+' : '') + number(total)) : '+ Add';
      button.title = hasAdjustment ? 'View adjustment history' : 'No adjustment recorded';
      button.onclick = () => showHistoryAdjustmentV2165(machine, product);
    });

    document.getElementById('historyBackTop').onclick = () => renderHistory();
    document.getElementById('historyPrint').onclick = () => {
      page.classList.add('history-print-detail');
      window.addEventListener('afterprint', () => page.classList.remove('history-print-detail'), { once: true });
      window.print();
    };
    document.getElementById('historyExport').onclick = async () => {
      try {
        const result = await api('/api/history/' + encodeURIComponent(closingId) + '/export', { method: 'POST' });
        toast('Excel report opened', result.report_name || (closingId + '.xlsx'));
      } catch (error) {
        toast('Cannot open Excel report', error.message, 'error');
      }
    };
  } catch (error) {
    toast('Cannot open closing history', error.message, 'error');
  }
};

function requestSettingsEditV2165(section) {
  const label = section === 'setup' ? 'Setup' : 'Type Machine';
  showModal(
    'Settings password',
    '<div class="settings-password-copy"><strong>Unlock ' + escapeHtml(label) + '</strong><span>Enter the administrator password to enable editing. Without the password, Settings remains view only.</span></div>' +
    '<div class="field"><label for="settingsPasswordV2165">Password</label><input id="settingsPasswordV2165" class="input" type="password" autocomplete="off" spellcheck="false"></div>',
    'Unlock Edit',
    async () => {
      const input = document.getElementById('settingsPasswordV2165');
      const password = String(input?.value || '');
      if (!password) throw new Error('Enter the Settings password.');
      await api('/api/settings/unlock', { method: 'POST', body: JSON.stringify({ password }) });
      state.settingsEditPasswordV2165 = password;
      state.settingsEdit.setup = section === 'setup';
      state.settingsEdit.machineTypes = section === 'machineTypes';
      closeModal();
      await renderSettings();
    }
  );
  setTimeout(() => document.getElementById('settingsPasswordV2165')?.focus(), 0);
}

const renderSettingsV2164BeforePassword = renderSettings;
renderSettings = async function() {
  await renderSettingsV2164BeforePassword();
  if (!state.settingsEdit.setup) {
    const button = document.getElementById('editSetupSettings');
    if (button) button.onclick = () => requestSettingsEditV2165('setup');
  }
  if (!state.settingsEdit.machineTypes) {
    const button = document.getElementById('editMachineTypeSettings');
    if (button) button.onclick = () => requestSettingsEditV2165('machineTypes');
  }
};

const saveSettingsPayloadV2164BeforePassword = saveSettingsPayload;
saveSettingsPayload = async function(payload, message, section) {
  const password = String(state.settingsEditPasswordV2165 || '');
  if (!password) {
    toast('Settings locked', 'Enter the Settings password before editing.', 'error');
    state.settingsEdit.setup = false;
    state.settingsEdit.machineTypes = false;
    await renderSettings();
    return;
  }
  try {
    return await saveSettingsPayloadV2164BeforePassword({ ...payload, _edit_password: password }, message, section);
  } finally {
    state.settingsEditPasswordV2165 = '';
  }
};


/* v2.1.68 — immediate adjustment operator + print continuation fixes */
showRefillProductModalV2144 = function(machineIndex, productIndex) {
  const machine = state.closing?.machines?.[Number(machineIndex)];
  const product = machine ? ensureClosingProducts(machine)[Number(productIndex)] : null;
  if (!machine || !product) return;
  if (state.closingReadOnly || state.closingReview) {
    showRefillHistory(Number(machineIndex), Number(productIndex));
    return;
  }

  const history = refillHistoryFor(product);
  const total = refillTotal(product);
  const machineLabel = machineDisplayLabel(machine, state.closing?.machines || []);
  const totalLabel = (total > 0 ? '+' : '') + number(total);
  const lastNamedEvent = history.slice().reverse().find(item => String(item?.by || item?.staff || '').trim());
  const defaultStaff = String(state.closing?.closed_by || lastNamedEvent?.by || lastNamedEvent?.staff || '').trim();
  const body =
    '<div class="refill-cell-product-head">' + productThumbnail(product, 'small') +
      '<div class="refill-cell-product-copy"><strong>' + escapeHtml(product.barcode || ('Product ' + (Number(productIndex) + 1))) +
      '</strong><span>' + escapeHtml(machineLabel) + ' · Begin Qty ' + number(product.begin_qty) + ' · Adjustment ' + totalLabel + '</span></div></div>' +
    '<div class="refill-adjustment-form-v2168">' +
      '<div class="field"><label for="refillAdjustedByV2168">Adjusted By</label>' +
      '<input id="refillAdjustedByV2168" class="input" type="text" maxlength="100" autocomplete="off" value="' + escapeHtml(defaultStaff) + '" placeholder="Staff name"></div>' +
      '<div class="field"><label for="refillCellQtyV2144">Adjustment Qty</label>' +
      '<input id="refillCellQtyV2144" class="input refill-cell-qty" type="text" inputmode="text" maxlength="7" autocomplete="off" value="" aria-label="Stock adjustment quantity"></div>' +
    '</div>' +
    '<div class="refill-adjustment-help-v2168">Use a positive number to add stock or a negative number to correct/remove stock.</div>' +
    '<div class="refill-cell-history-section"><div class="refill-cell-history-head"><strong>Adjustment history</strong><span>' + history.length +
      ' event' + (history.length === 1 ? '' : 's') + ' · Total ' + totalLabel + '</span></div>' +
      '<div class="refill-cell-history-list">' + refillHistoryRowsV2144(product) + '</div></div>';

  showModal('Refill · ' + machineLabel, body, 'Save Adjustment', async () => {
    const staffInput = document.getElementById('refillAdjustedByV2168');
    const staff = String(staffInput?.value || '').trim();
    if (!staff) {
      staffInput?.classList.add('refill-field-error-v2168');
      staffInput?.focus();
      throw new Error('Adjusted By is required.');
    }

    const input = document.getElementById('refillCellQtyV2144');
    const raw = String(input?.value || '').trim();
    if (!/^[+-]?\d+$/.test(raw)) throw new Error('Enter a whole number such as 10 or -10.');
    const qty = parseInt(raw, 10);
    if (!qty) throw new Error('Adjustment cannot be 0.');
    const available = Math.max(0, numeric(product.begin_qty)) + refillTotal(product) + qty;
    if (available < 0) throw new Error('This adjustment would make available stock negative.');

    try {
      const cloudRefill = isCloudStaging();
      if (cloudRefill) {
        const result = await api('/api/refills', {
          method: 'POST',
          body: JSON.stringify({
            closing_id: state.closingId || '',
            closing_payload: state.closingId ? undefined : closingPayload('Draft'),
            machine_style_id: product.product_id,
            adjusted_by: staff,
            delta_qty: qty,
          }),
        });
        state.closingId = result.closing_id;
        state.closingStatus = 'Draft';
        product.refill_history = result.product.refill_history;
        product.refill_qty = result.product.refill_qty;
      } else {
        const oldHistory = refillHistoryFor(product).slice();
        const nextHistory = oldHistory.slice();
        nextHistory.push({ qty, at: new Date().toISOString(), by: staff });
        product.refill_history = nextHistory;
        product.refill_qty = nextHistory.reduce((sum, item) => sum + signedAdjustmentNumberV2164(item.qty), 0);
        const result = await api('/api/closings/save', { method: 'POST', body: JSON.stringify(closingPayload('Draft')) });
        state.closingId = result.closing_id;
        state.closingStatus = result.workflow_status;
      }
      closeModal();
      renderClosing();
      toast('Stock adjustment saved', machineLabel + ' · ' + (product.barcode || 'Product') + ' · ' + (qty > 0 ? '+' : '') + number(qty) + ' · ' + staff + '.');
    } catch (error) {
      throw error;
    }
  });

  document.querySelector('#modalRoot .modal')?.classList.add('refill-cell-modal');
  const staffInput = document.getElementById('refillAdjustedByV2168');
  const qtyInput = document.getElementById('refillCellQtyV2144');
  staffInput?.addEventListener('input', () => staffInput.classList.remove('refill-field-error-v2168'));
  if (qtyInput) {
    qtyInput.addEventListener('input', () => {
      let value = qtyInput.value.replace(/[^0-9+-]/g, '');
      const negative = value.startsWith('-');
      value = value.replace(/[+-]/g, '');
      qtyInput.value = (negative ? '-' : '') + value;
    });
  }
  setTimeout(() => (defaultStaff ? qtyInput : staffInput)?.focus(), 0);
};

const buildExactPrintV2167BeforeRefillStatic = buildExactPrintV2164;
buildExactPrintV2164 = function() {
  const swaps = [];
  document.querySelectorAll('#page-closing .refill-total-button').forEach(button => {
    const mi = Number(button.dataset.machineIndex);
    const pi = Number(button.dataset.productIndex);
    const machine = state.closing?.machines?.[mi];
    const product = machine ? ensureClosingProducts(machine)[pi] : null;
    const history = product ? refillHistoryFor(product) : [];
    const total = product ? refillTotal(product) : 0;
    const span = document.createElement('span');
    span.className = 'print-refill-static-v2168 ' + (total > 0 ? 'positive' : (total < 0 ? 'negative' : 'neutral'));
    span.textContent = history.length ? ((total > 0 ? '+' : '') + number(total)) : '—';
    span.setAttribute('aria-label', 'Refill ' + span.textContent);
    button.replaceWith(span);
    swaps.push([span, button]);
  });

  let host = null;
  try {
    host = buildExactPrintV2167BeforeRefillStatic();
    const shadow = host?.shadowRoot;
    if (shadow) {
      shadow.querySelectorAll('.closing-workflow-stepper').forEach(node => node.remove());
      const style = document.createElement('style');
      style.textContent = '@media print{' +
        '.closing-workflow-stepper{display:none!important}' +
        '.product-closing-table thead{display:table-header-group!important}' +
        '.product-closing-table thead tr{break-inside:avoid!important;page-break-inside:avoid!important}' +
        '.print-refill-static-v2168{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:52px!important;height:34px!important;padding:0 8px!important;border:1px solid #d1d5db!important;border-radius:8px!important;background:#fff!important;font-size:14px!important;font-weight:600!important;line-height:20px!important;box-sizing:border-box!important}' +
        '.print-refill-static-v2168.positive{color:#067647!important;background:#ecfdf3!important;border-color:#abefc6!important}' +
        '.print-refill-static-v2168.negative{color:#b42318!important;background:#fef3f2!important;border-color:#fda29b!important}' +
        '.print-refill-static-v2168.neutral{color:#6b7280!important;background:#fff!important;border-color:#d1d5db!important}' +
      '}';
      shadow.appendChild(style);
    }
    return host;
  } finally {
    swaps.forEach(([span, button]) => {
      if (span.isConnected) span.replaceWith(button);
    });
  }
};


/* v2.1.69 — force repeating Machine Closing header in exact print clone */
const buildExactPrintV2168BeforeHeaderRepeat = buildExactPrintV2164;
buildExactPrintV2164 = function() {
  const host = buildExactPrintV2168BeforeHeaderRepeat();
  const shadow = host?.shadowRoot;
  if (!shadow) return host;
  shadow.querySelectorAll('.product-closing-table').forEach(table => {
    table.style.setProperty('overflow', 'visible', 'important');
    table.style.setProperty('break-inside', 'auto', 'important');
    table.style.setProperty('page-break-inside', 'auto', 'important');
  });
  shadow.querySelectorAll('.product-closing-table thead').forEach(head => {
    head.style.setProperty('display', 'table-header-group', 'important');
    head.style.setProperty('break-inside', 'avoid', 'important');
    head.style.setProperty('page-break-inside', 'avoid', 'important');
  });
  shadow.querySelectorAll('.product-closing-table thead tr').forEach(row => {
    row.style.setProperty('break-inside', 'avoid', 'important');
    row.style.setProperty('page-break-inside', 'avoid', 'important');
  });
  shadow.querySelectorAll('.product-closing-table tbody').forEach(body => {
    body.style.setProperty('display', 'table-row-group', 'important');
  });
  shadow.querySelectorAll('.product-closing-table tbody tr').forEach(row => {
    row.style.setProperty('break-inside', 'avoid', 'important');
    row.style.setProperty('page-break-inside', 'avoid', 'important');
  });
  return host;
};


/* v2.1.72 — print actual outside Review screen */
function buildOutsideScreenPrintV2172(){
  destroyExactPrintV2164();
  const page=document.getElementById('page-closing');
  if(!page||!state.closingReview)return null;
  const topbar=document.querySelector('.topbar');
  const host=document.createElement('div');
  host.id='exactPrintRootV2164';
  host.style.display='none';
  const shadow=host.attachShadow({mode:'open'});
  const shell=document.createElement('div');
  shell.className='exact-print-shell-v2164';
  let pseudoCss='';

  if(topbar){
    const topCopy=copyLiveStyleTreeV2164(topbar);
    topCopy.clone.querySelectorAll('.topbar-actions,.page-actions,button').forEach(node=>node.remove());
    topCopy.clone.style.setProperty('position','static','important');
    topCopy.clone.style.setProperty('inset','auto','important');
    shell.appendChild(topCopy.clone);
    pseudoCss+=topCopy.pseudoCss;
  }

  const pageCopy=copyLiveStyleTreeV2164(page);
  pageCopy.clone.querySelectorAll('.closing-workflow-stepper,.review-top-actions,#reviewTopActions,.closing-actions,.machine-heading-buttons,.bulk-edit-bar,.structure-edit-banner').forEach(node=>node.remove());
  pageCopy.clone.querySelectorAll('button').forEach(button=>{
    if(!button.classList.contains('refill-total-button')) button.remove();
  });
  pageCopy.clone.style.setProperty('display','block','important');
  pageCopy.clone.style.setProperty('width','100%','important');
  pageCopy.clone.style.setProperty('max-width','none','important');
  pageCopy.clone.style.setProperty('margin','0','important');

  pageCopy.clone.querySelectorAll('.product-closing-table').forEach(table=>{
    const thead=table.querySelector('thead');
    const tbody=table.querySelector('tbody');
    if(thead){
      thead.style.setProperty('display','table-header-group','important');
      thead.style.setProperty('break-inside','avoid','important');
      thead.style.setProperty('page-break-inside','avoid','important');
    }
    if(tbody) tbody.style.setProperty('display','table-row-group','important');
    table.querySelectorAll('tbody tr').forEach(row=>{
      row.style.setProperty('break-inside','avoid','important');
      row.style.setProperty('page-break-inside','avoid','important');
    });
  });

  shell.appendChild(pageCopy.clone);
  pseudoCss+=pageCopy.pseudoCss;
  const width=Math.max(page.getBoundingClientRect().width,topbar?.getBoundingClientRect().width||0,900);
  const printable=1068;
  const scale=Math.min(1,printable/width);
  shell.style.setProperty('width',width+'px','important');
  shell.style.setProperty('zoom',String(scale),'important');
  shell.style.setProperty('height','auto','important');
  shell.style.setProperty('overflow','visible','important');
  shell.style.setProperty('background','#fff','important');
  const style=document.createElement('style');
  style.textContent=':host{display:block;background:#fff;color:#111827;overflow:visible!important}'+
    '.exact-print-shell-v2164{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;transform-origin:top left!important;overflow:visible!important;height:auto!important}'+
    '.exact-print-shell-v2164 *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}'+pseudoCss;
  shadow.append(style,shell);
  document.body.appendChild(host);
  document.body.classList.add('exact-print-active-v2164','exact-print-active-v2165');
  return host;
}

async function waitForLiveReviewImagesV2189(){
  const images=[...document.querySelectorAll('#page-closing img.product-thumb')];
  await Promise.all(images.map(image=>new Promise(resolve=>{
    let settled=false;
    const finish=()=>{
      if(settled)return;
      settled=true;
      clearTimeout(timeout);
      image.removeEventListener('load',finish);
      image.removeEventListener('error',finish);
      resolve();
    };
    const timeout=setTimeout(finish,2500);
    image.addEventListener('load',finish,{once:true});
    image.addEventListener('error',finish,{once:true});
    if(image.complete){
      if(typeof image.decode==='function')Promise.resolve(image.decode()).catch(()=>{}).finally(finish);
      else finish();
    }
  })));
}

function copyLivePrintControlAppearanceV2193(source,target){
  const properties=['box-sizing','display','width','min-width','max-width','height','min-height','max-height','margin','padding','border','border-width','border-style','border-color','border-radius','background','background-color','color','font','font-family','font-size','font-weight','font-style','line-height','letter-spacing','text-align','vertical-align','appearance','-webkit-appearance','opacity','-webkit-text-fill-color','box-shadow','align-items','justify-content','gap'];
  const style=getComputedStyle(source);
  properties.forEach(property=>target.style.setProperty(property,style.getPropertyValue(property),'important'));
}

function cloneLivePrintNodeV2192(node){
  const clone=node.cloneNode(true);
  const sourceControls=node.matches?.('input,select,textarea')?[node]:[...node.querySelectorAll?.('input,select,textarea')||[]];
  const clonedControls=clone.matches?.('input,select,textarea')?[clone]:[...clone.querySelectorAll?.('input,select,textarea')||[]];
  sourceControls.forEach((source,index)=>{
    const target=clonedControls[index];
    if(!target)return;
    if('value'in source)target.value=source.value;
    if('checked'in source)target.checked=source.checked;
    if(source instanceof HTMLSelectElement&&target instanceof HTMLSelectElement){
      target.value=source.value;
      [...target.options].forEach(option=>option.selected=option.value===source.value);
    }
    copyLivePrintControlAppearanceV2193(source,target);
  });
  clone.removeAttribute?.('id');
  clone.querySelectorAll?.('[id]').forEach(element=>element.removeAttribute('id'));
  return clone;
}

function machinePrintBlocksV2192(table){
  const blocks=[];
  let groupHeader=null;
  let machineRows=[];
  for(const row of table.tBodies[0]?.rows||[]){
    if(row.classList.contains('group-row')){
      groupHeader=row;
      continue;
    }
    if(row.classList.contains('machine-group-start')){
      machineRows=[row];
      if(row.classList.contains('machine-group-end')){
        blocks.push({groupHeader,rows:machineRows});
        groupHeader=null;
      }
      continue;
    }
    machineRows.push(row);
    if(row.classList.contains('machine-group-end')){
      blocks.push({groupHeader,rows:machineRows});
      groupHeader=null;
      machineRows=[];
    }
  }
  return blocks;
}

function appendMachinePrintRowsV2193(target,block,start,end,includeGroupHeader){
  if(includeGroupHeader&&block.groupHeader)target.tbody.appendChild(cloneLivePrintNodeV2192(block.groupHeader));
  const rowCount=end-start;
  for(let index=start;index<end;index+=1){
    const sourceRow=block.rows[index];
    const row=cloneLivePrintNodeV2192(sourceRow);
    if(index===start){
      const sourceLead=block.rows[0];
      const machineCells=[...sourceLead.querySelectorAll(':scope > .machine-group-cell')];
      if(start>0&&machineCells.length){
        row.insertBefore(cloneLivePrintNodeV2192(machineCells[0]),row.firstChild);
        machineCells.slice(1).forEach(cell=>row.appendChild(cloneLivePrintNodeV2192(cell)));
      }
      row.querySelectorAll(':scope > .machine-group-cell').forEach(cell=>cell.rowSpan=rowCount);
    }
    target.tbody.appendChild(row);
  }
}

function explicitPrintPageFitsV2193(page,usableHeight){
  // The outer page is fixed to the physical paper size; only inner content is consumed height.
  void page.content.offsetHeight;
  return page.content.getBoundingClientRect().height<=usableHeight;
}

function createExplicitPrintPageV2192(topbar,reviewHeader,sourcePage,widthPx,heightPx){
  const page=document.createElement('section');
  page.className='print-page';
  page.style.width=`${widthPx}px`;
  page.style.height=`${heightPx}px`;
  const content=document.createElement('div');
  content.className='print-page-content';
  const pageRoot=sourcePage.cloneNode(false);
  pageRoot.classList.add('print-review-page');
  pageRoot.append(cloneLivePrintNodeV2192(topbar),cloneLivePrintNodeV2192(reviewHeader));
  content.appendChild(pageRoot);
  page.appendChild(content);
  return{page,content,pageRoot};
}

function createExplicitPrintTableV2192(sourceSection,includeHeading){
  const section=sourceSection.cloneNode(false);
  if(includeHeading){
    const heading=sourceSection.querySelector('.section-heading');
    if(heading)section.appendChild(cloneLivePrintNodeV2192(heading));
  }
  const sourceWrap=sourceSection.querySelector('.data-table-wrap');
  const sourceTable=sourceSection.querySelector('.product-closing-table');
  const wrap=sourceWrap.cloneNode(false);
  const table=sourceTable.cloneNode(false);
  const colgroup=sourceTable.querySelector('colgroup');
  const thead=sourceTable.tHead;
  const tbody=sourceTable.tBodies[0].cloneNode(false);
  if(colgroup)table.appendChild(cloneLivePrintNodeV2192(colgroup));
  if(thead)table.appendChild(cloneLivePrintNodeV2192(thead));
  table.appendChild(tbody);
  wrap.appendChild(table);
  section.appendChild(wrap);
  return{section,tbody};
}

function printPixelsPerMmV2192(){
  const ruler=document.createElement('div');
  ruler.style.cssText='position:absolute;visibility:hidden;width:100mm;height:1px;pointer-events:none;';
  document.body.appendChild(ruler);
  const pixels=ruler.getBoundingClientRect().width/100;
  ruler.remove();
  return pixels||3.78;
}

function buildExplicitLiveReviewPrintDocumentV2192(){
  const topbar=document.querySelector('.topbar');
  const reviewHeader=document.querySelector('#page-closing .review-heading-card');
  const page=document.getElementById('page-closing');
  const machineSection=page?.querySelector('.review-machine-section');
  const sourceTable=machineSection?.querySelector('.product-closing-table');
  const notes=page?.querySelector('.review-notes-card');
  if(!topbar||!reviewHeader||!page||!machineSection||!sourceTable||!notes)return()=>{};
  const pixelsPerMm=printPixelsPerMmV2192();
  const pageWidth=281*pixelsPerMm;
  const pageHeight=194*pixelsPerMm;
  const usableHeight=pageHeight-(2.5*pixelsPerMm);
  const documentRoot=document.createElement('div');
  documentRoot.id='printDocumentV2192';
  documentRoot.className='print-document print-measurement';
  document.body.appendChild(documentRoot);
  const pages=[];
  const makePage=first=>{
    const next=createExplicitPrintPageV2192(topbar,reviewHeader,page,pageWidth,pageHeight);
    documentRoot.appendChild(next.page);
    if(first){
      [...page.children].filter(node=>node!==reviewHeader&&node!==machineSection&&node!==notes&&!node.classList.contains('closing-workflow-stepper')).forEach(node=>next.pageRoot.appendChild(cloneLivePrintNodeV2192(node)));
    }
    const table=createExplicitPrintTableV2192(machineSection,first);
    next.pageRoot.appendChild(table.section);
    pages.push({...next,...table});
    return pages.at(-1);
  };
  let current=makePage(true);
  for(const block of machinePrintBlocksV2192(sourceTable)){
    let start=0;
    while(start<block.rows.length){
      const before=current.tbody.rows.length;
      appendMachinePrintRowsV2193(current,block,start,block.rows.length,start===0);
      if(explicitPrintPageFitsV2193(current,usableHeight)){
        start=block.rows.length;
        continue;
      }
      while(current.tbody.rows.length>before)current.tbody.lastChild.remove();

      let end=start;
      while(end<block.rows.length){
        const beforeCandidate=current.tbody.rows.length;
        appendMachinePrintRowsV2193(current,block,start,end+1,start===0);
        if(!explicitPrintPageFitsV2193(current,usableHeight)){
          while(current.tbody.rows.length>beforeCandidate)current.tbody.lastChild.remove();
          break;
        }
        end+=1;
        while(current.tbody.rows.length>beforeCandidate)current.tbody.lastChild.remove();
      }
      if(end>start){
        appendMachinePrintRowsV2193(current,block,start,end,start===0);
        start=end;
        current=makePage(false);
        continue;
      }
      if(current.tbody.rows.length){
        current=makePage(false);
        continue;
      }
      // A single product row must remain intact even when it exceeds the conservative allowance.
      appendMachinePrintRowsV2193(current,block,start,start+1,start===0);
      start+=1;
    }
  }
  const notesClone=cloneLivePrintNodeV2192(notes);
  current.pageRoot.appendChild(notesClone);
  if(!explicitPrintPageFitsV2193(current,usableHeight)&&current.pageRoot.children.length>3){
    notesClone.remove();
    current=makePage(false);
    current.section.remove();
    current.pageRoot.appendChild(notesClone);
  }
  documentRoot.classList.remove('print-measurement');
  documentRoot.dataset.pageCount=String(pages.length);
  return()=>documentRoot.remove();
}

printClosingPdf=async function(){
  const button=document.getElementById('globalPrintButton');
  if(!state.closing||!state.closingReview||!button)return;
  let removePrintDocument=()=>{};
  try{
    button.disabled=true;
    await waitForLiveReviewImagesV2189();
    document.body.classList.add('printing-live-review-v2192');
    removePrintDocument=buildExplicitLiveReviewPrintDocumentV2192();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    window.print();
  }catch(error){
    toast('Cannot open print dialog',error.message||'Printing is not available on this computer.','error');
  }finally{
    removePrintDocument();
    document.body.classList.remove('printing-live-review-v2192');
    button.disabled=false;
  }
};


/* v2.1.73 — outside Review print without screen scroll constraints */
function normalizeOutsidePrintFlowV2173(host){
  const shadow=host?.shadowRoot;if(!shadow)return host;
  shadow.querySelectorAll('.machine-section,.data-table-wrap').forEach(node=>{
    node.style.setProperty('height','auto','important');
    node.style.setProperty('max-height','none','important');
    node.style.setProperty('min-height','0','important');
    node.style.setProperty('overflow','visible','important');
    node.style.setProperty('overflow-x','visible','important');
    node.style.setProperty('overflow-y','visible','important');
  });
  shadow.querySelectorAll('.product-closing-table').forEach(table=>{
    table.style.setProperty('height','auto','important');
    table.style.setProperty('max-height','none','important');
    table.style.setProperty('overflow','visible','important');
    const thead=table.querySelector('thead');
    const tbody=table.querySelector('tbody');
    if(thead){
      thead.style.setProperty('display','table-header-group','important');
      thead.style.setProperty('break-inside','avoid','important');
      thead.style.setProperty('page-break-inside','avoid','important');
    }
    if(tbody)tbody.style.setProperty('display','table-row-group','important');
    table.querySelectorAll('tbody tr').forEach(row=>{
      row.style.setProperty('break-inside','avoid','important');
      row.style.setProperty('page-break-inside','avoid','important');
    });
  });
  const style=document.createElement('style');
  style.textContent='.data-table-wrap::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}.data-table-wrap{scrollbar-width:none!important}';
  shadow.appendChild(style);
  return host;
}
const buildOutsideScreenPrintV2172BaseV2173=buildOutsideScreenPrintV2172;
buildOutsideScreenPrintV2172=function(){return normalizeOutsidePrintFlowV2173(buildOutsideScreenPrintV2172BaseV2173());};

/* v2.1.78 operational shifts: server-authoritative opening and draft reload. */
function startShiftLaunchContextV2204() {
  const activeStore = activeCloudStoreV2186();
  const outlet = String(activeStore?.name || activeStore?.code || state.bootstrap?.settings?.outlet || state.bootstrap?.settings?.Outlet || "Current outlet").trim() || "Current outlet";
  const businessDate = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(`${isoToday()}T00:00:00`))
    .replace("Sept", "Sep");
  return { outlet, businessDate };
}

function startShiftLaunchPanelV2204(buttonId) {
  const { outlet, businessDate } = startShiftLaunchContextV2204();
  return `<section class="card shift-launch-panel" data-start-shift-empty-state><div class="shift-launch-status"><span class="shift-launch-icon" aria-hidden="true">${icon("history", 20)}</span><span class="shift-launch-status-label">No active shift</span></div><div class="shift-launch-copy"><h2>Ready to start today's shift?</h2><p>Begin a new closing session for this outlet.</p></div><dl class="shift-launch-context"><div class="shift-launch-context-item"><span class="shift-launch-context-icon" aria-hidden="true">${icon("store", 20)}</span><dt>Outlet</dt><dd>${escapeHtml(outlet)}</dd></div><div class="shift-launch-context-item"><span class="shift-launch-context-icon" aria-hidden="true">${icon("calendar", 20)}</span><dt>Date</dt><dd>${escapeHtml(businessDate)}</dd></div></dl><div class="shift-launch-actions"><button id="${buttonId}" class="btn btn-primary" type="button">Start Shift <span aria-hidden="true">→</span></button></div></section>`;
}

function renderStartShiftStateV2178() {
  const page = document.getElementById("page-closing");
  if (!page) return;
  page.innerHTML = startShiftLaunchPanelV2204("startShiftButtonV2178");
  document.getElementById("startShiftButtonV2178").onclick = () => newClosing();
}

newClosing = async function() {
  const data = await api(`/api/new-closing?report_date=${isoToday()}`);
  if (data.existing_closing_id) return openClosing(data.existing_closing_id);
  state.closingId = null;
  state.closingStatus = "Draft";
  state.closingReadOnly = false;
  state.closingReview = false;
  state.closing = { report_date: dateDisplay(data.report_date), outlet: data.outlet, closed_by: "", verified_by: "", notes: "", sales: defaultSales(), machines: data.machines };
  if (state.page !== "closing") await navigate("closing"); else renderClosing();
};

ensureClosingPage = async function() {
  if (state.closing) renderClosing();
  else renderStartShiftStateV2178();
};

const saveClosingV2178AuthoritativeReload = saveClosing;
saveClosing = async function(status) {
  const saved = await saveClosingV2178AuthoritativeReload(status);
  if (saved && state.closingId) await openClosing(state.closingId);
  return saved;
};

const renderClosingV2178OperationalLock = renderClosing;
renderClosing = function() {
  renderClosingV2178OperationalLock();
  if (!state.closing || state.closingReadOnly) return;
  document.querySelectorAll('#page-closing .product-qty-input[data-field="begin_qty"]').forEach(input => {
    input.readOnly = true;
    input.setAttribute("aria-readonly", "true");
    input.title = "Begin Qty is carried forward from the most recent closed shift.";
  });
  const outletInput = document.getElementById("field-outlet");
  if (outletInput) {
    outletInput.readOnly = true;
    outletInput.closest(".outlet-edit-shell")?.querySelector(".outlet-edit-button")?.remove();
  }
};

const setupBulkSelectionV2178AlwaysAvailable = setupBulkSelection;
setupBulkSelection = function(page) {
  setupBulkSelectionV2178AlwaysAvailable(page);
  const clear = document.getElementById("bulkSelectToggle");
  if (clear) clear.onclick = () => setBulkMode(false);
};

/* v2.1.79 — active-draft lifecycle, queued autosave, and explicit selection mode. */
const renderClosingV2179DailyWorkflow = renderClosing;
const openClosingV2179DailyWorkflow = openClosing;
const openClosingReviewV2179DailyWorkflow = openClosingReview;
const ensureClosingPageV2179DailyWorkflow = ensureClosingPage;
const showRefillProductModalV2179DailyWorkflow = showRefillProductModalV2144;
const setupBulkSelectionV2179Explicit = setupBulkSelection;
const updateBulkSelectionUiV2179Explicit = updateBulkSelectionUi;
const handleBulkPointerDownV2179Explicit = handleBulkPointerDown;
const handleBulkPointerEnterV2179Explicit = handleBulkPointerEnter;

let autosaveTimerV2179 = null;
let autosavePromiseV2179 = null;
let autosaveQueuedV2179 = false;
let autosaveDirtyV2179 = false;
let autosaveRevisionV2179 = 0;
let autosaveFailureV2179 = false;
let autosaveGenerationV2181 = 0;

function showAutosaveErrorV2179(message) {
  const root = document.getElementById("toastRoot");
  const existing = root?.querySelector('[data-autosave-error="true"]');
  if (existing) {
    existing.querySelector("p").textContent = message;
    return;
  }
  toast("Autosave failed", message, "error");
  const created = root?.lastElementChild;
  if (created) created.dataset.autosaveError = "true";
}

function clearAutosaveErrorV2179() { document.querySelector('#toastRoot [data-autosave-error="true"]')?.remove(); }

function autosaveIndicatorV2179(value) {
  document.querySelectorAll("[data-closing-autosave-status]").forEach(target => {
    target.textContent = value;
    target.dataset.state = value.toLowerCase().replace(/\s+/g, "-");
  });
}

function scheduleAutosaveV2179() {
  if (!state.closing || state.closingReadOnly || state.closingReview) return;
  autosaveDirtyV2179 = true;
  autosaveRevisionV2179 += 1;
  clearTimeout(autosaveTimerV2179);
  autosaveIndicatorV2179("Saving...");
  autosaveTimerV2179 = setTimeout(() => { void flushAutosaveV2179().catch(() => {}); }, 850);
}

async function persistActiveDraftV2179() {
  if (!state.closing || state.closingReadOnly || !autosaveDirtyV2179) return;
  if (autosavePromiseV2179) { autosaveQueuedV2179 = true; return autosavePromiseV2179; }
  const revision = autosaveRevisionV2179;
  const generation = autosaveGenerationV2181;
  const closingId = state.closingId;
  let succeeded = false;
  autosaveDirtyV2179 = false;
  autosaveIndicatorV2179("Saving...");
  const tracked = api("/api/closings/save", { method: "POST", body: JSON.stringify(closingPayload("Draft")) })
    .then(result => {
      if (generation !== autosaveGenerationV2181 || closingId !== state.closingId) return result;
      state.closingId = result.closing_id;
      state.closingStatus = result.workflow_status;
      autosaveFailureV2179 = false;
      clearAutosaveErrorV2179();
      if (revision === autosaveRevisionV2179) autosaveIndicatorV2179("Saved");
      succeeded = true;
      return result;
    })
    .catch(error => {
      if (generation !== autosaveGenerationV2181 || closingId !== state.closingId) return undefined;
      autosaveDirtyV2179 = true;
      autosaveFailureV2179 = true;
      autosaveIndicatorV2179("Save failed");
      showAutosaveErrorV2179(error.message || "Your changes are still in this browser. Try Save Now.");
      throw error;
    })
    .finally(() => { if (autosavePromiseV2179 === tracked) autosavePromiseV2179 = null; });
  autosavePromiseV2179 = tracked;
  try { return await tracked; }
  finally {
    if (autosaveQueuedV2179 && succeeded) {
      autosaveQueuedV2179 = false;
      await persistActiveDraftV2179();
    } else autosaveQueuedV2179 = false;
  }
}

async function flushAutosaveV2179() {
  clearTimeout(autosaveTimerV2179);
  autosaveTimerV2179 = null;
  return persistActiveDraftV2179();
}

function renderStartShiftStateV2179() {
  const page = document.getElementById("page-closing");
  if (!page) return;
  setActions("");
  page.innerHTML = startShiftLaunchPanelV2204("startShiftButtonV2179");
  document.getElementById("startShiftButtonV2179").onclick = () => newClosing();
}

function renderContinueShiftStateV2190(active) {
  const page = document.getElementById("page-closing");
  if (!page) return;
  setActions("");
  const { outlet } = startShiftLaunchContextV2204();
  const reportDate = continueShiftDateLabelV2205(active.report_date);
  page.innerHTML = `<section class="card shift-launch-panel shift-continue-panel" data-continue-shift-state><div class="shift-launch-status"><span class="shift-launch-icon" aria-hidden="true">${icon("history", 20)}</span><span class="shift-launch-status-label">Shift still open</span></div><div class="shift-launch-copy"><h2>Continue your open shift?</h2><p>Your previous shift is still in progress and ready to continue.</p></div><dl class="shift-launch-context"><div class="shift-launch-context-item"><span class="shift-launch-context-icon" aria-hidden="true">${icon("store", 20)}</span><dt>Outlet</dt><dd>${escapeHtml(outlet)}</dd></div><div class="shift-launch-context-item"><span class="shift-launch-context-icon" aria-hidden="true">${icon("calendar", 20)}</span><dt>Shift Date</dt><dd>${escapeHtml(reportDate)}</dd></div></dl><div class="shift-launch-actions"><button id="continueShiftButtonV2190" class="btn btn-primary" type="button">Continue Shift <span aria-hidden="true">→</span></button></div></section>`;
  document.getElementById("continueShiftButtonV2190").onclick = () => openClosingV2179DailyWorkflow(active.closing_id);
}

newClosing = async function() {
  const data = await api(`/api/new-closing?report_date=${isoToday()}`);
  const closingId = data.closing_id || data.existing_closing_id;
  if (!closingId) {
    state.closingId = null;
    state.closingStatus = "Draft";
    state.closingReadOnly = false;
    state.closing = { report_date: dateDisplay(data.report_date), outlet: data.outlet, closed_by: "", verified_by: "", notes: "", sales: defaultSales(), machines: data.machines || [] };
    if (state.page !== "closing") await navigate("closing"); else renderClosing();
    return;
  }
  state.closingReview = false;
  state.closingReadOnly = false;
  await openClosingV2179DailyWorkflow(closingId);
  autosaveIndicatorV2179("Saved");
};

ensureClosingPage = async function() {
  if (!isCloudStaging()) return ensureClosingPageV2179DailyWorkflow();
  if (state.closing) return renderClosing();
  const active = await api("/api/active-closing");
  if (active.has_active_shift && active.closing_id) return renderContinueShiftStateV2190(active);
  renderStartShiftStateV2179();
};

saveClosing = async function(status) {
  if (status !== "Finalized") return flushAutosaveV2179();
  await flushAutosaveV2179();
  const result = await api("/api/closings/save", { method: "POST", body: JSON.stringify(closingPayload("Finalized")) });
  state.closingId = result.closing_id;
  state.closingStatus = result.workflow_status;
  state.closingReadOnly = true;
  autosaveDirtyV2179 = false;
  renderClosing();
  toast("Closing finalized", `${result.closing_id} was finalized.`);
  return result;
};

confirmFinalize = function() {
  showConfirm("Close Shift?", "Pending autosave changes will be saved before this shift is closed.", async () => {
    try { await saveClosing("Finalized"); }
    catch (error) { toast("Cannot close shift", error.message, "error"); }
  });
};

openClosingReview = async function() {
  try { await flushAutosaveV2179(); openClosingReviewV2179DailyWorkflow(); }
  catch (error) { toast("Cannot open review", error.message, "error"); }
};

showRefillProductModalV2144 = async function(machineIndex, productIndex) {
  try { await flushAutosaveV2179(); return showRefillProductModalV2179DailyWorkflow(machineIndex, productIndex); }
  catch (error) { toast("Cannot open adjustment", error.message, "error"); }
};

renderClosing = function() {
  renderClosingV2179DailyWorkflow();
  if (!state.closing || state.closingReadOnly || state.closingReview) return;
  setActions("");
  document.getElementById("newClosingBtn")?.remove();
  const save = document.getElementById("saveDraftBtn");
  if (save) {
    const status = document.createElement("span");
    status.id = "closingAutosaveStatusV2179";
    status.className = "closing-autosave-status";
    status.dataset.closingAutosaveStatus = "true";
    status.textContent = autosaveDirtyV2179 ? "Saving..." : "Saved";
    const now = document.createElement("button");
    now.id = "saveNowBtnV2179";
    now.className = "btn btn-ghost btn-compact";
    now.type = "button";
    now.textContent = "Save Now";
    now.onclick = () => { void flushAutosaveV2179().catch(() => {}); };
    save.replaceWith(status, now);
  }
};

document.addEventListener("input", event => {
  if (event.target instanceof Element && event.target.matches("#page-closing input, #page-closing select, #page-closing textarea")) scheduleAutosaveV2179();
}, true);
document.addEventListener("change", event => {
  if (event.target instanceof Element && event.target.matches("#page-closing select")) scheduleAutosaveV2179();
}, true);

handleBulkPointerDown = function(event) { if (state.bulkMode) handleBulkPointerDownV2179Explicit(event); };
handleBulkPointerEnter = function(event) { if (state.bulkMode) handleBulkPointerEnterV2179Explicit(event); };
setupBulkSelection = function(page) {
  setupBulkSelectionV2179Explicit(page);
  const oldToggle = document.getElementById("bulkSelectToggle");
  if (oldToggle) {
    const toggle = oldToggle.cloneNode(true);
    oldToggle.replaceWith(toggle);
    toggle.onclick = () => setBulkMode(!state.bulkMode);
  }
  const oldClear = document.getElementById("bulkClearBtn");
  if (oldClear) {
    const clear = oldClear.cloneNode(true);
    oldClear.replaceWith(clear);
    clear.textContent = "Clear Selection";
    clear.onclick = () => { state.bulkSelection.clear(); state.bulkAnchor = null; updateBulkSelectionUi(); };
  }
};
updateBulkSelectionUi = function() {
  updateBulkSelectionUiV2179Explicit();
  const toggle = document.getElementById("bulkSelectToggle");
  const bar = document.getElementById("bulkEditBar");
  if (toggle) toggle.innerHTML = `${icon("mouse-pointer", 15)} ${state.bulkMode ? "Exit Multi-select" : "Multi-select"}`;
  if (bar) bar.hidden = !state.bulkMode;
};

/* v2.1.80 — an active draft always exposes the non-finalizing close path. */
const renderClosingV2180CloseShift = renderClosing;
renderClosing = function() {
  renderClosingV2180CloseShift();
  if (!state.closing || state.closingReadOnly || state.closingReview) return;
  const review = document.getElementById("reviewClosingBtn");
  if (!review) return;
  review.id = "closeShiftBtnV2180";
  review.className = "btn btn-success";
  review.innerHTML = `${icon("check", 16)} Close Shift`;
  review.title = "Save this active draft, then review it before final confirmation.";
  review.onclick = () => { void openClosingReview(); };
};

/* v2.1.81 — current-draft actions must survive autosave and draft recovery. */
function invalidateAutosaveForVoidV2181() {
  autosaveGenerationV2181 += 1;
  clearTimeout(autosaveTimerV2179);
  autosaveTimerV2179 = null;
  autosaveQueuedV2179 = false;
  autosaveDirtyV2179 = false;
  autosaveFailureV2179 = false;
  // An in-flight request cannot be cancelled reliably, so its generation is
  // invalidated and it may no longer change client state when it settles.
  autosavePromiseV2179 = null;
}

async function reloadBootstrapAfterVoidV2181() {
  state.bootstrap = await api("/api/bootstrap");
  state.appSettings = state.bootstrap.settings || {};
  state.machines = state.bootstrap.machines || [];
  if (isCloudStaging()) {
    window.clawCloudBootstrap = state.bootstrap;
    window.dispatchEvent(new CustomEvent("claw-cloud-bootstrap", { detail: state.bootstrap }));
  }
}

function showVoidCurrentShiftV2181() {
  const targetClosingId = String(state.closingId || "");
  if (!targetClosingId || !state.closing || state.closingReadOnly) return;
  showModal(
    "Void this shift?",
    `<p class="void-current-shift-copy">This removes the current draft from normal operation.<br>Historical audit data will be retained.</p><div class="field"><label for="voidCurrentShiftReason">Void reason <small>(optional)</small></label><textarea id="voidCurrentShiftReason" class="textarea" rows="3" maxlength="250" placeholder="Optional reason for the audit log"></textarea></div>`,
    "Void Shift",
    async () => {
      const reason = String(document.getElementById("voidCurrentShiftReason")?.value || "").trim();
      invalidateAutosaveForVoidV2181();
      try {
        const result = await api(`/api/closings/${encodeURIComponent(targetClosingId)}`, { method: "DELETE", body: JSON.stringify({ reason }) });
        if (result.voided_closing_id !== targetClosingId) throw new Error("The current draft was not voided.");
        clearContinueShiftAcknowledgementV2194(targetClosingId);
        state.closingId = null;
        state.closingStatus = null;
        state.closingReadOnly = false;
        state.closingReview = false;
        state.closing = null;
        closeModal();
        await reloadBootstrapAfterVoidV2181();
        await ensureClosingPage();
        toast("Shift voided", "The current draft was removed. You can start a replacement shift now.");
      } catch (error) {
        // If the delete was rejected before it changed the draft, keep the
        // draft visible and make the failed save state explicit.
        if (state.closingId === targetClosingId) {
          autosaveDirtyV2179 = true;
          autosaveFailureV2179 = true;
          autosaveIndicatorV2179("Save failed");
        }
        throw error;
      }
    }
  );
  document.querySelector("#modalRoot .modal-save")?.classList.add("void-shift-button");
  setTimeout(() => document.getElementById("voidCurrentShiftReason")?.focus(), 0);
}

const renderClosingV2181ActiveDraftActions = renderClosing;
renderClosing = function() {
  renderClosingV2181ActiveDraftActions();
  if (!state.closing || state.closingReadOnly || state.closingReview) return;
  const canVoid = ["developer", "admin"].includes(String(state.bootstrap?.cloud_context?.profile?.role || "").toLowerCase());
  renderReviewTopActions(`<span id="closingAutosaveStatusV2181" class="closing-autosave-status closing-top-autosave" data-closing-autosave-status="true">${autosaveDirtyV2179 ? "Saving..." : autosaveFailureV2179 ? "Save failed" : "Saved"}</span>${canVoid ? `<button class="btn btn-secondary void-shift-button" id="voidCurrentShiftBtnV2181" type="button">Void Shift</button>` : ""}<button class="btn btn-success" id="closeShiftBtnV2181" type="button">${icon("check", 16)} Close Shift</button>`);
  document.getElementById("closeShiftBtnV2181").onclick = () => { void openClosingReview(); };
  const voidButton = document.getElementById("voidCurrentShiftBtnV2181");
  if (voidButton) voidButton.onclick = showVoidCurrentShiftV2181;
  const review = document.getElementById("reviewClosingBtn") || document.getElementById("closeShiftBtnV2180");
  if (review) {
    review.id = "closeShiftBtnV2181Bottom";
    review.innerHTML = `${icon("check", 16)} Close Shift`;
    review.onclick = () => { void openClosingReview(); };
  }
};

/* v2.1.82 — deleting the active cloud outlet must discard its local draft
   state before bootstrap selects a remaining usable outlet. */
async function resetAfterDeletedOutletV2182(event) {
  if (!event.detail?.wasCurrent) return;
  invalidateAutosaveForVoidV2181();
  state.closingId = null;
  state.closingStatus = null;
  state.closingReadOnly = false;
  state.closingReview = false;
  state.closing = null;
  await reloadBootstrapAfterVoidV2181();
  if (state.page === "closing") await ensureClosingPage();
  const nextOutlet = state.bootstrap?.cloud_context?.active_store?.name || state.bootstrap?.cloud_context?.active_store?.code;
  toast("Outlet deleted", nextOutlet ? `Switched to ${nextOutlet}.` : "Workspace reset.");
}

window.addEventListener("claw-outlet-deleted", event => {
  void resetAfterDeletedOutletV2182(event).catch(error => {
    toast("Outlet deleted", error.message || "Refresh the workspace to continue.", "error");
  });
});

function loadingDotsV2183(label = "Loading", section = false) {
  return `<div class="page-loading${section ? " page-loading-section" : ""}" role="status" aria-label="${escapeHtml(label)}"><span class="loading-dots" aria-hidden="true"><span></span><span></span><span></span></span><span class="claw-sr-only">${escapeHtml(label)}</span></div>`;
}
function renderPageLoadingV2183(page, label, section = false) {
  if (page) page.innerHTML = loadingDotsV2183(label, section);
}
function loadingErrorV2182(page, title, error, retry) {
  page.innerHTML = `<article class="card section-card"><div class="empty-state"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(error.message || "Please try again.")}</span><button class="btn btn-primary" type="button" data-loading-retry>Try again</button></div></article>`;
  page.querySelector("[data-loading-retry]")?.addEventListener("click", () => { void retry(); });
}
const renderSettingsV2183PageLoader = renderSettings;
renderSettings = async function() {
  renderPageLoadingV2183(document.getElementById("page-settings"), "Loading settings");
  try { return await renderSettingsV2183PageLoader(); }
  catch (error) { loadingErrorV2182(document.getElementById("page-settings"), "Cannot load settings", error, renderSettings); }
};
const renderHistoryV2183PageLoader = renderHistory;
renderHistory = async function() {
  renderPageLoadingV2183(document.getElementById("page-history"), "Loading closing history");
  try { return await renderHistoryV2183PageLoader(); }
  catch (error) { loadingErrorV2182(document.getElementById("page-history"), "Cannot load closing history", error, renderHistory); }
};
const refreshReportSummaryV2183PageLoader = refreshReportSummary;
refreshReportSummary = async function() {
  const kpis = document.getElementById("reportKpis");
  if (kpis) kpis.innerHTML = loadingDotsV2183("Loading report summary", true);
  return refreshReportSummaryV2183PageLoader();
};
const saveSettingsPayloadV2182Loading = saveSettingsPayload;
saveSettingsPayload = async function(payload, message, section) {
  const button = document.getElementById(section === "setup" ? "saveSetupSettings" : "saveMachineTypeSettings");
  const loading = setInlineButtonLoading(button, "Saving...");
  try { return await saveSettingsPayloadV2182Loading(payload, message, section); }
  finally { if (loading) clearInlineButtonLoading(button); }
};
const renderStartShiftStateV2182Loading = renderStartShiftStateV2179;
renderStartShiftStateV2179 = function() {
  renderStartShiftStateV2182Loading();
  const button = document.getElementById("startShiftButtonV2179");
  if (button) button.onclick = async () => {
    if (!setInlineButtonLoading(button, "Starting...")) return;
    try { await newClosing(); }
    catch (error) { toast("Cannot start shift", error.message, "error"); clearInlineButtonLoading(button); }
  };
};

/* v2.1.84 — headers are presentation only; bulk selection starts exclusively
   from an eligible editable control in the table body after explicit enablement. */
const handleBulkPointerDownV2184BodyOnly = handleBulkPointerDown;
const handleBulkPointerEnterV2184BodyOnly = handleBulkPointerEnter;
handleBulkPointerDown = function(event) {
  const cell = event.currentTarget;
  if (!state.bulkMode || !(cell instanceof Element) || !cell.matches(".bulk-cell[data-cell-key]") || !cell.closest("tbody")) return;
  handleBulkPointerDownV2184BodyOnly(event);
};
handleBulkPointerEnter = function(event) {
  const cell = event.currentTarget;
  if (!state.bulkMode || !(cell instanceof Element) || !cell.matches(".bulk-cell[data-cell-key]") || !cell.closest("tbody")) return;
  handleBulkPointerEnterV2184BodyOnly(event);
};
handleBulkHeaderClick = function(event) {
  event.preventDefault();
  event.stopPropagation();
};

/* v2.1.85 — business invoices replace UUIDs in user-facing closing views. */
const showHistoryDetailV2185InvoiceNo = showHistoryDetail;
showHistoryDetail = async function(closingId) {
  await showHistoryDetailV2185InvoiceNo(closingId);
  const row = (state.history || []).find(item => String(item.Closing_ID) === String(closingId));
  const invoice = closingInvoiceNo(row);
  const page = document.getElementById("page-history");
  const detailHead = page?.querySelector(".history-daily-head");
  if (!detailHead) return;
  const time = detailHead.querySelector("p")?.textContent?.split("·").pop()?.trim() || "—";
  const detailLine = detailHead.querySelector("p");
  if (detailLine) detailLine.textContent = `${invoice} · ${time}`;
  const invoiceCard = detailHead.querySelector(".review-staff-grid > div:nth-child(3)");
  if (invoiceCard) {
    invoiceCard.querySelector("span").textContent = "Invoice No";
    invoiceCard.querySelector("strong").textContent = invoice;
  }
};

saveClosing = async function(status) {
  if (status !== "Finalized") return flushAutosaveV2179();
  await flushAutosaveV2179();
  const result = await api("/api/closings/save", { method: "POST", body: JSON.stringify(closingPayload("Finalized")) });
  state.closingId = result.closing_id;
  state.closingStatus = result.workflow_status;
  if (state.closing) state.closing.invoice_no = result.closing_code || state.closing.invoice_no || "";
  state.closingReadOnly = true;
  autosaveDirtyV2179 = false;
  renderClosing();
  toast("Closing finalized", `${closingInvoiceNo(state.closing)} was finalized.`);
  return result;
};

async function flushPendingAutosaveForOutletSwitchV2186() {
  await flushAutosaveV2179();
  if (autosavePromiseV2179) await autosavePromiseV2179;
  if (autosaveDirtyV2179 || autosaveQueuedV2179) {
    await flushAutosaveV2179();
    if (autosavePromiseV2179) await autosavePromiseV2179;
  }
}

const renderClosingV2186FinalOutletSelector = renderClosing;
renderClosing = function() {
  renderClosingV2186FinalOutletSelector();
  installCloudOutletSelectorV2186();
};

const renderSettingsV2186FinalMachineTypePurge = renderSettings;
renderSettings = async function() {
  const result = await renderSettingsV2186FinalMachineTypePurge();
  installDeveloperMachineTypePurgeV2186();
  return result;
};

/* v2.1.87 — persistent Developer outlet context, including the no-shift state. */
function renderDeveloperOutletSwitcherV2187() {
  const host = document.getElementById("developerOutletSwitcher");
  if (!host) return;
  if (!isCloudStaging() || cloudProfileRoleV2186() !== "developer") {
    host.hidden = true;
    host.replaceChildren();
    return;
  }
  const active = activeCloudStoreV2186();
  const stores = activeCloudOutletsV2186();
  if (!active || !stores.length) {
    host.hidden = true;
    host.replaceChildren();
    return;
  }
  host.hidden = false;
  const label = document.createElement("label");
  label.htmlFor = "developerOutletSelectV2187";
  label.textContent = "Outlet";
  const select = document.createElement("select");
  select.id = "developerOutletSelectV2187";
  select.className = "input developer-outlet-select";
  select.setAttribute("aria-label", "Outlet");
  stores.forEach(store => {
    const option = document.createElement("option");
    option.value = String(store.id);
    option.textContent = String(store.name || store.code || "Outlet");
    option.selected = String(store.id) === String(active.id);
    select.appendChild(option);
  });
  select.addEventListener("change", () => {
    const requestedStoreId = select.value;
    select.disabled = true;
    void switchCloudOutletV2186(requestedStoreId).catch(error => {
      select.disabled = false;
      select.value = String(activeCloudStoreV2186()?.id || "");
      toast("Cannot switch outlet", error.message, "error");
    });
  });
  host.replaceChildren(label, select);
}

const initialiseV2187GlobalOutletSwitcher = initialise;
initialise = async function() {
  const result = await initialiseV2187GlobalOutletSwitcher();
  renderDeveloperOutletSwitcherV2187();
  return result;
};

const navigateV2187GlobalOutletSwitcher = navigate;
navigate = async function(page, options = {}) {
  const result = await navigateV2187GlobalOutletSwitcher(page, options);
  renderDeveloperOutletSwitcherV2187();
  return result;
};

const reloadBootstrapAfterVoidV2187GlobalOutletSwitcher = reloadBootstrapAfterVoidV2181;
reloadBootstrapAfterVoidV2181 = async function() {
  const result = await reloadBootstrapAfterVoidV2187GlobalOutletSwitcher();
  renderDeveloperOutletSwitcherV2187();
  return result;
};

/* v2.1.88 — retired configuration stays out of normal machine operations. */
let showInactiveMachinesV2188 = false;
function canManageMachineConfigurationV2188() {
  return isCloudStaging() && ["developer", "admin"].includes(cloudProfileRoleV2186());
}
function activeMachineCountV2188(fallbackMachines = []) {
  const masters = Array.isArray(state.machines) && state.machines.length ? state.machines : fallbackMachines;
  return masters.filter(machine => machine?.Active !== false && !machine?.inactive_configuration).length;
}
function installInactiveMachineArchiveV2188() {
  if (!state.closingStructureEdit || state.closingReadOnly || !canManageMachineConfigurationV2188()) return;
  const actions = document.querySelector("#page-closing .machine-heading-buttons");
  if (!actions || actions.querySelector("#toggleInactiveMachinesV2188")) return;
  const toggle = document.createElement("button");
  toggle.id = "toggleInactiveMachinesV2188";
  toggle.type = "button";
  toggle.className = "btn btn-ghost btn-compact";
  toggle.textContent = showInactiveMachinesV2188 ? "Hide inactive" : "Show inactive";
  toggle.onclick = async () => {
    showInactiveMachinesV2188 = !showInactiveMachinesV2188;
    state.machines = await api(showInactiveMachinesV2188 ? "/api/machines?include_inactive=true" : "/api/machines?active_only=true");
    if (state.bootstrap) state.bootstrap.machines = state.machines;
    renderClosing();
  };
  actions.appendChild(toggle);
  document.getElementById("inactiveMachineArchiveV2188")?.remove();
  if (!showInactiveMachinesV2188) return;
  const retired = state.machines.filter(machine => machine?.Active === false);
  const archive = document.createElement("aside");
  archive.id = "inactiveMachineArchiveV2188";
  archive.className = "inactive-machine-archive";
  archive.innerHTML = `<strong>Inactive machines</strong><span>${retired.length ? retired.map(machine => escapeHtml(machine.Machine_Name || machine.Machine_Code || machine.Machine_ID)).join(", ") : "None"}</span>`;
  document.querySelector("#page-closing .machine-section")?.after(archive);
}

const renderMachineClosingTableV2188ActiveCount = renderMachineClosingTable;
renderMachineClosingTable = function(c, review = false) {
  const html = renderMachineClosingTableV2188ActiveCount(c, review);
  return review ? html : html.replace(`${c.machines.length} active machines`, `${activeMachineCountV2188(c.machines)} active machines`);
};

const renderClosingV2188InactiveMachineArchive = renderClosing;
renderClosing = function() {
  renderClosingV2188InactiveMachineArchive();
  installInactiveMachineArchiveV2188();
};

/* v2.1.94 — one local Continue Shift acknowledgement per active Draft/day. */
const CONTINUE_SHIFT_ACK_STORAGE_KEY_V2194 = "claw_continue_shift_ack";

function localCalendarDateV2194(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function continueShiftDateLabelV2205(value) {
  const date = displayToIsoDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(`${date}T00:00:00`))
    .replace("Sept", "Sep");
}

function requiresContinueShiftAcknowledgementV2205(active) {
  const reportDate = displayToIsoDate(active?.report_date);
  return Boolean(reportDate && reportDate < localCalendarDateV2194());
}

function continueShiftStoreIdV2194() { return String(activeCloudStoreV2186()?.id || ""); }
function continueShiftAckKeyV2194(storeId, closingId) { return `${String(storeId)}:${String(closingId)}`; }

function continueShiftAcknowledgementsV2194() {
  try {
    const value = JSON.parse(localStorage.getItem(CONTINUE_SHIFT_ACK_STORAGE_KEY_V2194) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch (_error) { return {}; }
}

function saveContinueShiftAcknowledgementsV2194(entries) {
  try {
    if (Object.keys(entries).length) localStorage.setItem(CONTINUE_SHIFT_ACK_STORAGE_KEY_V2194, JSON.stringify(entries));
    else localStorage.removeItem(CONTINUE_SHIFT_ACK_STORAGE_KEY_V2194);
  } catch (_error) {}
}

function acknowledgeContinueShiftV2194(closingId, storeId = continueShiftStoreIdV2194()) {
  if (!storeId || !closingId) return;
  const entries = continueShiftAcknowledgementsV2194();
  entries[continueShiftAckKeyV2194(storeId, closingId)] = {
    store_id: String(storeId),
    closing_id: String(closingId),
    acknowledged_date: localCalendarDateV2194(),
  };
  saveContinueShiftAcknowledgementsV2194(entries);
}

function hasContinueShiftAcknowledgementV2194(closingId, storeId = continueShiftStoreIdV2194()) {
  const acknowledgement = continueShiftAcknowledgementsV2194()[continueShiftAckKeyV2194(storeId, closingId)];
  return acknowledgement?.store_id === String(storeId) &&
    acknowledgement?.closing_id === String(closingId) &&
    acknowledgement?.acknowledged_date === localCalendarDateV2194();
}

function clearContinueShiftAcknowledgementV2194(closingId, storeId = continueShiftStoreIdV2194()) {
  if (!storeId || !closingId) return;
  const entries = continueShiftAcknowledgementsV2194();
  delete entries[continueShiftAckKeyV2194(storeId, closingId)];
  saveContinueShiftAcknowledgementsV2194(entries);
}

function pruneContinueShiftAcknowledgementsV2194(storeId, activeClosingId = "") {
  const entries = continueShiftAcknowledgementsV2194();
  Object.entries(entries).forEach(([key, acknowledgement]) => {
    if (acknowledgement?.store_id === String(storeId) && acknowledgement?.closing_id !== String(activeClosingId)) delete entries[key];
  });
  saveContinueShiftAcknowledgementsV2194(entries);
}

function renderContinueShiftStateV2194(active) {
  renderContinueShiftStateV2190(active);
  document.getElementById("continueShiftButtonV2190").onclick = async () => {
    acknowledgeContinueShiftV2194(active.closing_id);
    await openClosingV2179DailyWorkflow(active.closing_id);
  };
}

newClosing = async function() {
  const data = await api(`/api/new-closing?report_date=${isoToday()}`);
  const closingId = data.closing_id || data.existing_closing_id;
  if (!closingId) {
    state.closingId = null;
    state.closingStatus = "Draft";
    state.closingReadOnly = false;
    state.closing = { report_date: dateDisplay(data.report_date), outlet: data.outlet, closed_by: "", verified_by: "", notes: "", sales: defaultSales(), machines: data.machines || [] };
    if (state.page !== "closing") await navigate("closing"); else renderClosing();
    return;
  }
  // An explicitly created Draft is already acknowledged for this local calendar day.
  if (!data.existing_closing_id) acknowledgeContinueShiftV2194(closingId);
  state.closingReview = false;
  state.closingReadOnly = false;
  await openClosingV2179DailyWorkflow(closingId);
  autosaveIndicatorV2179("Saved");
};

ensureClosingPage = async function() {
  if (!isCloudStaging()) return ensureClosingPageV2179DailyWorkflow();
  const storeId = continueShiftStoreIdV2194();
  const active = await api("/api/active-closing");
  if (!active.has_active_shift || !active.closing_id) {
    pruneContinueShiftAcknowledgementsV2194(storeId);
    state.closing = null;
    state.closingId = null;
    state.closingReview = false;
    state.closingReadOnly = false;
    renderStartShiftStateV2179();
    return;
  }
  pruneContinueShiftAcknowledgementsV2194(storeId, active.closing_id);
  if (!requiresContinueShiftAcknowledgementV2205(active)) {
    acknowledgeContinueShiftV2194(active.closing_id, storeId);
    await openClosingV2179DailyWorkflow(active.closing_id);
    return;
  }
  if (hasContinueShiftAcknowledgementV2194(active.closing_id, storeId)) {
    await openClosingV2179DailyWorkflow(active.closing_id);
    return;
  }
  renderContinueShiftStateV2194(active);
};

const saveClosingV2194ContinueAcknowledgement = saveClosing;
saveClosing = async function(status) {
  const closingId = state.closingId;
  const result = await saveClosingV2194ContinueAcknowledgement(status);
  if (status === "Finalized") clearContinueShiftAcknowledgementV2194(result?.closing_id || closingId);
  return result;
};

/* v2.1.95 -- print the system Review at its rendered width, then scale one canvas. */
const PRINT_PAGE_WIDTH_MM_V2195 = 281;
const PRINT_PAGE_HEIGHT_MM_V2195 = 194;
const PRINT_GEOMETRY_TOLERANCE_V2195 = 2;

function clonePrintStateV2195(node) {
  const clone = node.cloneNode(true);
  const sourceControls = node.matches?.('input,select,textarea') ? [node] : [...node.querySelectorAll?.('input,select,textarea') || []];
  const clonedControls = clone.matches?.('input,select,textarea') ? [clone] : [...clone.querySelectorAll?.('input,select,textarea') || []];
  sourceControls.forEach((source, index) => {
    const target = clonedControls[index];
    if (!target) return;
    if ('value' in source) target.value = source.value;
    if ('checked' in source) target.checked = source.checked;
    if (source instanceof HTMLSelectElement && target instanceof HTMLSelectElement) {
      target.selectedIndex = source.selectedIndex;
      [...target.options].forEach((option, optionIndex) => { option.selected = optionIndex === source.selectedIndex; });
    }
  });
  clone.removeAttribute?.('id');
  clone.querySelectorAll?.('[id]').forEach(element => element.removeAttribute('id'));
  return clone;
}

function sourceTableColumnsV2195(table) {
  const tableRect = table.getBoundingClientRect();
  const headers = [...table.tHead?.rows[0]?.cells || []];
  if (headers.length !== 11 || !tableRect.width) throw new Error('Machine Closing must have exactly 11 visible columns before printing.');
  return headers.map(header => header.getBoundingClientRect().width / tableRect.width);
}

function clonePrintTableV2195(sourceSection, includeHeading, columnRatios) {
  const sourceTable = sourceSection.querySelector('.product-closing-table');
  const section = sourceSection.cloneNode(false);
  if (includeHeading) {
    const heading = sourceSection.querySelector('.section-heading');
    if (heading) section.appendChild(clonePrintStateV2195(heading));
  }
  const wrap = sourceSection.querySelector('.data-table-wrap').cloneNode(false);
  const table = sourceTable.cloneNode(false);
  const sourceColgroup = sourceTable.querySelector('colgroup');
  const colgroup = sourceColgroup ? clonePrintStateV2195(sourceColgroup) : document.createElement('colgroup');
  if (!sourceColgroup) columnRatios.forEach(ratio => {
    const col = document.createElement('col');
    col.style.width = `${ratio * 100}%`;
    colgroup.appendChild(col);
  });
  table.append(colgroup, clonePrintStateV2195(sourceTable.tHead));
  const tbody = sourceTable.tBodies[0].cloneNode(false);
  table.appendChild(tbody);
  wrap.appendChild(table);
  section.appendChild(wrap);
  return { section, table, tbody };
}

function appendPrintRowsV2195(target, block, start, end, includeGroupHeader) {
  if (includeGroupHeader && block.groupHeader) target.tbody.appendChild(clonePrintStateV2195(block.groupHeader));
  const rowCount = end - start;
  for (let index = start; index < end; index += 1) {
    const sourceRow = block.rows[index];
    const row = clonePrintStateV2195(sourceRow);
    if (index === start) row.querySelectorAll(':scope > .machine-group-cell').forEach(cell => { cell.rowSpan = rowCount; });
    if (start > 0 && index === start) {
      const sharedCells = [...block.rows[0].querySelectorAll(':scope > .machine-group-cell')];
      const sourceCells = [...sourceRow.cells];
      const clonedCells = [...row.cells];
      sharedCells.forEach(sourceCell => {
        const copy = clonePrintStateV2195(sourceCell);
        copy.rowSpan = rowCount;
        const sourceLeft = sourceCell.getBoundingClientRect().left;
        const before = sourceCells.find(cell => cell.getBoundingClientRect().left > sourceLeft + 1);
        row.insertBefore(copy, before ? clonedCells[sourceCells.indexOf(before)] : null);
      });
    }
    target.tbody.appendChild(row);
  }
}

function pageFitsInSourceCoordinatesV2195(page, availableSourceHeight) {
  void page.canvas.offsetHeight;
  return page.canvas.scrollHeight <= availableSourceHeight;
}

function createPrintPageV2195(topbar, reviewHeader, sourcePage, widthPx, heightPx, sourceWidth, scale) {
  const page = document.createElement('section');
  page.className = 'print-page-v2195';
  page.style.width = `${widthPx}px`;
  page.style.height = `${heightPx}px`;
  const viewport = document.createElement('div');
  viewport.className = 'print-page-viewport-v2195';
  const canvas = document.createElement('div');
  canvas.className = 'print-page-canvas-v2195';
  canvas.style.width = `${sourceWidth}px`;
  canvas.style.transform = `scale(${scale})`;
  const pageRoot = sourcePage.cloneNode(false);
  pageRoot.style.width = `${sourceWidth}px`;
  pageRoot.append(clonePrintStateV2195(topbar), clonePrintStateV2195(reviewHeader));
  canvas.appendChild(pageRoot);
  viewport.appendChild(canvas);
  page.appendChild(viewport);
  return { page, canvas, pageRoot };
}

function geometryCheckV2195(source, clone) {
  const widths = [
    ['Review header', source.reviewHeader, clone.pageRoot.querySelector('.review-heading-card')],
    ['KPI grid', source.kpiGrid, clone.pageRoot.querySelector('.closing-summary-strip')],
    ['Machine table', source.table, clone.table],
  ];
  const failures = widths.flatMap(([name, live, copy]) => {
    if (!live || !copy) return [`${name} is missing`];
    const delta = Math.abs(live.getBoundingClientRect().width - copy.getBoundingClientRect().width);
    return delta > Math.max(1, live.getBoundingClientRect().width * .005) ? [`${name} width delta ${delta.toFixed(2)}px`] : [];
  });
  const sourceHeaders = [...source.table.tHead.rows[0].cells];
  const cloneHeaders = [...clone.table.tHead.rows[0].cells];
  if (sourceHeaders.length !== 11 || cloneHeaders.length !== 11) failures.push(`expected 11 columns, got ${sourceHeaders.length}/${cloneHeaders.length}`);
  sourceHeaders.forEach((header, index) => {
    const copy = cloneHeaders[index];
    if (!copy) return;
    const delta = Math.abs(header.getBoundingClientRect().width - copy.getBoundingClientRect().width);
    if (delta > Math.max(1, header.getBoundingClientRect().width * .005)) failures.push(`column ${index + 1} width delta ${delta.toFixed(2)}px`);
  });
  clone.table.querySelectorAll('input, select, textarea, button.refill-total-button').forEach(control => {
    const cell = control.closest('td');
    if (!cell) return;
    const controlRect = control.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    if (controlRect.left < cellRect.left - PRINT_GEOMETRY_TOLERANCE_V2195 || controlRect.right > cellRect.right + PRINT_GEOMETRY_TOLERANCE_V2195) failures.push(`control outside its TD: ${control.className || control.tagName}`);
  });
  if (failures.length && window.__CLAW_PRINT_DEBUG__) throw new Error(`Print geometry failed: ${failures.join('; ')}`);
  if (window.__CLAW_PRINT_DEBUG__) console.info('Print geometry v2195', { passed: !failures.length, failures });
  return failures;
}

function buildSystemWidthPrintDocumentV2195() {
  const topbar = document.querySelector('.topbar');
  const page = document.getElementById('page-closing');
  const reviewHeader = page?.querySelector('.review-heading-card');
  const machineSection = page?.querySelector('.review-machine-section');
  const sourceTable = machineSection?.querySelector('.product-closing-table');
  const notes = page?.querySelector('.review-notes-card');
  const kpiGrid = page?.querySelector('.closing-summary-strip');
  if (!topbar || !page || !reviewHeader || !machineSection || !sourceTable || !notes) throw new Error('Review page is not available.');
  const sourceWidth = page.getBoundingClientRect().width;
  if (!sourceWidth) throw new Error('Review width is not available.');
  const pixelsPerMm = printPixelsPerMmV2192();
  const printWidthPx = PRINT_PAGE_WIDTH_MM_V2195 * pixelsPerMm;
  const printHeightPx = PRINT_PAGE_HEIGHT_MM_V2195 * pixelsPerMm;
  const scale = printWidthPx / sourceWidth;
  const availableSourceHeight = printHeightPx / scale;
  const columnRatios = sourceTableColumnsV2195(sourceTable);
  const root = document.createElement('div');
  root.id = 'printDocumentV2195';
  root.className = 'print-document-v2195 print-measurement-v2195';
  root.dataset.sourceWidth = String(sourceWidth);
  root.dataset.scale = String(scale);
  root.dataset.availableSourceHeight = String(availableSourceHeight);
  document.body.appendChild(root);
  const pages = [];
  const makePage = first => {
    const next = createPrintPageV2195(topbar, reviewHeader, page, printWidthPx, printHeightPx, sourceWidth, scale);
    root.appendChild(next.page);
    if (first) [...page.children].filter(node => node !== reviewHeader && node !== machineSection && node !== notes && !node.classList.contains('closing-workflow-stepper')).forEach(node => next.pageRoot.appendChild(clonePrintStateV2195(node)));
    const table = clonePrintTableV2195(machineSection, first, columnRatios);
    next.pageRoot.appendChild(table.section);
    const record = { ...next, ...table };
    pages.push(record);
    return record;
  };
  let current = makePage(true);
  for (const block of machinePrintBlocksV2192(sourceTable)) {
    let start = 0;
    while (start < block.rows.length) {
      const before = current.tbody.rows.length;
      appendPrintRowsV2195(current, block, start, block.rows.length, start === 0);
      if (pageFitsInSourceCoordinatesV2195(current, availableSourceHeight)) { start = block.rows.length; continue; }
      while (current.tbody.rows.length > before) current.tbody.lastChild.remove();
      let end = start;
      while (end < block.rows.length) {
        const beforeCandidate = current.tbody.rows.length;
        appendPrintRowsV2195(current, block, start, end + 1, start === 0);
        if (!pageFitsInSourceCoordinatesV2195(current, availableSourceHeight)) {
          while (current.tbody.rows.length > beforeCandidate) current.tbody.lastChild.remove();
          break;
        }
        while (current.tbody.rows.length > beforeCandidate) current.tbody.lastChild.remove();
        end += 1;
      }
      if (end > start) { appendPrintRowsV2195(current, block, start, end, start === 0); start = end; current = makePage(false); }
      else if (current.tbody.rows.length) current = makePage(false);
      else { appendPrintRowsV2195(current, block, start, start + 1, start === 0); start += 1; }
    }
  }
  const notesClone = clonePrintStateV2195(notes);
  current.pageRoot.appendChild(notesClone);
  if (!pageFitsInSourceCoordinatesV2195(current, availableSourceHeight) && current.pageRoot.children.length > 3) { notesClone.remove(); current = makePage(false); current.section.remove(); current.pageRoot.appendChild(notesClone); }
  const failures = geometryCheckV2195({ reviewHeader, kpiGrid, table: sourceTable }, pages[0]);
  root.classList.remove('print-measurement-v2195');
  root.dataset.pageCount = String(pages.length);
  root.dataset.geometryFailures = String(failures.length);
  return () => root.remove();
}

printClosingPdf = async function() {
  const button = document.getElementById('globalPrintButton');
  if (!state.closing || !state.closingReview || !button) return;
  let removePrintDocument = () => {};
  try {
    button.disabled = true;
    await waitForLiveReviewImagesV2189();
    document.body.classList.add('printing-live-review-v2195');
    removePrintDocument = buildSystemWidthPrintDocumentV2195();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.print();
  } catch (error) {
    toast('Cannot open print dialog', error.message || 'Printing is not available on this computer.', 'error');
  } finally {
    removePrintDocument();
    document.body.classList.remove('printing-live-review-v2195');
    button.disabled = false;
  }
};

/* v2.1.107 -- native mobile camera scanner for the product-bound refill flow.
   The manual and hardware scanner path remains the same source of truth. */
let activeRefillCameraStopV2212 = null;
function stopActiveRefillCameraV2212() {
  const stop = activeRefillCameraStopV2212;
  activeRefillCameraStopV2212 = null;
  stop?.();
}
const closeModalV2212CameraCleanup = closeModal;
closeModal = function() {
  stopActiveRefillCameraV2212();
  return closeModalV2212CameraCleanup.apply(this, arguments);
};
const navigateV2212CameraCleanup = navigate;
navigate = async function() {
  stopActiveRefillCameraV2212();
  return navigateV2212CameraCleanup.apply(this, arguments);
};
window.addEventListener('pagehide', stopActiveRefillCameraV2212);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') stopActiveRefillCameraV2212();
});

function refillCameraErrorMessageV2212(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return 'Camera access was denied. Allow camera access or enter the barcode manually.';
  if (error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError') return 'No camera is available. Enter the barcode manually.';
  return 'Camera scanner could not start. Enter the barcode manually.';
}

/* v2.1.106 -- product-bound barcode verification for signed refill events. */
function refillBarcodeV2211(value) {
  return String(value ?? '').trim();
}

function refillSignedQuantityV2211(value) {
  const raw = String(value ?? '').trim();
  return /^[+-]?\d+$/.test(raw) ? Number(raw) : 0;
}

/* v2.1.108 -- server-confirmed Draft mutations update the canonical product,
   not a rendered-cell copy.  Refill history remains the total authority. */
function activeDraftRefillProductV2214(machineIndex, productIndex, productId) {
  const machines = state.closing?.machines || [];
  const requestedId = String(productId || '');
  const directMachine = machines[Number(machineIndex)];
  const directProduct = directMachine ? ensureClosingProducts(directMachine)[Number(productIndex)] : null;
  if (directProduct && (!requestedId || String(directProduct.product_id) === requestedId)) return directProduct;
  for (const machine of machines) {
    const found = ensureClosingProducts(machine).find(item => String(item.product_id) === requestedId);
    if (found) return found;
  }
  return null;
}

function applyConfirmedRefillToDraftV2214({ machineIndex, productIndex, productId, closingId, workflowStatus, serverProduct, fallbackHistory }) {
  const product = activeDraftRefillProductV2214(machineIndex, productIndex, productId);
  if (!product) throw new Error('The adjusted product is no longer available in this Draft.');
  const hasServerHistory = Array.isArray(serverProduct?.refill_history);
  const history = hasServerHistory ? serverProduct.refill_history : fallbackHistory;
  if (Array.isArray(history)) product.refill_history = history.map(event => ({ ...event }));
  const total = Array.isArray(product.refill_history)
    ? product.refill_history.reduce((sum, event) => sum + signedAdjustmentNumberV2164(event?.qty), 0)
    : signedAdjustmentNumberV2164(serverProduct?.refill_qty ?? product.refill_qty);
  product.refill_qty = total;
  const finalValue = product.final_qty ?? product.final_prize;
  product.qty_used = finalValue === '' || finalValue === null || finalValue === undefined
    ? 0
    : Math.max(0, numeric(product.begin_qty)) + total - numeric(finalValue);
  state.closingId = closingId || state.closingId;
  state.closingStatus = workflowStatus || state.closingStatus || 'Draft';
  // The modal starts only after a complete autosave drain.  This acknowledgement
  // prevents its old scheduled work from being treated as newer Draft state.
  autosaveRevisionV2179 += 1;
  autosaveDirtyV2179 = false;
  autosaveQueuedV2179 = false;
  autosaveFailureV2179 = false;
  clearAutosaveErrorV2179();
  autosaveIndicatorV2179('Saved');
  return product;
}

async function flushAutosaveForDraftMutationV2214() {
  await flushAutosaveV2179();
  if (autosavePromiseV2179) await autosavePromiseV2179;
  if (autosaveDirtyV2179 || autosaveQueuedV2179) {
    await flushAutosaveV2179();
    if (autosavePromiseV2179) await autosavePromiseV2179;
  }
}

showRefillProductModalV2144 = async function(machineIndex, productIndex) {
  try {
    await flushAutosaveForDraftMutationV2214();
    const machine = state.closing?.machines?.[Number(machineIndex)];
    const product = machine ? ensureClosingProducts(machine)[Number(productIndex)] : null;
    if (!machine || !product) return;
    if (state.closingReadOnly || state.closingReview) {
      showRefillHistory(Number(machineIndex), Number(productIndex));
      return;
    }

    const targetBarcode = refillBarcodeV2211(product.barcode);
    const history = refillHistoryFor(product);
    const total = refillTotal(product);
    const totalLabel = (total > 0 ? '+' : '') + number(total);
    const machineLabel = machineDisplayLabel(machine, state.closing?.machines || []);
    const lastNamedEvent = history.slice().reverse().find(item => String(item?.by || item?.staff || '').trim());
    const defaultStaff = String(state.closing?.closed_by || lastNamedEvent?.by || lastNamedEvent?.staff || '').trim();
    const barcodeCopy = targetBarcode || 'No barcode configured';
    const body =
      '<div class="refill-cell-product-head refill-verify-product-v2211">' + productThumbnail(product, 'small') +
        '<div class="refill-cell-product-copy"><strong>' + escapeHtml(barcodeCopy) + '</strong><span>' +
          escapeHtml(machineLabel) + ' · Begin Qty ' + number(product.begin_qty) + ' · Adjustment ' + totalLabel +
        '</span></div></div>' +
      '<section class="refill-verify-section-v2211" aria-labelledby="refillScanMethodTitleV2211">' +
        '<div class="refill-verify-heading-v2211"><strong id="refillScanMethodTitleV2211">Scan Method</strong><span>Verify this exact product before saving an adjustment.</span></div>' +
        '<div class="refill-scan-methods-v2211" role="group" aria-label="Scan method">' +
          '<button type="button" class="refill-scan-method-v2211 is-active" data-refill-mode="each" aria-pressed="true">Scan 1 Count 1</button>' +
          '<button type="button" class="refill-scan-method-v2211" data-refill-mode="once" aria-pressed="false">Scan 1 Count Multiple</button>' +
        '</div>' +
        '<div class="refill-verify-field-v2211"><label for="refillBarcodeScanV2211">Barcode Verification</label>' +
          '<div class="refill-barcode-input-wrap-v2212"><input id="refillBarcodeScanV2211" class="input" type="text" inputmode="none" autocomplete="off" autocapitalize="off" spellcheck="false" value="" placeholder="Scan barcode..."' + (targetBarcode ? '' : ' disabled') + '>' +
            '<button id="refillCameraScanButtonV2212" class="refill-camera-trigger-v2212" type="button" aria-label="Scan barcode with camera" title="Scan barcode with camera" aria-pressed="false"' + (targetBarcode ? '' : ' disabled') + '>' + icon('barcode', 18) + '</button></div></div>' +
        '<section id="refillCameraScannerV2212" class="refill-camera-scanner-v2212" hidden aria-labelledby="refillCameraScanTitleV2212">' +
          '<div class="refill-camera-scanner-head-v2212"><div><strong id="refillCameraScanTitleV2212">Scan barcode</strong><span>Expected <b>' + escapeHtml(targetBarcode || '—') + '</b></span></div><span id="refillCameraStatusV2212" class="refill-camera-status-v2212" role="status" aria-live="polite">Opening camera…</span></div>' +
          '<div class="refill-camera-preview-v2215">' +
            '<video id="refillCameraVideoV2212" class="refill-camera-video-v2212" autoplay muted playsinline></video>' +
            '<div class="refill-camera-scan-zone-v2215" aria-hidden="true"><span class="refill-camera-scan-line-v2215"></span></div>' +
          '</div>' +
          '<div id="refillCameraGuidanceV2215" class="refill-camera-guidance-v2215" role="status" aria-live="polite"><strong>Starting camera…</strong><span>Preparing secure camera preview</span></div>' +
          '<button id="refillCameraCancelV2212" class="btn btn-secondary refill-camera-cancel-v2212" type="button">Cancel</button>' +
        '</section>' +
        '<div id="refillScanFeedbackV2211" class="refill-scan-feedback-v2211" role="status" aria-live="polite">' +
          (targetBarcode ? 'Ready to scan ' + escapeHtml(targetBarcode) + '.' : 'A product barcode is required before a refill can be verified.') +
        '</div>' +
        '<div id="refillEachSummaryV2211" class="refill-scan-count-v2211"><span>Scanned Qty</span><strong>0</strong><small>Each valid scan counts 1 item.</small></div>' +
        '<div id="refillOnceQuantityV2211" class="refill-manual-quantity-v2211 refill-verified-quantity-v2213" hidden>' +
          '<div class="refill-verified-quantity-head-v2213"><span>✓ Verified</span><strong id="refillVerifiedBarcodeV2213">' + escapeHtml(targetBarcode || '—') + '</strong></div>' +
          '<label for="refillCellQtyV2144">Adjustment Qty</label>' +
          '<input id="refillCellQtyV2144" class="input refill-cell-qty" type="text" inputmode="text" maxlength="7" autocomplete="off" value="" disabled></div>' +
      '</section>' +
      '<div class="refill-adjustment-form-v2168 refill-adjusted-by-v2211"><div class="field"><label for="refillAdjustedByV2168">Adjusted By</label>' +
        '<input id="refillAdjustedByV2168" class="input" type="text" maxlength="100" autocomplete="off" value="' + escapeHtml(defaultStaff) + '" placeholder="Staff name"></div></div>' +
      '<div class="refill-cell-history-section"><div class="refill-cell-history-head"><strong>Adjustment history</strong><span>' + history.length +
        ' event' + (history.length === 1 ? '' : 's') + ' · Total ' + totalLabel + '</span></div>' +
        '<div class="refill-cell-history-list">' + refillHistoryRowsV2144(product) + '</div></div>';

    let mode = 'each';
    let scannedQty = 0;
    let verified = false;
    showModal('Refill · ' + machineLabel, body, 'Save Adjustment', async () => {
      stopActiveRefillCameraV2212();
      const staff = String(document.getElementById('refillAdjustedByV2168')?.value || '').trim();
      const qty = mode === 'each' ? scannedQty : refillSignedQuantityV2211(document.getElementById('refillCellQtyV2144')?.value);
      if (!targetBarcode) throw new Error('This product has no barcode configured. Add its barcode before recording a refill.');
      if (!staff) throw new Error('Adjusted By is required.');
      if (mode === 'each' && scannedQty <= 0) throw new Error('Scan at least one matching product barcode.');
      if (mode === 'once' && !verified) throw new Error('Scan the matching product barcode before entering an adjustment.');
      if (!qty) throw new Error('Adjustment cannot be 0.');
      const available = Math.max(0, numeric(product.begin_qty)) + refillTotal(product) + qty;
      if (available < 0) throw new Error('This adjustment would make available stock negative.');

      if (isCloudStaging()) {
        const result = await api('/api/refills', { method: 'POST', body: JSON.stringify({
          closing_id: state.closingId || '',
          closing_payload: state.closingId ? undefined : closingPayload('Draft'),
          machine_style_id: product.product_id,
          adjusted_by: staff,
          delta_qty: qty,
        }) });
        applyConfirmedRefillToDraftV2214({
          machineIndex,
          productIndex,
          productId: product.product_id,
          closingId: result.closing_id,
          workflowStatus: 'Draft',
          serverProduct: result.product,
        });
      } else {
        const oldHistory = refillHistoryFor(product).slice();
        const oldQty = product.refill_qty;
        const nextHistory = refillHistoryFor(product).slice();
        nextHistory.push({ qty, at: new Date().toISOString(), by: staff });
        product.refill_history = nextHistory;
        product.refill_qty = nextHistory.reduce((sum, item) => sum + signedAdjustmentNumberV2164(item.qty), 0);
        try {
          const result = await api('/api/closings/save', { method: 'POST', body: JSON.stringify(closingPayload('Draft')) });
          applyConfirmedRefillToDraftV2214({
            machineIndex,
            productIndex,
            productId: product.product_id,
            closingId: result.closing_id,
            workflowStatus: result.workflow_status,
            fallbackHistory: nextHistory,
          });
        } catch (error) {
          product.refill_history = oldHistory;
          product.refill_qty = oldQty;
          throw error;
        }
      }
      closeModal();
      renderClosing();
      toast('Stock adjustment saved', machineLabel + ' · ' + targetBarcode + ' · ' + (qty > 0 ? '+' : '') + number(qty) + ' · ' + staff + '.');
    });

    const modal = document.querySelector('#modalRoot .modal');
    modal?.classList.add('refill-cell-modal', 'refill-verification-modal-v2211');
    const scanInput = document.getElementById('refillBarcodeScanV2211');
    const staffInput = document.getElementById('refillAdjustedByV2168');
    const qtyInput = document.getElementById('refillCellQtyV2144');
    const feedback = document.getElementById('refillScanFeedbackV2211');
    const eachSummary = document.getElementById('refillEachSummaryV2211');
    const onceQuantity = document.getElementById('refillOnceQuantityV2211');
    const cameraButton = document.getElementById('refillCameraScanButtonV2212');
    const cameraPane = document.getElementById('refillCameraScannerV2212');
    const cameraVideo = document.getElementById('refillCameraVideoV2212');
    const cameraStatus = document.getElementById('refillCameraStatusV2212');
    const cameraGuidance = document.getElementById('refillCameraGuidanceV2215');
    const cameraCancel = document.getElementById('refillCameraCancelV2212');
    const saveButton = modal?.querySelector('.modal-save');
    const methodButtons = [...document.querySelectorAll('[data-refill-mode]')];
    let cameraStream = null;
    let cameraFrame = 0;
    let cameraSession = 0;
    let cameraRunning = false;
    let cameraDetector = null;
    let cameraScannerKind = '';
    let zxingControls = null;
    let lastCameraSeenAt = 0;
    let latchedCameraBarcode = '';
    let cameraEachScanPendingRearm = false;
    let cameraUiTimer = 0;
    let cameraStopTimer = 0;

    const setFeedback = (tone, message) => {
      if (!feedback) return;
      feedback.className = 'refill-scan-feedback-v2211 ' + tone;
      feedback.textContent = message;
    };
    const saveReady = () => {
      const staff = String(staffInput?.value || '').trim();
      const qty = mode === 'each' ? scannedQty : refillSignedQuantityV2211(qtyInput?.value);
      return Boolean(targetBarcode && staff && (mode === 'each' ? scannedQty > 0 : verified && qty));
    };
    const updateSave = () => {
      if (saveButton) saveButton.disabled = !saveReady();
    };
    const stopCamera = ({ focus = false } = {}) => {
      cameraSession += 1;
      cameraRunning = false;
      if (cameraFrame) window.cancelAnimationFrame(cameraFrame);
      cameraFrame = 0;
      if (cameraUiTimer) window.clearTimeout(cameraUiTimer);
      if (cameraStopTimer) window.clearTimeout(cameraStopTimer);
      cameraUiTimer = 0;
      cameraStopTimer = 0;
      try { zxingControls?.stop(); } catch (_error) {}
      zxingControls = null;
      cameraScannerKind = '';
      cameraStream?.getTracks().forEach(track => track.stop());
      cameraStream = null;
      cameraDetector = null;
      latchedCameraBarcode = '';
      lastCameraSeenAt = 0;
      cameraEachScanPendingRearm = false;
      if (cameraVideo) {
        const videoStream = cameraVideo.srcObject;
        if (videoStream && typeof videoStream.getTracks === 'function') videoStream.getTracks().forEach(track => track.stop());
        cameraVideo.pause();
        cameraVideo.srcObject = null;
      }
      if (cameraPane) cameraPane.hidden = true;
      cameraButton?.setAttribute('aria-pressed', 'false');
      if (activeRefillCameraStopV2212 === stopCamera) activeRefillCameraStopV2212 = null;
      if (focus) focusScan();
    };
    activeRefillCameraStopV2212 = stopCamera;
    const focusScan = () => setTimeout(() => scanInput?.focus(), 0);
    const resetMode = nextMode => {
      stopCamera();
      mode = nextMode;
      scannedQty = 0;
      verified = false;
      if (scanInput) { scanInput.value = ''; scanInput.disabled = !targetBarcode; }
      if (qtyInput) { qtyInput.value = ''; qtyInput.disabled = true; }
      if (eachSummary) eachSummary.hidden = mode !== 'each';
      if (onceQuantity) onceQuantity.hidden = true;
      methodButtons.forEach(button => {
        const active = button.dataset.refillMode === mode;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      if (eachSummary) eachSummary.querySelector('strong').textContent = '0';
      setFeedback('is-neutral', targetBarcode ? 'Ready to scan ' + targetBarcode + '.' : 'A product barcode is required before a refill can be verified.');
      updateSave();
      focusScan();
    };
    const processScan = rawValue => {
      const scanned = refillBarcodeV2211(rawValue === undefined ? scanInput?.value : rawValue);
      if (!scanned) return false;
      if (scanned !== targetBarcode) {
        setFeedback('is-error', 'Wrong barcode. Expected ' + targetBarcode + ', scanned ' + scanned + '.');
        if (scanInput) scanInput.value = '';
        focusScan();
        return false;
      }
      if (mode === 'each') {
        scannedQty += 1;
        if (eachSummary) eachSummary.querySelector('strong').textContent = String(scannedQty);
        setFeedback('is-success', 'Verified ' + targetBarcode + ' · +1 item.');
        if (scanInput) scanInput.value = '';
        updateSave();
        focusScan();
        return true;
      } else {
        verified = true;
        setFeedback('is-success', 'Product verified: ' + targetBarcode + '.');
        if (scanInput) { scanInput.value = targetBarcode; scanInput.disabled = true; }
        if (onceQuantity) onceQuantity.hidden = false;
        if (qtyInput) { qtyInput.disabled = false; qtyInput.focus(); }
        updateSave();
        return true;
      }
    };

    const setCameraStatus = message => {
      if (cameraStatus) cameraStatus.textContent = message;
    };
    const setCameraUiState = (nextState, status, helper) => {
      if (cameraPane) cameraPane.dataset.cameraState = nextState;
      setCameraStatus(status);
      if (!cameraGuidance) return;
      const title = cameraGuidance.querySelector('strong');
      const detail = cameraGuidance.querySelector('span');
      if (title) title.textContent = status;
      if (detail) detail.textContent = helper;
    };
    const vibrateCameraFeedback = pattern => {
      try { navigator.vibrate?.(pattern); } catch (_error) {}
    };
    const scheduleCameraUiState = (delay, nextState, status, helper) => {
      if (cameraUiTimer) window.clearTimeout(cameraUiTimer);
      cameraUiTimer = window.setTimeout(() => {
        cameraUiTimer = 0;
        if (cameraRunning) setCameraUiState(nextState, status, helper);
      }, delay);
    };
    const rearmCameraBarcode = () => {
      if (Date.now() - lastCameraSeenAt < 450 || !latchedCameraBarcode) return;
      latchedCameraBarcode = '';
      if (mode === 'each' && cameraRunning && cameraEachScanPendingRearm) {
        cameraEachScanPendingRearm = false;
        setCameraUiState('ready-next', 'Ready for next item', 'Place next barcode inside the frame');
        scheduleCameraUiState(650, 'scanning', 'Scanning…', 'Place barcode inside the frame');
      }
    };
    const processCameraDetection = rawValue => {
      const scanned = refillBarcodeV2211(rawValue);
      if (!scanned) {
        rearmCameraBarcode();
        return false;
      }
      lastCameraSeenAt = Date.now();
      if (scanned === latchedCameraBarcode) return false;
      latchedCameraBarcode = scanned;
      const accepted = processScan(scanned);
      if (!accepted) {
        setCameraUiState('wrong', 'Wrong barcode', 'Expected: ' + targetBarcode + ' · Scanned: ' + scanned);
        vibrateCameraFeedback([30, 40, 30]);
        scheduleCameraUiState(900, 'scanning', 'Scanning…', 'Place barcode inside the frame');
        return false;
      }
      vibrateCameraFeedback(65);
      if (mode === 'once') {
        setCameraUiState('success', '✓ Product verified', 'Opening the quantity entry');
        if (cameraStopTimer) window.clearTimeout(cameraStopTimer);
        cameraStopTimer = window.setTimeout(() => {
          cameraStopTimer = 0;
          stopCamera();
        }, 700);
        return true;
      }
      setCameraUiState('success', '✓ +1', 'Total scanned: ' + scannedQty);
      cameraEachScanPendingRearm = true;
      scheduleCameraUiState(850, 'locked', 'Item counted', 'Move barcode away to scan the next item');
      return true;
    };
    const scheduleCameraDetection = () => {
      if (!cameraRunning) return;
      cameraFrame = window.requestAnimationFrame(detectCameraFrame);
    };
    const detectCameraFrame = async () => {
      if (!cameraRunning || !cameraDetector || !cameraVideo) return;
      try {
        if (cameraVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          const detections = await cameraDetector.detect(cameraVideo);
          const values = detections.map(item => refillBarcodeV2211(item?.rawValue)).filter(Boolean);
          const scanned = values.find(value => value === targetBarcode) || values[0] || '';
          processCameraDetection(scanned);
        }
      } catch (_error) {
        // A bad video frame must not close the modal or disable manual scanning.
      }
      scheduleCameraDetection();
    };
    const openNativeCamera = async (Detector, session) => {
      const supported = typeof Detector.getSupportedFormats === 'function' ? await Detector.getSupportedFormats() : [];
      const preferred = ['code_128', 'code_39', 'code_93', 'codabar', 'ean_13', 'ean_8', 'itf', 'upc_a', 'upc_e', 'qr_code'];
      const formats = preferred.filter(format => supported.includes(format));
      cameraScannerKind = 'native';
      cameraDetector = formats.length ? new Detector({ formats }) : new Detector();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (session !== cameraSession) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      cameraStream = stream;
      if (!cameraVideo) throw new Error('Camera preview is unavailable.');
      cameraVideo.srcObject = stream;
      await cameraVideo.play();
      if (session !== cameraSession) {
        stopCamera();
        return;
      }
      cameraRunning = true;
      setCameraUiState('scanning', 'Scanning…', 'Place barcode inside the frame');
      scheduleCameraDetection();
    };
    const openZxingCamera = async session => {
      const Reader = window.ZXingBrowser?.BrowserMultiFormatReader;
      if (typeof Reader !== 'function') throw new Error('ZXing fallback is unavailable.');
      if (!cameraVideo) throw new Error('Camera preview is unavailable.');
      cameraScannerKind = 'zxing';
      const reader = new Reader();
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } }, audio: false },
        cameraVideo,
        (result, _error) => {
          if (!cameraRunning || session !== cameraSession) return;
          if (result) processCameraDetection(result.getText());
          else rearmCameraBarcode();
        },
      );
      if (session !== cameraSession) {
        controls?.stop();
        return;
      }
      zxingControls = controls;
      cameraRunning = true;
      setCameraUiState('scanning', 'Scanning…', 'Place barcode inside the frame');
    };
    const openCamera = async () => {
      if (!targetBarcode) {
        setFeedback('is-error', 'A product barcode is required before a refill can be verified.');
        return;
      }
      const Detector = window.BarcodeDetector;
      if (!navigator.mediaDevices?.getUserMedia) {
        setFeedback('is-error', 'No camera is available. Enter the barcode manually.');
        return;
      }
      stopCamera();
      activeRefillCameraStopV2212 = stopCamera;
      const session = ++cameraSession;
      if (cameraPane) { cameraPane.hidden = false; cameraPane.dataset.cameraState = 'starting'; }
      cameraButton?.setAttribute('aria-pressed', 'true');
      setCameraUiState('starting', 'Starting camera…', 'Preparing secure camera preview');
      try {
        if (typeof Detector === 'function') await openNativeCamera(Detector, session);
        else await openZxingCamera(session);
      } catch (error) {
        stopCamera();
        setFeedback('is-error', refillCameraErrorMessageV2212(error));
      }
    };

    methodButtons.forEach(button => button.addEventListener('click', () => resetMode(button.dataset.refillMode === 'once' ? 'once' : 'each')));
    scanInput?.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (processScan() && mode === 'once') stopCamera();
    });
    cameraButton?.addEventListener('click', openCamera);
    cameraCancel?.addEventListener('click', () => stopCamera({ focus: true }));
    staffInput?.addEventListener('input', updateSave);
    qtyInput?.addEventListener('input', () => {
      let value = String(qtyInput.value || '').replace(/[^0-9+-]/g, '');
      const negative = value.startsWith('-');
      value = value.replace(/[+-]/g, '');
      qtyInput.value = (negative ? '-' : '') + value;
      updateSave();
    });
    resetMode('each');
  } catch (error) {
    toast('Cannot open adjustment', error.message, 'error');
  }
};

/* v2.1.105 -- phone entry cards preserve the existing machine/product data
   controls, but put shared meter controls after every product for that machine.
   Desktop and Review continue to use the accepted table and its rowspans. */
const mobileMachineCardsV2210 = typeof window.matchMedia === "function"
  ? window.matchMedia("(max-width: 767px)")
  : { matches: false };

function mobileMachineFieldV2210(label, control, extraClass = "") {
  return `<label class="mobile-machine-field ${extraClass}"><span>${label}</span>${control}</label>`;
}

function renderMobileMachineCardsV2210(c) {
  let visualRow = 0;
  let cards = "";
  for (const [type, machines] of groupMachines(c.machines)) {
    for (const [typeIndex, machine] of machines.entries()) {
      const machineIndex = c.machines.indexOf(machine);
      const products = ensureClosingProducts(machine);
      const machineBulkRow = visualRow;
      const status = `<select class="table-select machine-input machine-status-select" data-machine-index="${machineIndex}" data-field="status"><option ${machine.status === "Working" ? "selected" : ""}>Working</option><option ${machine.status === "Maintenance" ? "selected" : ""}>Maintenance</option><option ${machine.status === "Out of Service" ? "selected" : ""}>Out of Service</option></select>`;
      const productBlocks = products.map((product, productIndex) => {
        const bulkRow = visualRow++;
        const refillQty = refillTotal(product);
        const historyCount = refillHistoryFor(product).length;
        const refill = `<button type="button" class="refill-total-button ${refillQty > 0 ? "has-refill" : "no-refill"}" data-machine-index="${machineIndex}" data-product-index="${productIndex}" title="${historyCount ? `${historyCount} refill event${historyCount === 1 ? "" : "s"}` : "No refill recorded"}">${refillQty > 0 ? `+${number(refillQty)}` : icon("plus", 14)}</button>`;
        return `<section class="mobile-machine-product" data-machine-index="${machineIndex}" data-product-index="${productIndex}"><div class="mobile-machine-product-heading">Product ${productIndex + 1}</div><div class="product-row-identity">${productThumbnail(product)}<div><strong>${escapeHtml(product.barcode || `Product ${productIndex + 1}`)}</strong></div></div><div class="mobile-machine-quantity-grid">${mobileMachineFieldV2210("Begin Qty", productInput(machineIndex, productIndex, "begin_qty", product.begin_qty, bulkRow, 0))}${mobileMachineFieldV2210("Refill", refill, "mobile-refill-field")}${mobileMachineFieldV2210("Final Qty", productInput(machineIndex, productIndex, "final_qty", product.final_qty, bulkRow, 1))}<div class="mobile-machine-field mobile-machine-readonly"><span>Qty Used</span><strong class="calc-product-used" data-machine-index="${machineIndex}" data-product-index="${productIndex}">0</strong></div></div></section>`;
      }).join("");
      const meterSection = `<section class="mobile-machine-summary"><div class="mobile-machine-summary-heading">Machine summary</div><div class="mobile-machine-meter-grid">${mobileMachineFieldV2210("Begin Meter", machineInput(machineIndex, "begin_coin_meter", machine.begin_coin_meter, machineBulkRow, 2, "number", "meter-input"))}${mobileMachineFieldV2210("Final Meter", machineInput(machineIndex, "final_coin_meter", machine.final_coin_meter, machineBulkRow, 3, "number", "meter-input"))}${mobileMachineFieldV2210("Coins Used", `<div class="coins-used-control">${machineInput(machineIndex, "coins_used", machine.coins_used, machineBulkRow, 4, "number", "coins-used-input")}</div>`)}<div class="mobile-machine-field mobile-machine-readonly mobile-win-rate-field"><span>Win Rate</span><strong class="calc-win-rate" data-machine-index="${machineIndex}">—</strong></div></div></section>`;
      const structureActions = state.closingStructureEdit && !state.closingReadOnly ? `<div class="closing-machine-structure-actions mobile-machine-structure-actions"><button class="mini-action closing-edit-machine" type="button" data-machine-id="${escapeHtml(machine.machine_id)}">${icon("edit", 13)} Edit</button><button class="mini-action danger closing-delete-machine" type="button" data-machine-id="${escapeHtml(machine.machine_id)}">${icon("trash", 13)} Delete</button></div>` : "";
      cards += `<article class="mobile-machine-card" data-mobile-machine-card data-machine-index="${machineIndex}"><header class="mobile-machine-card-header"><div class="mobile-machine-title"><span>Machine</span><strong>${typeIndex + 1}</strong></div>${status}</header>${structureActions}${productBlocks}${meterSection}</article>`;
    }
  }
  return `<div class="mobile-machine-card-list" data-mobile-machine-cards>${cards}</div>`;
}

const renderMachineClosingTableV2210MobileCards = renderMachineClosingTable;
renderMachineClosingTable = function(c, review = false) {
  if (review || !mobileMachineCardsV2210.matches) return renderMachineClosingTableV2210MobileCards(c, review);
  const actionBlock = `<span class="machine-count-badge">${activeMachineCountV2188(c.machines)} active machines</span><div class="machine-heading-buttons">${state.closingStructureEdit && !state.closingReadOnly ? `<button class="btn btn-primary btn-compact" id="addClosingMachine">${icon("plus", 15)} Add Machine</button><button class="btn btn-secondary btn-compact" id="closingStructureDone">${icon("check", 15)} Done</button>` : `<button class="btn btn-secondary btn-compact" id="bulkSelectToggle">${icon("mouse-pointer", 15)} Multi-select</button>${!state.closingReadOnly ? `<button class="btn btn-secondary btn-compact" id="closingStructureEdit">${icon("settings", 15)} Manage Machines</button>` : ""}`}</div>`;
  return `<article class="card section-card machine-section mobile-machine-section"><div class="section-heading"><div><h2>Machine Closing</h2></div><div class="machine-heading-actions">${actionBlock}</div></div>${state.closingStructureEdit && !state.closingReadOnly ? `<div class="structure-edit-banner"><div><strong>Machine setup mode</strong><span>Add, edit, or delete active machines. Historical closing records stay preserved.</span></div></div>` : ""}<div id="bulkEditBar" class="bulk-edit-bar" hidden><div class="bulk-summary"><strong id="bulkSelectedCount">0 cells selected</strong><span>Drag for a rectangular range. Shift-click extends. Ctrl-click adds or removes individual cells.</span></div><div class="bulk-controls"><input id="bulkValue" class="input bulk-value" placeholder="Value for selected cells"><button class="btn btn-primary btn-compact" id="bulkApplyBtn">Apply</button><button class="btn btn-secondary btn-compact" id="bulkFillBtn">${icon("copy-down", 15)} Fill from first</button><button class="btn btn-secondary btn-compact" id="bulkClearBtn">${icon("eraser", 15)} Clear</button><button class="btn btn-ghost btn-compact" id="bulkDoneBtn">Done</button></div></div>${renderMobileMachineCardsV2210(c)}</article>`;
};

/* v2.1.104 -- phone-only Daily Closing date is a read-only local-date status.
   The existing Report Date control and all of its handlers remain authoritative
   for non-phone layouts; this adds no date mutation or navigation behavior. */
function syncMobileClosingTodayStatusV2208() {
  const topbarActions = document.querySelector(".topbar-actions");
  let status = document.getElementById("mobileClosingTodayStatusV2208");
  if (state.page !== "closing" || !state.closing || state.closingReview) {
    status?.remove();
    return;
  }
  if (!topbarActions) return;
  if (!status) {
    status = document.createElement("div");
    status.id = "mobileClosingTodayStatusV2208";
    status.className = "mobile-closing-today-status";
    topbarActions.appendChild(status);
  }
  status.innerHTML = `<span>Today</span><strong>${escapeHtml(dateDisplay(localCalendarDateV2194()))}</strong>`;
}

const renderClosingV2208MobileDateStatus = renderClosing;
renderClosing = function() {
  renderClosingV2208MobileDateStatus();
  syncMobileClosingTodayStatusV2208();
};

/* v2.1.103 -- phone presentation uses the existing active-Draft controls.
   The buttons are moved, never recreated, so their current handlers, role
   checks, autosave state, and final-review path remain authoritative. */
const mobileDailyClosingActionsV2207 = typeof window.matchMedia === "function"
  ? window.matchMedia("(max-width: 767px)")
  : { matches: false, addEventListener() {} };

function arrangeMobileDailyClosingActionsV2207() {
  const topActions = document.getElementById("reviewTopActions");
  const page = document.getElementById("page-closing");
  if (!topActions || !page) return;

  const voidButton = document.getElementById("voidCurrentShiftBtnV2181");
  const closeButton = document.getElementById("closeShiftBtnV2181");
  let mobileBar = page.querySelector("#mobileShiftActionsV2207");

  if (!mobileDailyClosingActionsV2207.matches) {
    mobileBar?.querySelectorAll(".btn").forEach(button => topActions.appendChild(button));
    if (voidButton) topActions.appendChild(voidButton);
    if (closeButton) topActions.appendChild(closeButton);
    mobileBar?.remove();
    return;
  }

  const buttonsToMove = state.closingReview
    ? [...topActions.querySelectorAll(".btn")]
    : [voidButton, closeButton].filter(Boolean);
  if (!buttonsToMove.length) {
    mobileBar?.remove();
    return;
  }
  if (!mobileBar) {
    mobileBar = document.createElement("div");
    mobileBar.id = "mobileShiftActionsV2207";
    mobileBar.className = "closing-actions mobile-shift-actions";
    mobileBar.innerHTML = '<div class="action-buttons"></div>';
    page.appendChild(mobileBar);
  }
  const buttons = mobileBar.querySelector(".action-buttons");
  buttonsToMove.forEach(button => buttons.appendChild(button));
}

const renderClosingV2207MobilePresentation = renderClosing;
renderClosing = function() {
  renderClosingV2207MobilePresentation();
  arrangeMobileDailyClosingActionsV2207();
};
mobileDailyClosingActionsV2207.addEventListener("change", arrangeMobileDailyClosingActionsV2207);

/* v2.1.102 -- Closing workflow controls belong only to the Daily Closing page.
   A queued Closing render can complete after navigation; do not let it repopulate
   the shared action surfaces or alter the active Draft while another page is open. */
const renderClosingV2202PageScopedActions = renderClosing;
renderClosing = function() {
  if (state.page !== "closing") {
    setActions("");
    renderPrintButton();
    return;
  }
  renderClosingV2202PageScopedActions();
};

/* v2.1.97 -- print the visible Review DOM; no cloned report or alternate print UI. */
printClosingPdf = async function() {
  const button = document.getElementById('globalPrintButton');
  if (!state.closing || !state.closingReview || !button) return;
  try {
    button.disabled = true;
    await waitForLiveReviewImagesV2189();
    document.body.classList.add('printing-live-review-v2197');
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.print();
  } catch (error) {
    toast('Cannot open print dialog', error.message || 'Printing is not available on this computer.', 'error');
  } finally {
    document.body.classList.remove('printing-live-review-v2197');
    button.disabled = false;
  }
};

/* v2.1.96 -- unscaled A4 pages; current system CSS remains the visual source. */
function createPrintPageV2196(topbar, reviewHeader, sourcePage, widthPx, heightPx) {
  const page = document.createElement('section');
  page.className = 'print-page-v2196';
  page.style.width = `${widthPx}px`;
  page.style.height = `${heightPx}px`;
  const content = document.createElement('div');
  content.className = 'print-page-content-v2196';
  const pageRoot = sourcePage.cloneNode(false);
  pageRoot.append(clonePrintStateV2195(topbar), clonePrintStateV2195(reviewHeader));
  content.appendChild(pageRoot);
  page.appendChild(content);
  return { page, content, pageRoot };
}

function printPageFitsV2196(page, usableHeight) {
  void page.content.offsetHeight;
  return page.content.getBoundingClientRect().height <= usableHeight;
}

function printStyleParityV2196(source, clone) {
  const checks = [
    ['Review header', source.reviewHeader, clone.pageRoot.querySelector('.review-heading-card'), ['font-size', 'font-weight', 'color', 'border-radius', 'padding']],
    ['KPI', source.kpi, clone.pageRoot.querySelector('.closing-summary-item'), ['font-size', '--kpi-accent', 'border-radius', 'background-color']],
    ['Machine header', source.table.tHead.rows[0].cells[0], clone.table.tHead.rows[0].cells[0], ['background-color', 'color', 'font-size', 'font-weight', 'text-transform', 'border-color', 'padding', 'height']],
    ['Machine group', source.table.querySelector('.group-row td'), clone.table.querySelector('.group-row td'), ['background-color', 'color', 'text-transform']],
  ];
  const failures = [];
  checks.forEach(([name, live, copy, properties]) => {
    if (!live || !copy) return;
    const liveStyle = getComputedStyle(live);
    const copyStyle = getComputedStyle(copy);
    properties.forEach(property => { if (liveStyle.getPropertyValue(property) !== copyStyle.getPropertyValue(property)) failures.push(`${name} ${property}`); });
  });
  const liveLabels = [...source.reviewHeader.querySelectorAll('.review-kicker,.review-staff-grid span')];
  const cloneLabels = [...clone.pageRoot.querySelectorAll('.review-heading-card .review-kicker,.review-heading-card .review-staff-grid span')];
  liveLabels.forEach((live, index) => {
    const copy = cloneLabels[index];
    if (!copy) return failures.push(`Review label ${index + 1} is missing`);
    const liveStyle = getComputedStyle(live);
    const copyStyle = getComputedStyle(copy);
    ['text-transform', 'font-size', 'font-weight', 'letter-spacing', 'color'].forEach(property => {
      if (liveStyle.getPropertyValue(property) !== copyStyle.getPropertyValue(property)) failures.push(`Review label ${index + 1} ${property}`);
    });
  });
  const headers = [...clone.table.tHead.rows[0].cells];
  if (headers.length !== 11) failures.push(`expected 11 print columns, got ${headers.length}`);
  const tableRect = clone.table.getBoundingClientRect();
  headers.forEach((header, index) => {
    const rect = header.getBoundingClientRect();
    if (rect.left < tableRect.left - 1 || rect.right > tableRect.right + 1) failures.push(`column ${index + 1} header outside table`);
  });
  clone.table.querySelectorAll('td').forEach((cell, index) => {
    const rect = cell.getBoundingClientRect();
    if (rect.left < tableRect.left - 1 || rect.right > tableRect.right + 1) failures.push(`TD ${index + 1} outside table`);
  });
  clone.table.querySelectorAll('input,select,textarea,button.refill-total-button').forEach(control => {
    const cell = control.closest('td');
    if (!cell) return;
    const controlRect = control.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    if (controlRect.left < cellRect.left - 2 || controlRect.right > cellRect.right + 2) failures.push(`control outside TD: ${control.className || control.tagName}`);
  });
  if (window.__CLAW_PRINT_DEBUG__) {
    const snapshot = node => {
      const style = getComputedStyle(node);
      return Object.fromEntries(['background-color', 'color', 'font-size', 'font-weight', 'text-transform', 'border-color', 'padding', 'height'].map(property => [property, style.getPropertyValue(property)]));
    };
    console.info('Print visual parity v2196', { passed: !failures.length, failures, liveTh: snapshot(source.table.tHead.rows[0].cells[0]), printTh: snapshot(clone.table.tHead.rows[0].cells[0]) });
  }
  if (failures.length && window.__CLAW_PRINT_DEBUG__) {
    console.error('Print visual parity v2196 failed', failures);
    throw new Error(`Print visual parity failed: ${failures.join('; ')}`);
  }
  return failures;
}

function buildUnscaledSystemPrintDocumentV2196() {
  const topbar = document.querySelector('.topbar');
  const page = document.getElementById('page-closing');
  const reviewHeader = page?.querySelector('.review-heading-card');
  const machineSection = page?.querySelector('.review-machine-section');
  const sourceTable = machineSection?.querySelector('.product-closing-table');
  const notes = page?.querySelector('.review-notes-card');
  const kpi = page?.querySelector('.closing-summary-item');
  if (!topbar || !page || !reviewHeader || !machineSection || !sourceTable || !notes) throw new Error('Review page is not available.');
  const pixelsPerMm = printPixelsPerMmV2192();
  const pageWidth = 281 * pixelsPerMm;
  const pageHeight = 194 * pixelsPerMm;
  const usableHeight = pageHeight - (2.5 * pixelsPerMm);
  const ratios = sourceTableColumnsV2195(sourceTable);
  const root = document.createElement('div');
  root.id = 'printDocumentV2196';
  root.className = 'print-document-v2196 print-measurement-v2196';
  document.body.appendChild(root);
  const pages = [];
  const makePage = first => {
    const next = createPrintPageV2196(topbar, reviewHeader, page, pageWidth, pageHeight);
    root.appendChild(next.page);
    if (first) [...page.children].filter(node => node !== reviewHeader && node !== machineSection && node !== notes && !node.classList.contains('closing-workflow-stepper')).forEach(node => next.pageRoot.appendChild(clonePrintStateV2195(node)));
    const table = clonePrintTableV2195(machineSection, first, ratios);
    next.pageRoot.appendChild(table.section);
    const record = { ...next, ...table };
    pages.push(record);
    return record;
  };
  let current = makePage(true);
  for (const block of machinePrintBlocksV2192(sourceTable)) {
    let start = 0;
    while (start < block.rows.length) {
      const before = current.tbody.rows.length;
      appendPrintRowsV2195(current, block, start, block.rows.length, start === 0);
      if (printPageFitsV2196(current, usableHeight)) { start = block.rows.length; continue; }
      while (current.tbody.rows.length > before) current.tbody.lastChild.remove();
      let end = start;
      while (end < block.rows.length) {
        const beforeCandidate = current.tbody.rows.length;
        appendPrintRowsV2195(current, block, start, end + 1, start === 0);
        if (!printPageFitsV2196(current, usableHeight)) { while (current.tbody.rows.length > beforeCandidate) current.tbody.lastChild.remove(); break; }
        while (current.tbody.rows.length > beforeCandidate) current.tbody.lastChild.remove();
        end += 1;
      }
      if (end > start) { appendPrintRowsV2195(current, block, start, end, start === 0); start = end; current = makePage(false); }
      else if (current.tbody.rows.length) current = makePage(false);
      else { appendPrintRowsV2195(current, block, start, start + 1, start === 0); start += 1; }
    }
  }
  const notesClone = clonePrintStateV2195(notes);
  current.pageRoot.appendChild(notesClone);
  if (!printPageFitsV2196(current, usableHeight) && current.pageRoot.children.length > 3) { notesClone.remove(); current = makePage(false); current.section.remove(); current.pageRoot.appendChild(notesClone); }
  const failures = printStyleParityV2196({ reviewHeader, kpi, table: sourceTable }, pages[0]);
  root.classList.remove('print-measurement-v2196');
  root.dataset.pageCount = String(pages.length);
  root.dataset.visualFailures = String(failures.length);
  return () => root.remove();
}

/* v2.1.99 -- print the live Machine Closing component without a parallel grid. */
function printStyleSnapshotV2199(node, properties) {
  const style = getComputedStyle(node);
  return Object.fromEntries(properties.map(property => [property, style.getPropertyValue(property)]));
}

function machineTableHeaderSnapshotV2199(table) {
  const headers = [...table?.tHead?.rows[0]?.cells || []];
  if (headers.length !== 11) throw new Error('Machine Closing must have exactly 11 visible columns before printing.');
  return headers.map((header, index) => {
    const rect = header.getBoundingClientRect();
    return { column: index + 1, left: rect.left, width: rect.width, height: rect.height, ...printStyleSnapshotV2199(header, ['font-size', 'font-weight', 'line-height', 'padding-left', 'padding-right', 'text-align']) };
  });
}

function prepareLiveMachinePrintParityV2199() {
  const table = document.querySelector('#page-closing .review-machine-section .product-closing-table');
  const refills = [...table?.querySelectorAll('.refill-total-button') || []];
  const winRates = [...table?.querySelectorAll('.calc-win-rate') || []];
  const statuses = [...table?.querySelectorAll('.machine-status-select') || []];
  if (!table || !refills.length || !winRates.length || !statuses.length) throw new Error('Machine Closing print controls are not available.');
  const headers = [...table.tHead.rows[0].cells];
  const columns = [...table.querySelectorAll(':scope > colgroup > col')];
  if (headers.length !== 11 || columns.length !== 11) throw new Error('Machine Closing must use one 11-column live colgroup before printing.');
  const tableWidth = table.getBoundingClientRect().width;
  if (!tableWidth) throw new Error('Machine Closing width is not available for printing.');
  const ratios = headers.map(header => header.getBoundingClientRect().width / tableWidth);
  const refillProperties = ['background-color', 'border-color', 'color', 'border-radius', 'font-family', 'font-size', 'font-weight', 'line-height', 'padding', 'height'];
  const textProperties = ['font-family', 'font-size', 'font-weight', 'line-height', 'color'];
  const statusProperties = [...textProperties, 'box-sizing', 'max-width', 'min-width', 'padding-left', 'padding-right'];
  const headerProperties = ['height', 'padding-left', 'padding-right', 'font-family', 'font-size', 'font-weight', 'line-height', 'text-align', 'border-left-color', 'border-right-color', 'border-top-color', 'border-bottom-color'];
  const styleGroups = [
    ...refills.map(node => [node, refillProperties]),
    ...winRates.map(node => [node, textProperties]),
    ...statuses.map(node => [node, statusProperties]),
    ...headers.map(node => [node, headerProperties]),
  ];
  const originalStyles = [...styleGroups.map(([node]) => [node, node.getAttribute('style')]), ...columns.map(column => [column, column.getAttribute('style')])];
  const live = {
    refills: refills.map(node => printStyleSnapshotV2199(node, refillProperties)),
    winRates: winRates.map(node => printStyleSnapshotV2199(node, textProperties)),
    statuses: statuses.map(node => printStyleSnapshotV2199(node, statusProperties)),
    headers: machineTableHeaderSnapshotV2199(table),
  };
  styleGroups.forEach(([node, properties]) => {
    const snapshot = printStyleSnapshotV2199(node, properties);
    properties.forEach(property => node.style.setProperty(property, snapshot[property], 'important'));
  });
  // Legacy print rules still target the first two columns with !important.
  // Keep the existing live colgroup, but give every one of its measured widths
  // equal priority for the duration of the browser print dialog.
  columns.forEach((column, index) => column.style.setProperty('width', `${(ratios[index] * 100).toFixed(8)}%`, 'important'));
  statuses.forEach(node => {
    node.style.setProperty('width', '100%', 'important');
    node.style.setProperty('max-width', '100%', 'important');
    node.style.setProperty('min-width', '0', 'important');
    node.style.setProperty('box-sizing', 'border-box', 'important');
  });
  let restored = false;
  return {
    live,
    prepared: () => ({
      refills: refills.map(node => printStyleSnapshotV2199(node, refillProperties)),
      winRates: winRates.map(node => printStyleSnapshotV2199(node, textProperties)),
      statuses: statuses.map(node => printStyleSnapshotV2199(node, statusProperties)),
      headers: machineTableHeaderSnapshotV2199(table),
      ratios,
    }),
    restore: () => {
      if (restored) return;
      restored = true;
      originalStyles.forEach(([node, style]) => {
        if (style === null) node.removeAttribute('style');
        else node.setAttribute('style', style);
      });
    },
  };
}

function assertLiveMachinePrintParityV2199(table, live, prepared) {
  const failures = [];
  const equal = (before, after, label) => Object.keys(before).forEach(property => { if (before[property] !== after[property]) failures.push(`${label} ${property}`); });
  live.refills.forEach((snapshot, index) => equal(snapshot, prepared.refills[index] || {}, `Refill ${index + 1}`));
  live.winRates.forEach((snapshot, index) => equal(snapshot, prepared.winRates[index] || {}, `Win Rate ${index + 1}`));
  live.statuses.forEach((snapshot, index) => {
    const preparedStatus = prepared.statuses[index] || {};
    ['font-family', 'font-size', 'font-weight', 'line-height', 'color', 'padding-left', 'padding-right'].forEach(property => {
      if (snapshot[property] !== preparedStatus[property]) failures.push(`Status ${index + 1} ${property}`);
    });
  });
  live.headers.forEach((snapshot, index) => {
    const next = prepared.headers[index];
    if (!next) return failures.push(`Header ${index + 1} missing`);
    ['height', 'padding-left', 'padding-right', 'font-family', 'font-size', 'font-weight', 'line-height', 'text-align'].forEach(property => { if (snapshot[property] !== next[property]) failures.push(`Header ${index + 1} ${property}`); });
    const liveLeft = (snapshot.left - table.getBoundingClientRect().left) / table.getBoundingClientRect().width;
    const nextLeft = (next.left - table.getBoundingClientRect().left) / table.getBoundingClientRect().width;
    const liveWidth = snapshot.width / table.getBoundingClientRect().width;
    const nextWidth = next.width / table.getBoundingClientRect().width;
    if (Math.abs(liveLeft - nextLeft) > .0025 || Math.abs(liveWidth - nextWidth) > .0025) failures.push(`Header ${index + 1} geometry`);
  });
  const headerCenters = prepared.headers.map(header => header.left + (header.width / 2));
  const aligned = (nodes, column, label, containment = false) => nodes.forEach((node, index) => {
    const rect = node.getBoundingClientRect();
    const cell = node.closest('td');
    const cellRect = cell?.getBoundingClientRect();
    const center = rect.left + (rect.width / 2);
    if (!cellRect || Math.abs((cellRect.left + cellRect.width / 2) - headerCenters[column - 1]) > 2 || Math.abs(center - headerCenters[column - 1]) > 2) failures.push(`${label} ${index + 1} alignment`);
    if (containment && (!cellRect || rect.left < cellRect.left || rect.right > cellRect.right - 1)) failures.push(`${label} ${index + 1} containment`);
  });
  aligned([...table.querySelectorAll('.refill-total-button')], 4, 'Refill');
  aligned([...table.querySelectorAll('.calc-win-rate')], 10, 'Win Rate');
  [...table.querySelectorAll('.machine-status-select')].forEach((node, index) => {
    const cell = node.closest('td');
    const rect = node.getBoundingClientRect();
    const cellRect = cell?.getBoundingClientRect();
    const style = getComputedStyle(node);
    const leftPadding = Number.parseFloat(style.paddingLeft) || 0;
    const rightPadding = Number.parseFloat(style.paddingRight) || 0;
    const nativeArrowAllowance = 20;
    const textWidth = (() => { const canvas = document.createElement('canvas'); const context = canvas.getContext('2d'); context.font = style.font; return context.measureText(node.value).width; })();
    if (!cellRect || rect.left < cellRect.left + 1 || rect.right > cellRect.right - 1) failures.push(`Status ${index + 1} containment`);
    if (node.clientWidth - leftPadding - rightPadding - nativeArrowAllowance < textWidth) failures.push(`Status ${index + 1} selected text clips`);
  });
  return failures;
}

function logLiveMachinePrintParityV2199(table, live, prepared) {
  const failures = assertLiveMachinePrintParityV2199(table, live, prepared);
  if (window.__CLAW_PRINT_DEBUG__ && failures.length) throw new Error(`Live Review print parity failed: ${failures.join('; ')}`);
  if (window.__CLAW_PRINT_DEBUG__) console.info('Machine Closing live-to-print parity v2199', { live, prepared, failures, colgroupOverride: 'kept only because legacy print column rules are !important; existing live colgroup widths are measured and temporarily promoted', pageTwoUsesSameColgroup: true });
}

/* v2.1.97 -- final active path: print the visible Review DOM, unchanged. */
printClosingPdf = async function() {
  const button = document.getElementById('globalPrintButton');
  if (!state.closing || !state.closingReview || !button) return;
  let parity = null;
  let restoreParity = () => {};
  try {
    button.disabled = true;
    await waitForLiveReviewImagesV2189();
    parity = prepareLiveMachinePrintParityV2199();
    restoreParity = parity.restore;
    window.addEventListener('afterprint', restoreParity, { once: true });
    document.body.classList.add('printing-live-review-v2197');
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    logLiveMachinePrintParityV2199(document.querySelector('#page-closing .review-machine-section .product-closing-table'), parity.live, parity.prepared());
    window.print();
  } catch (error) {
    toast('Cannot open print dialog', error.message || 'Printing is not available on this computer.', 'error');
  } finally {
    document.body.classList.remove('printing-live-review-v2197');
    restoreParity();
    button.disabled = false;
  }
};

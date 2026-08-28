"use strict";

// Browser-parity transport seam. Keep the legacy UI behind this adapter until
// each route has an approved, authenticated Supabase replacement.
(() => {
  const settings = {
    outlet: "",
    exchange_rate_usd_khr: 4100,
    price_per_coin_usd: 0.3125,
    machine_types: [
      { name: "Claw", coins_per_play: 1 },
      { name: "Keychain", coins_per_play: 1 },
      { name: "Roller", coins_per_play: 3 },
    ],
  };

  const mockError = message => Promise.reject(new Error(message));
  const readBody = options => {
    if (!options.body) return {};
    try { return JSON.parse(options.body); } catch { return {}; }
  };
  const reportDate = path => new URL(path, window.location.origin).searchParams.get("report_date") || new Date().toISOString().slice(0, 10);
  const mockClosing = date => ({ report_date: date, outlet: settings.outlet, machines: [] });

  window.clawApi = {
    mode: "local-mock",
    async request(path, options = {}) {
      const method = String(options.method || "GET").toUpperCase();
      const route = String(path).split("?")[0];

      if (method === "GET" && route === "/api/bootstrap") {
        return { app: { version: "2.1.78" }, settings: { ...settings }, machines: [], closings: [] };
      }
      if (method === "GET" && route === "/api/settings") return { settings: { ...settings } };
      if (method === "POST" && route === "/api/settings") {
        Object.assign(settings, readBody(options));
        return { ok: true, settings: { ...settings } };
      }
      if (method === "GET" && route === "/api/dashboard") {
        return { latest_closing: null, finalized_count: 0, total_sales: 0, total_products: 0 };
      }
      if (method === "GET" && route === "/api/machines") return [];
      if (method === "GET" && route === "/api/new-closing") return mockClosing(reportDate(path));
      if (method === "GET" && route === "/api/closings") return [];
      if (method === "GET" && route === "/api/history") return { records: [], machines: [], staff: [] };
      if (method === "GET" && route === "/api/reports/summary") return { records: [], summary: {} };
      if (method === "GET" && route === "/api/update/status") return { available: false, enabled: false };
      if (method === "GET" && route === "/api/update/config") return { github_repo: "", manifest_url: "", auto_check: false };
      if (method === "POST" && route === "/api/closings/save") {
        const payload = readBody(options);
        return {
          ok: true,
          closing_id: payload.closing_id || "MOCK-UNSAVED",
          workflow_status: payload.workflow_status || "Draft",
          result: {},
          mock: true,
        };
      }

      return mockError(`The ${method} ${route} desktop capability is not available in the browser parity mock.`);
    },
  };
})();

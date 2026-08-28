"use strict";

// Browser-to-local-backend transport seam. Keep all legacy UI calls behind
// this adapter; the local FastAPI server owns the v2.1.78 business behavior.
(() => {
  window.clawApi = {
    mode: "local-backend",
    async request(path, options = {}) {
      const response = await fetch(path, {
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
        ...options,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || `Request failed (${response.status})`);
      return body;
    },
  };
})();

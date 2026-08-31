"use strict";

// The host selects one transport before this file loads. LOCAL is always the
// same-origin FastAPI backend; CLOUD STAGING is always the authenticated Edge
// API. There is intentionally no runtime fallback between them.
(() => {
  const runtimeMode = window.__CLAW_RUNTIME_MODE__;
  const cloudConfig = window.__CLAW_CLOUD_CONFIG__;
  if (window.clawApi) throw new Error("A Claw API adapter is already active.");
  if (runtimeMode === "cloud-staging") {
    if (cloudConfig?.mode !== "cloud-staging") {
      throw new Error("Cloud configuration is unavailable.");
    }
    if (typeof window.createClawCloudAdapter !== "function") {
      throw new Error("Cloud transport was selected but the cloud adapter was not loaded.");
    }
    window.clawApi = window.createClawCloudAdapter(cloudConfig);
    return;
  }
  if (runtimeMode !== "local") throw new Error("The Claw runtime mode is invalid.");
  if (cloudConfig !== undefined) throw new Error("LOCAL mode refuses cloud configuration.");
  window.clawApi = {
    mode: "local-backend",
    async request(path, options = {}) {
      const response = await fetch(path, {
        ...options,
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || `Request failed (${response.status})`);
      return body;
    },
  };
})();

"use strict";

// Inactive production transport scaffold. It deliberately accepts only a
// browser session token supplied by the host; it never contains Supabase
// credentials with elevated privileges.
window.createClawCloudAdapter = function createClawCloudAdapter(config) {
  const baseUrl = String(config?.apiBaseUrl || "").replace(/\/$/, "");
  const getAccessToken = typeof config?.getAccessToken === "function" ? config.getAccessToken : null;
  if (!baseUrl || !getAccessToken) throw new Error("Cloud adapter requires an HTTPS API URL and session-token provider.");
  return {
    mode: "cloud",
    async request(path, options = {}) {
      const token = await getAccessToken();
      if (!token) throw new Error("Sign in is required.");
      const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || `Request failed (${response.status})`);
      return body;
    },
  };
};

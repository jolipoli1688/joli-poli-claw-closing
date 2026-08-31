"use strict";

// CLOUD transport deliberately accepts only a browser session token supplied
// by the staging host. It never contains elevated Supabase credentials.
window.createClawCloudAdapter = function createClawCloudAdapter(config) {
  if (config?.mode !== "cloud-staging") throw new Error("Cloud adapter requires the cloud-staging runtime mode.");
  const baseUrl = String(config?.apiBaseUrl || "").replace(/\/$/, "");
  const projectRef = String(config?.projectRef || "");
  const publishableKey = String(config?.publishableKey || "");
  const getAccessToken = typeof config?.getAccessToken === "function" ? config.getAccessToken : null;
  if (projectRef !== "fbvzqdqjqcbjopuinknw") throw new Error("Cloud adapter is restricted to the approved JOLI POLI staging project.");
  let endpoint;
  try {
    endpoint = new URL(baseUrl);
  } catch {
    throw new Error("Cloud adapter requires an HTTPS API URL and session-token provider.");
  }
  if (endpoint.protocol !== "https:" || endpoint.hostname !== `${projectRef}.supabase.co` || !publishableKey || !getAccessToken) {
    throw new Error("Cloud adapter requires the approved staging HTTPS function URL and a session-token provider.");
  }
  const functionPath = "/functions/v1/claw-api/api/";
  const requestUrlFor = path => {
    const requestedPath = String(path || "");
    if (!requestedPath.startsWith("/api/") || requestedPath.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(requestedPath)) {
      throw new Error("Cloud API routing is unavailable.");
    }
    const requestUrl = new URL(`${baseUrl}${requestedPath}`);
    if (requestUrl.protocol !== "https:" || requestUrl.origin !== endpoint.origin || !requestUrl.pathname.startsWith(functionPath)) {
      throw new Error("Cloud API routing is unavailable.");
    }
    return requestUrl.href;
  };
  return {
    mode: "cloud",
    async request(path, options = {}) {
      const requestUrl = requestUrlFor(path);
      const token = await getAccessToken();
      if (!token) throw new Error("Sign in is required.");
      const response = await fetch(requestUrl, {
        ...options,
        headers: { ...(options.headers || {}), "Content-Type": "application/json", apikey: publishableKey, Authorization: `Bearer ${token}` },
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401 && typeof config.onSessionExpired === "function") config.onSessionExpired();
      if (!response.ok) throw new Error(body.detail || body.error || "Cloud workspace is unavailable. Please try again.");
      return body;
    },
  };
};

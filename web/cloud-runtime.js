"use strict";

// This file is inert in LOCAL mode. Start_Cloud_Staging.py injects the
// browser-safe runtime configuration before this script for CLOUD staging.
(() => {
  const config = window.__CLAW_CLOUD_CONFIG__;
  if (!config || config.mode !== "cloud") return;

  const storageKey = `joli-poli-claw:${config.projectRef}:session`;
  let session = null;
  let readyResolve;
  const ready = new Promise(resolve => { readyResolve = resolve; });

  const authHeaders = () => ({ apikey: config.publishableKey, "Content-Type": "application/json" });
  const internalEmailForUsername = value => {
    const username = String(value || "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9._-]/g, "").replace(/-+/g, "-");
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) throw new Error("Enter a valid username.");
    return `${username}@claw.internal`;
  };
  const persist = value => {
    session = value || null;
    if (session) localStorage.setItem(storageKey, JSON.stringify(session));
    else localStorage.removeItem(storageKey);
  };
  const show = visible => {
    const overlay = document.getElementById("clawStagingSignIn");
    if (overlay) overlay.hidden = !visible;
    const shell = document.getElementById("appShell");
    if (shell) shell.hidden = visible;
  };
  const refreshIfNeeded = async () => {
    if (!session) return null;
    if (Number(session.expires_at || 0) * 1000 > Date.now() + 60_000) return session;
    const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST", headers: authHeaders(), body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    if (!response.ok) { persist(null); return null; }
    persist(await response.json());
    return session;
  };
  const restore = async () => {
    try { persist(JSON.parse(localStorage.getItem(storageKey) || "null")); } catch { persist(null); }
    await refreshIfNeeded();
    readyResolve();
    show(!session);
  };
  const signOut = async () => {
    const token = session?.access_token;
    persist(null);
    if (token) await fetch(`${config.supabaseUrl}/auth/v1/logout`, { method: "POST", headers: { ...authHeaders(), Authorization: `Bearer ${token}` } }).catch(() => {});
    window.dispatchEvent(new Event("claw-cloud-signed-out"));
    show(true);
  };
  const mount = () => {
    const root = document.createElement("section");
    root.id = "clawStagingSignIn";
    root.hidden = true;
    root.innerHTML = '<div style="position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:rgba(15,23,42,.42)"><form id="clawStagingSignInForm" style="width:min(360px,calc(100vw - 32px));padding:24px;border-radius:14px;background:#fff;box-shadow:0 20px 60px rgba(15,23,42,.28);font:14px system-ui"><div style="font-size:12px;font-weight:800;letter-spacing:.08em;color:#b45309">STAGING</div><h1 style="margin:7px 0 16px;font-size:22px;color:#102a43">JOLI POLI Claw</h1><label>Username<input name="username" type="text" autocomplete="username" required style="display:block;width:100%;box-sizing:border-box;margin:6px 0 12px;padding:10px"></label><label>Password<input name="password" type="password" autocomplete="current-password" required style="display:block;width:100%;box-sizing:border-box;margin:6px 0 16px;padding:10px"></label><p id="clawStagingSignInError" style="min-height:18px;color:#b42318"></p><button type="submit" style="width:100%;padding:10px;border:0;border-radius:7px;background:#102a43;color:#fff;font-weight:700">Sign in to staging</button></form></div>';
    document.body.appendChild(root);
    root.querySelector("form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const error = root.querySelector("#clawStagingSignInError");
      error.textContent = "";
      let email;
      try { email = internalEmailForUsername(form.get("username")); } catch (cause) { error.textContent = cause.message; return; }
      const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ email, password: form.get("password") }) });
      if (!response.ok) { error.textContent = "Sign-in failed. Check the username and password."; return; }
      persist(await response.json());
      show(false);
      location.reload();
    });
    const badge = document.createElement("button");
    badge.type = "button";
    badge.textContent = "STAGING · Sign out";
    badge.title = "Sign out of cloud staging";
    badge.style.cssText = "position:fixed;right:10px;bottom:10px;z-index:9000;padding:4px 7px;border-radius:5px;background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;font:700 11px system-ui;letter-spacing:.08em;cursor:pointer";
    badge.addEventListener("click", signOut);
    void badge;
  };
  config.getAccessToken = async () => { await ready; const current = await refreshIfNeeded(); return current?.access_token || ""; };
  config.onSessionExpired = () => { persist(null); window.dispatchEvent(new Event("claw-cloud-signed-out")); show(true); };
  window.clawCloudAuth = { signOut, session: () => session, ready };
  document.addEventListener("DOMContentLoaded", () => { mount(); restore(); });
})();

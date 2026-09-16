"use strict";

// This file is inert in LOCAL mode. Start_Cloud_Staging.py injects the
// browser-safe runtime configuration before this script for CLOUD staging.
(() => {
  const config = window.__CLAW_CLOUD_CONFIG__;
  if (!config || config.mode !== "cloud-staging") return;

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
    delete window.clawCloudBootstrap;
    if (token) await fetch(`${config.supabaseUrl}/auth/v1/logout`, { method: "POST", headers: { ...authHeaders(), Authorization: `Bearer ${token}` } }).catch(() => {});
    window.dispatchEvent(new Event("claw-cloud-signed-out"));
    show(true);
  };
  const mount = () => {
    const root = document.createElement("section");
    root.id = "clawStagingSignIn";
    root.hidden = true;
    root.innerHTML = `<div class="claw-login-stage"><form id="clawStagingSignInForm"></form></div>`;
    const form = root.querySelector("form");
    form.className = "claw-login-card claw-login-form";
    form.setAttribute("novalidate", "");
    form.innerHTML = `<div class="claw-login-form-stack"><header class="claw-login-brand"><img src="/assets/brand-logo.png" alt="JOLI POLI" class="claw-login-logo"><div><strong>JOLI POLI</strong><span>Claw Closing</span></div></header><div class="claw-login-heading"><h1>Welcome Back</h1><p>Sign in to continue to Claw Closing</p></div><div id="clawStagingSignInError" class="claw-login-error" role="alert" hidden></div><label class="claw-login-field"><span>Username</span><span class="claw-login-input"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.25"></circle><path d="M4.75 20c.9-3.25 3.35-5 7.25-5s6.35 1.75 7.25 5"></path></svg><input name="username" type="text" autocomplete="username" required></span></label><label class="claw-login-field"><span>Password</span><span class="claw-login-input"><svg aria-hidden="true" viewBox="0 0 24 24"><rect x="5.5" y="10" width="13" height="10" rx="2"></rect><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10"></path></svg><input name="password" type="password" autocomplete="current-password" required><button type="button" class="claw-login-password-toggle" aria-label="Show password" title="Show password"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M2.75 12s3.25-5 9.25-5 9.25 5 9.25 5-3.25 5-9.25 5-9.25-5-9.25-5Z"></path><circle cx="12" cy="12" r="2.5"></circle></svg></button></span></label><button type="submit" class="claw-login-submit"><span>Sign In</span></button></div>`;
    const passwordInput = form.elements.password;
    const passwordToggle = form.querySelector(".claw-login-password-toggle");
    passwordToggle.addEventListener("click", () => {
      const showing = passwordInput.type === "text";
      passwordInput.type = showing ? "password" : "text";
      passwordToggle.setAttribute("aria-label", showing ? "Show password" : "Hide password");
      passwordToggle.title = showing ? "Show password" : "Hide password";
    });
    document.body.appendChild(root);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (event.currentTarget.dataset.submitting === "true") return;
      const form = new FormData(event.currentTarget);
      const error = root.querySelector("#clawStagingSignInError");
      error.textContent = "";
      error.hidden = true;
      let email;
      try { email = internalEmailForUsername(form.get("username")); } catch (cause) { error.textContent = cause.message; error.hidden = false; return; }
      if (!String(form.get("password") || "")) { error.textContent = "Enter your password."; error.hidden = false; return; }
      const submit = root.querySelector(".claw-login-submit");
      const stopSubmitting = () => {
        event.currentTarget.dataset.submitting = "false";
        submit.disabled = false;
        submit.querySelector("span").textContent = "Sign In";
      };
      event.currentTarget.dataset.submitting = "true";
      submit.disabled = true;
      submit.querySelector("span").textContent = "Signing in…";
      let response;
      try {
        response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ email, password: form.get("password") }) });
      } catch (_) {
        error.textContent = "Unable to sign in right now. Check your connection and try again.";
        error.hidden = false;
        stopSubmitting();
        return;
      }
      if (!response.ok) {
        error.textContent = "Sign-in failed. Check the username and password.";
        error.hidden = false;
        stopSubmitting();
        return;
      }
      persist(await response.json());
      show(false);
      location.reload();
    });
  };
  config.getAccessToken = async () => { await ready; const current = await refreshIfNeeded(); return current?.access_token || ""; };
  config.onSessionExpired = () => { persist(null); delete window.clawCloudBootstrap; window.dispatchEvent(new Event("claw-cloud-signed-out")); show(true); };
  window.clawCloudAuth = { signOut, session: () => session, ready };
  document.addEventListener("DOMContentLoaded", () => { mount(); restore(); });
})();

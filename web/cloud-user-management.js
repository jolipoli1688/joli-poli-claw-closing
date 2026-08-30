"use strict";

// A CLOUD-staging-only Developer utility. It is intentionally isolated from
// the accepted operational UI and never renders internal Auth email values.
(() => {
  const config = window.__CLAW_CLOUD_CONFIG__;
  if (!config || config.mode !== "cloud") return;
  const request = async (path, options = {}) => {
    const token = await config.getAccessToken();
    const response = await fetch(`${config.apiBaseUrl}${path}`, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.detail || "Request failed.");
    return body;
  };
  const esc = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[char]);
  const show = async () => {
    const [users, bootstrap] = await Promise.all([request("/api/users"), request("/api/bootstrap")]);
    const stores = bootstrap.cloud_context?.stores || [];
    const root = document.createElement("section");
    root.id = "clawDeveloperUsers";
    root.innerHTML = `<div style="position:fixed;inset:0;z-index:9998;background:rgba(15,23,42,.42);display:grid;place-items:center"><div style="width:min(720px,calc(100vw - 24px));max-height:86vh;overflow:auto;background:#fff;border-radius:14px;padding:22px;font:14px system-ui"><button id="clawUsersClose" style="float:right;border:0;background:none;font-size:20px" aria-label="Close">×</button><div style="font-size:12px;font-weight:800;color:#b45309;letter-spacing:.08em">STAGING · DEVELOPER</div><h2 style="margin:6px 0 16px">User Management</h2><form id="clawUserAdd" style="display:grid;gap:10px;padding:14px;background:#f8fafc;border-radius:10px"><strong>Add User</strong><label>Username<input name="username" required autocomplete="username" style="display:block;width:100%;box-sizing:border-box;padding:8px"></label><label>Temporary Password<input name="temporary_password" type="password" required autocomplete="new-password" minlength="12" style="display:block;width:100%;box-sizing:border-box;padding:8px"></label><label>Role<select name="role" style="display:block;width:100%;padding:8px"><option value="outlet">Outlet</option><option value="admin">Admin</option><option value="developer">Developer</option></select></label><fieldset style="border:0;padding:0"><legend>Outlet assignment</legend>${stores.map(store => `<label style="margin-right:12px"><input type="checkbox" name="outlets" value="${esc(store.code)}"> ${esc(store.name)}</label>`).join("")}</fieldset><p id="clawUserError" style="margin:0;color:#b42318"></p><button type="submit" style="padding:9px;border:0;border-radius:6px;background:#102a43;color:#fff;font-weight:700">Create User</button></form><table style="width:100%;margin-top:16px;border-collapse:collapse"><thead><tr><th align="left">Username</th><th align="left">Role</th><th align="left">Status</th><th align="left">Outlets</th></tr></thead><tbody>${users.map(user => `<tr><td>${esc(user.username)}</td><td>${esc(user.role)}</td><td>${esc(user.status)}</td><td>${esc((user.outlets || []).map(outlet => outlet.code).filter(Boolean).join(", "))}</td></tr>`).join("") || "<tr><td colspan=\"4\">No users.</td></tr>"}</tbody></table></div></div>`;
    document.body.appendChild(root);
    root.querySelector("#clawUsersClose").onclick = () => root.remove();
    root.querySelector("#clawUserAdd").onsubmit = async event => {
      event.preventDefault(); const form = new FormData(event.currentTarget); const error = root.querySelector("#clawUserError"); error.textContent = "";
      try { await request("/api/users", { method: "POST", body: JSON.stringify({ username: form.get("username"), temporary_password: form.get("temporary_password"), role: form.get("role"), outlets: form.getAll("outlets"), status: "active" }) }); root.remove(); await show(); }
      catch (cause) { error.textContent = cause.message; }
    };
  };
  document.addEventListener("DOMContentLoaded", async () => {
    try {
      await window.clawCloudAuth.ready; if (!window.clawCloudAuth.session()) return;
      const bootstrap = await request("/api/bootstrap");
      if (bootstrap.cloud_context?.profile?.role !== "developer") return;
      const button = document.createElement("button"); button.type = "button"; button.textContent = "Manage Users"; button.style.cssText = "position:fixed;right:10px;bottom:42px;z-index:9000;padding:4px 7px;border-radius:5px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;font:700 11px system-ui;cursor:pointer"; button.onclick = () => show().catch(error => alert(error.message)); document.body.appendChild(button);
    } catch (_) { /* Session UI remains responsible for sign-in failures. */ }
  });
})();

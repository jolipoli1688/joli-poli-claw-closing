"use strict";

// CLOUD-staging-only Developer UI. It intentionally uses the existing
// authenticated /api/users surface and never renders technical Auth emails.
(() => {
  const config = window.__CLAW_CLOUD_CONFIG__;
  if (!config || config.mode !== "cloud-staging") return;

  const request = async (path, options = {}) => {
    const token = await config.getAccessToken();
    const response = await fetch(`${config.apiBaseUrl}${path}`, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.detail || "Request failed.");
    return body;
  };
  const esc = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[char]);
  const label = value => String(value || "").replace(/(^|[-_\s])\w/g, part => part.slice(-1).toUpperCase());
  const userOutlets = user => (user.outlets || []).map(outlet => outlet.code).filter(code => code && code !== "ALL");
  const outletLabel = user => {
    const outlets = user.outlets || [];
    if (outlets.some(outlet => outlet.code === "ALL")) return "All outlets";
    return outlets.map(outlet => outlet.name || outlet.code).filter(Boolean).join(", ") || "No outlet assigned";
  };
  const validTemporaryPassword = value => {
    const password = String(value || "");
    if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) return "Temporary password must be at least 12 characters and include uppercase, lowercase, number, and symbol.";
    return "";
  };

  const show = async () => {
    const [users, bootstrap] = await Promise.all([request("/api/users"), request("/api/bootstrap")]);
    const state = { users, stores: bootstrap.cloud_context?.stores || [], search: "", role: "", showInactive: false };
    const root = document.createElement("section");
    root.id = "clawDeveloperUsers";
    root.innerHTML = `<div class="claw-users-backdrop" role="presentation"><div class="claw-users-dialog" role="dialog" aria-modal="true" aria-labelledby="clawUsersTitle"><header class="claw-users-header"><div><h2 id="clawUsersTitle">User Management</h2><p>Manage application users and outlet access.</p></div><div class="claw-users-header-actions"><span class="claw-staging-pill">STAGING</span><button class="claw-icon-button" id="clawUsersClose" type="button" aria-label="Close User Management">×</button></div></header><div class="claw-users-body"><div class="claw-users-toolbar"><div class="claw-users-filters"><label class="claw-search-field"><span class="claw-sr-only">Search users</span><input id="clawUserSearch" type="search" placeholder="Search users" autocomplete="off"></label><label class="claw-filter-field"><span class="claw-sr-only">Filter by role</span><select id="clawUserRole"><option value="">All roles</option><option value="developer">Developer</option><option value="admin">Admin</option><option value="outlet">Outlet</option></select></label><label class="claw-inactive-toggle"><input id="clawUserInactive" type="checkbox"> <span>Show inactive</span></label></div><button id="clawUserAdd" class="btn btn-primary claw-users-add" type="button">+ Add User</button></div><div class="claw-users-table-wrap"><table class="claw-users-table"><thead><tr><th>Username</th><th>Role</th><th>Outlet Access</th><th>Status</th><th><span class="claw-sr-only">Actions</span></th></tr></thead><tbody id="clawUsersRows"></tbody></table></div></div></div></div>`;
    document.body.appendChild(root);
    const notice = document.createElement("p");
    notice.id = "clawUserManagementNotice";
    notice.className = "claw-user-management-notice";
    notice.setAttribute("aria-live", "polite");
    root.querySelector(".claw-users-toolbar").after(notice);
    const close = () => root.remove();
    root.querySelector("#clawUsersClose").onclick = close;
    root.querySelector(".claw-users-backdrop").addEventListener("click", event => { if (event.target === event.currentTarget) close(); });
    root.addEventListener("keydown", event => { if (event.key === "Escape" && !root.querySelector(".claw-user-form-layer")) close(); });

    const renderRows = () => {
      const query = state.search.trim().toLowerCase();
      const filtered = state.users.filter(user => (state.showInactive || user.status === "active") && (!state.role || user.role === state.role) && (!query || [user.username, user.role, user.status, outletLabel(user)].join(" ").toLowerCase().includes(query)));
      root.querySelector("#clawUsersRows").innerHTML = filtered.map(user => `<tr><td><strong>${esc(user.username)}</strong></td><td><span class="claw-role-badge claw-role-${esc(user.role)}">${esc(label(user.role))}</span></td><td class="claw-outlet-access">${esc(outletLabel(user))}</td><td><span class="claw-status-badge ${user.status === "active" ? "is-active" : "is-inactive"}">${esc(label(user.status))}</span></td><td class="claw-users-actions"><button class="btn btn-secondary btn-compact" type="button" data-user-id="${esc(user.id)}">Edit</button></td></tr>`).join("") || `<tr><td colspan="5" class="claw-users-empty">No users match the current filters.</td></tr>`;
      root.querySelectorAll("[data-user-id]").forEach(button => { button.onclick = () => openForm(state.users.find(user => user.id === button.dataset.userId)); });
    };

    const openForm = user => {
      const editing = Boolean(user);
      const formLayer = document.createElement("div");
      formLayer.className = "claw-user-form-layer";
      const role = user?.role || "outlet";
      const assigned = new Set(userOutlets(user || {}));
      formLayer.innerHTML = `<div class="claw-user-form-card" role="dialog" aria-modal="true" aria-labelledby="clawUserFormTitle"><header><div><h3 id="clawUserFormTitle">${editing ? "Edit User" : "Add User"}</h3><p>${editing ? "Update role, outlet access, or account status." : "Create an authenticated staging user."}</p></div><button type="button" class="claw-icon-button" data-close-form aria-label="Close">×</button></header><form id="clawUserForm"><div class="claw-user-form-body"><label class="claw-form-field">Username<input name="username" type="text" required autocomplete="username" value="${esc(user?.username || "")}" ${editing ? "readonly" : ""}></label>${editing ? "" : `<label class="claw-form-field">Temporary Password<input name="temporary_password" type="password" required autocomplete="new-password" minlength="12"></label>`}<label class="claw-form-field">Role<select name="role"><option value="outlet" ${role === "outlet" ? "selected" : ""}>Outlet</option><option value="admin" ${role === "admin" ? "selected" : ""}>Admin</option><option value="developer" ${role === "developer" ? "selected" : ""}>Developer</option></select></label>${editing ? `<label class="claw-form-field">Status<select name="status"><option value="active" ${user.status === "active" ? "selected" : ""}>Active</option><option value="inactive" ${user.status === "inactive" ? "selected" : ""}>Inactive</option></select></label>` : ""}<fieldset class="claw-outlet-fieldset"><legend>Outlet Assignment</legend><p>Outlet users require at least one assignment. Admin and Developer keep their existing all-outlet access model.</p><div class="claw-outlet-options">${state.stores.map(store => `<label><input type="checkbox" name="outlets" value="${esc(store.code)}" ${assigned.has(store.code) ? "checked" : ""}> <span>${esc(store.name || store.code)}</span></label>`).join("")}</div></fieldset><p class="claw-user-form-error" aria-live="polite"></p></div><footer><button type="button" class="btn btn-secondary" data-close-form>Cancel</button><button type="submit" class="btn btn-primary">${editing ? "Save Changes" : "Create User"}</button></footer></form></div>`;
      root.appendChild(formLayer);
      const closeForm = () => formLayer.remove();
      formLayer.querySelectorAll("[data-close-form]").forEach(button => { button.onclick = closeForm; });
      formLayer.addEventListener("click", event => { if (event.target === formLayer) closeForm(); });
      let saving = false;
      formLayer.querySelector("form").addEventListener("submit", async event => {
        event.preventDefault();
        if (saving) return;
        const form = new FormData(event.currentTarget);
        const roleValue = form.get("role");
        const payload = { role: roleValue, outlets: roleValue === "outlet" ? form.getAll("outlets") : [] };
        if (editing) payload.status = form.get("status");
        else { payload.username = form.get("username"); payload.temporary_password = form.get("temporary_password"); payload.status = "active"; }
        const error = formLayer.querySelector(".claw-user-form-error");
        error.textContent = "";
        if (!editing) {
          const passwordError = validTemporaryPassword(form.get("temporary_password"));
          if (passwordError) { error.textContent = passwordError; return; }
        }
        saving = true;
        const submit = formLayer.querySelector("button[type=submit]");
        const originalText = submit.textContent;
        submit.textContent = editing ? "Saving…" : "Creating…";
        formLayer.querySelectorAll("button, input, select").forEach(control => { control.disabled = true; });
        try {
          await request(editing ? `/api/users/${user.id}` : "/api/users", { method: editing ? "PATCH" : "POST", body: JSON.stringify(payload) });
          state.users = await request("/api/users");
          closeForm();
          root.querySelector("#clawUserManagementNotice").textContent = editing ? "User changes saved." : "User created.";
          renderRows();
        } catch (cause) {
          error.textContent = cause.message || "The user could not be saved.";
          saving = false;
          submit.textContent = originalText;
          formLayer.querySelectorAll("button, input, select").forEach(control => { control.disabled = false; });
        }
      });
      formLayer.querySelector("input:not([readonly]), select")?.focus();
    };

    root.querySelector("#clawUserSearch").addEventListener("input", event => { state.search = event.target.value; renderRows(); });
    root.querySelector("#clawUserRole").addEventListener("change", event => { state.role = event.target.value; renderRows(); });
    root.querySelector("#clawUserInactive").addEventListener("change", event => { state.showInactive = event.target.checked; renderRows(); });
    root.querySelector("#clawUserAdd").onclick = () => openForm(null);
    renderRows();
    root.querySelector("#clawUserSearch").focus();
  };

  window.clawCloudUserManagement = { show: () => show() };
})();

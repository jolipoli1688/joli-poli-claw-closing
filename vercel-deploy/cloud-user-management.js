"use strict";

// CLOUD-staging-only Developer UI. It intentionally uses the existing
// authenticated /api/users surface and never renders technical Auth emails.
(() => {
  const config = window.__CLAW_CLOUD_CONFIG__;
  if (!config || config.mode !== "cloud-staging") return;

  const request = (path, options = {}) => {
    if (!window.clawApi || window.clawApi.mode !== "cloud") throw new Error("Cloud API routing is unavailable.");
    return window.clawApi.request(path, options);
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
    const bootstrap = window.clawCloudBootstrap;
    if (!bootstrap?.cloud_context) throw new Error("Cloud workspace context is unavailable.");
    const loadingRoot = document.createElement("section");
    loadingRoot.id = "clawDeveloperUsersLoading";
    loadingRoot.innerHTML = '<div class="claw-users-backdrop" role="presentation"><div class="claw-users-dialog" role="dialog" aria-modal="true" aria-label="Loading User Management"><div class="claw-users-header"><div><h2>User Management</h2><p>Manage cloud users and outlet access.</p></div></div><div class="claw-users-body" aria-busy="true"><div class="page-loading page-loading-section" role="status" aria-label="Loading User Management"><span class="loading-dots" aria-hidden="true"><span></span><span></span><span></span></span><span class="claw-sr-only">Loading User Management</span></div></div></div></div>';
    document.body.appendChild(loadingRoot);
    let users, outlets;
    try { [users, outlets] = await Promise.all([request("/api/users"), request("/api/outlets?include_inactive=true")]); }
    catch (cause) { loadingRoot.innerHTML = `<div class="claw-users-backdrop"><div class="claw-users-dialog"><div class="claw-users-body"><div class="empty-state"><strong>Cannot load User Management</strong><span>${esc(cause.message || "Please try again.")}</span><button class="btn btn-primary" type="button" data-retry-users>Try again</button></div></div></div></div>`; loadingRoot.querySelector("[data-retry-users]").onclick = () => { loadingRoot.remove(); void show(); }; return; }
    loadingRoot.remove();
    const state = { users, outlets, stores: outlets.filter(outlet => outlet.status === "active"), search: "", role: "", showInactive: false, showInactiveOutlets: false };
    const root = document.createElement("section");
    root.id = "clawDeveloperUsers";
    root.innerHTML = `<div class="claw-users-backdrop" role="presentation"><div class="claw-users-dialog" role="dialog" aria-modal="true" aria-labelledby="clawUsersTitle"><header class="claw-users-header"><div><h2 id="clawUsersTitle">User Management</h2><p>Manage application users and outlet access.</p></div><div class="claw-users-header-actions"><button class="claw-icon-button" id="clawUsersClose" type="button" aria-label="Close User Management">×</button></div></header><div class="claw-users-body"><div class="claw-users-toolbar"><div class="claw-users-filters"><label class="claw-search-field"><span class="claw-sr-only">Search users</span><input id="clawUserSearch" type="search" placeholder="Search users" autocomplete="off"></label><label class="claw-filter-field"><span class="claw-sr-only">Filter by role</span><select id="clawUserRole"><option value="">All roles</option><option value="developer">Developer</option><option value="admin">Admin</option><option value="outlet">Outlet</option></select></label><label class="claw-inactive-toggle"><input id="clawUserInactive" type="checkbox"> <span>Show inactive</span></label></div><button id="clawUserAdd" class="btn btn-primary claw-users-add" type="button">+ Add User</button></div><div class="claw-users-table-wrap"><table class="claw-users-table"><thead><tr><th>Username</th><th>Role</th><th>Outlet Access</th><th>Status</th><th><span class="claw-sr-only">Actions</span></th></tr></thead><tbody id="clawUsersRows"></tbody></table></div></div></div></div>`;
    document.body.appendChild(root);
    const dialog = root.querySelector(".claw-users-dialog");
    const usersPanel = root.querySelector(".claw-users-body");
    const tabs = document.createElement("nav");
    tabs.className = "claw-admin-tabs";
    tabs.setAttribute("aria-label", "Management sections");
    tabs.innerHTML = '<button class="claw-admin-tab is-selected" data-admin-tab="users" type="button">Users</button><button class="claw-admin-tab" data-admin-tab="outlets" type="button">Outlets</button>';
    const outletsPanel = document.createElement("div");
    outletsPanel.className = "claw-users-body claw-outlet-panel";
    outletsPanel.hidden = true;
    dialog.insertBefore(tabs, usersPanel);
    dialog.appendChild(outletsPanel);
    const notice = document.createElement("p");
    notice.id = "clawUserManagementNotice";
    notice.className = "claw-user-management-notice";
    notice.setAttribute("aria-live", "polite");
    root.querySelector(".claw-users-toolbar").after(notice);
    const close = () => root.remove();
    root.querySelector("#clawUsersClose").onclick = close;
    root.querySelector(".claw-users-backdrop").addEventListener("click", event => { if (event.target === event.currentTarget) close(); });
    root.addEventListener("keydown", event => { if (event.key === "Escape" && !document.querySelector(".claw-user-form-layer")) close(); });

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
      formLayer.innerHTML = `<div class="claw-user-form-card" role="dialog" aria-modal="true" aria-labelledby="clawUserFormTitle"><header><div><h3 id="clawUserFormTitle">${editing ? "Edit User" : "Add User"}</h3><p>${editing ? "Update role, outlet access, or account status." : "Create an authenticated user."}</p></div><button type="button" class="claw-icon-button" data-close-form aria-label="Close">×</button></header><form id="clawUserForm"><div class="claw-user-form-body"><label class="claw-form-field">Username<input name="username" type="text" required autocomplete="username" value="${esc(user?.username || "")}" ${editing ? "readonly" : ""}></label>${editing ? "" : `<label class="claw-form-field">Temporary Password<input name="temporary_password" type="password" required autocomplete="new-password" minlength="12"></label>`}<label class="claw-form-field">Role<select name="role"><option value="outlet" ${role === "outlet" ? "selected" : ""}>Outlet</option><option value="admin" ${role === "admin" ? "selected" : ""}>Admin</option><option value="developer" ${role === "developer" ? "selected" : ""}>Developer</option></select></label>${editing ? `<label class="claw-form-field">Status<select name="status"><option value="active" ${user.status === "active" ? "selected" : ""}>Active</option><option value="inactive" ${user.status === "inactive" ? "selected" : ""}>Inactive</option></select></label>` : ""}<fieldset class="claw-outlet-fieldset"><legend>Outlet Assignment</legend><p>Outlet users require at least one assignment. Admin and Developer keep their existing all-outlet access model.</p><div class="claw-outlet-options">${state.stores.map(store => `<label><input type="checkbox" name="outlets" value="${esc(store.code)}" ${assigned.has(store.code) ? "checked" : ""}> <span>${esc(store.name || store.code)}</span></label>`).join("")}</div></fieldset><p class="claw-user-form-error" aria-live="polite"></p></div><footer><button type="button" class="btn btn-secondary" data-close-form>Cancel</button><button type="submit" class="btn btn-primary">${editing ? "Save Changes" : "Create User"}</button></footer></form></div>`;
      document.body.appendChild(formLayer);
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
        submit.setAttribute("aria-busy", "true");
        submit.innerHTML = `<span class="loading-inline"><span class="loading-inline-spinner" aria-hidden="true"></span><span>${editing ? "Saving..." : "Creating..."}</span></span>`;
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
          submit.removeAttribute("aria-busy");
          submit.textContent = originalText;
          formLayer.querySelectorAll("button, input, select").forEach(control => { control.disabled = false; });
        }
      });
      formLayer.querySelector("input:not([readonly]), select")?.focus();
      formLayer.addEventListener("keydown", event => {
        if (event.key === "Escape") { event.stopPropagation(); closeForm(); }
        if (event.key !== "Tab") return;
        const focusable = [...formLayer.querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled])")];
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      });
    };

    const renderOutlets = () => {
      const rows = state.outlets;
      outletsPanel.innerHTML = `<div class="claw-users-toolbar"><button id="clawOutletAdd" class="btn btn-primary claw-users-add" type="button">+ Add Outlet</button></div><p class="claw-outlet-help">Delete Outlet permanently removes the selected outlet and its data. It cannot be undone.</p><div class="claw-users-table-wrap"><table class="claw-users-table"><thead><tr><th>Code</th><th>Name</th><th>Assigned Users</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(outlet => `<tr><td><strong>${esc(outlet.code)}</strong></td><td>${esc(outlet.name)}</td><td>${Number(outlet.assigned_users || 0)}</td><td><span class="claw-status-badge ${outlet.status === "active" ? "is-active" : "is-inactive"}">${esc(label(outlet.status))}</span></td><td class="claw-users-actions"><button class="btn btn-secondary btn-compact" data-outlet-edit-id="${esc(outlet.id)}" type="button">Edit</button><button class="btn btn-danger btn-compact" data-outlet-delete-id="${esc(outlet.id)}" type="button">Delete</button></td></tr>`).join("") || '<tr><td colspan="5" class="claw-users-empty">No outlets are available.</td></tr>'}</tbody></table></div>`;
      outletsPanel.querySelector("#clawOutletAdd").onclick = () => openOutletForm(null);
      outletsPanel.querySelectorAll("[data-outlet-edit-id]").forEach(button => { button.onclick = () => openOutletForm(state.outlets.find(outlet => outlet.id === button.dataset.outletEditId)); });
      outletsPanel.querySelectorAll("[data-outlet-delete-id]").forEach(button => { button.onclick = () => openDeleteOutletForm(state.outlets.find(outlet => outlet.id === button.dataset.outletDeleteId)); });
    };
    const refreshOutlets = async () => { state.outlets = await request("/api/outlets?include_inactive=true"); state.stores = state.outlets.filter(outlet => outlet.status === "active"); };
    const openOutletForm = outlet => {
      const editing = Boolean(outlet);
      const formLayer = document.createElement("div");
      formLayer.className = "claw-user-form-layer";
      formLayer.innerHTML = `<div class="claw-user-form-card" role="dialog" aria-modal="true"><header><div><h3>${editing ? "Edit Outlet" : "Add Outlet"}</h3><p>${editing ? "Rename this outlet. Permanent deletion is a separate action." : "Settings are copied from the active outlet."}</p></div><button type="button" class="claw-icon-button" data-close-form aria-label="Close">×</button></header><form><div class="claw-user-form-body">${editing ? `<label class="claw-form-field">Code<input value="${esc(outlet.code)}" readonly></label>` : '<label class="claw-form-field">Code<input name="code" required maxlength="32" placeholder="OUTLET-01"></label>'}<label class="claw-form-field">Name<input name="name" required maxlength="80" value="${esc(outlet?.name || "")}"></label><p class="claw-user-form-error" aria-live="polite"></p></div><footer><button type="button" class="btn btn-secondary" data-close-form>Cancel</button><button class="btn btn-primary" type="submit">${editing ? "Save Changes" : "Create Outlet"}</button></footer></form></div>`;
      document.body.appendChild(formLayer);
      const closeForm = () => formLayer.remove();
      formLayer.querySelectorAll("[data-close-form]").forEach(button => { button.onclick = closeForm; });
      formLayer.querySelector("form").onsubmit = async event => {
        event.preventDefault(); const form = new FormData(event.currentTarget); const payload = editing ? { name: form.get("name") } : { code: form.get("code"), name: form.get("name") }; const error = formLayer.querySelector(".claw-user-form-error");
        try { await request(editing ? `/api/outlets/${outlet.id}` : "/api/outlets", { method: editing ? "PATCH" : "POST", body: JSON.stringify(payload) }); await refreshOutlets(); closeForm(); renderOutlets(); root.querySelector("#clawUserManagementNotice").textContent = editing ? "Outlet changes saved." : "Outlet created."; } catch (cause) { error.textContent = cause.message || "The outlet could not be saved."; }
      };
      formLayer.querySelector("input:not([readonly])")?.focus();
    };
    const openDeleteOutletForm = outlet => {
      if (!outlet) return;
      const formLayer = document.createElement("div");
      formLayer.className = "claw-user-form-layer";
      formLayer.innerHTML = `<div class="claw-user-form-card" role="dialog" aria-modal="true" aria-labelledby="clawDeleteOutletTitle"><header><div><h3 id="clawDeleteOutletTitle">Delete Outlet Permanently</h3><p>This cannot be undone. All closing, machine, product, refill, settings, assignment, and audit data for ${esc(outlet.code)} will be deleted.</p></div><button type="button" class="claw-icon-button" data-close-form aria-label="Close">×</button></header><form><div class="claw-user-form-body"><label class="claw-form-field">Type <strong>${esc(outlet.code)}</strong> to confirm<input name="confirm_code" required autocomplete="off" spellcheck="false"></label><p class="claw-user-form-error" aria-live="polite"></p></div><footer><button type="button" class="btn btn-secondary" data-close-form>Cancel</button><button class="btn btn-danger" type="submit">Delete Outlet Permanently</button></footer></form></div>`;
      document.body.appendChild(formLayer);
      const closeForm = () => formLayer.remove();
      formLayer.querySelectorAll("[data-close-form]").forEach(button => { button.onclick = closeForm; });
      formLayer.addEventListener("click", event => { if (event.target === formLayer) closeForm(); });
      formLayer.querySelector("form").onsubmit = async event => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const confirmCode = String(form.get("confirm_code") || "");
        const error = formLayer.querySelector(".claw-user-form-error");
        error.textContent = "";
        if (confirmCode !== outlet.code) { error.textContent = `Type ${outlet.code} exactly to confirm permanent deletion.`; return; }
        const submit = formLayer.querySelector("button[type=submit]");
        submit.disabled = true;
        submit.setAttribute("aria-busy", "true");
        submit.innerHTML = '<span class="loading-inline"><span class="loading-inline-spinner" aria-hidden="true"></span><span>Deleting...</span></span>';
        try {
          const result = await request(`/api/outlets/${outlet.id}`, { method: "DELETE", body: JSON.stringify({ confirm_code: confirmCode }) });
          const wasCurrent = window.clawCloudBootstrap?.cloud_context?.active_store?.id === outlet.id;
          await refreshOutlets();
          closeForm();
          renderOutlets();
          const failed = Array.isArray(result.storage_cleanup_failed_paths) ? result.storage_cleanup_failed_paths.length : 0;
          root.querySelector("#clawUserManagementNotice").textContent = failed ? `Outlet permanently deleted. ${failed} image object${failed === 1 ? "" : "s"} could not be removed.` : "Outlet permanently deleted.";
          window.dispatchEvent(new CustomEvent("claw-outlet-deleted", { detail: { outletId: outlet.id, wasCurrent } }));
        } catch (cause) {
          error.textContent = cause.message || "The outlet could not be permanently deleted.";
          submit.disabled = false;
          submit.removeAttribute("aria-busy");
          submit.textContent = "Delete Outlet Permanently";
        }
      };
      formLayer.querySelector("input[name=confirm_code]")?.focus();
    };
    tabs.querySelectorAll("[data-admin-tab]").forEach(button => { button.onclick = () => { const outletsTab = button.dataset.adminTab === "outlets"; usersPanel.hidden = outletsTab; outletsPanel.hidden = !outletsTab; tabs.querySelectorAll("[data-admin-tab]").forEach(tab => tab.classList.toggle("is-selected", tab === button)); if (outletsTab) renderOutlets(); }; });
    root.querySelector("#clawUserSearch").addEventListener("input", event => { state.search = event.target.value; renderRows(); });
    root.querySelector("#clawUserRole").addEventListener("change", event => { state.role = event.target.value; renderRows(); });
    root.querySelector("#clawUserInactive").addEventListener("change", event => { state.showInactive = event.target.checked; renderRows(); });
    root.querySelector("#clawUserAdd").onclick = () => openForm(null);
    renderRows();
    root.querySelector("#clawUserSearch").focus();
  };

  window.clawCloudUserManagement = { show: () => show() };
})();

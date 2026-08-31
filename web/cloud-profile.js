"use strict";

// CLOUD-staging-only sidebar account surface. Authorization remains in the
// Edge API; this component only renders the authenticated profile context.
(() => {
  const config = window.__CLAW_CLOUD_CONFIG__;
  if (!config || config.mode !== "cloud") return;

  let profile = null;
  let menu = null;
  let menuOwner = null;
  const onMenuKeydown = event => {
    if (event.key !== "Escape" || !menu) return;
    const owner = menuOwner;
    closeMenu();
    owner?.focus();
  };
  const escapeHtml = value => String(value ?? "").replace(/[&<'"]/g, char => ({ "&":"&amp;", "<":"&lt;", "'":"&#39;", '"':"&quot;" })[char]);
  const roleLabel = value => ({ developer: "Developer", admin: "Admin", outlet: "Outlet" })[String(value || "")] || "";
  const outletLabel = value => value?.role === "outlet" ? (value.outlets || []).map(outlet => outlet.name || outlet.code).filter(Boolean).join(", ") || "No outlet assigned" : "All outlets";
  const closeMenu = () => {
    menu?.remove();
    menu = null;
    document.removeEventListener("keydown", onMenuKeydown);
    menuOwner?.classList.remove("is-open");
    menuOwner?.setAttribute("aria-expanded", "false");
    menuOwner = null;
  };
  const clearProfile = () => {
    profile = null;
    window.clawCloudProfile = null;
    closeMenu();
    document.getElementById("clawSidebarProfile")?.remove();
    document.getElementById("clawProfileDialog")?.remove();
    document.getElementById("clawDeveloperUsers")?.remove();
  };
  const openProfileDialog = () => {
    if (!profile) return;
    const root = document.createElement("section");
    root.id = "clawProfileDialog";
    root.innerHTML = `<div class="claw-profile-dialog-backdrop"><div class="claw-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="clawProfileDialogTitle"><header><div><h2 id="clawProfileDialogTitle">My Profile</h2><p>Your cloud staging account details.</p></div><button type="button" class="claw-icon-button" aria-label="Close profile">×</button></header><dl><div><dt>Username</dt><dd>${escapeHtml(profile.username)}</dd></div><div><dt>Role</dt><dd>${escapeHtml(roleLabel(profile.role))}</dd></div><div><dt>Outlet Access</dt><dd>${escapeHtml(outletLabel(profile))}</dd></div></dl><footer><button type="button" class="btn btn-secondary">Close</button></footer></div></div>`;
    const close = () => root.remove();
    root.querySelectorAll("button").forEach(button => { button.onclick = close; });
    root.querySelector(".claw-profile-dialog-backdrop").addEventListener("click", event => { if (event.target === event.currentTarget) close(); });
    document.body.appendChild(root);
    root.querySelector("button")?.focus();
  };
  const openMenu = button => {
    if (!profile) return;
    closeMenu();
    menuOwner = button;
    const rect = button.getBoundingClientRect();
    menu = document.createElement("div");
    menu.className = "claw-profile-menu";
    menu.setAttribute("role", "menu");
    menu.innerHTML = `<button type="button" role="menuitem" data-profile-action="profile">My Profile</button>${profile.role === "developer" ? `<button type="button" role="menuitem" data-profile-action="users">Manage Users</button>` : ""}<hr><button type="button" role="menuitem" class="claw-profile-sign-out" data-profile-action="signout">Sign out</button>`;
    menu.style.left = `${Math.max(8, rect.left)}px`;
    menu.style.bottom = `${Math.max(8, window.innerHeight - rect.top + 8)}px`;
    document.body.appendChild(menu);
    button.setAttribute("aria-expanded", "true");
    button.classList.add("is-open");
    menu.querySelectorAll("[data-profile-action]").forEach(item => item.addEventListener("click", async () => {
      const action = item.dataset.profileAction;
      closeMenu();
      if (action === "profile") openProfileDialog();
      if (action === "users") await window.clawCloudUserManagement?.show();
      if (action === "signout") await window.clawCloudAuth.signOut();
    }));
    setTimeout(() => document.addEventListener("click", event => { if (menu && !menu.contains(event.target) && event.target !== button) closeMenu(); }, { once: true }), 0);
    document.addEventListener("keydown", onMenuKeydown);
  };
  const renderProfile = () => {
    const footer = document.querySelector(".sidebar-footer");
    if (!footer || !profile) return;
    let area = document.getElementById("clawSidebarProfile");
    if (!area) {
      area = document.createElement("section");
      area.id = "clawSidebarProfile";
      footer.before(area);
    }
    const initial = escapeHtml(String(profile.username || "?").slice(0, 1).toUpperCase());
    area.innerHTML = `<button id="clawSidebarProfileButton" class="claw-sidebar-profile-button" type="button" title="Profile" aria-label="Profile" aria-expanded="false"><span class="claw-profile-avatar" aria-hidden="true">${initial}</span><span class="claw-profile-copy"><strong>${escapeHtml(profile.username)}</strong><small>${escapeHtml(roleLabel(profile.role))}</small></span><span class="claw-profile-chevron" aria-hidden="true">⌄</span></button>`;
    area.querySelector("button").onclick = event => openMenu(event.currentTarget);
  };
  const loadProfile = async () => {
    const token = await config.getAccessToken();
    if (!token) return clearProfile();
    const response = await fetch(`${config.apiBaseUrl}/api/bootstrap`, { headers: { apikey: config.publishableKey, Authorization: `Bearer ${token}` } });
    if (!response.ok) return clearProfile();
    const context = (await response.json()).cloud_context || {};
    profile = { username: context.profile?.username || "", role: context.profile?.role || "", outlets: context.stores || [] };
    window.clawCloudProfile = { username: profile.username, role: profile.role, outlets: profile.outlets.map(outlet => ({ code: outlet.code, name: outlet.name })) };
    renderProfile();
  };
  document.addEventListener("DOMContentLoaded", async () => {
    const actions = document.querySelector(".topbar-actions");
    if (actions && !document.getElementById("clawStagingIndicator")) {
      const indicator = document.createElement("span");
      indicator.id = "clawStagingIndicator";
      indicator.className = "claw-staging-indicator";
      indicator.textContent = "STAGING";
      actions.prepend(indicator);
    }
    await window.clawCloudAuth.ready;
    if (window.clawCloudAuth.session()) await loadProfile();
  });
  window.addEventListener("claw-cloud-signed-out", clearProfile);
})();

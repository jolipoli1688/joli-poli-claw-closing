"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../web/assets/styles.css", import.meta.url), "utf8");
const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../web/assets/app.js", import.meta.url), "utf8");

assert.match(css, /Retail Sales Dashboard-compatible design primitives/, "Claw must define a shared Dashboard-aligned token layer");
for (const token of ["--surface-primary", "--surface-secondary", "--text-primary", "--text-muted", "--border-default", "--border-focus", "--action-primary", "--action-danger", "--radius-card", "--shadow-elevation-1", "--control-height"]) {
  assert.match(css, new RegExp(token.replace("--", "\\-\\-")), `${token} must be a shared design token`);
}
assert.match(css, /\[data-theme="dark"\],\s*\.theme-dark/, "explicit dark theme tokens must be supported");
assert.match(css, /\[data-theme="light"\],\s*\.theme-light/, "explicit light theme tokens must be supported");
assert.match(css, /@media \(prefers-color-scheme: dark\)/, "default theme must adapt to system dark mode");
assert.match(css, /@media screen \{[\s\S]*\.sidebar[\s\S]*\.topbar[\s\S]*\.card/s, "screen-only shared layer must cover shell and cards");
assert.match(css, /\.btn \{ min-height: var\(--control-height\)/, "buttons must use shared control height");
assert.match(css, /\.input, \.select, \.textarea, \.data-table \.table-input/, "forms and table controls must share the component treatment");
assert.match(css, /\.data-table th \{ height: 44px; background: var\(--surface-secondary\)/, "tables must use the Dashboard 44px secondary header treatment");
assert.match(css, /\.status-pill \{ padding: 4px 8px; border: 1px solid transparent/, "status badges must use a compact shared treatment");
assert.match(css, /\.modal \{ background: var\(--surface-elevated\)/, "standard modals must use elevated surfaces");
assert.match(css, /\.claw-users-dialog, \.claw-user-form-card/, "User and Outlet dialogs must share the modal language");
assert.match(css, /#clawSidebarProfile/, "the cloud sidebar profile must use the shared sidebar treatment");
assert.match(css, /\.loading-dots > span \{ width:8px; height:8px/, "page loading must use the Dashboard dot component");
assert.match(css, /Closing KPI cards: shared, screen-only presentation for Daily, Review, and History/, "Closing KPI refinements must stay screen-only and cover each shared closing surface");
assert.match(css, /#page-closing \.closing-summary-item,\s*#page-history \.history-kpi-card\.closing-summary-item/, "Daily, Review, and History closing KPI cards must share one card surface treatment");
assert.match(css, /border:1px solid var\(--border-default\) !important;[\s\S]*background:var\(--surface-primary\) !important;[\s\S]*box-shadow:var\(--shadow-elevation-1\) !important;/, "Closing KPI cards must use shared surface, border, and elevation tokens");
assert.match(css, /#page-closing \.closing-summary-item::before,[\s\S]*background:var\(--kpi-accent/, "Closing KPI cards must use a restrained semantic left accent");
assert.match(css, /#page-closing \.closing-summary-head,[\s\S]*justify-content:space-between !important;/, "Closing KPI labels and icons must use a left-to-right top row");
assert.match(css, /#page-closing \.closing-summary-item > strong,[\s\S]*font-size:26px !important;[\s\S]*font-weight:600 !important;/, "Closing KPI values must match the Dashboard value hierarchy");
assert.match(css, /left:18px;[\s\S]*width:2px;[\s\S]*height:40px;/, "Closing KPI accents must match the Dashboard inset accent measurement");
assert.match(css, /width:28px !important;[\s\S]*height:28px !important;[\s\S]*border-radius:var\(--radius-small\)/, "Closing KPI icons must match the Dashboard compact icon tile");
assert.match(css, /background:color-mix\(in srgb, var\(--kpi-accent/, "Closing KPI icon badges must use token-aware semantic tints");
assert.match(css, /@media \(max-width: 860px\)/, "responsive sidebar and grid behavior must be included");
assert.match(css, /\.app-shell\.sidebar-collapsed \{ grid-template-columns: 72px minmax\(0, 1fr\); \}/, "normal desktop must use the Dashboard 72px icon rail");
assert.match(css, /\.app-shell \{ grid-template-columns: 312px minmax\(0, 1fr\);/, "the optional expanded Dashboard sidebar must use 312px");
assert.match(css, /\.nav-button \{ position: relative; min-height: 44px;/, "Dashboard navigation must use 44px rows");
assert.match(css, /\.nav-button\.active::before/, "active navigation must use the Dashboard left indicator");
assert.match(app, /localStorage\.getItem\(SIDEBAR_STORAGE_KEY\) !== "false"/, "the icon rail must be the default sidebar state");
assert.match(html, /class="app-shell sidebar-collapsed app-shell-loading"/, "initial desktop render must start in the icon rail state");
assert.match(html, /<h1 id="pageTitle">Daily Closing<\/h1>/, "initial render must show the real page title");
assert.match(html, /class="page-loading" role="status"/, "initial render must show the Dashboard page loader");
assert.equal((html.match(/loading-dots/g) || []).length, 1, "initial render must contain one three-dot loader");
assert.ok(!html.includes("skeleton"), "navigation and content must never be replaced with skeleton placeholders");
assert.ok(!css.includes("glassmorphism"), "the design migration must not introduce glassmorphism");

console.log("PASS - Retail Dashboard-aligned Claw design tokens and shared component layer are present.");

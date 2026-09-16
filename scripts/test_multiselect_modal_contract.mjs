"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [app, users, styles] = await Promise.all([
  read("../web/assets/app.js"),
  read("../web/cloud-user-management.js"),
  read("../web/assets/styles.css"),
]);

const current = app.slice(app.lastIndexOf("/* v2.1.79"));
assert.match(current, /handleBulkPointerDown = function\(event\) \{ if \(state\.bulkMode\)/, "normal input clicks must not start selection mode");
assert.match(current, /Multi-select/, "the explicit Multi-select control must remain available");
assert.match(current, /Exit Multi-select/, "active selection mode must have a predictable exit control");
assert.match(current, /Clear Selection/, "active selection mode must provide Clear Selection");
assert.match(current, /state\.bulkSelection\.clear\(\); state\.bulkAnchor = null/, "Clear Selection must clear only selection state");
assert.match(users, /document\.body\.appendChild\(formLayer\)/, "Edit User must mount above User Management");
assert.match(users, /event\.key !== "Tab"/, "Edit User must trap keyboard focus at the topmost modal");
assert.match(users, /state\.users = await request\("\/api\/users"\)/, "User PATCH must refresh the visible list");
assert.match(styles, /\.claw-user-form-layer\{position:fixed;inset:0;z-index:10000/, "Edit User overlay must be above User Management");
assert.match(styles, /\.claw-user-form-card[^\n]*max-height/, "Edit User must keep an internally scrollable dialog");
assert.match(app, /handleBulkPointerDown = function\(event\) \{[\s\S]*!state\.bulkMode[\s\S]*\.bulk-cell\[data-cell-key\][\s\S]*closest\("tbody"\)/, "selection must start only from an eligible body cell while explicit mode is active");
assert.match(app, /handleBulkHeaderClick = function\(event\) \{[\s\S]*event\.preventDefault\(\);[\s\S]*event\.stopPropagation\(\);/, "table headers must never alter selection state");
assert.match(styles, /#page-closing \.product-closing-table thead th,[\s\S]*background:var\(--surface-primary\) !important; color:var\(--text-primary\) !important;[\s\S]*font-size:12px !important; font-weight:600 !important;/, "all Machine Closing headers must share the professional white surface treatment");
assert.match(styles, /\.machine-table\.bulk-mode \.bulk-column-header \{ background:var\(--surface-primary\) !important; color:var\(--text-primary\) !important; cursor:default;/, "selection mode must not make headers interactive");
assert.match(styles, /product-closing-table tbody tr\.group-row td,[\s\S]*background:var\(--surface-hover\) !important; color:var\(--text-primary\) !important;[\s\S]*font-size:12px !important; font-weight:600 !important;/, "machine group rows must use a distinct soft-neutral treatment");
assert.match(styles, /product-closing-table tbody td,[\s\S]*border-top:0 !important; border-right:0 !important; border-left:0 !important; border-bottom:1px solid var\(--border-subtle\) !important;/, "Machine Closing body cells must use horizontal separators instead of boxed grid cells");
assert.match(styles, /product-closing-row:not\(\.machine-group-end\) td\.machine-group-cell,[\s\S]*border-bottom:0 !important;/, "merged machine cells must remain visually continuous across product rows");

console.log("PASS - explicit Multi-select and topmost User Edit modal contract.");

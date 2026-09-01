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

console.log("PASS - explicit Multi-select and topmost User Edit modal contract.");

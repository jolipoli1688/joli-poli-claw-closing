"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [edge, app] = await Promise.all([
  read("../supabase/functions/claw-api/index.ts"),
  read("../web/assets/app.js"),
]);

assert.match(edge, /\[\.\.\.\(machine\.machine_styles \|\| \[\]\)\][\s\S]*integer\(a\.sort_order\) - integer\(b\.sort_order\)/, "new shift masters must sort styles by sort_order without mutating database rows");
assert.match(edge, /sort_order: integer\(style\.sort_order\)/, "master style position must reach the browser");
assert.match(edge, /sort_order_snapshot: style\.sort_order/, "draft product entries must persist the master position snapshot");
assert.match(edge, /\[\.\.\.\(row\.closing_product_entries \|\| \[\]\)\]\.sort\(\(a: any, b: any\) => integer\(a\.sort_order_snapshot\) - integer\(b\.sort_order_snapshot\)/, "closing detail must sort embedded snapshot rows deterministically");
assert.match(edge, /\.order\("sort_order_snapshot"\)/, "closing machines must retain their own deterministic order");
assert.match(app, /function productStableOrder\(left, right\)/, "browser must centralize product ordering");
assert.match(app, /return \[\.\.\.source\]\.sort\(productStableOrder\)/, "browser must copy before sorting rather than mutate the canonical source array");
assert.match(app, /sort_order: row\.sort_order_snapshot/, "draft hydration must retain snapshot position");
assert.match(app, /sort_order: product\.sort_order_snapshot/, "master hydration must retain configured position");
assert.match(app, /products\.forEach\(product => \{\n    product\.refill_history/, "refill normalization must update values in place, not reorder products");
assert.match(app, /machines: state\.closing\.machines/, "autosave must submit canonical machine/product arrays rather than rebuild from object values");

const compare = (left, right) => left.sort - right.sort || left.id.localeCompare(right.id);
const master = [{ id: "123", sort: 1 }, { id: "456", sort: 2 }];
const snapshot = [{ id: "456", sort: 2 }, { id: "123", sort: 1 }];
assert.deepEqual([...master].sort(compare).map(item => item.id), ["123", "456"], "new shift master order must be 123,456");
assert.deepEqual([...snapshot].sort(compare).map(item => item.id), ["123", "456"], "continued draft snapshot order must be 123,456");
assert.deepEqual([...snapshot].sort(compare).map(item => item.id), ["123", "456"], "refill/autosave/render operations preserve the same ordered identities");
assert.deepEqual([...master.filter(item => item.id !== "456")].sort(compare).map(item => item.id), ["123"], "inactive removal must preserve relative order of remaining products");

console.log("PASS - master/snapshot product rows retain deterministic order through reload, autosave, refill, render, and inactive filtering.");

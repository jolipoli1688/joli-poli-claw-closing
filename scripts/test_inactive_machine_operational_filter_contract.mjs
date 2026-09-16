"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [edge, app] = await Promise.all([
  read("../supabase/functions/claw-api/index.ts"),
  read("../web/assets/app.js"),
]);

const bootstrap = edge.match(/if \(path === "\/api\/bootstrap"\)[\s\S]*?\n    if \(path === "\/api\/settings"/)?.[0] || "";
const machinesRoute = edge.match(/if \(path === "\/api\/machines" && req\.method === "GET"\)[\s\S]*?\n    if \(path === "\/api\/machines" && req\.method === "POST"/)?.[0] || "";
const opening = edge.match(/async function openingTemplate[\s\S]*?\n}\n\nasync function saveClosing/)?.[0] || "";
const archive = app.match(/let showInactiveMachinesV2188[\s\S]*?\n}\n\nconst renderMachineClosingTableV2188ActiveCount/)?.[0] || "";
const retirement = app.match(/async function retireMachineAndReloadDraftV2189[\s\S]*?\n}\n\nfunction bindClosingStructureActions/)?.[0] || "";

assert.match(bootstrap, /readMachines\(ctx, true\)/, "normal bootstrap must hydrate only active machines");
assert.match(machinesRoute, /const includeInactive = configurationManager\(ctx\) && url\.searchParams\.get\("include_inactive"\) === "true"/, "only authorized explicit requests may include retired machines");
assert.match(machinesRoute, /readMachines\(ctx, !includeInactive, includeInactive\)/, "normal machine retrieval must default to active rows");
assert.match(opening, /readMachines\(ctx, true\)/, "new shifts must use current active machines only");
assert.match(app, /state\.machines = await api\("\/api\/machines\?active_only=true"\)/, "successful soft-delete must immediately refresh active machine configuration");
assert.match(retirement, /await openClosing\(targetClosingId\)/, "machine retirement must reload the authoritative Draft rather than retain a local inactive snapshot");
assert.doesNotMatch(retirement, /inactive_configuration/, "the active retirement path must not retain an inactive local Draft snapshot");
assert.match(archive, /Show inactive/, "Manage Machines must offer an explicit inactive-only recovery view to authorized roles");
assert.match(archive, /\/api\/machines\?include_inactive=true/, "inactive machines must be fetched only by explicit configuration action");
assert.match(archive, /Inactive machines/, "retired machine rows must be clearly labeled");
assert.match(app, /activeMachineCountV2188/, "active machine counts must exclude inactive configuration rows");

console.log("PASS - inactive machines are excluded from normal bootstrap, operational retrieval, counts, and new shifts; the active Draft reloads without a retired machine and explicit authorized archive access remains available.");

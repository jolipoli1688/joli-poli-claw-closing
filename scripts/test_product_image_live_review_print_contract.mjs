"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [app, edge, styles] = await Promise.all([
  read("../web/assets/app.js"),
  read("../supabase/functions/claw-api/index.ts"),
  read("../web/assets/styles.css"),
]);

assert.match(edge, /if \(path === "\/api\/images\/replace" && req\.method === "POST"\) return json\(await saveImage\(ctx, body\)\)/, "Cloud must expose the authenticated replacement route");
assert.match(edge, /image_path: nextPath, image_content_type: contentType, image_updated_by: ctx\.userId, image_updated_at:/, "Cloud replacement must persist the path, type, and audit timestamp");
assert.match(edge, /const signed = await ctx\.admin\.storage\.from\(IMAGE_BUCKET\)\.createSignedUrl\(nextPath, 300\)/, "Cloud replacement must return a signed image URL");
assert.match(edge, /if \(style\.data\.image_path\).*remove\(\[style\.data\.image_path\]\)/s, "Cloud replacement must clean only the replaced style object");
assert.match(edge, /path === "\/api\/images\/remove"/, "Cloud removal route must remain available");

assert.match(app, /function pendingCloudProductImageOperations\(products\)/, "the editor must retain a per-product list of pending image changes");
assert.match(app, /function cloudMachineMetadataProducts\(products\)/, "Cloud metadata saves must exclude temporary image data");
assert.match(app, /function persistCloudProductImages\(machine, operations\)/, "the editor must persist pending images after machine metadata");
assert.match(app, /new Map\(machineProducts\(machine\)\.map\(product => \[productBarcodeKey\(product\), product\]\)\)/, "pending images must resolve persisted styles by barcode identity, never array position");
assert.match(app, /machine_style_id: style\.product_id, content_type: match\[1\], image_base64: operation\.product\.image_data/, "each replacement must address its resolved persisted style ID");
assert.match(app, /await api\("\/api\/images\/remove"/, "a per-product removal must use its resolved persisted style ID");
assert.match(app, /const result = await api\("\/api\/machines"[\s\S]*?await persistCloudProductImages\(updated, cloudImageOperations\);[\s\S]*?const refreshedMachines = await api\("\/api\/machines\?active_only=false"\)/, "metadata must save before image writes, then reload signed Cloud image URLs");
assert.match(app, /Machine details saved, but image upload failed for barcode \$\{operation\.barcode\}/, "image failures must identify the affected barcode and prevent full success");
assert.match(app, /operation\.product\.image_data = ""/, "only a successfully persisted image may clear its retry payload");
assert.match(app, /products: isCloudStaging\(\) \? cloudMachineMetadataProducts\(products\) : products/, "LOCAL mode must keep its existing metadata-and-image save path");

const activePrintStart = app.lastIndexOf("/* v2.1.97 -- final active path");
const activePrint = app.slice(activePrintStart);
const sharedReviewCss = styles.slice(styles.lastIndexOf("/* v2.1.97 -- shared Review components"));
assert.match(activePrint, /printClosingPdf = async function\(\)[\s\S]*?await waitForLiveReviewImagesV2189\(\)[\s\S]*?window\.print\(\)/, "the final Print handler must invoke the browser dialog from the visible Review");
assert.doesNotMatch(activePrint, /buildUnscaledSystemPrintDocument|buildSystemWidthPrintDocument|clonePrint|printDocumentV219[256]|sourceWidth|scale\(|zoom|attachShadow/, "the active handler must not build, scale, or print an alternate report tree");
assert.match(sharedReviewCss, /#page-closing \.product-closing-table thead th \{[\s\S]*?background:var\(--surface-primary\) !important;[\s\S]*?color:var\(--text-primary\) !important;/, "the light Machine Closing header must come from shared Review CSS");
assert.match(sharedReviewCss, /#page-closing \.product-closing-table tbody tr\.group-row td \{[\s\S]*?text-transform:none;/, "machine groups must retain shared normal casing");
assert.match(sharedReviewCss, /#page-closing \.review-kicker[\s\S]*?text-transform:uppercase;[\s\S]*?#page-closing \.review-staff-grid span[\s\S]*?text-transform:uppercase;/, "Review and staff labels must retain their shared screen treatment");
assert.match(sharedReviewCss, /#page-closing \.closing-summary-item:nth-child\(1\)[\s\S]*?nth-child\(8\)/, "all eight KPI themes must remain in shared component CSS");
assert.match(sharedReviewCss, /#page-closing \.product-closing-table \.table-input,[\s\S]*?border-radius:var\(--radius-small\)/, "Review controls must retain shared system styling");
assert.match(sharedReviewCss, /@page \{ size:A4 landscape; margin:8mm; \}[\s\S]*?printing-live-review-v2197[\s\S]*?display:table-header-group[\s\S]*?break-inside:avoid/, "print CSS must limit itself to physical page, visibility, table-header repetition, and natural breaks");
assert.doesNotMatch(sharedReviewCss.match(/@media print \{[\s\S]*$/)?.[0] || "", /font-size|background:|color:|padding|border-radius|closing-summary-item/, "the final print media rule must not create a separate Review theme");
assert.match(app, /Invoice No/, "Review print content must use the visible Invoice No label");
assert.match(app, /function prepareLiveMachinePrintParityV2199\(\)[\s\S]*?headers\.length !== 11 \|\| columns\.length !== 11/, "print parity must require the live 11-column header and colgroup");
assert.match(app, /refills\.map\(node => \[node, refillProperties\]\)[\s\S]*?winRates\.map\(node => \[node, textProperties\]\)[\s\S]*?statuses\.map\(node => \[node, statusProperties\]\)/, "every Refill, Win Rate, and Status control must carry its own live style into print");
assert.match(app, /refillProperties = \['background-color', 'border-color', 'color', 'border-radius', 'font-family', 'font-size', 'font-weight', 'line-height', 'padding', 'height'\]/, "every Refill must retain its live green or red component styling");
assert.match(app, /headerProperties = \['height', 'padding-left', 'padding-right', 'font-family', 'font-size', 'font-weight', 'line-height', 'text-align'[\s\S]*?headers\.map\(node => \[node, headerProperties\]\)/, "all live table headers must carry their screen dimensions and type into print");
assert.match(app, /columns\.forEach\(\(column, index\) => column\.style\.setProperty\('width', `\$\{\(ratios\[index\] \* 100\)\.toFixed\(8\)\}%`, 'important'\)\)/, "the existing live colgroup widths must override legacy print-only column changes");
const currentMachinePrintParity = app.slice(app.lastIndexOf("/* v2.1.99 -- print the live Machine Closing component"));
assert.doesNotMatch(currentMachinePrintParity, /function prepareLiveMachineTablePrintGeometryV2198|document\.createElement\('colgroup'\)/, "the active print preparation must not replace the live colgroup with a parallel grid");
assert.match(app, /window\.addEventListener\('afterprint', restoreParity, \{ once: true \}\)[\s\S]*?restoreParity\(\)/, "temporary live print styles must restore after printing");
assert.match(app, /pageTwoUsesSameColgroup: true/, "debug output must record that native repeated headers reuse the same colgroup geometry");
assert.match(app, /if \(window\.__CLAW_PRINT_DEBUG__ && failures\.length\) throw new Error\(/, "debug mode must hard-fail before opening print on any parity mismatch");
assert.match(app, /live\.refills\.forEach[\s\S]*?live\.winRates\.forEach[\s\S]*?live\.statuses\.forEach/, "debug parity must check every Refill, Win Rate, and Status control");
assert.match(app, /const statusProperties = \[\.\.\.textProperties, 'box-sizing', 'max-width', 'min-width', 'padding-left', 'padding-right'\]/, "Status print parity must capture its live padding and box model");
assert.match(app, /statuses\.forEach\(node => \{[\s\S]*?node\.style\.setProperty\('width', '100%', 'important'\)[\s\S]*?node\.style\.setProperty\('box-sizing', 'border-box', 'important'\)/, "Status must fill only its existing TD with a border-box control");
assert.match(app, /node\.clientWidth - leftPadding - rightPadding - nativeArrowAllowance < textWidth/, "debug mode must reject a Status select whose selected text cannot fit beside the native arrow");

console.log("PASS - Cloud product images persist by barcode-resolved style ID and Print uses the live Review DOM.");

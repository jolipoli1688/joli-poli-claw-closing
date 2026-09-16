import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../web/assets/app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../web/assets/styles.css", import.meta.url), "utf8");
const workflow = app.slice(app.lastIndexOf("/* v2.1.106 -- product-bound barcode verification"));
const barcodeHelper = Function(`${workflow.match(/function refillBarcodeV2211\(value\) \{[\s\S]*?\n\}/)[0]}; return refillBarcodeV2211;`)();
const quantityHelper = Function(`${workflow.match(/function refillSignedQuantityV2211\(value\) \{[\s\S]*?\n\}/)[0]}; return refillSignedQuantityV2211;`)();

assert.match(workflow, /function refillBarcodeV2211\(value\) \{\s*return String\(value \?\? ''\)\.trim\(\);/, "barcode normalization must trim only and preserve leading zeroes");
assert.doesNotMatch(workflow, /parseInt\(.*barcode|Number\(.*barcode/, "barcode verification must not coerce barcode strings to numbers");
assert.equal(barcodeHelper(" 00123 "), "00123", "barcode verification must preserve leading zeroes while trimming scanner whitespace");
assert.notEqual(barcodeHelper("123"), barcodeHelper("00123"), "different barcode strings must not compare equal after normalization");
assert.equal(quantityHelper("-3"), -3, "the signed manual adjustment must preserve negative quantities");
assert.match(workflow, /data-refill-mode="each"[\s\S]*?data-refill-mode="once"/, "the refill modal must offer both scan methods");
assert.match(workflow, /refill-verified-quantity-v2213" hidden[\s\S]*?refillVerifiedBarcodeV2213/, "the multiple-count quantity panel must start hidden and identify the verified product");
assert.doesNotMatch(workflow, /placeholder="\+10 \/ -3"|Scan once to verify the product, then enter the quantity/, "the pre-verification quantity examples and helper must be removed");
assert.match(workflow, /if \(scanned !== targetBarcode\)[\s\S]*?Wrong barcode\. Expected/, "wrong barcodes must be rejected with inline feedback");
assert.match(workflow, /mode === 'each'\) \{\s*scannedQty \+= 1;/, "each correct scan must increment exactly once");
assert.match(workflow, /mode === 'once' && !verified/, "scan-once mode must require verification before saving");
assert.match(workflow, /mode === 'once'[\s\S]*?qtyInput\.disabled = true[\s\S]*?qtyInput\.disabled = false/, "manual quantity must reset and remain locked until the next verification");
assert.match(workflow, /if \(onceQuantity\) onceQuantity\.hidden = true;[\s\S]*?verified = true[\s\S]*?if \(onceQuantity\) onceQuantity\.hidden = false;/, "mode changes must hide the panel until a fresh correct barcode verifies it");
assert.match(workflow, /scanInput\.disabled = !targetBarcode/, "switching scan methods must restore the scanner for a product with a barcode");
assert.match(workflow, /targetBarcode && staff && \(mode === 'each' \? scannedQty > 0 : verified && qty\)/, "save readiness must require staff and barcode verification");
assert.match(workflow, /const available = Math\.max\(0,\s*numeric\(product\.begin_qty\)\) \+ refillTotal\(product\) \+ qty;/, "negative adjustment availability protection must remain intact");
assert.match(workflow, /isCloudStaging\(\)[\s\S]*?api\('\/api\/refills'/, "Cloud refills must continue through the existing refill API");
assert.match(workflow, /nextHistory\.push\(\{ qty, at:\s*new Date\(\)\.toISOString\(\), by: staff \}\)/, "local refills must preserve the existing signed event ledger");
assert.match(css, /refill-verification-modal-v2211[\s\S]*?refill-scan-methods-v2211/, "barcode verification modal styling must remain scoped to the refill workflow");
console.log("PASS - refill barcode verification workflow contract.");

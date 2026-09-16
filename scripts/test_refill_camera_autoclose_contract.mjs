import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../web/assets/app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../web/assets/styles.css", import.meta.url), "utf8");
const workflow = app.slice(app.lastIndexOf("/* v2.1.107 -- native mobile camera scanner"));

assert.match(workflow, /const closeSuccessfulCameraScan = completedMode =>/, "success close must use one shared transition owner");
assert.match(workflow, /\}, 320\);/, "success feedback must remain visible briefly");
assert.match(workflow, /\}, 180\);/, "camera close must use a short fade interval");
assert.match(workflow, /if \(cameraSuccessfulScanHandled\) return false[\s\S]*?if \(isCorrectBarcode\) cameraSuccessfulScanHandled = true/, "later native or ZXing callbacks must be ignored after a correct scan");
assert.match(workflow, /processScan\(scanned, \{ deferFocus: isCorrectBarcode, deferQuantityReveal: isCorrectBarcode && mode === 'once' \}\)/, "camera behavior must still use the shared barcode verifier");
assert.match(workflow, /mode === 'once'[\s\S]*?closeSuccessfulCameraScan\('once'\)/, "Count Multiple must close after one verified scan");
assert.match(workflow, /is-camera-confirmed[\s\S]*?closeSuccessfulCameraScan\('each'\)/, "Count 1 must highlight its updated total and then close");
assert.match(workflow, /if \(completedMode === 'once'\) \{[\s\S]*?onceQuantity\.hidden = false[\s\S]*?qtyInput\.disabled = false; qtyInput\.focus\(\);[\s\S]*?\} else focusScan\(\)/, "the quantity panel and focus must return only after camera cleanup");
assert.match(workflow, /if \(!cameraRunning \|\| session !== cameraSession\) return;/, "ZXing callbacks must stop once the scanner is frozen");
assert.match(css, /data-camera-state="closing"[\s\S]*?transform:scale\(\.985\)/, "closing must fade rather than intentionally show a black video frame");
assert.match(css, /is-camera-confirmed[\s\S]*?background:#f0fdf4/, "Count 1 return must make the updated quantity obvious");

console.log("PASS - refill camera one-success-per-session auto-close contract.");

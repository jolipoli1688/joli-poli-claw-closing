import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../web/assets/app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../web/assets/styles.css", import.meta.url), "utf8");
const workflow = app.slice(app.lastIndexOf("/* v2.1.107 -- native mobile camera scanner"));

assert.match(workflow, />Scan 1 Count 1<|Scan 1 Count 1/, "the first visible scan mode must use the requested label");
assert.match(workflow, />Scan 1 Count Multiple<|Scan 1 Count Multiple/, "the second visible scan mode must use the requested label");
assert.doesNotMatch(workflow, /Scan Each Item|Scan Once \+ Qty/, "retired scan labels must not remain in the active refill workflow");
assert.match(workflow, /refillCameraScanButtonV2212[\s\S]*?aria-label="Scan barcode with camera"/, "mobile camera control must be accessible");
assert.match(workflow, /window\.BarcodeDetector[\s\S]*?navigator\.mediaDevices\?\.getUserMedia/, "camera scanning must feature-detect native browser support");
assert.match(workflow, /window\.ZXingBrowser\?\.BrowserMultiFormatReader[\s\S]*?decodeFromConstraints/, "Safari must receive the bundled ZXing fallback when BarcodeDetector is unavailable");
assert.match(workflow, /facingMode:\s*\{ ideal: 'environment' \}/, "camera scanning must prefer the rear camera");
assert.match(workflow, /const accepted = processScan\(scanned\)/, "camera values must use the existing barcode verification function");
assert.match(workflow, /verified = true[\s\S]*?onceQuantity\.hidden = false[\s\S]*?qtyInput\.disabled = false[\s\S]*?qtyInput\.focus\(\)/, "manual and camera verification must reveal and focus the compact quantity panel through the shared flow");
assert.match(workflow, /let latchedCameraBarcode = ''[\s\S]*?scanned === latchedCameraBarcode/, "continuous video frames must be latched while visible");
assert.match(workflow, /lastCameraSeenAt < 450 \|\| !latchedCameraBarcode[\s\S]*?latchedCameraBarcode = ''/, "continuous video frames must rearm after the barcode leaves view");
assert.match(workflow, /mode === 'once'[\s\S]*?cameraStopTimer = window\.setTimeout[\s\S]*?stopCamera\(\)/, "the multiple-count mode must close the camera after one accepted verification");
assert.match(workflow, /track => track\.stop\(\)/, "camera media tracks must be released");
assert.match(workflow, /zxingControls\?\.stop\(\)/, "fallback scanner controls must be released");
assert.match(workflow, /stopCamera\(\);\s*activeRefillCameraStopV2212 = stopCamera;/, "a reopened camera must remain registered for modal and navigation cleanup");
assert.match(workflow, /closeModal = function\(\)[\s\S]*?stopActiveRefillCameraV2212\(\)/, "closing the modal must release an active scanner");
assert.match(workflow, /navigate = async function\(\)[\s\S]*?stopActiveRefillCameraV2212\(\)/, "page navigation must release an active scanner");
assert.match(workflow, /NotAllowedError[\s\S]*?Camera access was denied\. Allow camera access or enter the barcode manually\./, "permission denial must use the requested friendly fallback text");
assert.match(css, /@media \(max-width:767px\)[\s\S]*?refill-camera-trigger-v2212/, "camera trigger must be mobile-only");
assert.match(css, /padding-right:48px/, "mobile barcode input must reserve space for the camera control");

console.log("PASS - refill camera scanner contract.");

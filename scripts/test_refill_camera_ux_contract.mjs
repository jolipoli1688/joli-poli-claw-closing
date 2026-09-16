import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../web/assets/app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../web/assets/styles.css", import.meta.url), "utf8");
const workflow = app.slice(app.lastIndexOf("/* v2.1.107 -- native mobile camera scanner"));

assert.match(workflow, /refill-camera-preview-v2215[\s\S]*?refill-camera-scan-zone-v2215[\s\S]*?refill-camera-guidance-v2215/, "camera preview must include a scan zone and text guidance");
assert.match(workflow, /setCameraUiState[\s\S]*?cameraPane\.dataset\.cameraState/, "scanner presentation must use explicit state data separate from detection");
assert.match(workflow, /'starting', 'Starting camera…', 'Preparing secure camera preview'/, "camera startup must be explained");
assert.match(workflow, /'scanning', 'Scanning…', 'Place barcode inside the frame'/, "active scanning must have clear guidance");
assert.match(workflow, /'success', '✓ \+1', 'Total scanned: ' \+ scannedQty/, "Count 1 must show its immediate count confirmation");
assert.match(workflow, /'closing', 'Scan complete', 'Returning to the refill entry'/, "successful scans must progress to a closing state instead of re-arming");
assert.match(workflow, /'wrong', 'Wrong barcode', 'Expected: ' \+ targetBarcode \+ ' · Scanned: ' \+ scanned/, "wrong scans must explain expected and scanned values");
assert.match(workflow, /'success', '✓ Product verified', 'Opening the quantity entry'/, "Count Multiple must visibly confirm product verification");
assert.match(workflow, /navigator\.vibrate\?\.|vibrateCameraFeedback/, "scanner feedback must use vibration only when supported");
assert.match(css, /@media \(max-width:767px\)[\s\S]*?refill-camera-scan-zone-v2215/, "scan-zone UX must be mobile scoped");
assert.match(css, /width:86%[\s\S]*?height:clamp\(110px,31vw,142px\)/, "scan zone must be a landscape mobile barcode frame");
assert.match(css, /box-shadow:0 0 0 999px/, "outside of the scan zone must receive a subtle overlay");
assert.match(css, /refill-camera-scan-v2215[\s\S]*?prefers-reduced-motion/, "scan-line animation must respect reduced motion");
assert.match(css, /data-camera-state="success"[\s\S]*?data-camera-state="wrong"/, "success and wrong states must be visually distinct");
assert.match(css, /data-camera-state="closing"[\s\S]*?opacity:0/, "successful camera close must use a subtle fade");

assert.doesNotMatch(workflow, /ready-next|rearmCameraBarcode|cameraEachScanPendingRearm/, "Count 1 must not retain the repeated-scan re-arm workflow");

console.log("PASS - mobile refill camera scanner UX contract.");

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const app = readFileSync(new URL("../web/assets/app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
const bundle = readFileSync(new URL("./build_vercel_production_bundle.mjs", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

assert.equal(packageJson.dependencies?.["@zxing/browser"], "0.2.1", "the fallback library must be locked as a local dependency");
assert.ok(existsSync(new URL("../web/assets/zxing-browser.min.js", import.meta.url)), "the browser fallback must be vendored into web assets");
assert.match(html, /zxing-browser\.min\.js[\s\S]*?app\.js/, "the local ZXing asset must load before the application");
assert.match(bundle, /"zxing-browser\.min\.js"/, "the Cloud bundle must copy the scanner asset");
assert.match(app, /autoplay muted playsinline/, "the mobile preview must remain inline on iPhone Safari");
assert.match(app, /typeof Detector === 'function'\) await openNativeCamera[\s\S]*?else await openZxingCamera/, "native BarcodeDetector must remain preferred before fallback");
assert.match(app, /BrowserMultiFormatReader[\s\S]*?decodeFromConstraints[\s\S]*?result\.getText\(\)/, "fallback results must flow through the camera scan handler");
assert.match(app, /processCameraDetection[\s\S]*?const accepted = processScan\(scanned\)/, "native and fallback scanners must share verification behavior");
assert.doesNotMatch(app, /Camera scanning is not available on this browser/, "native absence must not leave the old unsupported-browser failure");
assert.match(app, /Camera access was denied\. Allow camera access or enter the barcode manually\./, "permission denial must be actionable");
assert.match(app, /No camera is available\. Enter the barcode manually\./, "missing camera must be actionable");

console.log("PASS - Safari/iPhone ZXing barcode fallback contract.");

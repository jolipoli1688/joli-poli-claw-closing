import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../web/assets/app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../web/assets/styles.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
const refillWorkflow = app.slice(app.lastIndexOf("showRefillProductModalV2144 = async function"));

assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1"/, "viewport must retain normal browser zoom behavior");
assert.doesNotMatch(html, /user-scalable\s*=\s*no|maximum-scale/i, "viewport must not disable pinch zoom");
assert.match(css, /@media \(max-width:767px\)[\s\S]*?\.refill-verification-modal-v2211 input,[\s\S]*?font-size:16px !important/, "all Refill editable controls must be at least 16px on mobile");
assert.match(css, /\.refill-verification-modal-v2211 \{[^}]*?display:flex;[^}]*?flex-direction:column;[^}]*?max-height:calc\(100dvh - 16px\);[^}]*?overflow:hidden/, "modal must be a dynamic-viewport flex shell");
assert.match(css, /\.refill-verification-modal-v2211 \.modal-body \{[^}]*?flex:1 1 auto;[^}]*?min-height:0;[^}]*?overflow-y:auto/, "only the modal body must own content scrolling");
assert.match(css, /\.refill-verification-modal-v2211 \.modal-footer \{[^}]*?position:static/, "footer must remain in the flex shell rather than use a sticky nested layout");
assert.match(css, /\.refill-verification-modal-v2211 \.refill-cell-history-list \{ max-height:none; overflow:visible; \}/, "scan history must flow inside modal-body rather than create a nested scroller");
assert.match(css, /\.refill-barcode-input-wrap-v2212 \.input,[\s\S]*?height:48px; min-height:48px/, "barcode and quantity controls must retain touch height");
assert.match(css, /\.refill-adjusted-by-v2211 \.input \{ height:50px; min-height:50px; \}/, "Adjusted By must retain touch height");
assert.match(css, /@media \(max-width:359px\)[\s\S]*?\.refill-scan-methods-v2211 \{ grid-template-columns:1fr; \}/, "scan methods may stack only at very narrow widths");
assert.match(app, /function setRefillModalScrollLockV2217\(locked\)[\s\S]*?document\.body\.classList\.toggle\('refill-modal-open-v2217'/, "Refill modal must own a reversible page scroll lock");
assert.match(app, /closeModal = function\(\) \{\s*setRefillModalScrollLockV2217\(false\)/, "closing any modal must release the lock");
assert.match(refillWorkflow, /refill-verification-modal-v2211'\);\s*setRefillModalScrollLockV2217\(true\)/, "only the active Refill modal must enable the page lock");
assert.doesNotMatch(refillWorkflow, /scrollIntoView|window\.scrollTo|visualViewport/, "the active Refill workflow must not force viewport movement for keyboard focus");
assert.doesNotMatch(css.match(/\.refill-verification-modal-v2211 \{[^}]*\}/)?.[0] ?? "", /transform\s*:\s*scale/i, "the modal shell must not use scale-based layout");

console.log("PASS - mobile Refill modal dynamic viewport, scrolling, and keyboard-zoom contract.");

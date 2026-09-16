"use strict";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [edge, app, styles] = await Promise.all([
  read("../supabase/functions/claw-api/index.ts"),
  read("../web/assets/app.js"),
  read("../web/assets/styles.css"),
]);

assert.match(edge, /async function hydrateClosingProductImages\(ctx: Context, closing: any, machines: any\[\]\)/, "closing detail must hydrate product images at the Edge");
assert.match(edge, /const snapshotPath = String\(product\.image_object_key_snapshot \|\| ""\)/, "the persisted snapshot path must be the first image source");
assert.match(edge, /const imagePath = snapshotPath \|\| \(closing\.status === "draft" \? masterImagePaths\.get/, "only Drafts may use the current master image fallback");
assert.match(edge, /from\("machine_styles"\)\.select\("id,image_path,machines!inner\(store_id\)"\)/, "the Draft fallback must stay store-scoped");
assert.match(edge, /storage\.from\(IMAGE_BUCKET\)\.createSignedUrl\(imagePath, 300\)/, "private snapshot or fallback paths must be signed on read");
assert.match(edge, /image_file: imagePath, image_url: signed\.data\?\.signedUrl \|\| ""/, "the response must carry a short-lived URL rather than persist one");
assert.match(edge, /Image_File: product\.image_file \|\| "", Image_URL: product\.image_url \|\| "", image_object_key_snapshot:/, "flattened closing products must retain the signed URL and snapshot path");

assert.match(app, /const signedImageUrl = String\(row\.Image_URL \|\| row\.image_url \|\| ""\)/, "opening a closing must retain the Edge-signed URL");
assert.match(app, /image_url: signedImageUrl \|\| \(!isCloudStaging\(\) && imageFile \? `\/api\/machine-images/, "Cloud hydration must not replace a missing signed URL with a local-only route");
assert.match(app, /if \(isCloudStaging\(\) && state\.closingId\) await openClosing\(state\.closingId\)/, "image saves must refresh the active closing from persisted Cloud data");
assert.match(app, /function productThumbnail\(product, size = "small"\)[\s\S]*?productImageUrl\(product\)/, "Daily Closing and Review thumbnails must render from image_url");
assert.match(app, /const signedImageUrl = String\(item\?\.Image_URL \?\? item\?\.image_url \?\? ''\)/, "History detail must retain the signed URL");

const sharedReview = styles.slice(styles.lastIndexOf("/* v2.1.97 -- shared Review components"));
assert.match(sharedReview, /#page-closing \.product-closing-table thead th \{[\s\S]*?background:var\(--surface-primary\) !important;[\s\S]*?color:var\(--text-primary\) !important;/, "the live Review table header must provide the printable light component style");
assert.match(styles, /#page-closing \.product-thumb/, "print must use existing product thumbnail elements through the visible Review DOM");
assert.match(sharedReview, /printing-live-review-v2197[\s\S]*?display:table-header-group[\s\S]*?break-inside:avoid/, "print must retain native table-header repetition and natural row breaks");
assert.match(app, /Invoice No/, "Review keeps the business invoice label");

console.log("PASS - persisted closing product images are signed, hydrated, refreshed, and printed from the live Review DOM.");

// LOCAL DRAFT ONLY. Deploy only after a dedicated staging project is approved.
// Required operation order: authorize -> validate -> upload -> DB reference ->
// delete old object; delete the new object if the reference update fails.
// The implementation intentionally has no project URL/key defaults.
export interface ImageReplacementRequest { storeId: string; machineStyleId: string; contentType: "image/jpeg" | "image/png" | "image/webp"; bytes: Uint8Array; }
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export function validateImageReplacement(input: ImageReplacementRequest): void {
  if (!input.storeId || !input.machineStyleId) throw new Error("Store and machine style are required.");
  if (!input.bytes?.byteLength || input.bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("Image must be between 1 byte and 5 MB.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(input.contentType)) throw new Error("Only JPEG, PNG, and WebP images are accepted.");
}
// A production handler must receive the authenticated JWT, verify style->store
// ownership, generate the object key server-side, and write an audit record.

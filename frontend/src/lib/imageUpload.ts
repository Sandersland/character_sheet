// Mirrors the backend's PORTRAIT_MAX_UPLOAD_BYTES and reencodePortrait whitelist as a UX nicety only — the server re-validates from the actual bytes.
export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;

// No "image/jpg" here, unlike the backend whitelist: File.type is browser-set and browsers always report "image/jpeg".
export const ACCEPTED_IMAGE_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];

export type ImageFileValidation = { ok: true } | { ok: false; message: string };

export function validateImageFile(file: File): ImageFileValidation {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return {
      ok: false,
      message: "That file isn't a supported image — use a JPEG, PNG, WebP, GIF, or AVIF.",
    };
  }
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    return {
      ok: false,
      message: `That image is too large — the limit is ${MAX_IMAGE_UPLOAD_BYTES / (1024 * 1024)} MB.`,
    };
  }
  return { ok: true };
}

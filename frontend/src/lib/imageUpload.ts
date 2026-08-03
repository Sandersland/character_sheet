// Client-side pre-checks for image uploads (portraits, #1616). Mirrors the
// backend's PORTRAIT_MAX_UPLOAD_BYTES and its declared-type whitelist
// (reencodePortrait) as a UX nicety only — the server re-validates from the
// actual bytes, so drift here can never admit a bad upload, just show a less
// helpful refusal.
export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;

export const ACCEPTED_IMAGE_TYPES: readonly string[] = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];

export type ImageFileValidation = { ok: true } | { ok: false; message: string };

// Refuses obvious non-images and oversized files before any network request,
// with a distinct message per failure so the user knows what to change.
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

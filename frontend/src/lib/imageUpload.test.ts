import { describe, expect, it } from "vitest";

import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_UPLOAD_BYTES,
  validateImageFile,
} from "@/lib/imageUpload";

function fileOf(type: string, bytes = 4): File {
  return new File([new Uint8Array(bytes)], "test-file", { type });
}

describe("validateImageFile", () => {
  it.each(ACCEPTED_IMAGE_TYPES)("accepts a small %s file", (type) => {
    expect(validateImageFile(fileOf(type))).toEqual({ ok: true });
  });

  it("refuses a non-image type with the format message", () => {
    const result = validateImageFile(fileOf("text/plain"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/isn't a supported image/);
  });

  it("refuses an empty type (unknown file) rather than passing it through", () => {
    expect(validateImageFile(fileOf("")).ok).toBe(false);
  });

  it("refuses SVG — matches the backend's raster-only whitelist", () => {
    expect(validateImageFile(fileOf("image/svg+xml")).ok).toBe(false);
  });

  it("accepts a file exactly at the byte cap", () => {
    expect(validateImageFile(fileOf("image/png", MAX_IMAGE_UPLOAD_BYTES))).toEqual({ ok: true });
  });

  it("refuses a file one byte over the cap with the size message", () => {
    const result = validateImageFile(fileOf("image/png", MAX_IMAGE_UPLOAD_BYTES + 1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/too large.*5 MB/);
  });

  it("reports the format problem first for a file failing both checks", () => {
    const result = validateImageFile(fileOf("text/plain", MAX_IMAGE_UPLOAD_BYTES + 1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/isn't a supported image/);
  });
});

import { describe, expect, it } from "vitest";
import sharp from "sharp";

import {
  PORTRAIT_MAX_UPLOAD_BYTES,
  PortraitImageError,
  reencodePortrait,
} from "../portrait-image.js";

// Fixture images are generated with sharp at runtime — no binary fixtures in
// the repo. The route-level pipeline is covered in portrait.test.ts; this file
// pins the helper's own contract for its other consumer (#1617).
describe("reencodePortrait", () => {
  it("re-encodes every whitelisted format to webp, accepting its declared type", async () => {
    const base = sharp({ create: { width: 32, height: 32, channels: 3, background: "#123456" } });
    for (const [format, mime] of [
      ["jpeg", "image/jpeg"],
      ["png", "image/png"],
      ["webp", "image/webp"],
      ["gif", "image/gif"],
      ["avif", "image/avif"],
    ] as const) {
      const input = await base.clone().toFormat(format).toBuffer();
      const output = await reencodePortrait(input, mime);
      expect((await sharp(output).metadata()).format).toBe("webp");
    }
  });

  it("accepts the common image/jpg alias for JPEG bytes", async () => {
    const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#000" } })
      .jpeg()
      .toBuffer();

    await expect(reencodePortrait(jpeg, "image/jpg")).resolves.toBeInstanceOf(Buffer);
  });

  it("caps the long edge at 512 without enlarging small images", async () => {
    const wide = await sharp({ create: { width: 1024, height: 256, channels: 3, background: "#abc" } })
      .png()
      .toBuffer();
    const wideOut = await sharp(await reencodePortrait(wide, "image/png")).metadata();
    expect(wideOut.width).toBe(512);
    expect(wideOut.height).toBe(128);

    const small = await sharp({ create: { width: 100, height: 60, channels: 3, background: "#abc" } })
      .png()
      .toBuffer();
    const smallOut = await sharp(await reencodePortrait(small, "image/png")).metadata();
    expect(smallOut.width).toBe(100);
    expect(smallOut.height).toBe(60);
  });

  it("rejects a declared type that does not match the bytes", async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#000" } })
      .png()
      .toBuffer();

    await expect(reencodePortrait(png, "image/jpeg")).rejects.toBeInstanceOf(PortraitImageError);
  });

  it("rejects undecodable bytes", async () => {
    await expect(
      reencodePortrait(Buffer.from("not an image"), "image/png"),
    ).rejects.toBeInstanceOf(PortraitImageError);
  });

  it("rejects a sniffable but off-whitelist format (SVG)", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>');

    await expect(reencodePortrait(svg, "image/svg+xml")).rejects.toBeInstanceOf(PortraitImageError);
  });

  it("carries the 400 status the errorHandler maps", async () => {
    const error = await reencodePortrait(Buffer.from("junk"), "image/png").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PortraitImageError);
    expect((error as PortraitImageError).status).toBe(400);
  });

  it("pins the 5 MB cross-plan upload cap (#1616/#1617)", () => {
    expect(PORTRAIT_MAX_UPLOAD_BYTES).toBe(5 * 1024 * 1024);
  });
});

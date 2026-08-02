import sharp from "sharp";

// 5 MB upload cap — the cross-plan contract pinned with the upload UI (#1616)
// and entity portraits (#1617); portraitMultipart enforces it pre-decode.
export const PORTRAIT_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// Every stored portrait is what reencodePortrait emits — webp, ≤512px long
// edge — regardless of what was uploaded, so serving code can pin this type.
export const PORTRAIT_CONTENT_TYPE = "image/webp";

const PORTRAIT_EDGE_PX = 512;

export class PortraitImageError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "PortraitImageError";
  }
}

// Input whitelist: raster formats only. SVG is deliberately absent — sharp can
// sniff and even rasterize it, but as a document format it's the classic
// stored-XSS/script-smuggling carrier. Values are the declared Content-Types
// accepted for each sniffed format ("image/jpg" is a common non-IANA alias
// browsers still emit for drag-dropped files).
const ACCEPTED_MIME_BY_FORMAT: Readonly<Record<string, readonly string[]>> = {
  jpeg: ["image/jpeg", "image/jpg"],
  png: ["image/png"],
  webp: ["image/webp"],
  gif: ["image/gif"],
  avif: ["image/avif"],
};

/**
 * Validates and normalizes an uploaded portrait: sniffs the REAL format from
 * the bytes (never trusting the declared Content-Type), whitelists it, checks
 * the declaration matches the bytes, then re-encodes to a ≤512px webp.
 *
 * The re-encode is itself the security boundary: output pixels are freshly
 * produced by libvips, so any polyglot payload riding the original container
 * does not survive, and sharp's default metadata strip (plus the no-arg
 * .rotate(), which bakes EXIF orientation into the pixels first — otherwise
 * phone photos land sideways) drops EXIF/GPS. Throws PortraitImageError
 * (status 400) for anything undecodable, off-whitelist, or misdeclared.
 */
export async function reencodePortrait(input: Buffer, declaredContentType: string): Promise<Buffer> {
  let sniffed: { format?: string; compression?: string };
  try {
    sniffed = await sharp(input).metadata();
  } catch {
    throw new PortraitImageError("Uploaded file is not a decodable image");
  }

  // sharp reports AVIF as its HEIF container with av1 compression; other HEIF
  // flavors (HEIC/hevc) are patent-encumbered and undecodable by the prebuilt
  // binaries, so only the av1 case maps back onto the whitelist.
  const format =
    sniffed.format === "heif" && sniffed.compression === "av1" ? "avif" : sniffed.format;
  const acceptedMimes = format ? ACCEPTED_MIME_BY_FORMAT[format] : undefined;
  if (!acceptedMimes) {
    throw new PortraitImageError(
      `Unsupported image format${format ? ` "${format}"` : ""} — upload JPEG, PNG, WebP, GIF, or AVIF`,
    );
  }
  if (!acceptedMimes.includes(declaredContentType.toLowerCase())) {
    throw new PortraitImageError(
      `Declared Content-Type "${declaredContentType}" does not match the uploaded ${format} image`,
    );
  }

  try {
    return await sharp(input)
      .rotate()
      .resize(PORTRAIT_EDGE_PX, PORTRAIT_EDGE_PX, { fit: "inside", withoutEnlargement: true })
      .webp()
      .toBuffer();
  } catch {
    // metadata() only reads the header — a truncated/corrupt body can still
    // fail at full decode, which is the client's fault, not a 500.
    throw new PortraitImageError("Uploaded image could not be decoded");
  }
}

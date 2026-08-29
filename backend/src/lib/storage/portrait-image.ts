import sharp from "sharp";

// #1616: cross-plan contract pinned with the upload UI; portraitMultipart enforces it pre-decode.
export const PORTRAIT_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// What reencodePortrait always emits regardless of what was uploaded, so serving code can pin this type.
export const PORTRAIT_CONTENT_TYPE = "image/webp";

const PORTRAIT_EDGE_PX = 512;

export class PortraitImageError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "PortraitImageError";
  }
}

// SVG is deliberately absent — sharp can sniff and rasterize it, but as a document format it's a classic stored-XSS/script-smuggling carrier. "image/jpg" is a common non-IANA alias accepted alongside "image/jpeg" so a programmatic client declaring it over honest JPEG bytes doesn't 400.
const ACCEPTED_MIME_BY_FORMAT: Readonly<Record<string, readonly string[]>> = {
  jpeg: ["image/jpeg", "image/jpg"],
  png: ["image/png"],
  webp: ["image/webp"],
  gif: ["image/gif"],
  avif: ["image/avif"],
};

// The re-encode is itself the security boundary: output pixels are freshly produced by libvips, so any polyglot payload riding the original container does not survive, and sharp's default metadata strip drops EXIF/GPS.
export async function reencodePortrait(input: Buffer, declaredContentType: string): Promise<Buffer> {
  let sniffed: { format?: string; compression?: string };
  try {
    sniffed = await sharp(input).metadata();
  } catch {
    throw new PortraitImageError("Uploaded file is not a decodable image");
  }

  // sharp reports AVIF as its HEIF container with av1 compression; other HEIF flavors are undecodable by the prebuilt binaries, so only av1 maps back.
  const format =
    sniffed.format === "heif" && sniffed.compression === "av1" ? "avif" : sniffed.format;
  const acceptedMimes = format ? ACCEPTED_MIME_BY_FORMAT[format] : undefined;
  if (!acceptedMimes) {
    throw new PortraitImageError(
      `Unsupported image format${format ? ` "${format}"` : ""} — upload JPEG, PNG, WebP, GIF, or AVIF`,
    );
  }
  // A declared Content-Type may legally carry parameters ("image/jpeg; charset=utf-8") that would fail an exact-string match.
  const declaredType = declaredContentType.split(";")[0].trim().toLowerCase();
  if (!acceptedMimes.includes(declaredType)) {
    throw new PortraitImageError(
      `Declared Content-Type "${declaredContentType}" does not match the uploaded ${format} image`,
    );
  }

  try {
    // .webp() without {animated: true} keeps only a GIF's first frame — deliberate, since portraits are static.
    return await sharp(input)
      .rotate()
      .resize(PORTRAIT_EDGE_PX, PORTRAIT_EDGE_PX, { fit: "inside", withoutEnlargement: true })
      .webp()
      .toBuffer();
  } catch {
    // metadata() only reads the header — a truncated/corrupt body can still fail at full decode, which is a client fault, not a 500.
    throw new PortraitImageError("Uploaded image could not be decoded");
  }
}

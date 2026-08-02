import type { RequestHandler, Response } from "express";
import multer from "multer";

import type { BlobObject } from "./blob-store.js";
import { PORTRAIT_MAX_UPLOAD_BYTES } from "./portrait-image.js";

// The multipart field name — the cross-plan contract pinned with the upload UI
// (#1616) and entity portraits (#1617), like PORTRAIT_MAX_UPLOAD_BYTES.
export const PORTRAIT_FIELD = "portrait";

// Safe to cache this hard ONLY because the wire URL is versioned (?v=<uuid>,
// see derivePortraitUrl): a re-upload changes the URL, never the bytes behind
// an old one. `private` keeps shared proxies from caching an authed response.
export const PORTRAIT_CACHE_CONTROL = "private, max-age=31536000, immutable";

class PortraitTooLargeError extends Error {
  readonly status = 413;
  constructor() {
    super(`Portrait exceeds the ${PORTRAIT_MAX_UPLOAD_BYTES / (1024 * 1024)} MB limit`);
    this.name = "PortraitTooLargeError";
  }
}

// Memory storage on purpose: the buffer feeds reencodePortrait directly and
// the 5 MB cap bounds it — no temp files to clean up. Mount an authorization
// check BEFORE this middleware so an unauthorized caller never makes us
// buffer a body.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PORTRAIT_MAX_UPLOAD_BYTES, files: 1 },
}).single(PORTRAIT_FIELD);

/**
 * Parses the single-file `portrait` multipart part onto `req.file`, mapping
 * multer's errors onto the app's status-carrying error contract: the size
 * limit becomes 413, every other MulterError (wrong field name, extra files —
 * all client faults) becomes 400 instead of multer's status-less default
 * falling through to a 500.
 */
export const portraitMultipart: RequestHandler = (req, res, next) => {
  upload(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        next(new PortraitTooLargeError());
        return;
      }
      next(Object.assign(new Error(`Invalid upload: ${err.message}`), { status: 400 }));
      return;
    }
    next(err);
  });
};

// Streams a stored portrait blob with the immutable cache contract above.
// Shared with entity portraits (#1617) alongside portraitMultipart.
export function sendPortrait(res: Response, blob: BlobObject): void {
  res.setHeader("Content-Type", blob.contentType);
  res.setHeader("Content-Length", String(blob.size));
  res.setHeader("Cache-Control", PORTRAIT_CACHE_CONTROL);
  // Headers are already sent once piping starts, so the terminal errorHandler
  // can't emit JSON — destroy the response and let the client see a truncated
  // transfer instead of a hung request.
  blob.body.on("error", (err) => res.destroy(err));
  blob.body.pipe(res);
}

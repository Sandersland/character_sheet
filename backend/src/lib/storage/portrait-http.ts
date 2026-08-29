import type { RequestHandler, Response } from "express";
import multer from "multer";

import { NotFoundError } from "@/lib/auth/errors.js";
import { BlobNotFoundError, type BlobObject } from "./blob-store.js";
import { getBlobStore } from "./index.js";
import { PORTRAIT_MAX_UPLOAD_BYTES } from "./portrait-image.js";

// Cross-plan contract pinned with the upload UI (#1616), like PORTRAIT_MAX_UPLOAD_BYTES.
export const PORTRAIT_FIELD = "portrait";

// Safe to cache this hard only because the wire URL is versioned (?v=<uuid>): a re-upload changes the URL, never the bytes behind an old one.
export const PORTRAIT_CACHE_CONTROL = "private, max-age=31536000, immutable";

class PortraitTooLargeError extends Error {
  readonly status = 413;
  constructor() {
    super(`Portrait exceeds the ${PORTRAIT_MAX_UPLOAD_BYTES / (1024 * 1024)} MB limit`);
    this.name = "PortraitTooLargeError";
  }
}

// Mount an authorization check BEFORE this middleware so an unauthorized caller never makes us buffer a body.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PORTRAIT_MAX_UPLOAD_BYTES, files: 1 },
}).single(PORTRAIT_FIELD);

// Maps multer's errors onto the app's status-carrying error contract: the size limit becomes 413, every other MulterError becomes 400 instead of multer's status-less default falling through to a 500.
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

// Callers authorize first; a null key, or a stored key whose blob is gone, reads as 404, not a server fault.
export async function sendStoredPortrait(res: Response, portraitKey: string | null): Promise<void> {
  if (!portraitKey) throw new NotFoundError("Portrait not found");
  let blob: BlobObject;
  try {
    blob = await getBlobStore().get(portraitKey);
  } catch (error) {
    if (error instanceof BlobNotFoundError) throw new NotFoundError("Portrait not found");
    throw error;
  }
  sendPortrait(res, blob);
}

function sendPortrait(res: Response, blob: BlobObject): void {
  res.setHeader("Content-Type", blob.contentType);
  res.setHeader("Content-Length", String(blob.size));
  res.setHeader("Cache-Control", PORTRAIT_CACHE_CONTROL);
  // pipe() never destroys its source when the destination goes away — a client dropping mid-transfer would otherwise leak the blob stream.
  res.on("close", () => blob.body.destroy());
  // Headers are already sent once piping starts, so errorHandler can't emit JSON here — destroy the response instead of hanging the request.
  blob.body.on("error", (err) => res.destroy(err));
  blob.body.pipe(res);
}

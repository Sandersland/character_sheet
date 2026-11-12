import type { RequestHandler, Response } from "express";
import multer from "multer";

import { DomainError, NotFoundError, ValidationError } from "@/lib/core/errors.js";
import { BlobNotFoundError, type BlobObject } from "@/lib/storage/blob-store.js";
import { getBlobStore } from "@/lib/storage/index.js";
import { PORTRAIT_MAX_UPLOAD_BYTES } from "@/lib/storage/portrait-image.js";

// Cross-plan contract pinned with the upload UI (#1616), like PORTRAIT_MAX_UPLOAD_BYTES.
export const PORTRAIT_FIELD = "portrait";

// Safe to cache this hard only because the wire URL is versioned (?v=<uuid>): a re-upload changes the URL, never the bytes behind an old one.
export const PORTRAIT_CACHE_CONTROL = "private, max-age=31536000, immutable";

class PortraitTooLargeError extends DomainError {
  constructor() {
    super(`Portrait exceeds the ${PORTRAIT_MAX_UPLOAD_BYTES / (1024 * 1024)} MB limit`, 413);
  }
}

// Mount an authorization check BEFORE this middleware so an unauthorized caller never makes us buffer a body.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PORTRAIT_MAX_UPLOAD_BYTES, files: 1 },
}).single(PORTRAIT_FIELD);

// Maps multer's errors onto DomainError: the size limit becomes 413, every other MulterError becomes 400 instead of multer's status-less default falling through to a 500.
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
      next(new ValidationError(`Invalid upload: ${err.message}`));
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

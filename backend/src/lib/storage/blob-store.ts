import type { Readable } from "node:stream";

export interface PutOptions {
  contentType: string;
}

export interface BlobObject {
  body: Readable;
  contentType: string;
  size: number;
}

/**
 * Vendor-agnostic blob storage port (#1614). Signatures use Node primitives
 * only — no provider SDK type may appear here or escape a driver.
 *
 * Semantics every driver must honor (pinned by runBlobStoreContract):
 * - `get` of a missing key rejects with `BlobNotFoundError`.
 * - `delete` of a missing key is idempotent — it resolves without error, the
 *   native behavior of both S3 DeleteObject and `fs.rm` with force.
 * - Keys are `/`-separated segment paths, validated by `assertValidKey`.
 */
export interface BlobStore {
  put(key: string, body: Buffer, options: PutOptions): Promise<void>;
  get(key: string): Promise<BlobObject>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export class BlobNotFoundError extends Error {
  constructor(key: string) {
    super(`Blob not found: ${key}`);
    this.name = "BlobNotFoundError";
  }
}

// S3 would happily treat "../x" or "/x" as an opaque key, but the fs driver
// maps keys onto real paths — so the PORT defines the stricter rule and every
// driver enforces it, or the drivers would diverge on which keys are legal.
export function assertValidKey(key: string): void {
  const segments = key.split("/");
  const valid =
    key.length > 0 &&
    !key.includes("\\") &&
    !key.includes("\0") &&
    segments.every(
      (segment) => segment !== "" && segment !== "." && segment !== "..",
    );
  if (!valid) {
    throw new Error(
      `Invalid blob key "${key}": keys are non-empty /-separated segments, with no ".", "..", empty, or backslash segments`,
    );
  }
}

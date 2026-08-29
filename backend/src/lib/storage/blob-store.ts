import type { Readable } from "node:stream";

export interface PutOptions {
  contentType: string;
}

export interface BlobObject {
  body: Readable;
  contentType: string;
  size: number;
}

// #1614: vendor-agnostic blob storage port — signatures use Node primitives only, no provider SDK type may appear here or escape a driver. Semantics every driver must honor, pinned by runBlobStoreContract: `get` of a missing key rejects BlobNotFoundError; `delete` of a missing key is idempotent; keys are `/`-separated segments validated by assertValidKey.
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

// #1615: no `status` field on either error — a missing blob is not inherently an HTTP 404, the route consuming the store maps it.
export class BlobStoreConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlobStoreConfigError";
  }
}

export class BlobKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlobKeyError";
  }
}

// The fs driver maps keys onto real paths, so the port defines this stricter rule and every driver enforces it, or drivers would diverge on legal keys.
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
    throw new BlobKeyError(
      `Invalid blob key "${key}": keys are non-empty /-separated segments, with no ".", "..", empty, or backslash segments`,
    );
  }
}

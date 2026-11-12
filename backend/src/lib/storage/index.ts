import os from "node:os";
import path from "node:path";

import type { Config } from "@/lib/core/config.js";
import { config } from "@/lib/core/config.js";

import type { BlobStore } from "./blob-store.js";
import { BlobStoreConfigError } from "./blob-store.js";
import { createFsBlobStore } from "./fs-blob-store.js";
import { createS3BlobStore } from "./s3-blob-store.js";

// fallow-ignore-next-line unused-type -- PutOptions completes the port's public surface (BlobStore.put's options shape); in-tree callers pass it inline, so only an out-of-tree driver/consumer would import it
export type { BlobObject, BlobStore, PutOptions } from "./blob-store.js";
// fallow-ignore-next-line unused-export -- BlobKeyError completes the port's error surface (assertValidKey throws it); in-tree routes only ever build valid server-generated keys, so nothing catches it yet
export { BlobKeyError, BlobNotFoundError, BlobStoreConfigError } from "./blob-store.js";

export type StorageConfig = Pick<
  Config,
  | "isProd"
  | "BLOB_STORE_DRIVER"
  | "BLOB_FS_DIR"
  | "S3_ENDPOINT"
  | "S3_BUCKET"
  | "S3_REGION"
  | "S3_ACCESS_KEY_ID"
  | "S3_SECRET_ACCESS_KEY"
  | "S3_FORCE_PATH_STYLE"
>;

// Validates lazily so the backend boots with no storage env at all — outside production the driver defaults to `fs`; in production an unset driver is a misconfiguration and throws.
export function createBlobStore(cfg: StorageConfig = config): BlobStore {
  const driver = cfg.BLOB_STORE_DRIVER ?? (cfg.isProd ? undefined : "fs");
  if (!driver) {
    throw new BlobStoreConfigError(
      'BLOB_STORE_DRIVER must be set in production ("s3" or "fs")',
    );
  }
  if (driver === "fs") {
    return createFsBlobStore(
      cfg.BLOB_FS_DIR ?? path.join(os.tmpdir(), "character-sheet-blobs"),
    );
  }
  if (driver === "s3") {
    const { S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = cfg;
    const missing = [
      ["S3_BUCKET", S3_BUCKET],
      ["S3_ACCESS_KEY_ID", S3_ACCESS_KEY_ID],
      ["S3_SECRET_ACCESS_KEY", S3_SECRET_ACCESS_KEY],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);
    if (!S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
      throw new BlobStoreConfigError(
        `BLOB_STORE_DRIVER=s3 but missing env: ${missing.join(", ")}`,
      );
    }
    return createS3BlobStore({
      endpoint: cfg.S3_ENDPOINT,
      bucket: S3_BUCKET,
      // "auto" is R2's region and a valid signing region for MinIO/B2/Spaces; real AWS S3 needs S3_REGION set explicitly.
      region: cfg.S3_REGION ?? "auto",
      accessKeyId: S3_ACCESS_KEY_ID,
      secretAccessKey: S3_SECRET_ACCESS_KEY,
      forcePathStyle: cfg.S3_FORCE_PATH_STYLE?.toLowerCase() !== "false",
    });
  }
  throw new BlobStoreConfigError(
    `Unknown BLOB_STORE_DRIVER "${driver}" (expected "s3" or "fs")`,
  );
}

let _store: BlobStore | undefined;

// #1657: the process-wide store — production call sites go through here rather than createBlobStore so the s3 driver's S3Client and its pooled connections are constructed once per process instead of per request.
export function getBlobStore(): BlobStore {
  return (_store ??= createBlobStore(config));
}

// Route tests point the process-wide store at a per-test tmpdir; passing nothing clears the memo so the next getBlobStore rebuilds from config.
export function __setBlobStoreForTests(store?: BlobStore): void {
  _store = store;
}

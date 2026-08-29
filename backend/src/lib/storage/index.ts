import os from "node:os";
import path from "node:path";

import type { BlobStore } from "./blob-store.js";
import { BlobStoreConfigError } from "./blob-store.js";
import { createFsBlobStore } from "./fs-blob-store.js";
import { createS3BlobStore } from "./s3-blob-store.js";

// fallow-ignore-next-line unused-type -- PutOptions completes the port's public surface (BlobStore.put's options shape); in-tree callers pass it inline, so only an out-of-tree driver/consumer would import it
export type { BlobObject, BlobStore, PutOptions } from "./blob-store.js";
// fallow-ignore-next-line unused-export -- BlobKeyError completes the port's error surface (assertValidKey throws it); in-tree routes only ever build valid server-generated keys, so nothing catches it yet
export { BlobKeyError, BlobNotFoundError, BlobStoreConfigError } from "./blob-store.js";

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

// Reads env at call time, not import time, so the backend boots with no storage env at all — outside production the driver defaults to `fs`; in production an unset driver is a misconfiguration and throws.
export function createBlobStore(): BlobStore {
  const driver =
    readEnv("BLOB_STORE_DRIVER") ??
    (process.env.NODE_ENV === "production" ? undefined : "fs");
  if (!driver) {
    throw new BlobStoreConfigError(
      'BLOB_STORE_DRIVER must be set in production ("s3" or "fs")',
    );
  }
  if (driver === "fs") {
    return createFsBlobStore(
      readEnv("BLOB_FS_DIR") ?? path.join(os.tmpdir(), "character-sheet-blobs"),
    );
  }
  if (driver === "s3") {
    const required = ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"];
    const missing = required.filter((name) => !readEnv(name));
    if (missing.length > 0) {
      throw new BlobStoreConfigError(
        `BLOB_STORE_DRIVER=s3 but missing env: ${missing.join(", ")}`,
      );
    }
    return createS3BlobStore({
      endpoint: readEnv("S3_ENDPOINT"),
      bucket: readEnv("S3_BUCKET") as string,
      // "auto" is R2's region and a valid signing region for MinIO/B2/Spaces; real AWS S3 needs S3_REGION set explicitly.
      region: readEnv("S3_REGION") ?? "auto",
      accessKeyId: readEnv("S3_ACCESS_KEY_ID") as string,
      secretAccessKey: readEnv("S3_SECRET_ACCESS_KEY") as string,
      forcePathStyle: readEnv("S3_FORCE_PATH_STYLE")?.toLowerCase() !== "false",
    });
  }
  throw new BlobStoreConfigError(
    `Unknown BLOB_STORE_DRIVER "${driver}" (expected "s3" or "fs")`,
  );
}

let _store: BlobStore | undefined;

// #1657: the process-wide store — production call sites go through here rather than createBlobStore so the s3 driver's S3Client and its pooled connections are constructed once per process instead of per request.
export function getBlobStore(): BlobStore {
  return (_store ??= createBlobStore());
}

// Route tests stub BLOB_FS_DIR per test/suite; without a reset the memo would pin the first tmpdir for the rest of the process.
export function __resetBlobStoreForTests(): void {
  _store = undefined;
}

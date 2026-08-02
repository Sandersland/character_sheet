import { access, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BlobStoreConfigError, createBlobStore } from "../index.js";

describe("createBlobStore", () => {
  beforeEach(() => {
    // Clean slate: an ambient BLOB_STORE_DRIVER or S3_* var must not leak into
    // a "missing config" assertion.
    for (const name of [
      "BLOB_STORE_DRIVER",
      "BLOB_FS_DIR",
      "S3_ENDPOINT",
      "S3_BUCKET",
      "S3_REGION",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
      "S3_FORCE_PATH_STYLE",
    ]) {
      vi.stubEnv(name, "");
    }
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("selects the fs driver from BLOB_STORE_DRIVER=fs and honors BLOB_FS_DIR", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "blob-factory-test-"));
    vi.stubEnv("BLOB_STORE_DRIVER", "fs");
    vi.stubEnv("BLOB_FS_DIR", dir);

    const store = createBlobStore();
    await store.put("proof.txt", Buffer.from("x"), { contentType: "text/plain" });

    await expect(access(path.join(dir, "objects", "proof.txt"))).resolves.toBeUndefined();
  });

  it("defaults to the fs driver outside production", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "blob-factory-test-"));
    vi.stubEnv("BLOB_FS_DIR", dir);

    const store = createBlobStore();
    await store.put("default.txt", Buffer.from("x"), { contentType: "text/plain" });

    expect(await store.exists("default.txt")).toBe(true);
  });

  it("throws in production when BLOB_STORE_DRIVER is unset", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(() => createBlobStore()).toThrow(BlobStoreConfigError);
    expect(() => createBlobStore()).toThrow(/BLOB_STORE_DRIVER/);
  });

  it("rejects an unknown driver by name", () => {
    vi.stubEnv("BLOB_STORE_DRIVER", "gcs");

    expect(() => createBlobStore()).toThrow(BlobStoreConfigError);
    expect(() => createBlobStore()).toThrow(/gcs/);
  });

  it("names every missing S3 var when the s3 driver is selected unconfigured", () => {
    vi.stubEnv("BLOB_STORE_DRIVER", "s3");
    vi.stubEnv("S3_BUCKET", "portraits");

    expect(() => createBlobStore()).toThrow(BlobStoreConfigError);
    expect(() => createBlobStore()).toThrow(
      /S3_ACCESS_KEY_ID.*S3_SECRET_ACCESS_KEY/,
    );
    expect(() => createBlobStore()).not.toThrow(/S3_BUCKET/);
  });

  it("constructs the s3 driver without network when fully configured", () => {
    vi.stubEnv("BLOB_STORE_DRIVER", "s3");
    vi.stubEnv("S3_ENDPOINT", "http://localhost:9100");
    vi.stubEnv("S3_BUCKET", "portraits");
    vi.stubEnv("S3_ACCESS_KEY_ID", "key");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "secret");

    const store = createBlobStore();
    expect(typeof store.put).toBe("function");
  });
});

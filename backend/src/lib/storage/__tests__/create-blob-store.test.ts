import { access, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { parseConfig } from "@/lib/core/config.js";

import {
  __setBlobStoreForTests,
  BlobStoreConfigError,
  createBlobStore,
  getBlobStore,
} from "../index.js";

function storageConfig(env: Record<string, string>) {
  return parseConfig({ DATABASE_URL: "postgres://unused", NODE_ENV: "test", ...env });
}

describe("createBlobStore", () => {
  it("selects the fs driver from BLOB_STORE_DRIVER=fs and honors BLOB_FS_DIR", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "blob-factory-test-"));
    const store = createBlobStore(storageConfig({ BLOB_STORE_DRIVER: "fs", BLOB_FS_DIR: dir }));
    await store.put("proof.txt", Buffer.from("x"), { contentType: "text/plain" });

    await expect(access(path.join(dir, "objects", "proof.txt"))).resolves.toBeUndefined();
  });

  it("defaults to the fs driver outside production", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "blob-factory-test-"));
    const store = createBlobStore(storageConfig({ BLOB_FS_DIR: dir }));
    await store.put("default.txt", Buffer.from("x"), { contentType: "text/plain" });

    expect(await store.exists("default.txt")).toBe(true);
  });

  it("throws in production when BLOB_STORE_DRIVER is unset", () => {
    const cfg = storageConfig({ NODE_ENV: "production" });

    expect(() => createBlobStore(cfg)).toThrow(BlobStoreConfigError);
    expect(() => createBlobStore(cfg)).toThrow(/BLOB_STORE_DRIVER/);
  });

  it("rejects an unknown driver by name", () => {
    const cfg = storageConfig({ BLOB_STORE_DRIVER: "gcs" });

    expect(() => createBlobStore(cfg)).toThrow(BlobStoreConfigError);
    expect(() => createBlobStore(cfg)).toThrow(/gcs/);
  });

  it("names every missing S3 var when the s3 driver is selected unconfigured", () => {
    const cfg = storageConfig({ BLOB_STORE_DRIVER: "s3", S3_BUCKET: "portraits" });

    expect(() => createBlobStore(cfg)).toThrow(BlobStoreConfigError);
    expect(() => createBlobStore(cfg)).toThrow(
      /S3_ACCESS_KEY_ID.*S3_SECRET_ACCESS_KEY/,
    );
    expect(() => createBlobStore(cfg)).not.toThrow(/S3_BUCKET/);
  });

  it("constructs the s3 driver without network when fully configured", () => {
    const store = createBlobStore(
      storageConfig({
        BLOB_STORE_DRIVER: "s3",
        S3_ENDPOINT: "http://localhost:9100",
        S3_BUCKET: "portraits",
        S3_ACCESS_KEY_ID: "key",
        S3_SECRET_ACCESS_KEY: "secret",
      }),
    );
    expect(typeof store.put).toBe("function");
  });
});

describe("getBlobStore", () => {
  afterEach(() => {
    __setBlobStoreForTests();
  });

  it("memoizes: every call returns the same instance", () => {
    __setBlobStoreForTests();
    const first = getBlobStore();
    expect(getBlobStore()).toBe(first);
  });

  it("serves an injected store, and rebuilds from config once cleared", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "blob-memo-test-"));
    const injected = createBlobStore(storageConfig({ BLOB_FS_DIR: dir }));
    __setBlobStoreForTests(injected);
    expect(getBlobStore()).toBe(injected);

    await injected.put("a.txt", Buffer.from("a"), { contentType: "text/plain" });
    await expect(access(path.join(dir, "objects", "a.txt"))).resolves.toBeUndefined();

    __setBlobStoreForTests();
    expect(getBlobStore()).not.toBe(injected);
  });
});

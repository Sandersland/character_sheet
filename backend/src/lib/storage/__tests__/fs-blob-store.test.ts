import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { BlobNotFoundError } from "../blob-store.js";
import { createFsBlobStore } from "../fs-blob-store.js";
import { runBlobStoreContract } from "./blob-store-contract.js";

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "blob-store-test-"));
}

runBlobStoreContract("fs driver", async () => createFsBlobStore(await tempDir()));

describe("createFsBlobStore", () => {
  const body = Buffer.from("payload");
  const options = { contentType: "text/plain" } as const;

  it("creates its target directory on first put", async () => {
    const dir = path.join(await tempDir(), "not", "yet", "created");
    const store = createFsBlobStore(dir);

    await store.put("a.txt", body, options);

    expect(await store.exists("a.txt")).toBe(true);
  });

  it("never exposes metadata as an object", async () => {
    const store = createFsBlobStore(await tempDir());
    await store.put("portrait", body, options);

    expect(await store.exists("portrait.meta.json")).toBe(false);
    expect(await store.exists("meta/portrait.json")).toBe(false);
  });

  it("treats a mid-delete crash state (data without meta) as not found", async () => {
    const dir = await tempDir();
    const store = createFsBlobStore(dir);
    await store.put("crashed", body, options);

    // Simulates a crash after delete's first rm: meta gone, data survives.
    await rm(path.join(dir, "meta", "crashed.json"));

    expect(await store.exists("crashed")).toBe(false);
    await expect(store.get("crashed")).rejects.toBeInstanceOf(BlobNotFoundError);
  });

  it("maps a data file vanishing after the meta read to BlobNotFoundError", async () => {
    const dir = await tempDir();
    const store = createFsBlobStore(dir);
    await store.put("racing", body, options);

    // Simulates a concurrent delete landing between get's readMeta and stat.
    await rm(path.join(dir, "objects", "racing"));

    await expect(store.get("racing")).rejects.toBeInstanceOf(BlobNotFoundError);
  });

  it("leaves no temp files behind after overwrite", async () => {
    const dir = await tempDir();
    const store = createFsBlobStore(dir);

    await store.put("a/b.txt", Buffer.from("first"), options);
    await store.put("a/b.txt", Buffer.from("second"), options);

    const entries = await readdir(dir, { recursive: true });
    expect(entries.filter((entry) => entry.includes(".tmp"))).toEqual([]);
  });
});

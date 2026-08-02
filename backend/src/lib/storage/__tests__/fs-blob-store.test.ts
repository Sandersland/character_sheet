import { mkdtemp, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createFsBlobStore } from "../fs-blob-store.js";
import { runBlobStoreContract } from "./blob-store-contract.js";

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "blob-store-test-"));
}

runBlobStoreContract("fs driver", async () => createFsBlobStore(await tempDir()));

describe("createFsBlobStore", () => {
  const body = Buffer.from("payload");
  const options = { contentType: "text/plain" } as const;

  it.each(["../escape", "a/../../escape", "/etc/passwd", "a//b", "", "a/./b"])(
    "rejects the traversal-capable key %j on every method",
    async (key) => {
      const store = createFsBlobStore(await tempDir());

      await expect(store.put(key, body, options)).rejects.toThrow(/blob key/i);
      await expect(store.get(key)).rejects.toThrow(/blob key/i);
      await expect(store.delete(key)).rejects.toThrow(/blob key/i);
      await expect(store.exists(key)).rejects.toThrow(/blob key/i);
    },
  );

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

  it("leaves no temp files behind after overwrite", async () => {
    const dir = await tempDir();
    const store = createFsBlobStore(dir);

    await store.put("a/b.txt", Buffer.from("first"), options);
    await store.put("a/b.txt", Buffer.from("second"), options);

    const entries = await readdir(dir, { recursive: true });
    expect(entries.filter((entry) => entry.includes(".tmp"))).toEqual([]);
  });
});

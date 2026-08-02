import type { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import type { BlobStore } from "../blob-store.js";
import { BlobKeyError, BlobNotFoundError } from "../blob-store.js";

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
}

// Every driver must pass this exact suite (#1614) — the port's semantics live
// here, not per driver: get of a missing key throws BlobNotFoundError, delete
// of a missing key is idempotent, and keys are /-separated paths. Keys are
// namespaced per test run so a driver backed by a shared bucket (the CI MinIO
// leg) never sees another run's objects.
export function runBlobStoreContract(
  name: string,
  makeStore: () => Promise<BlobStore>,
): void {
  describe(`${name} satisfies the BlobStore contract`, () => {
    const key = (suffix: string) => `contract-${crypto.randomUUID()}/${suffix}`;

    it("round-trips bytes, contentType and size through put/get", async () => {
      const store = await makeStore();
      const k = key("round-trip.txt");
      const body = Buffer.from("hello blob store");

      await store.put(k, body, { contentType: "text/plain" });
      const object = await store.get(k);

      expect(await collect(object.body)).toEqual(body);
      expect(object.contentType).toBe("text/plain");
      expect(object.size).toBe(body.byteLength);
    });

    it("round-trips binary payloads byte-exactly", async () => {
      const store = await makeStore();
      const k = key("binary.bin");
      const body = Buffer.from(Array.from({ length: 256 }, (_, i) => i));

      await store.put(k, body, { contentType: "application/octet-stream" });
      const object = await store.get(k);

      expect(await collect(object.body)).toEqual(body);
      expect(object.size).toBe(256);
    });

    it("overwrites an existing key with new body and contentType", async () => {
      const store = await makeStore();
      const k = key("overwrite");

      await store.put(k, Buffer.from("first"), { contentType: "text/plain" });
      await store.put(k, Buffer.from("second, longer body"), {
        contentType: "application/json",
      });
      const object = await store.get(k);

      expect((await collect(object.body)).toString()).toBe(
        "second, longer body",
      );
      expect(object.contentType).toBe("application/json");
      expect(object.size).toBe(Buffer.byteLength("second, longer body"));
    });

    it("reports existence only for stored keys", async () => {
      const store = await makeStore();
      const k = key("exists");

      expect(await store.exists(k)).toBe(false);
      await store.put(k, Buffer.from("x"), { contentType: "text/plain" });
      expect(await store.exists(k)).toBe(true);
    });

    it("delete removes the object", async () => {
      const store = await makeStore();
      const k = key("deleted");

      await store.put(k, Buffer.from("x"), { contentType: "text/plain" });
      await store.delete(k);

      expect(await store.exists(k)).toBe(false);
      await expect(store.get(k)).rejects.toBeInstanceOf(BlobNotFoundError);
    });

    it("delete of a missing key is idempotent (no throw)", async () => {
      const store = await makeStore();
      await expect(store.delete(key("never-stored"))).resolves.toBeUndefined();
    });

    it("get of a missing key throws BlobNotFoundError", async () => {
      const store = await makeStore();
      await expect(store.get(key("missing"))).rejects.toBeInstanceOf(
        BlobNotFoundError,
      );
    });

    // In the contract, not per driver: S3 would accept "../escape" as an opaque
    // key, so only a shared assertion proves both drivers enforce one key space.
    it.each(["../escape", "a/../../escape", "/etc/passwd", "a//b", "", "a/./b"])(
      "rejects the traversal-capable key %j on every method",
      async (k) => {
        const store = await makeStore();
        const body = Buffer.from("x");

        await expect(store.put(k, body, { contentType: "text/plain" })).rejects.toBeInstanceOf(BlobKeyError);
        await expect(store.get(k)).rejects.toBeInstanceOf(BlobKeyError);
        await expect(store.delete(k)).rejects.toBeInstanceOf(BlobKeyError);
        await expect(store.exists(k)).rejects.toBeInstanceOf(BlobKeyError);
      },
    );

    it("supports nested multi-segment keys", async () => {
      const store = await makeStore();
      const k = key("a/b/c/deep.png");
      const body = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

      await store.put(k, body, { contentType: "image/png" });
      const object = await store.get(k);

      expect(await collect(object.body)).toEqual(body);
      expect(object.contentType).toBe("image/png");
    });
  });
}

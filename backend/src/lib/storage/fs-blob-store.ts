import { createReadStream } from "node:fs";
import { access, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BlobObject, BlobStore, PutOptions } from "./blob-store.js";
import { assertValidKey, BlobNotFoundError } from "./blob-store.js";

interface BlobMeta {
  contentType: string;
}

// Data lives under <dir>/objects/<key> and metadata under <dir>/meta/<key>.json
// — parallel trees rather than a sidecar next to the object, because a sidecar
// ("<key>.meta.json") would collide with a legitimate object of that name. The
// meta file's presence is what defines existence; size comes from stat so it
// can never drift from the actual bytes.
export function createFsBlobStore(dir: string): BlobStore {
  const dataPath = (key: string) => path.join(dir, "objects", ...key.split("/"));
  const metaPath = (key: string) =>
    path.join(dir, "meta", ...key.split("/")) + ".json";

  async function readMeta(key: string): Promise<BlobMeta | undefined> {
    try {
      return JSON.parse(await readFile(metaPath(key), "utf8")) as BlobMeta;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  // Write-tmp-then-rename so an overwrite is atomic: a concurrent get streams
  // either the old bytes or the new, never a torn file.
  async function writeAtomic(target: string, contents: Buffer | string): Promise<void> {
    await mkdir(path.dirname(target), { recursive: true });
    const tmp = `${target}.${crypto.randomUUID()}.tmp`;
    await writeFile(tmp, contents);
    await rename(tmp, target);
  }

  return {
    async put(key: string, body: Buffer, options: PutOptions): Promise<void> {
      assertValidKey(key);
      await writeAtomic(dataPath(key), body);
      const meta: BlobMeta = { contentType: options.contentType };
      await writeAtomic(metaPath(key), JSON.stringify(meta));
    },

    async get(key: string): Promise<BlobObject> {
      assertValidKey(key);
      const meta = await readMeta(key);
      if (!meta) throw new BlobNotFoundError(key);
      const file = dataPath(key);
      let size: number;
      try {
        ({ size } = await stat(file));
      } catch (error) {
        // A concurrent delete can land between readMeta and stat (meta-first
        // delete order); the contract promises BlobNotFoundError, not ENOENT.
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
          throw new BlobNotFoundError(key);
        throw error;
      }
      return {
        body: createReadStream(file),
        contentType: meta.contentType,
        size,
      };
    },

    async delete(key: string): Promise<void> {
      assertValidKey(key);
      // Meta first — its presence defines existence, so the object is gone to
      // callers the moment the first rm lands. A crash between the two rms
      // then leaves only an orphaned, invisible data file; the reverse order
      // would leave meta-without-data, where exists reports true and get
      // rejects with a raw ENOENT instead of BlobNotFoundError.
      await rm(metaPath(key), { force: true });
      await rm(dataPath(key), { force: true });
    },

    async exists(key: string): Promise<boolean> {
      assertValidKey(key);
      try {
        await access(metaPath(key));
        return true;
      } catch {
        return false;
      }
    },
  };
}

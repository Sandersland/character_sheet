import type { Readable } from "node:stream";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import type { BlobObject, BlobStore, PutOptions } from "./blob-store.js";
import { assertValidKey, BlobNotFoundError } from "./blob-store.js";

export interface S3BlobStoreOptions {
  // Optional because AWS S3 itself resolves endpoints from the region; every
  // other S3-compatible provider (R2, MinIO, B2, Spaces) requires one.
  endpoint?: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}

// GetObject reports a missing key as NoSuchKey, HeadObject as NotFound, and
// some S3-compatibles only guarantee the 404 status — normalize all three so
// no call site ever switches on provider error codes (#1614).
function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { name, $metadata } = error as {
    name?: unknown;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    name === "NoSuchKey" || name === "NotFound" || $metadata?.httpStatusCode === 404
  );
}

export function createS3BlobStore(options: S3BlobStoreOptions): BlobStore {
  const client = new S3Client({
    endpoint: options.endpoint,
    region: options.region,
    // Path-style addressing (bucket in the path, not the hostname) — required
    // by MinIO and harmless on R2, whereas virtual-hosted style needs
    // per-bucket DNS that local MinIO doesn't have. Defaults on because the
    // primary targets (R2, MinIO) want it; a real-AWS target opts out, since
    // AWS is deprecating path-style addressing.
    forcePathStyle: options.forcePathStyle ?? true,
    credentials: {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
    },
  });
  const bucket = options.bucket;

  return {
    async put(key: string, body: Buffer, putOptions: PutOptions): Promise<void> {
      assertValidKey(key);
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: putOptions.contentType,
        }),
      );
    },

    async get(key: string): Promise<BlobObject> {
      assertValidKey(key);
      try {
        const output = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: key }),
        );
        return {
          // The SDK types Body as a Node/browser stream union; under Node it
          // is always a Readable. The cast keeps the union — an SDK type —
          // from escaping this file into the BlobStore port.
          body: output.Body as Readable,
          contentType: output.ContentType ?? "application/octet-stream",
          size: output.ContentLength ?? 0,
        };
      } catch (error) {
        if (isNotFound(error)) throw new BlobNotFoundError(key);
        throw error;
      }
    },

    async delete(key: string): Promise<void> {
      assertValidKey(key);
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    async exists(key: string): Promise<boolean> {
      assertValidKey(key);
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
      } catch (error) {
        if (isNotFound(error)) return false;
        throw error;
      }
    },
  };
}

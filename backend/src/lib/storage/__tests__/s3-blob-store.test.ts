import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { beforeAll, describe } from "vitest";

import { createS3BlobStore } from "../s3-blob-store.js";
import { runBlobStoreContract } from "./blob-store-contract.js";

// #1614: without S3_TEST_ENDPOINT the whole file skips, keeping the local suite hermetic (no network, no credentials); CI runs it against MinIO.
const endpoint = process.env.S3_TEST_ENDPOINT;
const credentials = {
  bucket: process.env.S3_TEST_BUCKET ?? "test-bucket",
  region: process.env.S3_TEST_REGION ?? "us-east-1",
  accessKeyId: process.env.S3_TEST_ACCESS_KEY_ID ?? "minioadmin",
  secretAccessKey: process.env.S3_TEST_SECRET_ACCESS_KEY ?? "minioadmin",
};

describe.skipIf(!endpoint)("s3 driver against a live endpoint", () => {
  beforeAll(async () => {
    const client = new S3Client({
      endpoint,
      region: credentials.region,
      forcePathStyle: true,
      credentials,
    });
    try {
      await client.send(new CreateBucketCommand({ Bucket: credentials.bucket }));
    } catch (error) {
      const name = (error as Error).name;
      // A bucket surviving from an earlier run is fine — keys are namespaced per run.
      if (name !== "BucketAlreadyOwnedByYou" && name !== "BucketAlreadyExists") {
        throw error;
      }
    } finally {
      client.destroy();
    }
  });

  runBlobStoreContract("s3 driver", async () =>
    createS3BlobStore({ endpoint: endpoint as string, ...credentials }),
  );
});

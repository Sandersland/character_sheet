import { getBlobStore } from "./index.js";

// Used as the wire URL's ?v= version by the portrait serializers. A fresh uuid per upload changes the URL, which is what makes PORTRAIT_CACHE_CONTROL's `immutable` safe.
export function portraitKeyVersion(key: string): string {
  const filename = key.slice(key.lastIndexOf("/") + 1);
  return filename.replace(/\.[^.]+$/, "");
}

// delete() is idempotent over missing keys by the BlobStore contract, so anything thrown here is an infrastructure hiccup, not a request failure — the DB is already consistent and an orphaned blob is harmless.
export async function deletePortraitBlobBestEffort(key: string | null): Promise<void> {
  if (!key) return;
  try {
    await getBlobStore().delete(key);
  } catch {
    // ignored
  }
}

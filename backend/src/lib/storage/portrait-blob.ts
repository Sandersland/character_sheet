import { createBlobStore } from "./index.js";

// The key's uuid filename segment, used as the wire URL's ?v= version by both
// portrait serializers (derivePortraitUrl, toWireEntity). A fresh uuid per
// upload changes the URL, which is what makes PORTRAIT_CACHE_CONTROL's
// `immutable` safe.
export function portraitKeyVersion(key: string): string {
  const filename = key.slice(key.lastIndexOf("/") + 1);
  return filename.replace(/\.[^.]+$/, "");
}

// Best-effort removal of a superseded/orphaned portrait blob, shared by the
// character (#1615) and entity (#1617) portrait pipelines. delete() is
// idempotent over missing keys by the BlobStore contract, so anything thrown
// here is an infrastructure hiccup — the DB is already consistent and an
// orphaned blob is harmless, so it never fails the request.
export async function deletePortraitBlobBestEffort(key: string | null): Promise<void> {
  if (!key) return;
  try {
    await createBlobStore().delete(key);
  } catch {
    /* orphaned blob accepted */
  }
}

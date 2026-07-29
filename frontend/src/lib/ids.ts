// crypto.randomUUID exists only in secure contexts (HTTPS or localhost). The
// dev server binds host:true precisely so other devices can reach it — a phone
// on the LAN or the containerized e2e runner browses a plain-http non-localhost
// origin, where Chromium removes the API and every attack roll died on it
// (#1458). crypto.getRandomValues is NOT secure-context-gated, so the fallback
// keeps the same entropy; callers only need uniqueness, not UUID shape (the
// roll log accepts any non-empty string ≤ 100 chars).
export function randomId(): string {
  // typeof, not `in`: lib.dom types randomUUID as always-present, so an `in`
  // narrowing check collapses the else branch's crypto to `never`.
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

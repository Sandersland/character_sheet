// crypto.randomUUID is secure-context-gated (missing over plain-http non-localhost, e.g. LAN devices or the e2e runner, #1458); crypto.getRandomValues is not, so it's the fallback.
export function randomId(): string {
  // typeof, not `in`: lib.dom types randomUUID as always-present, so `in` narrowing collapses the else branch's crypto to `never`.
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

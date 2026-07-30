// The async Clipboard API exists only in secure contexts (HTTPS or localhost).
// The dev server binds host:true precisely so other devices can reach it, so a
// phone on the LAN browses a plain-http non-localhost origin where Chromium
// removes navigator.clipboard outright — the same gate that stranded
// crypto.randomUUID in randomId (#1465). Callers get a boolean rather than a
// throw so they can walk a fallback ladder instead of guarding a TypeError.
export async function writeToClipboard(text: string): Promise<boolean> {
  // typeof, not `in`: lib.dom types clipboard as always-present, so an `in`
  // narrowing check collapses the else branch to `never`.
  if (typeof navigator.clipboard?.writeText !== "function") return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // A denied permission rejects asynchronously instead of throwing, so it is
    // invisible to the plain-http repro yet has to land in the same fallback.
    return false;
  }
}

// document.execCommand is deprecated but — unlike navigator.clipboard — it is
// NOT secure-context gated, which is the whole reason this rung exists: on a
// plain-http LAN origin it can still reach the real clipboard (#1467).
// The selection is left in place on purpose even when the copy fails: that
// selection IS the manual-copy affordance a "press Ctrl+C" hint points at.
export function selectAndCopy(input: HTMLInputElement): boolean {
  input.focus();
  input.select();
  // typeof again: lib.dom types execCommand as always-present, so a browser
  // that has finished removing it is invisible to the compiler.
  if (typeof document.execCommand !== "function") return false;
  try {
    return document.execCommand("copy");
  } catch {
    // Nothing on this path may throw into a click handler; a browser refusing
    // the command must degrade to the manual hint like an absent one does.
    return false;
  }
}

// navigator.clipboard is secure-context gated (same as randomId's crypto.randomUUID, #1465); return a boolean here instead of throwing so callers can walk a fallback ladder.
export async function writeToClipboard(text: string): Promise<boolean> {
  // typeof, not `in`: lib.dom types clipboard as always-present, so an `in` check collapses the else branch to `never`.
  if (typeof navigator.clipboard?.writeText !== "function") return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // A denied permission rejects asynchronously instead of throwing, but must still land in the same fallback.
    return false;
  }
}

// document.execCommand is not secure-context gated, so it still reaches the clipboard on a plain-http LAN origin (#1467).
export function selectAndCopy(input: HTMLInputElement): boolean {
  input.focus();
  input.select();
  // The selection stays even on failure — it IS the manual-copy affordance a "press Ctrl+C" hint points at.
  // typeof again: lib.dom types execCommand as always-present, so a browser that removed it is invisible to the compiler.
  if (typeof document.execCommand !== "function") return false;
  try {
    return document.execCommand("copy");
  } catch {
    // A browser refusing the command must degrade to the manual-copy hint like an absent one does; nothing here may throw into the click handler.
    return false;
  }
}

import { useState } from "react";

import type { Character } from "@/types/character";

// Shared busy/error runner for ClassFeaturesSection's transaction endpoints.
export function useClassTransactions(onUpdate: (updated: Character) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(send: () => Promise<Character>) {
    setBusy(true);
    setError(null);
    try {
      const updated = await send();
      onUpdate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, run };
}

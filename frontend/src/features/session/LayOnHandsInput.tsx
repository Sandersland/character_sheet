import { useState } from "react";

import { QuickBtn } from "@/features/session/TurnControls";
import type { Character } from "@/types/character";

/** Numeric pool-draw input for Lay on Hands — owns its own amount/busy state. */
export default function LayOnHandsInput({
  character,
  onSend,
  onClose,
}: {
  character: Character;
  onSend: (actionKey: string, opts?: { roll?: number }) => Promise<void>;
  onClose: () => void;
}) {
  const pool = character.resources?.pools?.find((p) => p.key === "layOnHands");
  const maxPool = pool?.remaining ?? 0;
  const [amount, setAmount] = useState(Math.min(1, maxPool));
  const [busy, setBusy] = useState(false);

  async function handleHeal() {
    if (amount <= 0 || amount > maxPool || busy) return;
    setBusy(true);
    try {
      await onSend("layOnHands", { roll: amount });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 flex items-center gap-3 rounded-control border border-vitality-200 bg-vitality-50 px-3 py-2">
      <span className="text-xs font-semibold text-vitality-700">
        Lay on Hands — pool remaining: {maxPool}
      </span>
      <input
        type="number"
        min={1}
        max={maxPool}
        value={amount}
        onChange={(e) => setAmount(Math.min(maxPool, Math.max(1, Number(e.target.value))))}
        className="w-16 rounded-control border border-vitality-300 bg-parchment-50 px-2 py-1 text-center text-sm tabular-nums text-parchment-900 focus:outline-none focus:ring-1 focus:ring-vitality-400"
        aria-label="Healing amount"
      />
      <QuickBtn
        tone="neutral"
        disabled={busy || amount <= 0 || amount > maxPool}
        onClick={handleHeal}
      >
        Heal
      </QuickBtn>
      <button
        type="button"
        onClick={onClose}
        className="ml-auto text-xs text-parchment-600 hover:text-parchment-600"
      >
        Cancel
      </button>
    </div>
  );
}

import { useState } from "react";

import Modal from "@/components/ui/Modal";
import DiceRoller from "@/features/dice/DiceRoller";
import type { RollResult, RollSpec } from "@/lib/dice";

interface DiceRollModalProps {
  spec: RollSpec;
  label: string;
  /** Fired once the die settles — the provider publishes the toast + logs it. */
  onResult: (result: RollResult) => void;
  onClose: () => void;
}

/**
 * Shared overlay that plays the 3D DiceRoller for a player-driven d20 roll
 * (skill check, ability check, save, initiative). Auto-rolls on mount and keeps
 * the settled die on screen — dismissed with "Done" — so the result reads
 * clearly rather than vanishing the instant it lands (same UX as the
 * concentration-save modal).
 */
export default function DiceRollModal({ spec, label, onResult, onClose }: DiceRollModalProps) {
  const [result, setResult] = useState<RollResult | null>(null);

  function handleResult(next: RollResult) {
    setResult(next);
    onResult(next);
  }

  return (
    <Modal title={label} onClose={onClose}>
      <div className="flex flex-col items-center gap-4 text-center">
        <DiceRoller
          spec={spec}
          label={label}
          onResult={handleResult}
          autoRollOnMount
          className="w-full"
        />
        {result && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-control bg-parchment-300 px-5 py-2 text-sm font-semibold text-parchment-800 transition-colors hover:bg-parchment-400"
          >
            Done
          </button>
        )}
      </div>
    </Modal>
  );
}

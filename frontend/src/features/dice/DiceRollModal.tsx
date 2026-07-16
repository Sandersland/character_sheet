import { useEffect, useRef, useState } from "react";

import Modal from "@/components/ui/Modal";
import DiceRoller from "@/features/dice/DiceRoller";
import RollBreakdown from "@/features/dice/RollBreakdown";
import type { RollResult, RollSpec } from "@/lib/dice";

// How long the settled result lingers before the overlay auto-dismisses.
const LINGER_MS = 2600;

interface DiceRollModalProps {
  spec: RollSpec;
  label: string;
  /** Fired once the die settles — the provider logs it + hands it back. */
  onResult: (result: RollResult) => void;
  onClose: () => void;
}

/**
 * Animated-mode result surface (#945): plays the 3D DiceRoller for a
 * player-driven roll, then shows the total + breakdown (source · formula ·
 * adv/dis · crit) at settle so the modal conveys the result without a separate
 * persistent toast. Auto-dismisses after a short linger; tapping "Done"
 * dismisses immediately.
 */
export default function DiceRollModal({ spec, label, onResult, onClose }: DiceRollModalProps) {
  const [result, setResult] = useState<RollResult | null>(null);
  // Latch onClose so the linger timer never fires against a stale closure.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  function handleResult(next: RollResult) {
    setResult(next);
    onResult(next);
  }

  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => closeRef.current(), LINGER_MS);
    return () => clearTimeout(timer);
  }, [result]);

  return (
    <Modal title={label} onClose={onClose}>
      <div className="flex flex-col items-center gap-4 text-center">
        <DiceRoller
          spec={spec}
          label={label}
          onResult={handleResult}
          autoRollOnMount
          showTotal={false}
          className="w-full"
        />
        {result && (
          <div data-testid="roll-modal-result" className="flex flex-col items-center gap-3">
            <RollBreakdown label={label} result={result} emphasis />
            <button
              type="button"
              onClick={onClose}
              className="rounded-control bg-parchment-300 px-5 py-2 text-sm font-semibold text-parchment-800 transition-colors hover:bg-parchment-400"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

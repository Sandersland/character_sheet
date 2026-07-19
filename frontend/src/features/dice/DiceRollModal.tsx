import Modal from "@/components/ui/Modal";
import DiceRoller from "@/features/dice/DiceRoller";
import type { RollResult, RollSpec } from "@/lib/dice";

interface DiceRollModalProps {
  spec: RollSpec;
  label: string;
  /** Fired once the die settles — the provider logs it, hands it back, and
   *  hands off to the shared `RollResultSeal` (which unmounts this overlay). */
  onResult: (result: RollResult) => void;
  /** Early dismiss (backdrop tap) while the dice are still tumbling. */
  onClose: () => void;
}

/**
 * Animated-mode roll overlay (#945/#956): plays the 3D DiceRoller for a
 * player-driven roll. It no longer renders its own result readout — at settle
 * the provider publishes the roll to the shared `RollResultSeal` and unmounts
 * this overlay, so the 3D tray visibly "settles into" that one seal rather than
 * a separate in-modal breakdown.
 */
export default function DiceRollModal({ spec, label, onResult, onClose }: DiceRollModalProps) {
  return (
    <Modal title={label} onClose={onClose}>
      <div className="flex flex-col items-center gap-4 text-center">
        <DiceRoller
          spec={spec}
          label={label}
          onResult={onResult}
          autoRollOnMount
          // Suppress the in-canvas total: the seal is the summary. Without this
          // the canvas total would flash for the single frame between settle and
          // this overlay unmounting in favour of the seal.
          showTotal={false}
          className="w-full"
        />
      </div>
    </Modal>
  );
}

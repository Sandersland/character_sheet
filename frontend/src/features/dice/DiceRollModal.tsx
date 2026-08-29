import Modal from "@/components/ui/Modal";
import DiceRoller from "@/features/dice/DiceRoller";
import type { RollResult, RollSpec } from "@/lib/dice";

interface DiceRollModalProps {
  spec: RollSpec;
  label: string;
  onResult: (result: RollResult) => void;
  onClose: () => void;
}

export default function DiceRollModal({ spec, label, onResult, onClose }: DiceRollModalProps) {
  return (
    <Modal title={label} onClose={onClose}>
      <div className="flex flex-col items-center gap-4 text-center">
        <DiceRoller
          spec={spec}
          label={label}
          onResult={onResult}
          autoRollOnMount
          // Suppresses the in-canvas total so it doesn't flash before the seal replaces it.
          showTotal={false}
          className="w-full"
        />
      </div>
    </Modal>
  );
}

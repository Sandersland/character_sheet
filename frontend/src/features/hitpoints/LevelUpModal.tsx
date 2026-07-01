import Modal from "@/components/ui/Modal";
import { averageHitPointGain, dieFaces, hitPointGainRange } from "@/lib/hitDice";

export default function LevelUpModal({
  hitDie,
  conMod,
  pending,
  onConfirm,
  onClose,
}: {
  hitDie: string;
  conMod: number;
  pending: boolean;
  onConfirm: (method: "average" | "roll") => void;
  onClose: () => void;
}) {
  const faces = dieFaces(hitDie);
  const averageGain = averageHitPointGain(faces, conMod);
  const { min: minRoll, max: maxRoll } = hitPointGainRange(faces, conMod);
  const conLabel = conMod >= 0 ? `+${conMod}` : String(conMod);

  return (
    <Modal title="Level Up" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-parchment-700">
          Choose how to gain hit points for this level ({hitDie} {conLabel} Con):
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => onConfirm("average")}
            className="flex items-center justify-between rounded-card border border-parchment-300 bg-parchment-50 px-4 py-3 text-left transition-colors hover:bg-parchment-100 disabled:opacity-50"
          >
            <div>
              <p className="font-semibold text-parchment-900">Take average</p>
              <p className="text-xs text-parchment-600">
                Predictable — {averageHitPointGain(faces, 0)} ({conLabel} Con)
              </p>
            </div>
            <span className="font-display text-2xl font-semibold text-arcane-800">
              +{averageGain}
            </span>
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => onConfirm("roll")}
            className="flex items-center justify-between rounded-card border border-parchment-300 bg-parchment-50 px-4 py-3 text-left transition-colors hover:bg-parchment-100 disabled:opacity-50"
          >
            <div>
              <p className="font-semibold text-parchment-900">Roll {hitDie}</p>
              <p className="text-xs text-parchment-600">
                Luck-based — {conLabel} Con applied
              </p>
            </div>
            <span className="text-sm text-parchment-600">
              {minRoll}–{maxRoll} HP
            </span>
          </button>
        </div>
      </div>
    </Modal>
  );
}

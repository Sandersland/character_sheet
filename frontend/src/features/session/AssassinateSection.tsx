// PHB'14 p.97: any hit scored against a surprised creature is a critical hit.
// Checking the box calls the same onCallCrit() the manual Crit! button uses;
// resolve-action.ts's assertAssassinateEligible re-gates eligibility server-side.

import { useEffect } from "react";

import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import type { ResolutionView } from "@/features/session/useResolution";

interface AssassinateSectionProps {
  resolutionView: ResolutionView;
  surprised: boolean;
  onSurprisedChange: (surprised: boolean) => void;
}

export default function AssassinateSection({
  resolutionView,
  surprised,
  onSurprisedChange,
}: AssassinateSectionProps) {
  const { character } = useCurrentCharacter();
  const { toHitRoll, verdict, disabled, completed, onCallCrit } = resolutionView;

  // Self-limiting via verdict !== undefined; onCallCrit's own guard refuses
  // once verdict === "miss" (surprise can't turn a miss into a hit).
  useEffect(() => {
    if (!surprised || disabled || completed) return;
    if (!toHitRoll || verdict !== undefined) return;
    onCallCrit();
  }, [surprised, disabled, completed, toHitRoll, verdict, onCallCrit]);

  if (!character.assassinate) return null;

  const missed = verdict === "miss";

  return (
    <div className="flex flex-col gap-1.5 rounded-control border border-gold-200 bg-gold-50 p-2">
      <span className="text-xs font-semibold text-gold-800">Assassinate</span>
      <label className="flex items-start gap-2 text-xs text-parchment-700">
        <input
          type="checkbox"
          checked={surprised}
          disabled={missed || completed}
          onChange={(e) => onSurprisedChange(e.target.checked)}
          className="mt-0.5"
        />
        <span>Target is surprised — any hit this swing scores is a critical hit.</span>
      </label>
      <p className="text-[10px] text-parchment-500">
        You also have advantage on this attack if the target hasn&apos;t taken a turn yet this combat.
      </p>
    </div>
  );
}

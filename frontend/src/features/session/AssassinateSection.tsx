// Assassinate (2014 Assassin L3+, #1526) — a manual "target is surprised"
// toggle on the attack card, following Sneak Attack's own eligibility-toggle
// pattern (#902): never auto-detected, a pure self-declared assertion (no
// enemy/surprise state — modelling one is an explicit non-goal). PHB'14
// p.97: "any hit you score against a creature that is surprised is a
// critical hit." Checking the box while a to-hit roll is live and its
// verdict hasn't settled calls the SAME `onCallCrit()` the manual "Crit!"
// button (ResolutionRail's CallItStepContent) already uses — this is a
// gated, attributed shortcut onto an already-audited mechanism, not a second
// crit-decision path (the server never computes the crit itself either; it
// only gates WHO may declare one, see resolve-action.ts's
// assertAssassinateEligible). The advantage-vs-hasn't-acted-yet clause stays
// reminder text — no initiative-order awareness lives here.

import { useEffect } from "react";

import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import type { ResolutionView } from "@/features/session/useResolution";

interface AssassinateSectionProps {
  resolutionView: ResolutionView;
  /** Lifted into the picker's own per-swing local state (like riderEffects)
   *  so it resets after every commit — a later, non-toggled swing starts
   *  unchecked, matching #1526 AC "changes only that swing". */
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

  // Self-limiting: once onCallCrit sets the verdict, `verdict !== undefined`
  // goes true and this stops firing — no "already fired" ref needed. Never
  // upgrades a called miss (RAW: surprise doesn't turn a miss into a hit) —
  // onCallCrit's own guard already refuses once `verdict === "miss"`.
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

import type { ReactNode } from "react";

import ConditionRollBanner from "@/features/conditions/ConditionRollBanner";
import ItemGrantsCard from "@/features/character-meta/ItemGrantsCard";
import type { Character } from "@/types/character";

interface CombatColumnProps {
  character: Character;
  /** Idle: the session doorway card. Live: the turn tracker. */
  turnSlot: ReactNode;
  /** Idle: the full HitPointTracker. Live: the compact HP card (desktop only). */
  hpSlot: ReactNode;
  /** Idle: ConditionsStrip. Live: CombatUtilityStrip (conditions · exhaustion · rest). */
  conditionsSlot: ReactNode;
  /** The one-line session-log row (self-hides when there's nothing to show). */
  logRow: ReactNode;
}

/**
 * The shared Combat-tab column (#1086) — one centered stack that idle and live
 * both fill, so switching between them moves only the turn + HP slots and nothing
 * else shifts. Order: roll-modifier banner → turn → HP → conditions → item grants
 * → log row. The ConditionRollBanner rides the top in both modes (decided) and
 * ItemGrantsCard both self-hide when empty; their slots carry test ids so the
 * idle↔live parity contract can assert the layout stays fixed.
 */
export default function CombatColumn({
  character,
  turnSlot,
  hpSlot,
  conditionsSlot,
  logRow,
}: CombatColumnProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 md:gap-6">
      <ConditionRollBanner modifiers={character.rollModifiers} />
      <div data-testid="combat-turn">{turnSlot}</div>
      {hpSlot && <div data-testid="combat-hp">{hpSlot}</div>}
      <div data-testid="combat-conditions">{conditionsSlot}</div>
      <ItemGrantsCard character={character} />
      {logRow && <div data-testid="combat-log">{logRow}</div>}
    </div>
  );
}

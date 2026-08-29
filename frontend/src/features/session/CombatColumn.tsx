import type { ReactNode } from "react";

import ConditionRollBanner from "@/features/conditions/ConditionRollBanner";
import ItemGrantsCard from "@/features/character-meta/ItemGrantsCard";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";

interface CombatColumnProps {
  turnSlot: ReactNode;
  hpSlot: ReactNode;
  conditionsSlot: ReactNode;
  logRow: ReactNode;
}

export default function CombatColumn({
  turnSlot,
  hpSlot,
  conditionsSlot,
  logRow,
}: CombatColumnProps) {
  const { character } = useCurrentCharacter();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 md:gap-6">
      <ConditionRollBanner modifiers={character.rollModifiers} />
      <div data-testid="combat-turn">{turnSlot}</div>
      {hpSlot && <div data-testid="combat-hp">{hpSlot}</div>}
      <div data-testid="combat-conditions">{conditionsSlot}</div>
      <ItemGrantsCard />
      {logRow && <div data-testid="combat-log">{logRow}</div>}
    </div>
  );
}

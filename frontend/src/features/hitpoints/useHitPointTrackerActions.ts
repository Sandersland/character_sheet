import { useEffect, useRef, useState } from "react";

import { rollDie } from "@/lib/dice";
import { advancingHitDie, dieFaces } from "@/lib/hitDice";
import { useRestActions } from "@/features/hitpoints/useRestActions";
import type { Character, ClassOption, HitPointOperation, LevelUpTarget } from "@/types/character";

// Level-up handlers and level-up/advancement UI state for HitPointTracker; rest
// ops come from the shared useRestActions hook.
export function useHitPointTrackerActions(
  character: Character,
  referenceClasses: ClassOption[],
  submit: (ops: HitPointOperation[]) => Promise<boolean>,
) {
  const { availableDice, shortRest, longRest } = useRestActions(character, submit);
  const [levelUpOpen, setLevelUpOpen] = useState(false);
  const [advancementCallout, setAdvancementCallout] = useState(false);

  // Detect when a level-up unlocks a new advancement slot.
  const prevAdvancementTotal = useRef(character.advancementSlots.total);
  useEffect(() => {
    const newTotal = character.advancementSlots.total;
    if (newTotal > prevAdvancementTotal.current) setAdvancementCallout(true);
    prevAdvancementTotal.current = newTotal;
  }, [character.advancementSlots.total]);

  async function levelUp(method: "average" | "roll", target: LevelUpTarget | undefined) {
    // Roll bounds follow the advancing class's hit die, not always the primary.
    const roll =
      method === "roll"
        ? rollDie(dieFaces(advancingHitDie(character, referenceClasses, target)))
        : undefined;
    const ok = await submit([{ type: "levelUp", method, roll, target }]);
    if (ok) setLevelUpOpen(false);
  }

  function dismissAdvancement() {
    setAdvancementCallout(false);
    document
      .getElementById("advancement-card")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return {
    availableDice,
    levelUpOpen,
    setLevelUpOpen,
    advancementCallout,
    dismissAdvancement,
    shortRest,
    longRest,
    levelUp,
  };
}

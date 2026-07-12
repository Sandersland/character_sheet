import { useEffect, useRef, useState } from "react";

import { rollDie } from "@/lib/dice";
import { advancingHitDie, dieFaces } from "@/lib/hitDice";
import type { Character, ClassOption, HitPointOperation, LevelUpTarget } from "@/types/character";

// Rest + level-up handlers and level-up/advancement UI state for HitPointTracker.
export function useHitPointTrackerActions(
  character: Character,
  referenceClasses: ClassOption[],
  submit: (ops: HitPointOperation[]) => Promise<boolean>,
) {
  const { hitDice } = character;
  const availableDice = hitDice.total - hitDice.spent;
  const [levelUpOpen, setLevelUpOpen] = useState(false);
  const [advancementCallout, setAdvancementCallout] = useState(false);

  // Detect when a level-up unlocks a new advancement slot.
  const prevAdvancementTotal = useRef(character.advancementSlots.total);
  useEffect(() => {
    const newTotal = character.advancementSlots.total;
    if (newTotal > prevAdvancementTotal.current) setAdvancementCallout(true);
    prevAdvancementTotal.current = newTotal;
  }, [character.advancementSlots.total]);

  async function shortRest(n: number) {
    if (!n || n < 1 || n > availableDice) return;
    const rolls = Array.from({ length: n }, () => rollDie(dieFaces(hitDice.die)));
    await submit([{ type: "shortRest", rolls }]);
  }

  async function longRest() {
    await submit([{ type: "longRest" }]);
  }

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

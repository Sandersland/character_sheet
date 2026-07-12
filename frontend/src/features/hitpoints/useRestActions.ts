import { rollDie } from "@/lib/dice";
import { dieFaces } from "@/lib/hitDice";
import type { Character, HitPointOperation } from "@/types/character";

// Short/long rest ops shared by HitPointTracker and the session rest button.
export function useRestActions(
  character: Character,
  submit: (ops: HitPointOperation[]) => Promise<boolean>,
) {
  const { hitDice } = character;
  const availableDice = hitDice.total - hitDice.spent;

  async function shortRest(n: number) {
    if (!n || n < 1 || n > availableDice) return;
    const rolls = Array.from({ length: n }, () => rollDie(dieFaces(hitDice.die)));
    await submit([{ type: "shortRest", rolls }]);
  }

  async function longRest() {
    await submit([{ type: "longRest" }]);
  }

  return { availableDice, shortRest, longRest };
}

// The Hit Points ceremony step (#887): the player takes the fixed average or
// rolls the advancing class's hit die; a live preview shows the new max HP. The
// HP math, the roll/selection state, and each sub-view live in their own unit.
// Which class advances is decided upstream by the ceremony's class-choice step
// (#1170) — this step just reads `target` off the context.

import HpChoiceCard from "@/features/level-up/HpChoiceCard";
import HpDiceReveal from "@/features/level-up/HpDiceReveal";
import { useHpRoll } from "@/features/level-up/useHpRoll";
import { useLevelUpStepContext } from "@/features/level-up/useLevelUpStepContext";
import { useReferenceData } from "@/hooks/useReferenceData";
import { abilityLabel } from "@/lib/abilities";
import { hitPointStepMath } from "@/lib/hitDice";

/** The "New maximum HP" preview line, split out to keep HitPointsStep's render flat. */
function HpGainPreview({
  method,
  roll,
  gain,
  currentMax,
  conText,
}: {
  method: "average" | "roll" | undefined;
  roll: number | null;
  gain: number | null;
  currentMax: number;
  conText: string;
}) {
  if (method === "roll") {
    // Always rendered (reserving its height) once Roll is chosen, so the
    // layout doesn't jump when the die settles — invisible until it does.
    return (
      <p className={`mt-4 text-center text-sm text-parchment-600 ${roll == null ? "invisible" : ""}`}>
        Rolled {roll} {conText} — New maximum HP{" "}
        <b className="font-display text-lg text-vitality-700">
          {currentMax} → {currentMax + (gain ?? 0)}
        </b>
      </p>
    );
  }
  if (method === "average" && gain != null) {
    return (
      <p className="mt-4 text-center text-sm text-parchment-600">
        New maximum HP{" "}
        <b className="font-display text-lg text-vitality-700">
          {currentMax} → {currentMax + gain}
        </b>
      </p>
    );
  }
  return null;
}

export default function HitPointsStep() {
  const { character, target } = useLevelUpStepContext();
  const { reference } = useReferenceData();

  const math = hitPointStepMath(character, reference?.classes ?? [], target);
  const { roll, method, gain, handleRoll, chooseAverage, chooseRoll } = useHpRoll(math);
  const currentMax = character.hitPoints.max;

  return (
    <div>
      <h2 className="text-center font-display text-xl font-semibold text-parchment-900">
        Roll for hit points, or take the average?
      </h2>
      <p className="mt-1 text-center text-sm text-parchment-600">
        You gain 1{math.die} + your {abilityLabel("constitution")} modifier ({math.conLabel}) this level.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <HpChoiceCard
          label="Take average"
          value={`+${math.averageGain}`}
          note={`${math.fixedBase} (fixed) ${math.conText} = reliable`}
          selected={method === "average"}
          onSelect={chooseAverage}
        />
        <HpChoiceCard
          label={`Roll 1${math.die}`}
          value={roll != null ? `+${roll + math.conMod}` : `${math.minRoll}–${math.maxRoll}`}
          note={`1${math.die} ${math.conText} = a gamble`}
          selected={method === "roll"}
          onSelect={chooseRoll}
        />
      </div>

      {(method === "roll" || roll != null) && (
        // Stays mounted once a roll exists — DiceRoller always self-rolls on
        // mount and can't re-display a held value — so average↔roll toggling
        // hides it instead of unmounting it. `key={math.faces}` forces the one
        // legitimate remount (and re-roll) on a class/die switch.
        <div hidden={method !== "roll"}>
          <HpDiceReveal key={math.faces} faces={math.faces} die={math.die} onResult={handleRoll} />
        </div>
      )}

      <HpGainPreview method={method} roll={roll} gain={gain} currentMax={currentMax} conText={math.conText} />
    </div>
  );
}

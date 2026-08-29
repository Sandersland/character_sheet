// The server resolves the advancing class's die and every HP number onto
// step.meta — this reads step.meta only, never the reference catalog or the
// level-up target.

import HpChoiceCard from "@/features/level-up/HpChoiceCard";
import HpDiceReveal from "@/features/level-up/HpDiceReveal";
import { useHpRoll } from "@/features/level-up/useHpRoll";
import { useLevelUpStepContext } from "@/features/level-up/useLevelUpStepContext";
import { abilityAbbr, abilityLabel, formatModifier } from "@/lib/abilities";
import { effectiveMaxForRoll, hpGainForRoll, readHitPointsMeta } from "@/lib/hitDice";
import type { HitPointsStepMeta, LevelUpStep } from "@/types/character";

// Renders the served effectiveMaxAverage/effectiveMaxByRoll, never
// `currentMax + gain`, which disagrees once 2014 exhaustion 4+ (PHB'14 p. 291)
// halves the committed max.
function HpGainPreview({
  method,
  roll,
  meta,
  currentMax,
  conText,
}: {
  method: "average" | "roll" | undefined;
  roll: number | null;
  meta: HitPointsStepMeta;
  currentMax: number;
  conText: string;
}) {
  if (method === "roll") {
    return (
      <p className={`mt-4 text-center text-sm text-parchment-600 ${roll == null ? "invisible" : ""}`}>
        Rolled {roll} {conText} — New maximum HP{" "}
        <b className="font-display text-lg text-vitality-700">
          {currentMax} → {roll != null ? effectiveMaxForRoll(meta, roll) : currentMax}
        </b>
      </p>
    );
  }
  if (method === "average") {
    return (
      <p className="mt-4 text-center text-sm text-parchment-600">
        New maximum HP{" "}
        <b className="font-display text-lg text-vitality-700">
          {currentMax} → {meta.effectiveMaxAverage}
        </b>
      </p>
    );
  }
  return null;
}

export default function HitPointsStep({ step }: { step: LevelUpStep }) {
  const { character } = useLevelUpStepContext();
  const meta = readHitPointsMeta(step);
  const { roll, method, handleRoll, chooseAverage, chooseRoll } = useHpRoll(meta);
  const currentMax = character.hitPoints.max;
  // Deliberately client-side: formatModifier/abilityAbbr are display strings
  // over a served number, not mechanics.
  const conLabel = formatModifier(meta.conMod);
  const conText = `${conLabel} ${abilityAbbr("constitution")}`;

  return (
    <div>
      <h2 className="text-center font-display text-xl font-semibold text-parchment-900">
        Roll for hit points, or take the average?
      </h2>
      <p className="mt-1 text-center text-sm text-parchment-600">
        You gain 1{meta.die} + your {abilityLabel("constitution")} modifier ({conLabel}) this level.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <HpChoiceCard
          label="Take average"
          value={`+${meta.averageGain}`}
          note={`${meta.fixedAverage} (fixed) ${conText} = reliable`}
          selected={method === "average"}
          onSelect={chooseAverage}
        />
        <HpChoiceCard
          label={`Roll 1${meta.die}`}
          value={roll != null ? `+${hpGainForRoll(meta, roll)}` : `${meta.minRoll}–${meta.maxRoll}`}
          note={`1${meta.die} ${conText} = a gamble`}
          selected={method === "roll"}
          onSelect={chooseRoll}
        />
      </div>

      {(method === "roll" || roll != null) && (
        // DiceRoller always self-rolls on mount and can't re-display a held
        // value, so this hides it instead of unmounting it once a roll
        // exists. `key={meta.faces}` forces the one legitimate remount (and
        // re-roll) on a class/die switch.
        <div hidden={method !== "roll"}>
          <HpDiceReveal key={meta.faces} faces={meta.faces} die={meta.die} onResult={handleRoll} />
        </div>
      )}

      <HpGainPreview method={method} roll={roll} meta={meta} currentMax={currentMax} conText={conText} />
    </div>
  );
}

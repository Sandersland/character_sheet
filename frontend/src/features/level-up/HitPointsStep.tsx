// The Hit Points ceremony step (#887): the player takes the fixed average or
// rolls the advancing class's hit die; a live preview shows the new max HP. The
// roll/selection state and each sub-view live in their own unit.
// Which class advances is decided upstream by the ceremony's class-choice step
// (#1170), and the server resolves that class's die and every HP number onto
// the plan step (#1380) — so this reads `step.meta` and needs neither the
// reference catalog nor the level-up target.

import HpChoiceCard from "@/features/level-up/HpChoiceCard";
import HpDiceReveal from "@/features/level-up/HpDiceReveal";
import { useHpRoll } from "@/features/level-up/useHpRoll";
import { useLevelUpStepContext } from "@/features/level-up/useLevelUpStepContext";
import { abilityAbbr, abilityLabel, formatModifier } from "@/lib/abilities";
import { effectiveMaxForRoll, hpGainForRoll, readHitPointsMeta } from "@/lib/hitDice";
import type { HitPointsStepMeta, LevelUpStep } from "@/types/character";

/**
 * The "New maximum HP" preview line, split out to keep HitPointsStep's render
 * flat. Renders the SERVED post-level effective max (#1497,
 * meta.effectiveMaxAverage/effectiveMaxByRoll) — never `currentMax + gain`,
 * which disagrees with the committed max once 2014 exhaustion 4+ (PHB'14
 * p. 291) halves it (the halving grows with the new max too).
 */
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
    // Always rendered (reserving its height) once Roll is chosen, so the
    // layout doesn't jump when the die settles — invisible until it does.
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
  // Read once, not per use site: every card, the reveal's key and the preview
  // must agree on the same numbers within a render.
  const meta = readHitPointsMeta(step);
  const { roll, method, handleRoll, chooseAverage, chooseRoll } = useHpRoll(meta);
  const currentMax = character.hitPoints.max;
  // Chrome, deliberately client-side: formatModifier/abilityAbbr are display
  // strings over a served number, not mechanics.
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
          // Shows the HELD roll even while average is selected, so toggling back
          // reveals the value the player already has rather than the range again.
          value={roll != null ? `+${hpGainForRoll(meta, roll)}` : `${meta.minRoll}–${meta.maxRoll}`}
          note={`1${meta.die} ${conText} = a gamble`}
          selected={method === "roll"}
          onSelect={chooseRoll}
        />
      </div>

      {(method === "roll" || roll != null) && (
        // Stays mounted once a roll exists — DiceRoller always self-rolls on
        // mount and can't re-display a held value — so average↔roll toggling
        // hides it instead of unmounting it. `key={meta.faces}` forces the one
        // legitimate remount (and re-roll) on a class/die switch.
        <div hidden={method !== "roll"}>
          <HpDiceReveal key={meta.faces} faces={meta.faces} die={meta.die} onResult={handleRoll} />
        </div>
      )}

      <HpGainPreview method={method} roll={roll} meta={meta} currentMax={currentMax} conText={conText} />
    </div>
  );
}

// The Hit Points ceremony step (#887): the player takes the fixed average or
// rolls the advancing class's hit die; a live preview shows the new max HP.

import { useSearchParams } from "react-router-dom";

import { useLevelUpStepContext } from "@/features/level-up/useLevelUpStepContext";
import { useReferenceData } from "@/hooks/useReferenceData";
import { abilityAbbr, abilityLabel, abilityModifier, formatModifier } from "@/lib/abilities";
import { advancingHitDie, averageHitPointGain, dieFaces, hitPointGainRange } from "@/lib/hitDice";

const CHOICE_BASE =
  "relative rounded-card border border-parchment-300 bg-parchment-50 px-4 py-5 text-center transition-colors hover:bg-parchment-100";
const CHOICE_SEL = "border-garnet-600 ring-2 ring-garnet-50";
const CH = "text-[11px] font-bold uppercase tracking-wide text-parchment-500";
const CBIG = "mt-1.5 font-display text-4xl font-bold";
const CNOTE = "mt-0.5 text-xs text-parchment-500";
const PICK = "absolute right-3 top-3 h-5 w-5 rounded-full border";

export default function HitPointsStep() {
  const { character, draft, setDraft } = useLevelUpStepContext();
  const { reference } = useReferenceData();
  const referenceClasses = reference?.classes ?? [];
  const [searchParams] = useSearchParams();
  const classEntryId = searchParams.get("entry") ?? character.classes?.[0]?.id;

  const conMod = abilityModifier(character.abilityScores.constitution);
  const conLabel = formatModifier(conMod);
  const conText = `${conLabel} ${abilityAbbr("constitution")}`;

  const die = advancingHitDie(
    character,
    referenceClasses,
    classEntryId ? { kind: "existing", classEntryId } : undefined,
  );
  const faces = dieFaces(die);
  const averageGain = averageHitPointGain(faces, conMod);
  const fixedBase = averageHitPointGain(faces, 0);
  const { min, max } = hitPointGainRange(faces, conMod);

  const method = draft.hp?.method;
  const gain = method === "average" ? averageGain : null;
  const currentMax = character.hitPoints.max;

  return (
    <div>
      <h2 className="text-center font-display text-xl font-semibold text-parchment-900">
        Roll for hit points, or take the average?
      </h2>
      <p className="mt-1 text-center text-sm text-parchment-600">
        You gain 1{die} + your {abilityLabel("constitution")} modifier ({conLabel}) this level.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setDraft((d) => ({ ...d, hp: { method: "average" } }))}
          aria-pressed={method === "average"}
          className={`${CHOICE_BASE} ${method === "average" ? CHOICE_SEL : ""}`}
        >
          <span className={`${PICK} ${method === "average" ? "border-garnet-700 bg-garnet-600" : "border-parchment-300"}`} />
          <div className={CH}>Take average</div>
          <div className={`${CBIG} ${method === "average" ? "text-garnet-700" : "text-parchment-900"}`}>+{averageGain}</div>
          <div className={CNOTE}>
            {fixedBase} (fixed) {conText} = reliable
          </div>
        </button>

        <button
          type="button"
          onClick={() => setDraft((d) => ({ ...d, hp: { method: "roll" } }))}
          aria-pressed={method === "roll"}
          className={`${CHOICE_BASE} ${method === "roll" ? CHOICE_SEL : ""}`}
        >
          <span className={`${PICK} ${method === "roll" ? "border-garnet-700 bg-garnet-600" : "border-parchment-300"}`} />
          <div className={CH}>Roll 1{die}</div>
          <div className={`${CBIG} ${method === "roll" ? "text-garnet-700" : "text-parchment-900"}`}>
            {min}–{max}
          </div>
          <div className={CNOTE}>
            1{die} {conText} = a gamble
          </div>
        </button>
      </div>

      {gain != null && (
        <p className="mt-4 text-center text-sm text-parchment-600">
          New maximum HP{" "}
          <b className="font-display text-lg text-vitality-700">
            {currentMax} → {currentMax + gain}
          </b>
        </p>
      )}
    </div>
  );
}

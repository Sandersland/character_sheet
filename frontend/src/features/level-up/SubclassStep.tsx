// useLevelUpCeremony re-plans around a new subclass pick — it can insert maneuver/tool-proficiency steps into the rail.

import Spinner from "@/components/ui/Spinner";
import { useLevelUpStepContext } from "@/features/level-up/useLevelUpStepContext";
import { useReferenceData } from "@/hooks/useReferenceData";
import { useRovingRadioGroup } from "@/hooks/useRovingRadioGroup";
import { applySubclassPick } from "@/lib/levelUpSteps";

const CARD_BASE =
  "flex flex-col gap-1 rounded border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-garnet-400";
const CARD_SELECTED = "border-garnet-600 bg-parchment-50 ring-2 ring-garnet-50";
const CARD_IDLE = "border-parchment-300 bg-parchment-50 hover:border-garnet-400";

export default function SubclassStep() {
  const { character, draft, setDraft, plan } = useLevelUpStepContext();
  const { reference } = useReferenceData(character.rulesEdition);

  const classDef = reference?.classes.find((c) => c.name === plan.target.className);
  const subclasses = classDef?.subclasses ?? [];
  const checkedIndex = subclasses.findIndex((sub) => sub.id === draft.subclassId);

  // applySubclassPick (#1323) stashes dependent picks under the outgoing subclass's id and restores the incoming one's, so arrowing A→B→A doesn't lose A's picks.
  function pick(subclassId: string) {
    setDraft((d) => applySubclassPick(d, subclassId));
  }

  // Called unconditionally, before the `!reference` early return, so hook order stays stable across renders — subclasses is [] until reference loads, a valid inert input.
  const { itemRef, tabIndexFor, keyDownFor } = useRovingRadioGroup(subclasses.length, checkedIndex, (index) =>
    pick(subclasses[index].id),
  );

  if (!reference) return <Spinner variant="inline" />;

  return (
    <div>
      <h2 className="font-display text-2xl font-semibold text-parchment-900">Choose your subclass</h2>
      <p className="mt-1 text-sm text-parchment-600">
        {plan.target.className} chooses a subclass at level {plan.target.newLevel} — this shapes the rest of your
        levels.
      </p>

      {subclasses.length === 0 ? (
        <p className="mt-5 text-sm text-parchment-500">No subclasses available for {plan.target.className}.</p>
      ) : (
        <div role="radiogroup" aria-label="Subclass" className="mt-5 grid gap-3 sm:grid-cols-2">
          {subclasses.map((sub, i) => {
            const selected = draft.subclassId === sub.id;
            return (
              <button
                key={sub.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={sub.name}
                tabIndex={tabIndexFor(i)}
                ref={itemRef(i)}
                onClick={() => pick(sub.id)}
                onKeyDown={keyDownFor(i)}
                className={`${CARD_BASE} ${selected ? CARD_SELECTED : CARD_IDLE}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-display text-base font-semibold text-parchment-900">{sub.name}</span>
                  <span
                    aria-hidden
                    className={`h-3.5 w-3.5 shrink-0 rounded-full border ${
                      selected ? "border-garnet-600 bg-garnet-soft-surface" : "border-parchment-400"
                    }`}
                  />
                </span>
                <span className="text-sm text-parchment-600">{sub.description}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

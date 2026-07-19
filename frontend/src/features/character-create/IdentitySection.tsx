import Card from "@/components/ui/Card";
import { emptyPackageState } from "@/lib/startingEquipment";
import type { CharacterDraft } from "@/hooks/useCharacterDraft";
import type { ReferenceData } from "@/types/character";

interface IdentitySectionProps {
  draft: CharacterDraft;
  update: (patch: Partial<CharacterDraft>) => void;
  reference: ReferenceData;
}

// Inline marker for required form fields.
function RequiredMark() {
  return (
    <span className="text-garnet-700" aria-hidden="true" title="Required">
      {" "}
      *
    </span>
  );
}

export default function IdentitySection({ draft, update, reference }: IdentitySectionProps) {
  return (
    <Card
      title="Identity"
      headingLevel={2}
      titleAccessory={
        <span className="text-xs font-normal normal-case text-parchment-600">
          <span className="text-garnet-700">*</span> required
        </span>
      }
    >
      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-600">
          <span>
            Name
            <RequiredMark />
          </span>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => update({ name: e.target.value })}
            className="rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1.5 text-sm font-normal normal-case text-parchment-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-600">
          <span>
            Alignment
            <RequiredMark />
          </span>
          <select
            value={draft.alignment}
            onChange={(e) => update({ alignment: e.target.value })}
            className="rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1.5 text-sm font-normal normal-case text-parchment-900"
          >
            <option value="">Select alignment…</option>
            {reference.alignments.map((alignment) => (
              <option key={alignment} value={alignment}>
                {alignment}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-600">
          <span>
            Race
            <RequiredMark />
          </span>
          <select
            value={draft.race}
            onChange={(e) => update({ race: e.target.value })}
            className="rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1.5 text-sm font-normal normal-case text-parchment-900"
          >
            <option value="">Select race…</option>
            {reference.races.map((race) => (
              <option key={race.id} value={race.name}>
                {race.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-600">
          <span>
            Class
            <RequiredMark />
          </span>
          <select
            value={draft.className}
            onChange={(e) => {
              // Changing class resets skill choices, equipment, and subclass.
              const newClassName = e.target.value;
              const newClassDef = reference.classes.find((c) => c.name === newClassName);
              update({
                className: newClassName,
                subclass: "",
                subclassId: "",
                skillProficiencies: [],
                toolChoices: [],
                equipmentDraft: newClassDef?.startingEquipment
                  ? { mode: "package", selections: emptyPackageState(newClassDef.startingEquipment) }
                  : null,
              });
            }}
            className="rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1.5 text-sm font-normal normal-case text-parchment-900"
          >
            <option value="">Select class…</option>
            {reference.classes.map((characterClass) => (
              <option key={characterClass.id} value={characterClass.name}>
                {characterClass.name}
              </option>
            ))}
          </select>
        </label>

        {/* Subclass picker — a select for L1 subclasses; disabled with explanatory text for classes that grant later. */}
        {(() => {
          const classDef = reference.classes.find((c) => c.name === draft.className);
          if (!classDef || classDef.subclasses.length === 0) return null;
          const unlockedAtCreation = classDef.subclassLevel === 1;
          return (
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-600">
              Subclass
              {unlockedAtCreation ? (
                <select
                  value={draft.subclassId}
                  onChange={(e) => {
                    const selected = classDef.subclasses.find((s) => s.id === e.target.value);
                    update({
                      subclassId: e.target.value,
                      subclass: selected?.name ?? "",
                    });
                  }}
                  className="rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1.5 text-sm font-normal normal-case text-parchment-900"
                >
                  <option value="">Select subclass…</option>
                  {classDef.subclasses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="rounded-control border border-parchment-200 bg-parchment-100 px-2 py-1.5 text-sm font-normal normal-case text-parchment-600">
                  Chosen at level {classDef.subclassLevel}
                </div>
              )}
            </label>
          );
        })()}

        <div className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-600">
          <span>
            Background
            <RequiredMark />
          </span>
          {draft.useCustomBackground ? (
            <div className="flex gap-2">
              <input
                type="text"
                aria-label="Background"
                value={draft.customBackground}
                onChange={(e) => update({ customBackground: e.target.value })}
                placeholder="Invent your own…"
                className="flex-1 rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1.5 text-sm font-normal normal-case text-parchment-900"
              />
              <button
                type="button"
                onClick={() => update({ useCustomBackground: false, customBackground: "", backgroundAbilities: {} })}
                className="rounded-control border border-parchment-300 px-2 text-xs font-semibold normal-case text-parchment-600"
              >
                Use list
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <select
                aria-label="Background"
                value={draft.background}
                onChange={(e) => update({ background: e.target.value, skillProficiencies: [], toolChoices: [], backgroundAbilities: {} })}
                className="flex-1 rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1.5 text-sm font-normal normal-case text-parchment-900"
              >
                <option value="">Select background…</option>
                {reference.backgrounds.map((background) => (
                  <option key={background.id} value={background.name}>
                    {background.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  update({ useCustomBackground: true, background: "", skillProficiencies: [], toolChoices: [], backgroundAbilities: {} })
                }
                className="rounded-control border border-parchment-300 px-2 text-xs font-semibold normal-case text-parchment-600"
              >
                Custom…
              </button>
            </div>
          )}
        </div>

        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-600 sm:col-span-2">
          Portrait URL (optional)
          <input
            type="text"
            value={draft.portraitUrl}
            onChange={(e) => update({ portraitUrl: e.target.value })}
            placeholder="https://…"
            className="rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1.5 text-sm font-normal normal-case text-parchment-900"
          />
        </label>
      </div>
    </Card>
  );
}

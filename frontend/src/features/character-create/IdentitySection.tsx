import Card from "@/components/ui/Card";
import ImageUploadControl from "@/components/ui/ImageUploadControl";
import { emptyPackageState } from "@/lib/startingEquipment";
import { ABILITY_LABELS } from "@/lib/abilities";
import type { CharacterDraft } from "@/hooks/useCharacterDraft";
import type { ReferenceData } from "@/types/character";

// PHB'24: choose one of three abilities (not the full six) when you select a spell-granting lineage/legacy.
const CASTING_ABILITIES = ["intelligence", "wisdom", "charisma"] as const;

interface IdentitySectionProps {
  draft: CharacterDraft;
  update: (patch: Partial<CharacterDraft>) => void;
  reference: ReferenceData;
  // Staged locally (deferred mode); uploaded by save() after create.
  portraitFile: File | null;
  onPortraitChange: (file: File | null) => void;
}

function RequiredMark() {
  return (
    <span className="text-garnet-700" aria-hidden="true" title="Required">
      {" "}
      *
    </span>
  );
}

export default function IdentitySection({
  draft,
  update,
  reference,
  portraitFile,
  onPortraitChange,
}: IdentitySectionProps) {
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
            Species
            <RequiredMark />
          </span>
          <select
            value={draft.speciesId}
            onChange={(e) =>
              // A variantId and castingAbility only mean something relative to their own species, so changing species resets both (#1680, #1683).
              update({ speciesId: e.target.value, variantId: "", castingAbility: "" })
            }
            className="rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1.5 text-sm font-normal normal-case text-parchment-900"
          >
            <option value="">Select species…</option>
            {reference.species.map((species) => (
              <option key={species.id} value={species.id}>
                {species.name}
              </option>
            ))}
          </select>
        </label>

        {(() => {
          const selectedSpecies = reference.species.find((s) => s.id === draft.speciesId);
          if (!selectedSpecies || selectedSpecies.variants.length === 0) return null;
          return (
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-600">
              <span>
                Variant
                <RequiredMark />
              </span>
              <select
                value={draft.variantId}
                onChange={(e) =>
                  // castingAbility only means something relative to the chosen variant, so changing variant resets it (#1683).
                  update({ variantId: e.target.value, castingAbility: "" })
                }
                className="rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1.5 text-sm font-normal normal-case text-parchment-900"
              >
                <option value="">Select variant…</option>
                {selectedSpecies.variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.name}
                  </option>
                ))}
              </select>
            </label>
          );
        })()}

        {/* needsCastingAbility is server-resolved (#1683) — never re-derived here. */}
        {(() => {
          const selectedSpecies = reference.species.find((s) => s.id === draft.speciesId);
          const selectedVariant = selectedSpecies?.variants.find((v) => v.id === draft.variantId);
          const needsCastingAbility = selectedVariant?.needsCastingAbility ?? selectedSpecies?.needsCastingAbility ?? false;
          if (!needsCastingAbility) return null;
          return (
            <div className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-600 sm:col-span-2">
              <span>
                Casting Ability
                <RequiredMark />
              </span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Casting ability">
                {CASTING_ABILITIES.map((ability) => {
                  const pressed = draft.castingAbility === ability;
                  return (
                    <button
                      key={ability}
                      type="button"
                      aria-pressed={pressed}
                      onClick={() => update({ castingAbility: ability })}
                      className={`rounded-control border px-3 py-1.5 text-xs font-semibold normal-case transition-colors ${
                        pressed
                          ? "border-garnet-surface bg-garnet-surface text-garnet-on-surface"
                          : "border-parchment-300 text-parchment-700 hover:border-arcane-400"
                      }`}
                    >
                      {ABILITY_LABELS[ability]}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-600">
          <span>
            Class
            <RequiredMark />
          </span>
          <select
            value={draft.className}
            onChange={(e) => {
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

        {(() => {
          const classDef = reference.classes.find((c) => c.name === draft.className);
          if (!classDef || classDef.subclasses.length === 0) return null;
          const unlockedAtCreation = classDef.subclassGateLevel === 1;
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
                  Chosen at level {classDef.subclassGateLevel}
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
                onClick={() =>
                  update({
                    useCustomBackground: false,
                    customBackground: "",
                    backgroundAbilities: {},
                    backgroundEquipmentDraft: null,
                  })
                }
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
                onChange={(e) => {
                  const newBackgroundName = e.target.value;
                  const newBackgroundDef = reference.backgrounds.find((b) => b.name === newBackgroundName);
                  update({
                    background: newBackgroundName,
                    skillProficiencies: [],
                    toolChoices: [],
                    backgroundAbilities: {},
                    backgroundEquipmentDraft: newBackgroundDef?.startingEquipment
                      ? { mode: "package", selections: emptyPackageState(newBackgroundDef.startingEquipment) }
                      : null,
                  });
                }}
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
                  update({
                    useCustomBackground: true,
                    background: "",
                    skillProficiencies: [],
                    toolChoices: [],
                    backgroundAbilities: {},
                    backgroundEquipmentDraft: null,
                  })
                }
                className="rounded-control border border-parchment-300 px-2 text-xs font-semibold normal-case text-parchment-600"
              >
                Custom…
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-600 sm:col-span-2">
          <span>Portrait (optional)</span>
          <div className="font-normal normal-case tracking-normal">
            <ImageUploadControl
              file={portraitFile}
              onSelect={onPortraitChange}
              onRemove={() => onPortraitChange(null)}
              label="Portrait"
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

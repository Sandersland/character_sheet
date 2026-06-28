import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { createCharacter, fetchItems } from "@/api/client";
import AbilityScoreEditor from "@/features/abilities/AbilityScoreEditor";
import BackendStatus from "@/features/character-meta/BackendStatus";
import Card from "@/components/ui/Card";
import StartingEquipmentEditor from "@/features/inventory/StartingEquipmentEditor";
import { draftToInput, emptyPackageState } from "@/lib/startingEquipment";
import { missingRequirements } from "@/lib/characterCreationValidation";
import { abilityModifier, formatModifier, skillLabel } from "@/lib/abilities";
import type { Item, SkillName } from "@/types/character";
import { useCharacterDraft } from "@/hooks/useCharacterDraft";
import { useReferenceData } from "@/hooks/useReferenceData";

function hitDieFace(hitDie: string): number {
  return Number(hitDie.replace(/^d/i, ""));
}

/** Inline marker for required form fields. */
function RequiredMark() {
  return (
    <span className="text-garnet-700" aria-hidden="true" title="Required">
      {" "}
      *
    </span>
  );
}

export default function CharacterCreatePage() {
  const navigate = useNavigate();
  const { draft, update, clear } = useCharacterDraft();
  const { reference, error: referenceError } = useReferenceData();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [catalog, setCatalog] = useState<Item[]>([]);

  // Load the item catalog once for the equipment picker's open-pick dropdowns.
  useEffect(() => {
    fetchItems().then(setCatalog).catch(() => {});
  }, []);

  const selectedRace = reference?.races.find((r) => r.name === draft.race);
  const selectedClass = reference?.classes.find((c) => c.name === draft.className);
  const selectedBackground = reference?.backgrounds.find((b) => b.name === draft.background);

  const grantedSkills = draft.useCustomBackground ? [] : selectedBackground?.skillProficiencies ?? [];
  const classChoiceOptions = (selectedClass?.skillChoices ?? []).filter(
    (skill) => !grantedSkills.includes(skill)
  );
  const maxClassChoices = selectedClass?.skillChoiceCount ?? 0;
  const selectedClassChoices = draft.skillProficiencies.filter((s) => classChoiceOptions.includes(s));

  function toggleSkill(skill: SkillName) {
    const isSelected = selectedClassChoices.includes(skill);
    if (isSelected) {
      update({ skillProficiencies: draft.skillProficiencies.filter((s) => s !== skill) });
    } else if (selectedClassChoices.length < maxClassChoices) {
      update({ skillProficiencies: [...draft.skillProficiencies, skill] });
    }
  }

  // ── Tool proficiencies ────────────────────────────────────────────────────
  // Granted = fixed from background/class/race (read-only display).
  // Choices = player-selectable from class.toolChoices up to toolChoiceCount.

  const grantedToolProfs = [
    ...(draft.useCustomBackground ? [] : selectedBackground?.toolProficiencies ?? []),
    ...(selectedClass?.toolProficiencies ?? []),
    ...(selectedRace?.toolProficiencies ?? []),
  ].filter((name, idx, arr) => arr.indexOf(name) === idx); // dedup

  const toolChoiceOptions = (selectedClass?.toolChoices ?? []).filter(
    (name) => !grantedToolProfs.includes(name)
  );
  const maxToolChoices = selectedClass?.toolChoiceCount ?? 0;
  const selectedToolChoices = draft.toolChoices.filter((t) =>
    toolChoiceOptions.includes(t)
  );

  function toggleToolChoice(name: string) {
    const isSelected = selectedToolChoices.includes(name);
    if (isSelected) {
      update({ toolChoices: draft.toolChoices.filter((t) => t !== name) });
    } else if (selectedToolChoices.length < maxToolChoices) {
      update({ toolChoices: [...draft.toolChoices, name] });
    }
  }

  const backgroundNameForSubmit = draft.useCustomBackground
    ? draft.customBackground.trim()
    : draft.background;

  // Equipment validation: if the class has a starting-equipment definition
  // and the player has started filling it in, the selection must be complete.
  // If the player hasn't touched it yet (null), we skip validation — the
  // character will simply start with no inventory.
  const equipmentInput =
    draft.equipmentDraft && selectedClass?.startingEquipment
      ? draftToInput(selectedClass.startingEquipment, draft.equipmentDraft)
      : undefined;

  // A single source of truth for "why is Save disabled?": a human-readable
  // list of the requirements still unmet (including nested equipment picks).
  // `isValid` is simply "nothing is missing".
  const missing = missingRequirements({
    name: draft.name,
    alignment: draft.alignment,
    race: draft.race,
    className: draft.className,
    backgroundName: backgroundNameForSubmit,
    startingEquipment: selectedClass?.startingEquipment ?? null,
    equipmentDraft: draft.equipmentDraft,
  });
  const isValid = missing.length === 0;

  const dexModifier = abilityModifier(draft.abilityScores.dexterity);
  const conModifier = abilityModifier(draft.abilityScores.constitution);
  const previewArmorClass = 10 + dexModifier;
  const previewMaxHp = selectedClass
    ? Math.max(1, hitDieFace(selectedClass.hitDie) + conModifier)
    : undefined;

  async function handleSave() {
    if (!isValid || submitting) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      const created = await createCharacter({
        name: draft.name.trim(),
        alignment: draft.alignment,
        race: draft.race,
        background: backgroundNameForSubmit,
        classes: [{
          name: draft.className,
          subclass: draft.subclass.trim() || null,
          subclassId: draft.subclassId || undefined,
        }],
        abilityScores: draft.abilityScores,
        skillProficiencies: [...grantedSkills, ...selectedClassChoices],
        toolChoices: selectedToolChoices.length > 0 ? selectedToolChoices : undefined,
        portraitUrl: draft.portraitUrl.trim() || null,
        startingEquipment: equipmentInput ?? undefined,
      });
      clear();
      // The URL gains the new character's id now that one exists; replace
      // (not push) so the now-stale empty form doesn't linger in history.
      navigate(`/characters/${created.id}`, { replace: true });
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-parchment-100">
      <header className="border-b border-parchment-200 bg-parchment-50">
        <div className="mx-auto flex max-w-4xl flex-wrap items-start justify-between gap-4 px-6 py-5">
          <div>
            <Link
              to="/"
              className="text-xs font-semibold text-garnet-700 hover:underline"
            >
              ← All characters
            </Link>
            <h1 className="mt-1 font-display text-3xl font-semibold text-parchment-900">
              New Character
            </h1>
            <p className="mt-1 text-sm text-parchment-600">
              Fill in what you know now — your progress is saved on this device
              until you press Save.
            </p>
          </div>
          <BackendStatus />
        </div>
      </header>

      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-8">
        {referenceError ? (
          <Card className="p-4">
            <p className="text-sm text-garnet-700">
              Couldn't load races/classes/backgrounds. Check that the backend is
              running and try refreshing.
            </p>
          </Card>
        ) : !reference ? (
          <p className="text-sm text-parchment-600">Loading options…</p>
        ) : (
          <>
            <Card
              title="Identity"
              titleAccessory={
                <span className="text-xs font-normal normal-case text-parchment-500">
                  <span className="text-garnet-700">*</span> required
                </span>
              }
            >
              <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-500">
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

                <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-500">
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

                <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-500">
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

                <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-500">
                  <span>
                    Class
                    <RequiredMark />
                  </span>
                  <select
                    value={draft.className}
                    onChange={(e) => {
                      // Changing class resets skill choices, equipment, and subclass.
                      const newClassName = e.target.value;
                      const newClassDef = reference.classes.find(
                        (c) => c.name === newClassName
                      );
                      update({
                        className: newClassName,
                        subclass: "",
                        subclassId: "",
                        skillProficiencies: [],
                        toolChoices: [],
                        equipmentDraft:
                          newClassDef?.startingEquipment
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

                {/* Subclass picker — a class-aware select for L1 subclasses (Cleric,
                    Sorcerer, Warlock); disabled with explanatory text for classes that
                    grant their subclass later (Fighter L3, Wizard L2, etc.). */}
                {(() => {
                  const classDef = reference.classes.find((c) => c.name === draft.className);
                  if (!classDef || classDef.subclasses.length === 0) return null;
                  const unlockedAtCreation = classDef.subclassLevel === 1;
                  return (
                    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-500">
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
                        <div className="rounded-control border border-parchment-200 bg-parchment-100 px-2 py-1.5 text-sm font-normal normal-case text-parchment-500">
                          Chosen at level {classDef.subclassLevel}
                        </div>
                      )}
                    </label>
                  );
                })()}

                <div className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-500">
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
                        onClick={() => update({ useCustomBackground: false, customBackground: "" })}
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
                        onChange={(e) => update({ background: e.target.value, skillProficiencies: [], toolChoices: [] })}
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
                          update({ useCustomBackground: true, background: "", skillProficiencies: [], toolChoices: [] })
                        }
                        className="rounded-control border border-parchment-300 px-2 text-xs font-semibold normal-case text-parchment-600"
                      >
                        Custom…
                      </button>
                    </div>
                  )}
                </div>

                <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-500 sm:col-span-2">
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

            <Card title="Ability Scores">
              <div className="p-4">
                <AbilityScoreEditor
                  method={draft.abilityMethod}
                  pool={draft.abilityPool}
                  assignments={draft.abilityAssignments}
                  abilityScores={draft.abilityScores}
                  onMethodChange={(method, pool, assignments) =>
                    update({ abilityMethod: method, abilityPool: pool, abilityAssignments: assignments })
                  }
                  onPoolChange={(pool) => update({ abilityPool: pool })}
                  onAssignmentsChange={(assignments, scores) =>
                    update({ abilityAssignments: assignments, abilityScores: scores })
                  }
                  onScoresChange={(scores) => update({ abilityScores: scores })}
                />
              </div>
            </Card>

            <Card title="Skill Proficiencies">
              <div className="flex flex-col gap-3 p-4">
                {!selectedClass ? (
                  <p className="text-sm text-parchment-600">
                    Pick a class above to choose its skill proficiencies.
                  </p>
                ) : (
                  <>
                    {grantedSkills.length > 0 && (
                      <p className="text-xs text-parchment-600">
                        Granted by background: {grantedSkills.map((s) => skillLabel(s)).join(", ")}
                      </p>
                    )}
                    <p className="text-xs font-semibold text-parchment-600">
                      Choose {maxClassChoices} ({selectedClassChoices.length}/{maxClassChoices} selected)
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {classChoiceOptions.map((skill) => (
                        <label
                          key={skill}
                          className="flex items-center gap-2 text-sm text-parchment-800"
                        >
                          <input
                            type="checkbox"
                            checked={selectedClassChoices.includes(skill)}
                            onChange={() => toggleSkill(skill)}
                            disabled={
                              !selectedClassChoices.includes(skill) &&
                              selectedClassChoices.length >= maxClassChoices
                            }
                          />
                          {skillLabel(skill)}
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </Card>

            {/* Tool Proficiency Choices — only shown when the class grants a
                choice (e.g. Bard → 3 instruments; Monk → 1 artisan or
                instrument). Also shows any granted tool profs as read-only. */}
            {(grantedToolProfs.length > 0 || toolChoiceOptions.length > 0) && (
              <Card title="Tool Proficiencies">
                <div className="flex flex-col gap-3 p-4">
                  {grantedToolProfs.length > 0 && (
                    <p className="text-xs text-parchment-600">
                      Granted:{" "}
                      <span className="font-medium text-parchment-800">
                        {grantedToolProfs.join(", ")}
                      </span>
                    </p>
                  )}
                  {toolChoiceOptions.length > 0 && (
                    <>
                      <p className="text-xs font-semibold text-parchment-600">
                        Choose {maxToolChoices} (
                        {selectedToolChoices.length}/{maxToolChoices} selected)
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {toolChoiceOptions.map((name) => (
                          <label
                            key={name}
                            className="flex items-center gap-2 text-sm text-parchment-800"
                          >
                            <input
                              type="checkbox"
                              checked={selectedToolChoices.includes(name)}
                              onChange={() => toggleToolChoice(name)}
                              disabled={
                                !selectedToolChoices.includes(name) &&
                                selectedToolChoices.length >= maxToolChoices
                              }
                            />
                            {name}
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </Card>
            )}

            {selectedClass?.startingEquipment && draft.equipmentDraft && (
              <Card
                title="Starting Equipment"
                titleAccessory={
                  <span className="text-xs font-normal normal-case text-parchment-500">
                    All choices required
                  </span>
                }
              >
                <div className="p-4">
                  <StartingEquipmentEditor
                    startingEquipment={selectedClass.startingEquipment}
                    catalog={catalog}
                    value={draft.equipmentDraft}
                    onChange={(eq) => update({ equipmentDraft: eq })}
                  />
                </div>
              </Card>
            )}

            <Card title="Preview" titleAccessory={<span className="text-xs text-parchment-500">Level 1</span>}>
              <div className="grid grid-cols-2 gap-4 p-4 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-parchment-500">
                    Armor Class
                  </p>
                  <p className="font-display text-xl text-garnet-800">{previewArmorClass}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-parchment-500">
                    Initiative
                  </p>
                  <p className="font-display text-xl text-garnet-800">
                    {formatModifier(dexModifier)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-parchment-500">Speed</p>
                  <p className="font-display text-xl text-garnet-800">
                    {selectedRace ? `${selectedRace.speed} ft` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-parchment-500">
                    Hit Points
                  </p>
                  <p className="font-display text-xl text-garnet-800">
                    {previewMaxHp ?? "—"}
                  </p>
                </div>
              </div>
            </Card>

            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={!isValid || submitting}
                  onClick={handleSave}
                  title={
                    isValid
                      ? undefined
                      : `Still needed before you can save: ${missing.join(", ")}`
                  }
                  className="rounded-control bg-garnet-700 px-4 py-2 text-sm font-semibold text-parchment-50 transition-colors hover:bg-garnet-800 disabled:opacity-50"
                >
                  {submitting ? "Saving…" : "Save Character"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Start over? This clears the draft saved on this device."
                      )
                    ) {
                      clear();
                    }
                  }}
                  className="rounded-control border border-parchment-300 px-3 py-2 text-sm font-semibold text-parchment-600 transition-colors hover:border-garnet-400 hover:text-garnet-700"
                >
                  Start over
                </button>
                {submitError && (
                  <p className="text-xs font-semibold text-garnet-700">
                    Couldn't save — check the form and try again.
                  </p>
                )}
              </div>

              {/* Live explanation of why Save is disabled — lists exactly which
                  requirements (incl. nested equipment picks) remain unmet. */}
              {!isValid && (
                <div
                  role="status"
                  className="rounded-control border border-parchment-300 bg-parchment-50 px-3 py-2 text-sm text-parchment-700"
                >
                  <p className="font-semibold text-parchment-800">
                    Still needed before you can save:
                  </p>
                  <ul className="mt-1 list-disc pl-5">
                    {missing.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

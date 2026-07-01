import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { createCharacter, fetchItems } from "@/api/client";
import AbilityScoresSection from "@/features/character-create/AbilityScoresSection";
import BackendStatus from "@/features/character-meta/BackendStatus";
import Card from "@/components/ui/Card";
import IdentitySection from "@/features/character-create/IdentitySection";
import Spinner from "@/components/ui/Spinner";
import StartingEquipmentEditor from "@/features/inventory/StartingEquipmentEditor";
import { draftToInput } from "@/lib/startingEquipment";
import { missingRequirements } from "@/lib/characterCreationValidation";
import { abilityModifier, formatModifier, skillLabel } from "@/lib/abilities";
import type { Item, SkillName } from "@/types/character";
import { useCharacterDraft } from "@/hooks/useCharacterDraft";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { useReferenceData } from "@/hooks/useReferenceData";

function hitDieFace(hitDie: string): number {
  return Number(hitDie.replace(/^d/i, ""));
}

export default function CharacterCreatePage() {
  const navigate = useNavigate();
  const { draft, update, clear } = useCharacterDraft();
  const { reference, error: referenceError } = useReferenceData();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [catalog, setCatalog] = useState<Item[]>([]);
  const showSpinner = useDelayedFlag(!reference && !referenceError);

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
      <div className="border-b border-parchment-200 bg-parchment-50">
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
      </div>

      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-8">
        {referenceError ? (
          <Card className="p-4">
            <p className="text-sm text-garnet-700">
              Couldn't load races/classes/backgrounds. Check that the backend is
              running and try refreshing.
            </p>
          </Card>
        ) : !reference ? (
          showSpinner ? <Spinner className="py-16" /> : null
        ) : (
          <>
            <IdentitySection draft={draft} update={update} reference={reference} />

            <AbilityScoresSection draft={draft} update={update} />

            <Card title="Skill Proficiencies" headingLevel={2}>
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
              <Card title="Tool Proficiencies" headingLevel={2}>
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
                headingLevel={2}
                titleAccessory={
                  <span className="text-xs font-normal normal-case text-parchment-600">
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

            <Card title="Preview" headingLevel={2} titleAccessory={<span className="text-xs text-parchment-600">Level 1</span>}>
              <div className="grid grid-cols-2 gap-4 p-4 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-parchment-600">
                    Armor Class
                  </p>
                  <p className="font-display text-xl text-garnet-800">{previewArmorClass}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-parchment-600">
                    Initiative
                  </p>
                  <p className="font-display text-xl text-garnet-800">
                    {formatModifier(dexModifier)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-parchment-600">Speed</p>
                  <p className="font-display text-xl text-garnet-800">
                    {selectedRace ? `${selectedRace.speed} ft` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-parchment-600">
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

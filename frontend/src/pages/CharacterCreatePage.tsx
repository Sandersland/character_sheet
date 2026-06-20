import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { createCharacter, fetchItems, fetchReference } from "../api/client";
import AbilityScoreEditor from "../components/AbilityScoreEditor";
import BackendStatus from "../components/BackendStatus";
import Card from "../components/Card";
import StartingEquipmentEditor from "../components/StartingEquipmentEditor";
import {
  draftToInput,
  emptyPackageState,
  type EquipmentDraft,
} from "../lib/startingEquipment";
import { abilityModifier, formatModifier } from "../lib/abilities";
import type { AbilityName, AbilityScores, Item, ReferenceData, SkillName } from "../types/character";

const DRAFT_STORAGE_KEY = "character-draft:new";

type AbilityMethod = "manual" | "roll" | "standardArray" | "pointBuy";

const DEFAULT_ABILITY_SCORES: AbilityScores = {
  strength: 10,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  wisdom: 10,
  charisma: 10,
};

const EMPTY_ASSIGNMENTS: Record<AbilityName, number | null> = {
  strength: null,
  dexterity: null,
  constitution: null,
  intelligence: null,
  wisdom: null,
  charisma: null,
};

interface CharacterDraft {
  name: string;
  alignment: string;
  race: string;
  className: string;
  subclass: string;
  portraitUrl: string;
  background: string;
  useCustomBackground: boolean;
  customBackground: string;
  abilityMethod: AbilityMethod;
  abilityPool: number[] | null;
  abilityAssignments: Record<AbilityName, number | null>;
  abilityScores: AbilityScores;
  skillProficiencies: SkillName[];
  equipmentDraft: EquipmentDraft | null;
}

const EMPTY_DRAFT: CharacterDraft = {
  name: "",
  alignment: "",
  race: "",
  className: "",
  subclass: "",
  portraitUrl: "",
  background: "",
  useCustomBackground: false,
  customBackground: "",
  abilityMethod: "manual",
  abilityPool: null,
  abilityAssignments: EMPTY_ASSIGNMENTS,
  abilityScores: DEFAULT_ABILITY_SCORES,
  skillProficiencies: [],
  equipmentDraft: null,
};

/**
 * Stages the in-progress form in localStorage so a player can fill in what
 * they know now, navigate away, and come back to finish later — the form
 * only talks to the backend once, on the first Save (see handleSave below).
 */
function useCharacterDraft() {
  const [draft, setDraft] = useState<CharacterDraft>(() => {
    try {
      const stored = localStorage.getItem(DRAFT_STORAGE_KEY);
      return stored ? { ...EMPTY_DRAFT, ...JSON.parse(stored) } : EMPTY_DRAFT;
    } catch {
      return EMPTY_DRAFT;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // localStorage may be unavailable (private browsing, quota, etc).
      // Creation still works for the current session — it just won't
      // survive a reload.
    }
  }, [draft]);

  function update(patch: Partial<CharacterDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function clear() {
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      // ignore — nothing to clean up if storage was never available
    }
    setDraft(EMPTY_DRAFT);
  }

  return { draft, update, clear };
}

function useReferenceData() {
  const [reference, setReference] = useState<ReferenceData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetchReference()
      .then((data) => {
        if (mounted) setReference(data);
      })
      .catch(() => {
        if (mounted) setError(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return { reference, error };
}

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
  const equipmentIsComplete =
    !draft.equipmentDraft ||
    !selectedClass?.startingEquipment ||
    equipmentInput !== null;

  const isValid =
    draft.name.trim().length > 0 &&
    draft.alignment.length > 0 &&
    draft.race.length > 0 &&
    draft.className.length > 0 &&
    backgroundNameForSubmit.length > 0 &&
    equipmentIsComplete;

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
        classes: [{ name: draft.className, subclass: draft.subclass.trim() || null }],
        abilityScores: draft.abilityScores,
        skillProficiencies: [...grantedSkills, ...selectedClassChoices],
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
            <Card title="Identity">
              <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-500">
                  Name
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) => update({ name: e.target.value })}
                    className="rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1.5 text-sm font-normal normal-case text-parchment-900"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-500">
                  Alignment
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
                  Race
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
                  Class
                  <select
                    value={draft.className}
                    onChange={(e) => {
                      // Changing class resets both skill choices and equipment
                      // selection — the new class has different options.
                      const newClassName = e.target.value;
                      const newClassDef = reference.classes.find(
                        (c) => c.name === newClassName
                      );
                      update({
                        className: newClassName,
                        skillProficiencies: [],
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

                <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-500">
                  Subclass (optional)
                  <input
                    type="text"
                    value={draft.subclass}
                    onChange={(e) => update({ subclass: e.target.value })}
                    placeholder="e.g. School of Evocation"
                    className="rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1.5 text-sm font-normal normal-case text-parchment-900"
                  />
                </label>

                <div className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-500">
                  Background
                  {draft.useCustomBackground ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
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
                        value={draft.background}
                        onChange={(e) => update({ background: e.target.value, skillProficiencies: [] })}
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
                          update({ useCustomBackground: true, background: "", skillProficiencies: [] })
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
                        Granted by background: {grantedSkills.join(", ")}
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
                          {skill}
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </Card>

            {selectedClass?.startingEquipment && draft.equipmentDraft && (
              <Card title="Starting Equipment">
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

            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={!isValid || submitting}
                onClick={handleSave}
                className="rounded-control bg-garnet-700 px-4 py-2 text-sm font-semibold text-parchment-50 transition-colors hover:bg-garnet-800 disabled:opacity-50"
              >
                {submitting ? "Saving…" : "Save Character"}
              </button>
              {submitError && (
                <p className="text-xs font-semibold text-garnet-700">
                  Couldn't save — check the form and try again.
                </p>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

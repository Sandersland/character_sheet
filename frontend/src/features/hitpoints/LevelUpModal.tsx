import { useState } from "react";

import Modal from "@/components/ui/Modal";
import { averageHitPointGain, dieFaces, hitPointGainRange } from "@/lib/hitDice";
import { multiclassPrereqMet } from "@/lib/multiclass";
import type { Character, ClassOption, LevelUpTarget } from "@/types/character";

export default function LevelUpModal({
  character,
  referenceClasses,
  conMod,
  pending,
  onConfirm,
  onClose,
}: {
  character: Character;
  referenceClasses: ClassOption[];
  conMod: number;
  pending: boolean;
  onConfirm: (method: "average" | "roll", target: LevelUpTarget | undefined) => void;
  onClose: () => void;
}) {
  const entries = character.classes ?? [];
  // "existing:<entryId>" or "new" — default to advancing the primary class.
  const [choice, setChoice] = useState<string>(entries[0] ? `existing:${entries[0].id}` : "new");
  const [newClassId, setNewClassId] = useState("");

  const ownedNames = new Set(entries.map((c) => c.name.toLowerCase()));
  const addable = referenceClasses
    .filter((c) => !ownedNames.has(c.name.toLowerCase()))
    .map((c) => ({ option: c, met: multiclassPrereqMet(c.multiclassPrerequisite, character.abilityScores) }));

  const isNew = choice === "new";
  const selectedNew = addable.find((a) => a.option.id === newClassId);
  const selectedNewMet = selectedNew?.met ?? false;

  // Hit die of the class being advanced — drives the HP preview + roll bounds.
  const advancingEntry = isNew ? undefined : entries.find((e) => `existing:${e.id}` === choice);
  const advancingDie =
    (isNew
      ? selectedNew?.option.hitDie
      : referenceClasses.find((c) => c.name === advancingEntry?.name)?.hitDie) ?? character.hitDice.die;

  const faces = dieFaces(advancingDie);
  const averageGain = averageHitPointGain(faces, conMod);
  const { min: minRoll, max: maxRoll } = hitPointGainRange(faces, conMod);
  const conLabel = conMod >= 0 ? `+${conMod}` : String(conMod);

  const canConfirm = isNew ? Boolean(selectedNew) && selectedNewMet : Boolean(advancingEntry);

  function handleConfirm(m: "average" | "roll") {
    if (!canConfirm) return;
    const target: LevelUpTarget | undefined = isNew
      ? { kind: "new", classId: newClassId }
      : advancingEntry
        ? { kind: "existing", classEntryId: advancingEntry.id }
        : undefined;
    onConfirm(m, target);
  }

  return (
    <Modal title="Level Up" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
            Which class advances?
          </legend>
          {entries.map((entry) => (
            <label key={entry.id} className="flex items-center gap-2 text-sm text-parchment-800">
              <input
                type="radio"
                name="levelup-class"
                checked={choice === `existing:${entry.id}`}
                onChange={() => setChoice(`existing:${entry.id}`)}
                disabled={pending}
              />
              {entry.name} {entry.level} → {entry.level + 1}
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm text-parchment-800">
            <input
              type="radio"
              name="levelup-class"
              checked={isNew}
              onChange={() => setChoice("new")}
              disabled={pending}
            />
            New class (multiclass)
          </label>
          {isNew && (
            <select
              value={newClassId}
              onChange={(e) => setNewClassId(e.target.value)}
              disabled={pending}
              className="w-full rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 focus:border-garnet-500 focus:outline-none disabled:opacity-50"
            >
              <option value="" disabled>
                Choose a class…
              </option>
              {addable.map(({ option, met }) => (
                <option key={option.id} value={option.id} disabled={!met}>
                  {option.name}
                  {!met && option.multiclassPrerequisite
                    ? ` — requires ${option.multiclassPrerequisite.description}`
                    : ""}
                </option>
              ))}
            </select>
          )}
          {isNew && selectedNew && !selectedNewMet && selectedNew.option.multiclassPrerequisite && (
            <p className="rounded-control bg-garnet-50 px-3 py-2 text-xs font-semibold text-garnet-700">
              {selectedNew.option.name} requires {selectedNew.option.multiclassPrerequisite.description}.
            </p>
          )}
        </fieldset>

        <p className="text-sm text-parchment-700">
          Choose how to gain hit points for this level ({advancingDie} {conLabel} Con):
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={pending || !canConfirm}
            onClick={() => handleConfirm("average")}
            className="flex items-center justify-between rounded-card border border-parchment-300 bg-parchment-50 px-4 py-3 text-left transition-colors hover:bg-parchment-100 disabled:opacity-50"
          >
            <div>
              <p className="font-semibold text-parchment-900">Take average</p>
              <p className="text-xs text-parchment-600">
                Predictable — {averageHitPointGain(faces, 0)} ({conLabel} Con)
              </p>
            </div>
            <span className="font-display text-2xl font-semibold text-arcane-800">
              +{averageGain}
            </span>
          </button>
          <button
            type="button"
            disabled={pending || !canConfirm}
            onClick={() => handleConfirm("roll")}
            className="flex items-center justify-between rounded-card border border-parchment-300 bg-parchment-50 px-4 py-3 text-left transition-colors hover:bg-parchment-100 disabled:opacity-50"
          >
            <div>
              <p className="font-semibold text-parchment-900">Roll {advancingDie}</p>
              <p className="text-xs text-parchment-600">
                Luck-based — {conLabel} Con applied
              </p>
            </div>
            <span className="text-sm text-parchment-600">
              {minRoll}–{maxRoll} HP
            </span>
          </button>
        </div>
      </div>
    </Modal>
  );
}

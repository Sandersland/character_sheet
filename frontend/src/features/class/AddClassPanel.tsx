/**
 * AddClassPanel — inline "multiclass into a new class" affordance for the class
 * section. Surfaces the 5e ability prerequisites the backend serves (per
 * ClassOption.multiclassPrerequisite) and rejects ineligible picks locally; the
 * server re-validates and its error is surfaced on failure.
 */

import { useState } from "react";

import { rollDie } from "@/lib/dice";
import { dieFaces } from "@/lib/hitDice";
import { multiclassPrereqMet } from "@/lib/multiclass";
import type { AddClassOperation, Character, ClassOption } from "@/types/character";

interface Props {
  character: Character;
  referenceClasses: ClassOption[];
  busy: boolean;
  onAddClass: (op: AddClassOperation) => void;
}

export default function AddClassPanel({ character, referenceClasses, busy, onAddClass }: Props) {
  const [open, setOpen] = useState(false);
  const [classId, setClassId] = useState("");
  const [method, setMethod] = useState<"average" | "roll">("average");

  // Classes the character doesn't already have a level in.
  const ownedNames = new Set((character.classes ?? []).map((c) => c.name.toLowerCase()));
  const options = referenceClasses
    .filter((c) => !ownedNames.has(c.name.toLowerCase()))
    .map((c) => ({ option: c, met: multiclassPrereqMet(c.multiclassPrerequisite, character.abilityScores) }));

  const selected = options.find((o) => o.option.id === classId)?.option;
  const selectedMet = selected
    ? multiclassPrereqMet(selected.multiclassPrerequisite, character.abilityScores)
    : false;

  function handleAdd() {
    if (!selected || !selectedMet) return;
    const roll = method === "roll" ? rollDie(dieFaces(selected.hitDie)) : undefined;
    onAddClass({ type: "addClass", classId: selected.id, method, roll });
    setOpen(false);
    setClassId("");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={busy}
        className="rounded-control border border-arcane-700 px-3 py-1.5 text-xs font-semibold text-arcane-700 transition-colors hover:bg-arcane-50 disabled:opacity-50"
      >
        ＋ Add a class
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-parchment-300 bg-parchment-50 p-3">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="add-class-select"
          className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600"
        >
          New class
        </label>
        <select
          id="add-class-select"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          disabled={busy}
          className="w-full rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 focus:border-garnet-500 focus:outline-none disabled:opacity-50"
        >
          <option value="" disabled>
            Choose a class…
          </option>
          {options.map(({ option, met }) => (
            <option key={option.id} value={option.id} disabled={!met}>
              {option.name}
              {!met && option.multiclassPrerequisite
                ? ` — requires ${option.multiclassPrerequisite.description}`
                : ""}
            </option>
          ))}
        </select>
      </div>

      {selected && !selectedMet && selected.multiclassPrerequisite && (
        <p className="rounded-control bg-garnet-50 px-3 py-2 text-xs font-semibold text-garnet-700">
          {selected.name} requires {selected.multiclassPrerequisite.description}.
        </p>
      )}

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
          Hit points for the new level
        </legend>
        <div className="flex gap-4 text-sm text-parchment-700">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="add-class-hp"
              checked={method === "average"}
              onChange={() => setMethod("average")}
              disabled={busy}
            />
            Average
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="add-class-hp"
              checked={method === "roll"}
              onChange={() => setMethod("roll")}
              disabled={busy}
            />
            Roll {selected?.hitDie ?? ""}
          </label>
        </div>
      </fieldset>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleAdd}
          disabled={busy || !selected || !selectedMet}
          className="rounded-control bg-garnet-700 px-3 py-1.5 text-xs font-semibold text-parchment-50 transition-colors hover:bg-garnet-800 disabled:opacity-50"
        >
          Add class
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setClassId("");
          }}
          disabled={busy}
          className="rounded-control border border-parchment-300 px-3 py-1.5 text-xs font-semibold text-parchment-700 transition-colors hover:bg-parchment-100 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

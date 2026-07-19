// Collapsed disclosure for the optional known-spell swap (#1101): a known caster
// may forget one user-learned leveled spell in exchange for an extra learn. The
// candidate list comes from swappableKnownSpells; picking one stages the forget.
import { useState } from "react";

import type { Spell } from "@/types/character";

export default function SwapPanel({
  candidates,
  forgottenEntryId,
  onToggle,
}: {
  candidates: Spell[];
  forgottenEntryId: string | null;
  onToggle: (entryId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const forgotten = candidates.find((s) => s.id === forgottenEntryId);

  return (
    <div className="mt-3 rounded border border-arcane-200 bg-arcane-50/40 p-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left text-sm font-medium text-arcane-800"
      >
        <span>Swap a known spell (optional)</span>
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>

      {forgotten && (
        <p className="mt-1 text-xs text-garnet-700">Forgetting: {forgotten.name}</p>
      )}

      {open && (
        <ul className="mt-2 max-h-[160px] overflow-y-auto">
          {candidates.length === 0 && (
            <li className="py-2 text-center text-xs text-parchment-600">No known spells to swap.</li>
          )}
          {candidates.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                aria-pressed={s.id === forgottenEntryId}
                onClick={() => onToggle(s.id)}
                className={`flex w-full items-center justify-between gap-3 border-b border-arcane-100 py-1.5 text-left text-sm last:border-0 ${
                  s.id === forgottenEntryId ? "font-semibold text-garnet-700" : "text-parchment-900"
                }`}
              >
                <span className="truncate">{s.name}</span>
                <span className="shrink-0 text-xs text-parchment-500">{s.id === forgottenEntryId ? "Forgetting" : "Forget"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

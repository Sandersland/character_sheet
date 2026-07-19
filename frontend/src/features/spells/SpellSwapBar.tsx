// Inline at-cap swap bar (#938): pick a prepared spell to drop so addSpell fits.
import { useEffect } from "react";

import type { Spell } from "@/types/character";

interface SpellSwapBarProps {
  addSpell: Spell;
  candidates: Spell[];
  limit: number;
  busy: boolean;
  onPick: (dropId: string) => void;
  onCancel: () => void;
}

export default function SpellSwapBar({
  addSpell, candidates, limit, busy, onPick, onCancel,
}: SpellSwapBarProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div role="status" className="mb-3 rounded-control border border-arcane-200 bg-arcane-50 px-3 py-2">
      <p className="text-xs font-semibold text-arcane-800">
        Prepared limit reached ({limit}). Swap out a spell to prepare {addSpell.name}:
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {candidates.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            disabled={busy}
            onClick={() => onPick(candidate.id)}
            aria-label={`Swap out ${candidate.name} to prepare ${addSpell.name}`}
            className="rounded bg-arcane-100 px-2 py-0.5 text-xs font-semibold text-arcane-800 hover:bg-arcane-200 disabled:opacity-40"
          >
            {candidate.name}
          </button>
        ))}
        <button
          type="button"
          onClick={onCancel}
          className="py-0.5 text-xs text-parchment-600 hover:text-parchment-700"
        >
          cancel
        </button>
      </div>
    </div>
  );
}

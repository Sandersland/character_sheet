// AddSpellPanel — inline expand-in-place panel for learning a new spell.
// Two tabs: catalog picker (SpellCatalogTab) and custom-spell form (CustomSpellForm).
// Not a modal — the overlay primitive is reserved for read-only review surfaces.
import { useState } from "react";

import CustomSpellForm from "@/features/spells/CustomSpellForm";
import SpellCatalogTab from "@/features/spells/SpellCatalogTab";
import type { CatalogSpell, LearnSpellOperation } from "@/types/character";

interface AddSpellPanelProps {
  /** Called with the op to send; parent batches and fires the API. */
  onLearn: (op: LearnSpellOperation) => void;
  onClose: () => void;
  busy: boolean;
  /** Set of spellId values already in the spellbook (to disable duplicates). */
  learnedSpellIds: Set<string>;
}

export default function AddSpellPanel({ onLearn, onClose, busy, learnedSpellIds }: AddSpellPanelProps) {
  const [tab, setTab] = useState<"catalog" | "custom">("catalog");

  function handleCatalogLearn(spell: CatalogSpell) {
    onLearn({ type: "learnSpell", spellId: spell.id });
  }

  return (
    <div className="mt-3 rounded-card border border-arcane-200 bg-arcane-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-arcane-900">Learn a Spell</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-parchment-600 hover:text-parchment-700"
          aria-label="Close add spell panel"
        >
          ✕
        </button>
      </div>

      <div className="mb-4 flex gap-2 border-b border-arcane-200 pb-2">
        {(["catalog", "custom"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-1 text-xs font-semibold transition-colors ${
              tab === t
                ? "border-b-2 border-arcane-600 text-arcane-800"
                : "text-parchment-600 hover:text-parchment-800"
            }`}
          >
            {t === "catalog" ? "From catalog" : "Custom spell"}
          </button>
        ))}
      </div>

      {tab === "catalog" ? (
        <SpellCatalogTab busy={busy} learnedSpellIds={learnedSpellIds} onLearn={handleCatalogLearn} />
      ) : (
        <CustomSpellForm busy={busy} onLearn={onLearn} onClose={onClose} />
      )}
    </div>
  );
}

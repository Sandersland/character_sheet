// AddSpellPanel — inline expand-in-place panel for learning a new spell.
// Three tabs: catalog picker (SpellCatalogTab), inline custom-spell form
// (CustomSpellForm — a per-character spell, never saved as its own catalog
// row), and homebrew authoring (HomebrewSpellForm — a user-owned catalog
// Spell row, reusable across all of the caller's characters, #1787). Not a
// modal — the overlay primitive is reserved for read-only review surfaces.
import { useState } from "react";

import CustomSpellForm from "@/features/spells/CustomSpellForm";
import HomebrewSpellForm from "@/features/spells/HomebrewSpellForm";
import SpellCatalogTab from "@/features/spells/SpellCatalogTab";
import type { CatalogSpell, LearnSpellOperation } from "@/types/character";
import type { RulesEdition } from "@character-sheet/shared-types";

interface AddSpellPanelProps {
  /** Called with the op to send; parent batches and fires the API. */
  onLearn: (op: LearnSpellOperation) => void;
  onClose: () => void;
  busy: boolean;
  /** Set of spellId values already in the spellbook (to disable duplicates). */
  learnedSpellIds: Set<string>;
  edition: RulesEdition;
}

const TAB_LABELS = { catalog: "From catalog", custom: "Custom spell", homebrew: "Homebrew" } as const;
type Tab = keyof typeof TAB_LABELS;

export default function AddSpellPanel({ onLearn, onClose, busy, learnedSpellIds, edition }: AddSpellPanelProps) {
  const [tab, setTab] = useState<Tab>("catalog");
  // Bumped after a homebrew spell is created (#1787) so SpellCatalogTab's
  // useSpellCatalog refetches and the new spell shows up without a remount.
  const [catalogRefreshKey, setCatalogRefreshKey] = useState(0);

  function handleCatalogLearn(spell: CatalogSpell) {
    onLearn({ type: "learnSpell", spellId: spell.id });
  }

  function handleHomebrewCreated() {
    setCatalogRefreshKey((k) => k + 1);
    setTab("catalog");
  }

  return (
    <div className="mt-3 rounded-card border border-arcane-200 bg-gradient-to-b from-parchment-50 to-arcane-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-parchment-500">Scribe a new spell</p>
          <h3 className="font-display text-lg font-bold text-arcane-800">Learn a spell</h3>
        </div>
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
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
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
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === "catalog" && (
        <SpellCatalogTab
          busy={busy}
          learnedSpellIds={learnedSpellIds}
          edition={edition}
          onLearn={handleCatalogLearn}
          refreshKey={catalogRefreshKey}
        />
      )}
      {tab === "custom" && <CustomSpellForm busy={busy} onLearn={onLearn} onClose={onClose} />}
      {tab === "homebrew" && (
        <HomebrewSpellForm edition={edition} onCreated={handleHomebrewCreated} onClose={onClose} />
      )}
    </div>
  );
}

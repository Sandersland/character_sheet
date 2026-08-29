import { useState } from "react";

import HomebrewTab from "@/features/spells/HomebrewTab";
import SpellCatalogTab from "@/features/spells/SpellCatalogTab";
import { useSpellCatalog } from "@/features/spells/useSpellCatalog";
import type { CatalogSpell, LearnSpellOperation } from "@/types/character";
import type { RulesEdition } from "@character-sheet/shared-types";

interface AddSpellPanelProps {
  onLearn: (op: LearnSpellOperation) => void;
  onClose: () => void;
  busy: boolean;
  learnedSpellIds: Set<string>;
  edition: RulesEdition;
  characterId: string;
}

const TAB_LABELS = { catalog: "From catalog", homebrew: "Homebrew" } as const;
type Tab = keyof typeof TAB_LABELS;

export default function AddSpellPanel({ onLearn, onClose, busy, learnedSpellIds, edition, characterId }: AddSpellPanelProps) {
  const [tab, setTab] = useState<Tab>("catalog");
  const [catalogRefreshKey, setCatalogRefreshKey] = useState(0);
  const { catalog, error, showSpinner } = useSpellCatalog(edition, { characterId }, catalogRefreshKey);

  function handleCatalogLearn(spell: CatalogSpell) {
    onLearn({ type: "learnSpell", spellId: spell.id });
  }

  function handleHomebrewCreated() {
    setCatalogRefreshKey((k) => k + 1);
    setTab("catalog");
  }

  function handleHomebrewChanged() {
    setCatalogRefreshKey((k) => k + 1);
  }

  function handleForked() {
    setCatalogRefreshKey((k) => k + 1);
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
          onLearn={handleCatalogLearn}
          catalog={catalog}
          error={error}
          showSpinner={showSpinner}
          onForked={handleForked}
        />
      )}
      {tab === "homebrew" && (
        <HomebrewTab
          edition={edition}
          characterId={characterId}
          catalog={catalog}
          catalogError={error}
          showSpinner={showSpinner}
          onCreated={handleHomebrewCreated}
          onEdited={handleHomebrewChanged}
          onDeleted={handleHomebrewChanged}
          onClose={onClose}
        />
      )}
    </div>
  );
}

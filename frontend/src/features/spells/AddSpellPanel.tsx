// AddSpellPanel — inline expand-in-place panel for learning a new spell.
// Three tabs: catalog picker (SpellCatalogTab), inline custom-spell form
// (CustomSpellForm — a per-character spell, never saved as its own catalog
// row), and homebrew authoring + management (HomebrewTab — a user-owned
// catalog Spell row, reusable across all of the caller's characters, create
// #1787, edit/delete #1788). Not a modal — the overlay primitive is reserved
// for read-only review surfaces.
//
// The GET /api/spells fetch is owned HERE, not by SpellCatalogTab, so the
// catalog tab's picker and the homebrew tab's manage list share one result
// and one refetch trigger (catalogRefreshKey) instead of racing two
// independent fetches.
import { useState } from "react";

import CustomSpellForm from "@/features/spells/CustomSpellForm";
import HomebrewTab from "@/features/spells/HomebrewTab";
import SpellCatalogTab from "@/features/spells/SpellCatalogTab";
import { useSpellCatalog } from "@/features/spells/useSpellCatalog";
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
  // #1811, epic #1795 9/9: the character this panel is learning FOR, forwarded
  // to GET /api/spells so the picker resolves spells shared/granted into that
  // character's campaign (and a DM's CAMPAIGN override), not just GLOBAL +
  // the caller's own USER-scope entries.
  characterId: string;
}

const TAB_LABELS = { catalog: "From catalog", custom: "Custom spell", homebrew: "Homebrew" } as const;
type Tab = keyof typeof TAB_LABELS;

export default function AddSpellPanel({ onLearn, onClose, busy, learnedSpellIds, edition, characterId }: AddSpellPanelProps) {
  const [tab, setTab] = useState<Tab>("catalog");
  // Bumped after a homebrew spell is created/edited/deleted (#1787/#1788) so
  // the shared useSpellCatalog fetch below refetches and both the catalog
  // picker and the homebrew manage list see the change without a remount.
  const [catalogRefreshKey, setCatalogRefreshKey] = useState(0);
  // `{ characterId }` (#1811) — see this component's own prop comment.
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

  // A fork (#1801, epic #1795 6/6) creates a new catalog entry the same way a
  // homebrew create does — bump the same shared refetch trigger so both the
  // catalog tab and the homebrew manage list (a USER fork lands there too, and
  // — since #1811's campaign-aware picker — a CAMPAIGN fork too, for its DM)
  // pick it up.
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
      {tab === "custom" && <CustomSpellForm busy={busy} onLearn={onLearn} onClose={onClose} />}
      {tab === "homebrew" && (
        <HomebrewTab
          edition={edition}
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

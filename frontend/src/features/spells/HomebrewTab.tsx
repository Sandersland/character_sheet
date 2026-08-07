// AddSpellPanel's "Homebrew" tab content (#1787/#1788, epic #1782 4/5-5/5):
// the create form, plus below it the caller's own homebrew spells with
// edit/delete (HomebrewSpellManageList). `catalog` is the SAME already-
// fetched GET /api/spells result AddSpellPanel passes to SpellCatalogTab —
// this tab derives its list from it (ownedHomebrewSpells) rather than
// running a second fetch, so create/edit/delete all share one refetch
// trigger (catalogRefreshKey in AddSpellPanel).
//
// Edit mode swaps the create-form-plus-list view for HomebrewSpellForm
// itself in `editing` mode: only one form is ever mounted at a time, so the
// static field ids (#homebrew-name etc.) never collide.
import { useState } from "react";

import { deleteCustomSpell } from "@/api/client";
import HomebrewSpellForm from "@/features/spells/HomebrewSpellForm";
import HomebrewSpellManageList from "@/features/spells/HomebrewSpellManageList";
import { ownedHomebrewSpells, toHomebrewSpellInput } from "@/lib/homebrewSpell";
import type { CatalogSpell } from "@/types/character";
import type { RulesEdition } from "@character-sheet/shared-types";

interface HomebrewTabProps {
  edition: RulesEdition;
  catalog: CatalogSpell[] | null;
  /** A new spell was created — caller switches to the catalog tab + refetches. */
  onCreated: () => void;
  /** An existing spell was edited or deleted — caller refetches, staying on this tab. */
  onChanged: () => void;
  onClose: () => void;
}

export default function HomebrewTab({ edition, catalog, onCreated, onChanged, onClose }: HomebrewTabProps) {
  const [editing, setEditing] = useState<CatalogSpell | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const owned = ownedHomebrewSpells(catalog ?? []);

  async function handleDelete(spell: CatalogSpell) {
    setBusyId(spell.id);
    setError(null);
    try {
      await deleteCustomSpell(spell.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete spell.");
    } finally {
      setBusyId(null);
    }
  }

  function handleSaved() {
    setEditing(null);
    onChanged();
  }

  if (editing) {
    return (
      <HomebrewSpellForm
        edition={edition}
        editing={{ id: editing.id, draft: toHomebrewSpellInput(editing) }}
        onSaved={handleSaved}
        onClose={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <HomebrewSpellForm edition={edition} onSaved={onCreated} onClose={onClose} />

      <div>
        <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.2em] text-parchment-500">Your homebrew spells</p>
        {error && <p className="mb-2 text-xs text-garnet-700">{error}</p>}
        <HomebrewSpellManageList spells={owned} busyId={busyId} onEdit={setEditing} onDelete={handleDelete} />
      </div>
    </div>
  );
}

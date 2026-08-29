// Derives its list from `catalog` via ownedHomebrewSpells rather than running a second fetch, so create/edit/delete share AddSpellPanel's catalogRefreshKey.
// Edit mode replaces the create-form-plus-list view entirely with HomebrewSpellForm, so the static field ids (#homebrew-name etc.) never collide.
import { useState } from "react";

import { deleteCustomSpell } from "@/api/client";
import Spinner from "@/components/ui/Spinner";
import HomebrewSpellForm from "@/features/spells/HomebrewSpellForm";
import HomebrewSpellManageList from "@/features/spells/HomebrewSpellManageList";
import { ownedHomebrewSpells, toHomebrewSpellInput } from "@/lib/homebrewSpell";
import type { CatalogSpell } from "@/types/character";
import type { RulesEdition } from "@character-sheet/shared-types";

interface HomebrewTabProps {
  edition: RulesEdition;
  // Forwarded to the create form so the server can derive the new spell's edition from it.
  characterId: string;
  catalog: CatalogSpell[] | null;
  catalogError?: string | null;
  showSpinner?: boolean;
  onCreated: () => void;
  onEdited: () => void;
  onDeleted: () => void;
  onClose: () => void;
}

export default function HomebrewTab({
  edition,
  characterId,
  catalog,
  catalogError = null,
  showSpinner = false,
  onCreated,
  onEdited,
  onDeleted,
  onClose,
}: HomebrewTabProps) {
  const [editing, setEditing] = useState<CatalogSpell | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const owned = ownedHomebrewSpells(catalog ?? []);

  // Rethrows so HomebrewSpellManageRow's own await resets its `confirming` state instead of staying stuck under this error banner.
  async function handleDelete(spell: CatalogSpell): Promise<void> {
    setBusyId(spell.id);
    setDeleteError(null);
    try {
      await deleteCustomSpell(spell.id);
      onDeleted();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete spell.");
      throw err;
    } finally {
      setBusyId(null);
    }
  }

  function handleSaved() {
    setEditing(null);
    onEdited();
  }

  if (editing) {
    return (
      <HomebrewSpellForm
        edition={edition}
        characterId={characterId}
        editing={{ id: editing.id, draft: toHomebrewSpellInput(editing) }}
        onSaved={handleSaved}
        onClose={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <HomebrewSpellForm edition={edition} characterId={characterId} onSaved={onCreated} onClose={onClose} />

      <div>
        <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.2em] text-parchment-500">Your homebrew spells</p>
        {deleteError && <p className="mb-2 text-xs text-garnet-700">{deleteError}</p>}
        {catalogError && <p className="mb-2 text-xs text-garnet-700">{catalogError}</p>}
        {catalog === null && !catalogError && showSpinner && <Spinner />}
        {catalog !== null && (
          <HomebrewSpellManageList spells={owned} busyId={busyId} onEdit={setEditing} onDelete={handleDelete} />
        )}
      </div>
    </div>
  );
}

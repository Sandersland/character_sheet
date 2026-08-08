// AddSpellPanel's "Homebrew" tab content (#1787/#1788, epic #1782 4/5-5/5):
// the create form, plus below it the caller's own homebrew spells with
// edit/delete (HomebrewSpellManageList). `catalog`/`catalogError`/
// `showSpinner` are the SAME already-fetched GET /api/spells result
// AddSpellPanel passes to SpellCatalogTab — this tab derives its list from
// `catalog` (ownedHomebrewSpells) rather than running a second fetch, so
// create/edit/delete all share one refetch trigger (catalogRefreshKey in
// AddSpellPanel), and mirrors SpellCatalogTab's own loading/error branches
// so the manage list doesn't flash its empty state before the first fetch
// resolves.
//
// Edit mode swaps the create-form-plus-list view for HomebrewSpellForm
// itself in `editing` mode: only one form is ever mounted at a time, so the
// static field ids (#homebrew-name etc.) never collide.
//
// onCreated/onEdited/onDeleted are bare refetch signals — AddSpellPanel just
// bumps its shared catalogRefreshKey on any of them; #1811's campaign-aware
// picker (`characterId` threaded into GET /api/spells) is what makes that
// refetch re-supply a DM's CAMPAIGN fork now, so no row payload needs to
// travel through these callbacks (a #1808-era local-override workaround,
// removed once #1811 made it redundant — see git history for that shape).
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
  /** The character being authored for — forwarded to the create form so the
   *  server can derive the new spell's edition from it (#1819). */
  characterId: string;
  catalog: CatalogSpell[] | null;
  catalogError?: string | null;
  showSpinner?: boolean;
  /** A new spell was created — caller switches to the catalog tab + refetches. */
  onCreated: () => void;
  /** An existing spell was edited — caller refetches, staying on this tab. */
  onEdited: () => void;
  /** An existing spell was deleted — caller refetches, staying on this tab. */
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

  // Rethrows after recording the message: HomebrewSpellManageRow awaits this
  // itself so a rejection resets ITS OWN `confirming` state — otherwise a
  // failed delete leaves the row stuck showing "Delete {name}? / Confirm /
  // Cancel" underneath this error banner.
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

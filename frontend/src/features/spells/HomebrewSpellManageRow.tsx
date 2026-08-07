// A single "Your homebrew spells" row (#1788, epic #1782 5/5): Edit/Delete
// controls, with delete a two-step inline confirm — same
// confirm-then-cancel-row shape as ItemDetailFooter's Drop control.
import { useState } from "react";

import { catalogMetaLine } from "@/lib/addSpell";
import type { CatalogSpell } from "@/types/character";

interface HomebrewSpellManageRowProps {
  spell: CatalogSpell;
  busy: boolean;
  onEdit: (spell: CatalogSpell) => void;
  onDelete: (spell: CatalogSpell) => void;
}

export default function HomebrewSpellManageRow({ spell, busy, onEdit, onDelete }: HomebrewSpellManageRowProps) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <li className="flex items-center justify-between gap-3 border-b border-arcane-100 py-2 text-sm last:border-0">
        <span className="text-parchment-700">Delete {spell.name}?</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => onDelete(spell)}
            aria-label={`Confirm deleting ${spell.name}`}
            className="font-semibold text-garnet-700 hover:underline disabled:opacity-40"
          >
            Confirm
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(false)}
            aria-label={`Cancel deleting ${spell.name}`}
            className="font-semibold text-parchment-600 hover:underline disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 border-b border-arcane-100 py-2 last:border-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-parchment-900">{spell.name}</p>
        <p className="text-xs text-parchment-600">{catalogMetaLine(spell)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs font-semibold">
        <button
          type="button"
          disabled={busy}
          onClick={() => onEdit(spell)}
          aria-label={`Edit ${spell.name}`}
          className="text-parchment-700 hover:underline disabled:opacity-40"
        >
          Edit
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${spell.name}`}
          className="text-garnet-700 hover:underline disabled:opacity-40"
        >
          Delete
        </button>
      </div>
    </li>
  );
}

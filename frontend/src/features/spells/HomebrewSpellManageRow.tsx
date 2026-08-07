// A single "Your homebrew spells" row (#1788, epic #1782 5/5): Edit/Delete
// controls, with delete a two-step inline confirm — same
// confirm-then-cancel-row shape as ItemDetailFooter's Drop control. Awaits
// `onDelete` itself (rather than firing-and-forgetting) so a rejected delete
// resets `confirming` here instead of leaving the row stuck showing BOTH the
// confirm prompt and HomebrewTab's error banner.
//
// "Share" (#1799/#1801, epic #1795 4/6+6/6) opens ShareSpellSheet, offered
// only for a USER-scope row: grants.ts's POST …/grants 400s any other scope
// ("Only USER-scope catalog entries can be granted"), and since #1808 (epic
// #1795 8/8) this list also carries a DM's CAMPAIGN-scope forks (already
// campaign-wide by construction — nothing to share). A "Forked" badge
// surfaces when the row is itself a fork of some other entry (isForkedSpell).
//
// Edit/Delete are gated on `catalog.editable` (#1808 leak-fix, epic #1795
// 8/9 combined-state review), not just "this row reached the manage list at
// all": since #1811 (epic #1795 9/9) the campaign-aware picker can serve a
// CAMPAIGN row to a non-DM member too (ownedHomebrewSpells' own list-level
// filter already excludes those — this is the same check again at the row,
// defense in depth, not a second source of truth: both read the ONE
// server-computed field). `catalog === undefined` (an older/no-metadata
// fixture) defaults to editable — that shape only ever reaches this
// component via ownerId-based ownership, which is real ownership regardless
// of whether catalog metadata rode along.
import { useState } from "react";

import Badge from "@/components/ui/Badge";
import ShareSpellSheet from "@/features/spells/ShareSpellSheet";
import { catalogMetaLine } from "@/lib/addSpell";
import { isForkedSpell } from "@/lib/catalogProvenance";
import type { CatalogSpell } from "@/types/character";

interface HomebrewSpellManageRowProps {
  spell: CatalogSpell;
  busy: boolean;
  onEdit: (spell: CatalogSpell) => void;
  onDelete: (spell: CatalogSpell) => Promise<void>;
}

export default function HomebrewSpellManageRow({ spell, busy, onEdit, onDelete }: HomebrewSpellManageRowProps) {
  const [confirming, setConfirming] = useState(false);
  const [sharing, setSharing] = useState(false);
  const editable = spell.catalog === undefined || spell.catalog.editable;

  async function handleConfirmDelete() {
    try {
      await onDelete(spell);
    } catch {
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <li className="flex items-center justify-between gap-3 border-b border-arcane-100 py-2 text-sm last:border-0">
        <span className="text-parchment-700">Delete {spell.name}?</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={handleConfirmDelete}
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
        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-parchment-900">
          {spell.name}
          {isForkedSpell(spell) && <Badge tone="arcane">Forked</Badge>}
        </p>
        <p className="text-xs text-parchment-600">{catalogMetaLine(spell)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs font-semibold">
        {spell.catalog?.scope === "USER" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setSharing(true)}
            aria-label={`Share ${spell.name}`}
            className="text-arcane-700 hover:underline disabled:opacity-40"
          >
            Share
          </button>
        )}
        {editable && (
          <>
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
          </>
        )}
      </div>
      {sharing && <ShareSpellSheet spell={spell} onClose={() => setSharing(false)} />}
    </li>
  );
}

// Catalog tab: filter strip + scrollable results list. Owns search/level
// state; the catalog fetch itself is lifted to AddSpellPanel (#1788, epic
// #1782 5/5) so the sibling Homebrew tab's manage list can derive from the
// SAME GET /api/spells result instead of running a second fetch.
//
// Also owns the ForkSpellSheet's open/closed state (#1801, epic #1795 6/6):
// only one row can be forking at a time, so the sheet lives here rather than
// per-row in SpellCatalogRow.
import { useState } from "react";

import Spinner from "@/components/ui/Spinner";
import ForkSpellSheet from "@/features/spells/ForkSpellSheet";
import SpellCatalogRow from "@/features/spells/SpellCatalogRow";
import { INPUT_CLS, LEVEL_OPTIONS, filterCatalog } from "@/lib/addSpell";
import type { CatalogSpell } from "@/types/character";

interface SpellCatalogTabProps {
  busy: boolean;
  learnedSpellIds: Set<string>;
  onLearn: (spell: CatalogSpell) => void;
  catalog: CatalogSpell[] | null;
  error: string | null;
  showSpinner: boolean;
  /** A fork was created — caller refetches the catalog (#1801). */
  onForked: () => void;
}

export default function SpellCatalogTab({
  busy,
  learnedSpellIds,
  onLearn,
  catalog,
  error,
  showSpinner,
  onForked,
}: SpellCatalogTabProps) {
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [forking, setForking] = useState<CatalogSpell | null>(null);

  const filtered = filterCatalog(catalog, search, levelFilter);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          aria-label="Search spells"
          placeholder="Search by name or school…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${INPUT_CLS} flex-1 min-w-[140px]`}
        />
        <select
          aria-label="Filter by level"
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
          className={`${INPUT_CLS} w-auto`}
        >
          {LEVEL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {error && <p className="text-xs text-garnet-700">{error}</p>}
      {catalog === null && !error && showSpinner && <Spinner />}
      {catalog !== null && filtered.length === 0 && (
        <p className="py-2 text-center text-xs text-parchment-600">No spells match your filter.</p>
      )}

      <ul className="max-h-[320px] overflow-y-auto">
        {filtered.map((spell) => (
          <SpellCatalogRow
            key={spell.id}
            spell={spell}
            alreadyKnown={learnedSpellIds.has(spell.id)}
            busy={busy}
            onLearn={onLearn}
            onFork={setForking}
          />
        ))}
      </ul>

      {forking && (
        <ForkSpellSheet
          spell={forking}
          onForked={() => {
            setForking(null);
            onForked();
          }}
          onClose={() => setForking(null)}
        />
      )}
    </div>
  );
}

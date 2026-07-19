// Creation spell/cantrip picker (#1131). A level-1 caster chooses its starting
// cantrips + prepared spells; counts ride in from the reference payload (never
// re-encoded here). Reuses the catalog fetch + filter the level-up picker uses.
import { useState } from "react";

import Card from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import { useSpellCatalog } from "@/features/spells/useSpellCatalog";
import { INPUT_CLS, catalogMetaLine, filterCatalog } from "@/lib/addSpell";
import {
  eligibleCreationCantrips,
  eligibleCreationSpells,
  toggleCreationPick,
  type CreationSpellCounts,
} from "@/lib/creationSpells";
import type { CatalogSpell } from "@/types/character";
import type { CharacterDraft } from "@/hooks/useCharacterDraft";

// One choose-N list (cantrips or level-1 spells) with its own search box.
function SpellPickGroup({
  label,
  count,
  options,
  selectedIds,
  onChange,
}: {
  label: string;
  count: number;
  options: CatalogSpell[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = filterCatalog(options, search, "");
  const atCap = selectedIds.length >= count;
  return (
    <div>
      <p className="text-xs font-semibold text-parchment-600">
        {label}: choose {count} ({selectedIds.length}/{count} selected)
      </p>
      <input
        type="search"
        aria-label={`Search ${label.toLowerCase()}`}
        placeholder="Search by name or school…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className={`${INPUT_CLS} mt-2`}
      />
      <ul className="mt-2 max-h-[240px] overflow-y-auto">
        {filtered.map((spell) => {
          const selected = selectedIds.includes(spell.id);
          return (
            <li key={spell.id}>
              <label className="flex items-center gap-2 py-1 text-sm text-parchment-800">
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={!selected && atCap}
                  onChange={() => onChange(toggleCreationPick(selectedIds, spell.id, count))}
                />
                <span>{spell.name}</span>
                <span className="text-xs text-parchment-500">{catalogMetaLine(spell)}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function SpellSelectionSection({
  className,
  counts,
  cantripIds,
  spellIds,
  onChange,
}: {
  className: string;
  counts: CreationSpellCounts;
  cantripIds: string[];
  spellIds: string[];
  onChange: (patch: Partial<CharacterDraft>) => void;
}) {
  const { catalog, error, showSpinner } = useSpellCatalog();
  return (
    <Card title="Spells" headingLevel={2}>
      <div className="flex flex-col gap-4 p-4">
        <p className="text-xs text-parchment-600">
          Choose the cantrips and level-1 spells your character starts knowing.
        </p>
        {error && <p className="text-xs text-garnet-700">{error}</p>}
        {catalog === null && !error && showSpinner && <Spinner />}
        {catalog !== null && (
          <>
            {counts.cantrips > 0 && (
              <SpellPickGroup
                label="Cantrips"
                count={counts.cantrips}
                options={eligibleCreationCantrips(catalog, className)}
                selectedIds={cantripIds}
                onChange={(ids) => onChange({ cantripIds: ids })}
              />
            )}
            <SpellPickGroup
              label="Spells"
              count={counts.spells}
              options={eligibleCreationSpells(catalog, className)}
              selectedIds={spellIds}
              onChange={(ids) => onChange({ spellIds: ids })}
            />
          </>
        )}
      </div>
    </Card>
  );
}

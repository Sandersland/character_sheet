// New Spells ceremony body (#890): scribe the level's new spells into the book,
// gated to the plan's count and the class's spell-level ceiling (both from the
// backend via step.meta). Eligibility + the hard cap live in lib/newSpells and
// useNewSpellsSelection; this component only wires the catalog fetch, search, and
// the tri-state rows.
import { useState } from "react";

import Spinner from "@/components/ui/Spinner";
import NewSpellRow, { type NewSpellRowState } from "@/features/level-up/NewSpellRow";
import { useNewSpellsSelection } from "@/features/level-up/useNewSpellsSelection";
import { useLevelUpStepContext } from "@/features/level-up/useLevelUpStepContext";
import { useSpellCatalog } from "@/features/spells/useSpellCatalog";
import { INPUT_CLS, filterCatalog } from "@/lib/addSpell";
import { eligibleNewSpells } from "@/lib/newSpells";
import { deriveSpellList } from "@/lib/spellList";
import type { CatalogSpell, LevelUpStep } from "@/types/character";

const NO_KNOWN: ReadonlySet<string> = new Set();

export default function NewSpellsStep({ step }: { step: LevelUpStep }) {
  const { character, plan } = useLevelUpStepContext();
  const { count, maxSpellLevel, magicalSecrets, selectedIds, atCap, toggle } = useNewSpellsSelection(step);
  const { catalog, error, showSpinner } = useSpellCatalog();
  const [search, setSearch] = useState("");

  const learnedSpellIds = character.spellcasting ? deriveSpellList(character).learnedSpellIds : NO_KNOWN;
  const eligible = eligibleNewSpells(catalog, { className: plan.target.className, maxSpellLevel, magicalSecrets });
  const filtered = filterCatalog(eligible, search, "");

  function rowState(spell: CatalogSpell): { state: NewSpellRowState; disabled: boolean } {
    if (learnedSpellIds.has(spell.id)) return { state: "known", disabled: true };
    const selected = selectedIds.includes(spell.id);
    return { state: selected ? "selected" : "select", disabled: !selected && atCap };
  }

  return (
    <div>
      <p className="text-center text-sm font-medium text-parchment-700">
        Choose {count} — {selectedIds.length} of {count} chosen
      </p>
      {magicalSecrets && (
        <p className="mt-1 text-center text-xs text-arcane-700">
          Magical Secrets — pick from <strong>any class&rsquo;s</strong> spell list.
        </p>
      )}

      <input
        type="search"
        aria-label="Search spells"
        placeholder="Search by name or school…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className={`${INPUT_CLS} mt-3`}
      />

      {error && <p className="mt-2 text-xs text-garnet-700">{error}</p>}
      {catalog === null && !error && showSpinner && <Spinner />}
      {catalog !== null && filtered.length === 0 && (
        <p className="mt-3 py-2 text-center text-xs text-parchment-600">No spells match your filter.</p>
      )}

      <ul className="mt-2 max-h-[320px] overflow-y-auto">
        {filtered.map((spell) => {
          const { state, disabled } = rowState(spell);
          return <NewSpellRow key={spell.id} spell={spell} state={state} disabled={disabled} onToggle={toggle} />;
        })}
      </ul>
    </div>
  );
}

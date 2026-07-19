// New Spells ceremony body (#890): scribe the level's new spells into the book,
// gated to the plan's count and the class's spell-level ceiling (both from the
// backend via step.meta). Eligibility + the hard cap live in lib/newSpells and
// useNewSpellsSelection; this component only wires the catalog fetch, search, and
// the tri-state rows.
import { useState } from "react";

import Spinner from "@/components/ui/Spinner";
import NewSpellRow, { type NewSpellRowState } from "@/features/level-up/NewSpellRow";
import SwapPanel from "@/features/level-up/SwapPanel";
import { useNewSpellsSelection } from "@/features/level-up/useNewSpellsSelection";
import { useLevelUpStepContext } from "@/features/level-up/useLevelUpStepContext";
import { useSpellCatalog } from "@/features/spells/useSpellCatalog";
import { INPUT_CLS, filterCatalog } from "@/lib/addSpell";
import { eligibleNewSpells, swappableKnownSpells } from "@/lib/newSpells";
import { deriveSpellList } from "@/lib/spellList";
import type { CatalogSpell, LevelUpStep } from "@/types/character";

const NO_KNOWN: ReadonlySet<string> = new Set();

// #1101: the budget header — a staged swap raises "Choose N" to "Choose N+1
// (N + 1 swap)"; a swap-only level (count 0) reads as optional, and once its
// swap is staged the "(0 + 1 swap)" arithmetic is hidden as "(swap replacement)".
function budgetHeadline(count: number, chosen: number, swapping: boolean): string {
  const cap = count + (swapping ? 1 : 0);
  if (cap === 0) return "No new spells at this level, but you may swap one known spell";
  const swapNote = count === 0 ? "(swap replacement)" : `(${count} + 1 swap)`;
  const label = swapping ? `Choose ${cap} ${swapNote}` : `Choose ${cap}`;
  return `${label} — ${chosen} of ${cap} chosen`;
}

// Tri-state of one catalog row: an already-known spell is disabled, a picked one
// is pressed, and an unpicked one disables once the (swap-aware) cap is hit.
function catalogRowState(
  spell: CatalogSpell,
  learnedIds: ReadonlySet<string>,
  selectedIds: string[],
  atCap: boolean,
): { state: NewSpellRowState; disabled: boolean } {
  if (learnedIds.has(spell.id)) return { state: "known", disabled: true };
  const selected = selectedIds.includes(spell.id);
  return { state: selected ? "selected" : "select", disabled: !selected && atCap };
}

// The catalog result region: error/spinner/empty status plus the tri-state rows.
// Extracted so NewSpellsStep stays under the complexity gate once the #1101 swap
// panel is layered on top.
function SpellResults({
  catalog, error, showSpinner, filtered, learnedSpellIds, selectedIds, atCap, onToggle,
}: {
  catalog: CatalogSpell[] | null;
  error: string | null;
  showSpinner: boolean;
  filtered: CatalogSpell[];
  learnedSpellIds: ReadonlySet<string>;
  selectedIds: string[];
  atCap: boolean;
  onToggle: (spellId: string) => void;
}) {
  return (
    <>
      {error && <p className="mt-2 text-xs text-garnet-700">{error}</p>}
      {catalog === null && !error && showSpinner && <Spinner />}
      {catalog !== null && filtered.length === 0 && (
        <p className="mt-3 py-2 text-center text-xs text-parchment-600">No spells match your filter.</p>
      )}
      <ul className="mt-2 max-h-[320px] overflow-y-auto">
        {filtered.map((spell) => {
          const { state, disabled } = catalogRowState(spell, learnedSpellIds, selectedIds, atCap);
          return <NewSpellRow key={spell.id} spell={spell} state={state} disabled={disabled} onToggle={onToggle} />;
        })}
      </ul>
    </>
  );
}

export default function NewSpellsStep({ step }: { step: LevelUpStep }) {
  const { character, plan } = useLevelUpStepContext();
  const { count, maxSpellLevel, magicalSecrets, canSwap, selectedIds, forgottenEntryId, atCap, toggle, toggleForget } =
    useNewSpellsSelection(step);
  const { catalog, error, showSpinner } = useSpellCatalog();
  const [search, setSearch] = useState("");

  const learnedSpellIds = character.spellcasting ? deriveSpellList(character).learnedSpellIds : NO_KNOWN;
  const eligible = eligibleNewSpells(catalog, { className: plan.target.className, maxSpellLevel, magicalSecrets });
  const filtered = filterCatalog(eligible, search, "");
  const swapCandidates = swappableKnownSpells(character.spellcasting?.spells ?? []);

  // #1139: spell out that the N learns and the optional swap are separate rules.
  const learnCopy = count > 0
    ? `You learn ${count} new spell${count === 1 ? "" : "s"}.${canSwap ? " You may also swap one spell you know for another." : ""}`
    : null;

  return (
    <div>
      <p className="text-center text-sm font-medium text-parchment-700">
        {budgetHeadline(count, selectedIds.length, forgottenEntryId != null)}
      </p>
      {learnCopy && (
        <p className="mt-1 text-center text-xs text-parchment-600">{learnCopy}</p>
      )}
      {canSwap && (
        <SwapPanel candidates={swapCandidates} forgottenEntryId={forgottenEntryId} onToggle={toggleForget} />
      )}
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

      <SpellResults
        catalog={catalog}
        error={error}
        showSpinner={showSpinner}
        filtered={filtered}
        learnedSpellIds={learnedSpellIds}
        selectedIds={selectedIds}
        atCap={atCap}
        onToggle={toggle}
      />
    </div>
  );
}

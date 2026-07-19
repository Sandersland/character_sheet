// New Spells ceremony body (#890): scribe the level's new spells into the book,
// gated to the plan's count and the class's spell-level ceiling (both from the
// backend via step.meta). Eligibility + the hard cap live in lib/newSpells and
// useNewSpellsSelection; this component only wires the catalog fetch, search, and
// the tri-state rows.
import { useState } from "react";

import Spinner from "@/components/ui/Spinner";
import NewSpellRow, { type NewSpellRowState } from "@/features/level-up/NewSpellRow";
import SwapPanel from "@/features/level-up/SwapPanel";
import { useNewSpellsSelection, type NewSpellsSelection } from "@/features/level-up/useNewSpellsSelection";
import { useLevelUpStepContext } from "@/features/level-up/useLevelUpStepContext";
import { useSpellCatalog } from "@/features/spells/useSpellCatalog";
import { INPUT_CLS, filterCatalog } from "@/lib/addSpell";
import { eligibleNewCantrips, eligibleNewSpells, swappableKnownSpells } from "@/lib/newSpells";
import { deriveSpellList } from "@/lib/spellList";
import type { CatalogSpell, Character, LevelUpStep } from "@/types/character";

const NO_KNOWN: ReadonlySet<string> = new Set();

// #1101: the budget header — a staged swap raises "Choose N" to "Choose N+1
// (N + 1 swap)"; a swap-only level (count 0) reads as optional, and once its
// swap is staged the "(0 + 1 swap)" arithmetic is hidden as "(swap replacement)".
function budgetHeadline(count: number, chosen: number, swapping: boolean): string {
  const cap = count + (swapping ? 1 : 0);
  if (cap === 0) return "No new spells at this level, but you may swap one prepared spell";
  const swapNote = count === 0 ? "(swap replacement)" : `(${count} + 1 swap)`;
  const label = swapping ? `Choose ${cap} ${swapNote}` : `Choose ${cap}`;
  return `${label} — ${chosen} of ${cap} chosen`;
}

// #1139: spell out that the N learns and the optional swap are separate rules.
function learnSummary(count: number, canSwap: boolean): string | null {
  if (count === 0) return null;
  const swap = canSwap ? " You may also swap one spell for another." : "";
  return `You learn ${count} new spell${count === 1 ? "" : "s"}.${swap}`;
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

// The shared tri-state row list (leveled spells + #1131 cantrips both use it).
function SpellRowList({
  filtered, learnedSpellIds, selectedIds, atCap, onToggle,
}: {
  filtered: CatalogSpell[];
  learnedSpellIds: ReadonlySet<string>;
  selectedIds: string[];
  atCap: boolean;
  onToggle: (spellId: string) => void;
}) {
  return (
    <ul className="mt-2 max-h-[320px] overflow-y-auto">
      {filtered.map((spell) => {
        const { state, disabled } = catalogRowState(spell, learnedSpellIds, selectedIds, atCap);
        return <NewSpellRow key={spell.id} spell={spell} state={state} disabled={disabled} onToggle={onToggle} />;
      })}
    </ul>
  );
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
      <SpellRowList
        filtered={filtered}
        learnedSpellIds={learnedSpellIds}
        selectedIds={selectedIds}
        atCap={atCap}
        onToggle={onToggle}
      />
    </>
  );
}

// #1131: the cantrip subsection shown above the leveled picker when the level
// grants new cantrips. Its own search + hard cap, disjoint from the spell learns.
function CantripSection({
  cantrips, filtered, learnedSpellIds, selectedIds, atCap, onToggle, search, setSearch,
}: {
  cantrips: number;
  filtered: CatalogSpell[];
  learnedSpellIds: ReadonlySet<string>;
  selectedIds: string[];
  atCap: boolean;
  onToggle: (spellId: string) => void;
  search: string;
  setSearch: (v: string) => void;
}) {
  return (
    <div>
      <p className="text-center text-sm font-medium text-parchment-700">
        Choose {cantrips} cantrip{cantrips === 1 ? "" : "s"} — {selectedIds.length} of {cantrips} chosen
      </p>
      <input
        type="search"
        aria-label="Search cantrips"
        placeholder="Search cantrips by name or school…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className={`${INPUT_CLS} mt-2`}
      />
      <SpellRowList
        filtered={filtered}
        learnedSpellIds={learnedSpellIds}
        selectedIds={selectedIds}
        atCap={atCap}
        onToggle={onToggle}
      />
    </div>
  );
}

// The leveled-spell picker: budget header, optional swap panel, Magical Secrets
// note, search + results. Split from NewSpellsStep so the cantrip subsection can
// sit above it without pushing the parent past the complexity gate.
function LeveledSpellsSection({
  selection, character, className, catalog, error, showSpinner, learnedSpellIds, framed,
}: {
  selection: NewSpellsSelection;
  character: Character;
  className: string;
  catalog: CatalogSpell[] | null;
  error: string | null;
  showSpinner: boolean;
  learnedSpellIds: ReadonlySet<string>;
  framed: boolean;
}) {
  const { count, maxSpellLevel, magicalSecrets, canSwap, selectedIds, forgottenEntryId, atCap, toggle, toggleForget } = selection;
  const [search, setSearch] = useState("");
  const eligible = eligibleNewSpells(catalog, { className, maxSpellLevel, magicalSecrets });
  const filtered = filterCatalog(eligible, search, "");
  const swapCandidates = swappableKnownSpells(character.spellcasting?.spells ?? []);
  const learnCopy = learnSummary(count, canSwap);

  return (
    <div className={framed ? "mt-4 border-t border-parchment-200 pt-4" : ""}>
      <p className="text-center text-sm font-medium text-parchment-700">
        {budgetHeadline(count, selectedIds.length, forgottenEntryId != null)}
      </p>
      {learnCopy && <p className="mt-1 text-center text-xs text-parchment-600">{learnCopy}</p>}
      {canSwap && (
        <SwapPanel candidates={swapCandidates} forgottenEntryId={forgottenEntryId} onToggle={toggleForget} />
      )}
      {magicalSecrets && (
        <p className="mt-1 text-center text-xs text-arcane-700">
          Magical Secrets — pick from the <strong>Bard, Cleric, Druid, or Wizard</strong> spell lists.
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

export default function NewSpellsStep({ step }: { step: LevelUpStep }) {
  const { character, plan } = useLevelUpStepContext();
  const selection = useNewSpellsSelection(step);
  const { catalog, error, showSpinner } = useSpellCatalog();
  const [cantripSearch, setCantripSearch] = useState("");

  const learnedSpellIds = character.spellcasting ? deriveSpellList(character).learnedSpellIds : NO_KNOWN;
  const filteredCantrips = filterCatalog(eligibleNewCantrips(catalog, plan.target.className), cantripSearch, "");
  // A cantrips-only level (Cleric/Druid at 4/10) has no leveled picker or swap.
  const showLeveled = selection.count > 0 || selection.canSwap;

  return (
    <div>
      {selection.cantrips > 0 && (
        <CantripSection
          cantrips={selection.cantrips}
          filtered={filteredCantrips}
          learnedSpellIds={learnedSpellIds}
          selectedIds={selection.cantripSelectedIds}
          atCap={selection.cantripsAtCap}
          onToggle={selection.toggleCantrip}
          search={cantripSearch}
          setSearch={setCantripSearch}
        />
      )}

      {showLeveled && (
        <LeveledSpellsSection
          selection={selection}
          character={character}
          className={plan.target.className}
          catalog={catalog}
          error={error}
          showSpinner={showSpinner}
          learnedSpellIds={learnedSpellIds}
          framed={selection.cantrips > 0}
        />
      )}
    </div>
  );
}

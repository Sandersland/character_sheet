// New Spells ceremony body (#890): scribe the level's new spells into the book,
// gated to the plan's count and the class's spell-level ceiling (both from the
// backend via step.meta). Eligibility + the hard cap live in lib/newSpells and
// useNewSpellsSelection; this component only wires the catalog fetch, search, and
// the tri-state rows. Rows + the full-description detail card (#1158) are the
// same shared SpellPickerRow/SpellDetailCard the creation Spells step (#1160)
// uses — never a level-up-specific copy.
import { useState } from "react";

import Spinner from "@/components/ui/Spinner";
import SpellDetailCard from "@/features/spells/SpellDetailCard";
import SpellPickerRow from "@/features/spells/SpellPickerRow";
import SwapPanel from "@/features/level-up/SwapPanel";
import { useNewSpellsSelection, type NewSpellsSelection } from "@/features/level-up/useNewSpellsSelection";
import { useLevelUpStepContext } from "@/features/level-up/useLevelUpStepContext";
import { useSpellCatalog } from "@/features/spells/useSpellCatalog";
import { INPUT_CLS, filterCatalog } from "@/lib/addSpell";
import { eligibleNewCantrips, eligibleNewSpells, swappableKnownSpells } from "@/lib/newSpells";
import { deriveSpellList } from "@/lib/spellList";
import { pickDetailCtaLabel, pickRowState } from "@/lib/spellPickerView";
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

// The shared tri-state row list (leveled spells + #1131 cantrips both use it):
// SpellPickerRow renders each quiet row, and a row/ⓘ tap opens the shared
// SpellDetailCard (#1158) with the full description and a Learn CTA — the same
// components the creation Spells step (#1160) renders, so the two ceremonies
// never drift. `spells` is the unfiltered eligible list, kept separate from
// `filtered` so the open detail card survives a search-text edit.
function SpellRowList({
  spells, filtered, learnedSpellIds, selectedIds, cap, onToggle,
}: {
  spells: CatalogSpell[];
  filtered: CatalogSpell[];
  learnedSpellIds: ReadonlySet<string>;
  selectedIds: string[];
  cap: number;
  onToggle: (spellId: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const atCap = selectedIds.length >= cap;
  const openSpell = openId ? spells.find((s) => s.id === openId) : undefined;
  const openState = openSpell ? pickRowState(openSpell, learnedSpellIds, selectedIds, atCap) : null;

  return (
    <>
      <ul className="mt-2 flex flex-col gap-2">
        {filtered.map((spell) => {
          const { state, disabled } = pickRowState(spell, learnedSpellIds, selectedIds, atCap);
          return (
            <SpellPickerRow
              key={spell.id}
              spell={spell}
              state={state}
              disabled={disabled}
              onToggle={onToggle}
              onOpen={() => setOpenId(spell.id)}
            />
          );
        })}
      </ul>
      {openSpell && openState && (
        <SpellDetailCard
          spell={openSpell}
          cta={{
            label: pickDetailCtaLabel(openSpell.name, openState.state, openState.disabled, cap, selectedIds.length, "Learn"),
            disabled: openState.disabled,
            onPress: () => {
              if (openState.state !== "known") onToggle(openSpell.id);
              setOpenId(null);
            },
          }}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}

// The catalog result region: error/spinner/empty status plus the tri-state rows.
// Extracted so NewSpellsStep stays under the complexity gate once the #1101 swap
// panel is layered on top.
function SpellResults({
  catalog, error, showSpinner, spells, filtered, learnedSpellIds, selectedIds, cap, onToggle,
}: {
  catalog: CatalogSpell[] | null;
  error: string | null;
  showSpinner: boolean;
  spells: CatalogSpell[];
  filtered: CatalogSpell[];
  learnedSpellIds: ReadonlySet<string>;
  selectedIds: string[];
  cap: number;
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
        spells={spells}
        filtered={filtered}
        learnedSpellIds={learnedSpellIds}
        selectedIds={selectedIds}
        cap={cap}
        onToggle={onToggle}
      />
    </>
  );
}

// #1131: the cantrip subsection shown above the leveled picker when the level
// grants new cantrips. Its own search + hard cap, disjoint from the spell learns.
function CantripSection({
  cantrips, spells, filtered, learnedSpellIds, selectedIds, onToggle, search, setSearch,
}: {
  cantrips: number;
  spells: CatalogSpell[];
  filtered: CatalogSpell[];
  learnedSpellIds: ReadonlySet<string>;
  selectedIds: string[];
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
        spells={spells}
        filtered={filtered}
        learnedSpellIds={learnedSpellIds}
        selectedIds={selectedIds}
        cap={cantrips}
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
  const { count, maxSpellLevel, magicalSecrets, canSwap, selectedIds, forgottenEntryId, toggle, toggleForget } = selection;
  const [search, setSearch] = useState("");
  const eligible = eligibleNewSpells(catalog, { className, maxSpellLevel, magicalSecrets });
  const filtered = filterCatalog(eligible, search, "");
  const swapCandidates = swappableKnownSpells(character.spellcasting?.spells ?? []);
  const learnCopy = learnSummary(count, canSwap);
  // #1101: a staged swap raises the learn cap by one (mirrors useNewSpellsSelection's cap).
  const cap = count + (forgottenEntryId != null ? 1 : 0);

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
        spells={eligible}
        filtered={filtered}
        learnedSpellIds={learnedSpellIds}
        selectedIds={selectedIds}
        cap={cap}
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
  const eligibleCantrips = eligibleNewCantrips(catalog, plan.target.className);
  const filteredCantrips = filterCatalog(eligibleCantrips, cantripSearch, "");
  // A cantrips-only level (Cleric/Druid at 4/10) has no leveled picker or swap.
  const showLeveled = selection.count > 0 || selection.canSwap;

  return (
    <div>
      {selection.cantrips > 0 && (
        <CantripSection
          cantrips={selection.cantrips}
          spells={eligibleCantrips}
          filtered={filteredCantrips}
          learnedSpellIds={learnedSpellIds}
          selectedIds={selection.cantripSelectedIds}
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

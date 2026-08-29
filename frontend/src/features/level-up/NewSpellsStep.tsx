// #1440: spellLists/cantripLists (step.meta) are edition-correct by construction, sourced from the backend's spellListsFor.
// Rows + the full-description detail card (#1158) are the same shared SpellPickerRow/SpellDetailCard the creation Spells step (#1160) uses — never a level-up-specific copy.
import { useState } from "react";

import Spinner from "@/components/ui/Spinner";
import SpellDetailCard from "@/features/spells/SpellDetailCard";
import SpellPickerRow from "@/features/spells/SpellPickerRow";
import SwapPanel from "@/features/level-up/SwapPanel";
import { useNewSpellsSelection, type NewSpellsSelection } from "@/features/level-up/useNewSpellsSelection";
import { useLevelUpStepContext } from "@/features/level-up/useLevelUpStepContext";
import { useSpellCatalog } from "@/features/spells/useSpellCatalog";
import { INPUT_CLS, filterCatalog } from "@/lib/addSpell";
import {
  casterModelNoun,
  eligibleNewCantrips,
  eligibleNewSpells,
  offListSelectedCount,
  spellListsLabel,
  spellSchoolEligible,
  spellSchoolsLabel,
  swappableKnownSpells,
} from "@/lib/newSpells";
import { deriveSpellList } from "@/lib/spellList";
import { pickDetailCtaLabel, pickRowState } from "@/lib/spellPickerView";
import type { CatalogSpell, Character, LevelUpStep } from "@/types/character";

const NO_KNOWN: ReadonlySet<string> = new Set();

// #1509: the swapped noun ("known"/"prepared") is the served casterModel, never re-derived — see casterModelNoun.
function budgetHeadline(count: number, chosen: number, swapping: boolean, casterModel: "known" | "prepared" | null): string {
  const cap = count + (swapping ? 1 : 0);
  if (cap === 0) return `No new spells at this level, but you may swap one ${casterModelNoun(casterModel)}`;
  const swapNote = count === 0 ? "(swap replacement)" : `(${count} + 1 swap)`;
  const label = swapping ? `Choose ${cap} ${swapNote}` : `Choose ${cap}`;
  return `${label} — ${chosen} of ${cap} chosen`;
}

function learnSummary(count: number, canSwap: boolean, casterModel: "known" | "prepared" | null): string | null {
  if (count === 0) return null;
  const swap = canSwap ? ` You may also swap one ${casterModelNoun(casterModel)} for another.` : "";
  return `You learn ${count} new spell${count === 1 ? "" : "s"}.${swap}`;
}

// `spells` is the unfiltered eligible list, kept separate from `filtered` so the open detail card survives a search-text edit.
function SpellRowList({
  spells, filtered, learnedSpellIds, selectedIds, cap, onToggle, spellSchools = null, freeSchoolPicks = 0,
}: {
  spells: CatalogSpell[];
  filtered: CatalogSpell[];
  learnedSpellIds: ReadonlySet<string>;
  selectedIds: string[];
  cap: number;
  onToggle: (spellId: string) => void;
  // #1855: omitted (null/0) for the cantrip section, which is never school-restricted.
  spellSchools?: string[] | null;
  freeSchoolPicks?: number;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const atCap = selectedIds.length >= cap;
  const openSpell = openId ? spells.find((s) => s.id === openId) : undefined;
  const openState = openSpell ? pickRowState(openSpell, learnedSpellIds, selectedIds, atCap) : null;
  // #1855: a row past the free-school budget disables even though the overall `cap` isn't reached yet.
  const offList = offListSelectedCount(selectedIds, spells, spellSchools);

  return (
    <>
      <ul className="mt-2 flex flex-col gap-2">
        {filtered.map((spell) => {
          const { state, disabled } = pickRowState(spell, learnedSpellIds, selectedIds, atCap);
          const schoolBlocked = state === "select" && !spellSchoolEligible(spell, spellSchools, freeSchoolPicks, offList);
          return (
            <SpellPickerRow
              key={spell.id}
              spell={spell}
              state={state}
              disabled={disabled || schoolBlocked}
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
            disabled: openState.disabled || (openState.state === "select" && !spellSchoolEligible(openSpell, spellSchools, freeSchoolPicks, offList)),
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

// Rendered once at the step level, not per section — a level granting both cantrips and leveled spells drives both from the same fetch, so per-section rendering stacked the message twice.
function SpellFetchStatus({ catalog, error, showSpinner }: { catalog: CatalogSpell[] | null; error: string | null; showSpinner: boolean }) {
  if (error) return <p className="mt-2 text-xs text-garnet-700">{error}</p>;
  if (catalog === null) return showSpinner ? <Spinner /> : null;
  return null;
}

// useSpellCatalog sets catalog to null AND sets error on a failed fetch, so `catalog === null` already covers it; checking `error` too is just an extra safety check.
function SpellPoolStatus({ catalog, error, spells, filtered }: { catalog: CatalogSpell[] | null; error: string | null; spells: CatalogSpell[]; filtered: CatalogSpell[] }) {
  if (catalog === null || error) return null;
  if (spells.length === 0) {
    return (
      <p className="mt-3 py-2 text-center text-xs text-garnet-700">
        No spells are available to choose here — this may be a configuration problem.
      </p>
    );
  }
  if (filtered.length === 0) {
    return <p className="mt-3 py-2 text-center text-xs text-parchment-600">No spells match your filter.</p>;
  }
  return null;
}

// Extracted so NewSpellsStep stays under the complexity gate once the #1101 swap panel is layered on top.
function SpellResults({
  catalog, error, spells, filtered, learnedSpellIds, selectedIds, cap, onToggle, spellSchools, freeSchoolPicks,
}: {
  catalog: CatalogSpell[] | null;
  error: string | null;
  spells: CatalogSpell[];
  filtered: CatalogSpell[];
  learnedSpellIds: ReadonlySet<string>;
  selectedIds: string[];
  cap: number;
  onToggle: (spellId: string) => void;
  // #1855: forwarded to SpellRowList; omitted by the cantrip section.
  spellSchools?: string[] | null;
  freeSchoolPicks?: number;
}) {
  return (
    <>
      <SpellPoolStatus catalog={catalog} error={error} spells={spells} filtered={filtered} />
      <SpellRowList
        spells={spells}
        filtered={filtered}
        learnedSpellIds={learnedSpellIds}
        selectedIds={selectedIds}
        cap={cap}
        onToggle={onToggle}
        spellSchools={spellSchools}
        freeSchoolPicks={freeSchoolPicks}
      />
    </>
  );
}

// #1826: routes through SpellResults (not SpellRowList directly) so a required cantrip pick gets the same empty-eligible/search-miss states as the leveled picker below it.
function CantripSection({
  cantrips, catalog, error, spells, filtered, learnedSpellIds, selectedIds, onToggle, search, setSearch,
}: {
  cantrips: number;
  catalog: CatalogSpell[] | null;
  error: string | null;
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
      <SpellResults
        catalog={catalog}
        error={error}
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

// #1855: Eldritch Knight (2014) leveled picks are restricted to Abjuration/Evocation except a free any-school grant at class level 3/8/14/20 (PHB'14 p. 74).
function SchoolGateNote({ spellSchools, freeSchoolPicks }: { spellSchools: string[]; freeSchoolPicks: number }) {
  return (
    <p className="mt-1 text-center text-xs text-arcane-700">
      Eldritch Knight — pick from <strong>{spellSchoolsLabel(spellSchools)}</strong> spells
      {freeSchoolPicks > 0 && (
        <> ({freeSchoolPicks === 1 ? "one pick" : `${freeSchoolPicks} picks`} this level may be any school)</>
      )}.
    </p>
  );
}

function MagicalSecretsNote({ spellLists }: { spellLists: string[] | null }) {
  return (
    <p className="mt-1 text-center text-xs text-arcane-700">
      Magical Secrets — pick from {spellLists === null ? (
        <><strong>any class&apos;s</strong> spell list.</>
      ) : (
        <>the <strong>{spellListsLabel(spellLists)}</strong> spell lists.</>
      )}
    </p>
  );
}

function LeveledSpellsSection({
  selection, character, catalog, error, learnedSpellIds, framed,
}: {
  selection: NewSpellsSelection;
  character: Character;
  catalog: CatalogSpell[] | null;
  error: string | null;
  learnedSpellIds: ReadonlySet<string>;
  framed: boolean;
}) {
  const {
    count, maxSpellLevel, magicalSecrets, spellLists, canSwap, selectedIds, forgottenEntryId, toggle, toggleForget,
    casterModel, expandedSpellIds, spellSchools, freeSchoolPicks,
  } = selection;
  const [search, setSearch] = useState("");
  const eligible = eligibleNewSpells(catalog, { maxSpellLevel, spellLists, expandedSpellIds });
  const filtered = filterCatalog(eligible, search, "");
  const swapCandidates = swappableKnownSpells(character.spellcasting?.spells ?? []);
  const learnCopy = learnSummary(count, canSwap, casterModel);
  // #1101: a staged swap raises the learn cap by one (mirrors useNewSpellsSelection's cap).
  const cap = count + (forgottenEntryId != null ? 1 : 0);

  return (
    <div className={framed ? "mt-4 border-t border-parchment-200 pt-4" : ""}>
      <p className="text-center text-sm font-medium text-parchment-700">
        {budgetHeadline(count, selectedIds.length, forgottenEntryId != null, casterModel)}
      </p>
      {learnCopy && <p className="mt-1 text-center text-xs text-parchment-600">{learnCopy}</p>}
      {canSwap && (
        <SwapPanel candidates={swapCandidates} forgottenEntryId={forgottenEntryId} onToggle={toggleForget} casterModel={casterModel} />
      )}
      {magicalSecrets && <MagicalSecretsNote spellLists={spellLists} />}
      {spellSchools && <SchoolGateNote spellSchools={spellSchools} freeSchoolPicks={freeSchoolPicks} />}
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
        spells={eligible}
        filtered={filtered}
        learnedSpellIds={learnedSpellIds}
        selectedIds={selectedIds}
        cap={cap}
        onToggle={toggle}
        spellSchools={spellSchools}
        freeSchoolPicks={freeSchoolPicks}
      />
    </div>
  );
}

export default function NewSpellsStep({ step }: { step: LevelUpStep }) {
  const { character } = useLevelUpStepContext();
  const selection = useNewSpellsSelection(step);
  const { catalog, error, showSpinner } = useSpellCatalog(character.rulesEdition);
  const [cantripSearch, setCantripSearch] = useState("");

  const learnedSpellIds = character.spellcasting ? deriveSpellList(character).learnedSpellIds : NO_KNOWN;
  const eligibleCantrips = eligibleNewCantrips(catalog, { cantripLists: selection.cantripLists });
  const filteredCantrips = filterCatalog(eligibleCantrips, cantripSearch, "");
  // A cantrips-only level (Cleric/Druid at 4/10) has no leveled picker or swap.
  const showLeveled = selection.count > 0 || selection.canSwap;

  return (
    <div>
      <SpellFetchStatus catalog={catalog} error={error} showSpinner={showSpinner} />
      {selection.cantrips > 0 && (
        <CantripSection
          cantrips={selection.cantrips}
          catalog={catalog}
          error={error}
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
          catalog={catalog}
          error={error}
          learnedSpellIds={learnedSpellIds}
          framed={selection.cantrips > 0}
        />
      )}
    </div>
  );
}

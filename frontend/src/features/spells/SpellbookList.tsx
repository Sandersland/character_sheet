import { useState } from "react";

import EmptyState from "@/components/ui/EmptyState";
import { GiSpellBook } from "@/components/ui/icons";
import MeterBar from "@/components/ui/MeterBar";
import ChipGroup from "@/components/ui/ChipGroup";
import ChipToggle from "@/components/ui/ChipToggle";
import Select from "@/components/ui/Select";
import SpellRow from "@/features/spells/SpellRow";
import SpellSwapBar from "@/features/spells/SpellSwapBar";
import { LEVEL_OPTIONS, SPELL_SCHOOLS } from "@/lib/addSpell";
import { schoolLabel } from "@/lib/spellMeta";
import { runeState } from "@/lib/spellRow";
import {
  canPrepare,
  filterSpellbook,
  pactMagicNote,
  preparedLabelOf,
  swapCandidates,
  type PreparedBudget,
  type SpellbookFilter,
} from "@/lib/spellList";
import type { Spell, SpellSchool, SpellSlots } from "@/types/character";

interface SpellbookListProps {
  spells: Spell[];
  sortedSpells: Spell[];
  slots: SpellSlots[];
  slotsArePactMagic: boolean;
  budget: PreparedBudget;
  busy: boolean;
  concentratingOnEntryId: string | null;
  onPrepare: (spell: Spell) => void;
  onSwap: (dropId: string, addId: string) => void;
  onForget: (spell: Spell) => void;
  availableSlotsFor: (spell: Spell) => number[];
  onAddSpell: () => void;
}

type GroupProps = Pick<
  SpellbookListProps,
  "slots" | "slotsArePactMagic" | "budget" | "busy" | "concentratingOnEntryId" | "onPrepare" | "onForget" | "availableSlotsFor"
> & { level: number; levelSpells: Spell[] };

// Labelled "Pact Magic —" so a single-class warlock's one slot pool doesn't read as "only level N has slots" (#1139).
function slotSummary(level: number, slotInfo: SpellSlots | undefined, pact: boolean): string {
  if (level === 0) return "always prepared";
  if (!slotInfo) return "";
  return `${pact ? "Pact Magic — " : ""}${slotInfo.total - slotInfo.used}/${slotInfo.total} slots`;
}

function SpellLevelGroup({
  level, levelSpells, slots, slotsArePactMagic, budget, busy,
  concentratingOnEntryId, onPrepare, onForget, availableSlotsFor,
}: GroupProps) {
  const slotInfo = level === 0 ? undefined : slots.find((s) => s.level === level);
  const pact = slotsArePactMagic && slotInfo != null;
  return (
    <div className="break-inside-avoid">
      <div className="mb-1 flex items-baseline justify-between gap-2 border-b border-parchment-300 pb-1">
        <h4 className="font-display text-sm font-semibold text-parchment-700">
          {level === 0 ? "Cantrips" : `Level ${level}`}
        </h4>
        <span className="text-[10px] uppercase tracking-wide text-parchment-500">
          {slotSummary(level, slotInfo, pact)}
        </span>
      </div>
      {pact && (
        <p className="mb-1 text-[10px] italic text-parchment-500">{pactMagicNote(level)}</p>
      )}
      <ul className="flex flex-col">
        {levelSpells.map((spell) => (
          <SpellRow
            key={spell.id}
            spell={spell}
            budget={budget}
            busy={busy}
            onPrepare={onPrepare}
            onForget={onForget}
            availableSlots={availableSlotsFor(spell)}
            isConcentrating={concentratingOnEntryId === spell.id}
          />
        ))}
      </ul>
    </div>
  );
}

const EMPTY_FILTER: SpellbookFilter = { level: null, school: null, prepared: false, ritual: false };

// #1511: label is a served noun via preparedLabelOf, never hardcoded as "Prepared".
function SpellbookMeter({ budget }: { budget: PreparedBudget }) {
  const label = preparedLabelOf(budget);
  return (
    <div className="w-40 text-right">
      <p className="text-[9px] font-bold uppercase tracking-wide text-parchment-500">{label}</p>
      <p className="font-display text-sm font-bold text-parchment-900 tabular-nums">
        {budget.count} / {budget.limit}
      </p>
      <div className="mt-1">
        <MeterBar
          current={budget.count}
          // budget.limit is never actually null here — the caller only renders this when limit != null, but that narrowing doesn't cross the component boundary for MeterBar's non-null max prop.
          max={budget.limit ?? 0}
          tone="arcane"
          label={`${budget.count} of ${budget.limit} ${label.toLowerCase()}`}
        />
      </div>
    </div>
  );
}

// #1511: the Prepared chip is hidden for a known caster — every leveled row is locked, so the predicate would filter nothing.
function SpellbookFilterStrip({
  filter,
  setFilter,
  casterModel,
}: {
  filter: SpellbookFilter;
  setFilter: (update: (f: SpellbookFilter) => SpellbookFilter) => void;
  casterModel: PreparedBudget["casterModel"];
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <ChipGroup label="Spellbook filters">
        {casterModel !== "known" && (
          <ChipToggle pressed={filter.prepared} onChange={(v) => setFilter((f) => ({ ...f, prepared: v }))}>
            Prepared
          </ChipToggle>
        )}
        <ChipToggle pressed={filter.ritual} onChange={(v) => setFilter((f) => ({ ...f, ritual: v }))}>
          Ritual
        </ChipToggle>
      </ChipGroup>
      <Select
        aria-label="Filter by level"
        className="w-auto"
        value={filter.level == null ? "" : String(filter.level)}
        onChange={(e) => setFilter((f) => ({ ...f, level: e.target.value === "" ? null : Number(e.target.value) }))}
      >
        {LEVEL_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </Select>
      <Select
        aria-label="Filter by school"
        className="w-auto"
        value={filter.school ?? ""}
        onChange={(e) => setFilter((f) => ({ ...f, school: e.target.value === "" ? null : (e.target.value as SpellSchool) }))}
      >
        <option value="">All schools</option>
        {SPELL_SCHOOLS.map((s) => (
          <option key={s} value={s}>{schoolLabel(s)}</option>
        ))}
      </Select>
    </div>
  );
}

export default function SpellbookList({
  spells, sortedSpells, budget, onAddSpell, onPrepare, onSwap, ...rest
}: SpellbookListProps) {
  const [filter, setFilter] = useState<SpellbookFilter>(EMPTY_FILTER);
  const [swapForId, setSwapForId] = useState<string | null>(null);

  const visible = filterSpellbook(sortedSpells, filter, budget.casterModel);
  const levels = [...new Set(visible.map((s) => s.level))].sort((a, b) => a - b);

  const candidates = swapCandidates(sortedSpells, budget.casterModel);
  // Derived, so the bar auto-closes if its target got prepared or left the book.
  const swapFor = sortedSpells.find(
    (s) => s.id === swapForId && runeState(s, budget.casterModel) === "unprepared",
  );

  function handlePrepareIntent(spell: Spell) {
    if (!canPrepare(spell, budget) && candidates.length > 0) {
      setSwapForId(spell.id);
      return;
    }
    onPrepare(spell);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-parchment-500">Spellbook</p>
          <h3 className="font-display text-xl font-bold text-arcane-800">
            {spells.length} spell{spells.length === 1 ? "" : "s"}
          </h3>
        </div>
        {budget.limit != null && <SpellbookMeter budget={budget} />}
      </div>

      {swapFor && budget.limit != null && (
        <SpellSwapBar
          addSpell={swapFor}
          candidates={candidates}
          limit={budget.limit}
          busy={rest.busy}
          onPick={(dropId) => {
            // Clear optimistically; a server rejection surfaces via the section error strip.
            setSwapForId(null);
            onSwap(dropId, swapFor.id);
          }}
          onCancel={() => setSwapForId(null)}
        />
      )}

      {spells.length === 0 ? (
        <EmptyState
          icon={<GiSpellBook />}
          title="No spells yet"
          description="Learn or prepare spells to start casting."
          action={{ label: "+ Add spell", onClick: onAddSpell }}
        />
      ) : (
        <>
          <SpellbookFilterStrip filter={filter} setFilter={setFilter} casterModel={budget.casterModel} />

          {visible.length === 0 ? (
            <p className="py-6 text-center text-xs text-parchment-600">No spells match these filters.</p>
          ) : (
            <div className="md:grid md:grid-cols-2 md:gap-x-10">
              {levels.map((level) => (
                <SpellLevelGroup
                  key={level}
                  level={level}
                  levelSpells={visible.filter((s) => s.level === level)}
                  budget={budget}
                  onPrepare={handlePrepareIntent}
                  {...rest}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

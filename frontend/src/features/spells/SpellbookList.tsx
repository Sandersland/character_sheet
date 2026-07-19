// The grimoire spellbook: a Prepared N/M budget meter, a filter strip, and spells
// inked by level into a two-page desktop spread (single scroll on mobile).
// caster-spellbook.html §2 & §4.
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
  characterLevel: number;
  budget: PreparedBudget;
  busy: boolean;
  concentratingOnEntryId: string | null;
  onCast: (spell: Spell, slotLevel?: number) => void;
  onPrepare: (spell: Spell) => void;
  onSwap: (dropId: string, addId: string) => void;
  onForget: (spell: Spell) => void;
  availableSlotsFor: (spell: Spell) => number[];
  onAddSpell: () => void;
}

type GroupProps = Pick<
  SpellbookListProps,
  "slots" | "slotsArePactMagic" | "characterLevel" | "budget" | "busy" | "concentratingOnEntryId" | "onCast" | "onPrepare" | "onForget" | "availableSlotsFor"
> & { level: number; levelSpells: Spell[] };

function SpellLevelGroup({
  level, levelSpells, slots, slotsArePactMagic, characterLevel, budget, busy,
  concentratingOnEntryId, onCast, onPrepare, onForget, availableSlotsFor,
}: GroupProps) {
  const slotInfo = level === 0 ? null : slots.find((s) => s.level === level);
  // A single-class warlock's one slot pool is all Pact Magic — label it so the level
  // heading doesn't read as "only level N has slots" (#1139).
  const pact = slotsArePactMagic && slotInfo != null;
  return (
    <div className="break-inside-avoid">
      <div className="mb-1 flex items-baseline justify-between gap-2 border-b border-parchment-300 pb-1">
        <h4 className="font-display text-sm font-semibold text-parchment-700">
          {level === 0 ? "Cantrips" : `Level ${level}`}
        </h4>
        <span className="text-[10px] uppercase tracking-wide text-parchment-500">
          {level === 0
            ? "always prepared"
            : slotInfo
              ? `${pact ? "Pact Magic — " : ""}${slotInfo.total - slotInfo.used}/${slotInfo.total} slots`
              : ""}
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
            characterLevel={characterLevel}
            budget={budget}
            busy={busy}
            onCast={onCast}
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

export default function SpellbookList({
  spells, sortedSpells, budget, onAddSpell, onPrepare, onSwap, ...rest
}: SpellbookListProps) {
  const [filter, setFilter] = useState<SpellbookFilter>(EMPTY_FILTER);
  const [swapForId, setSwapForId] = useState<string | null>(null);

  const visible = filterSpellbook(sortedSpells, filter);
  const levels = [...new Set(visible.map((s) => s.level))].sort((a, b) => a - b);

  const candidates = swapCandidates(sortedSpells);
  // Derived, so the bar auto-closes if its target got prepared or left the book.
  const swapFor = sortedSpells.find(
    (s) => s.id === swapForId && runeState(s) === "unprepared",
  );

  // Intercept a cap-blocked prepare tap into swap mode when there's something to drop;
  // otherwise fall through to handlePrepare's existing error path (#938).
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
        {budget.limit != null && (
          <div className="w-40 text-right">
            <p className="text-[9px] font-bold uppercase tracking-wide text-parchment-500">Prepared today</p>
            <p className="font-display text-sm font-bold text-parchment-900 tabular-nums">
              {budget.count} / {budget.limit}
            </p>
            <div className="mt-1">
              <MeterBar
                current={budget.count}
                max={budget.limit}
                tone="arcane"
                label={`${budget.count} of ${budget.limit} prepared`}
              />
            </div>
          </div>
        )}
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
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <ChipGroup label="Spellbook filters">
              <ChipToggle pressed={filter.prepared} onChange={(v) => setFilter((f) => ({ ...f, prepared: v }))}>
                Prepared
              </ChipToggle>
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

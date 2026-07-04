/**
 * DisciplineRow — a single known elemental discipline with an expandable
 * description, a ki-scaling cast affordance, and Forget / Swap actions. Mirrors
 * ManeuverRow; the cast path rolls through RollContext (→ RollResultToast), the
 * same player-driven roll path as spell casting.
 */

import { useState } from "react";

import { useRoll } from "@/features/dice/RollContext";
import { formatRollSpec } from "@/lib/dice";
import {
  disciplineBaseCost,
  disciplineKiOptions,
  disciplineRollSpec,
} from "@/lib/disciplines";
import type {
  CastDisciplineOperation,
  CatalogDiscipline,
  DisciplineEntry,
} from "@/types/character";

interface Props {
  entry: DisciplineEntry;
  catalog?: CatalogDiscipline;
  characterLevel: number;
  kiAvailable: number;
  saveDC?: number;
  forgettable: boolean;
  busy: boolean;
  onCast: (op: CastDisciplineOperation) => void;
  onForget: (entryId: string) => void;
  onSwapStart: (entryId: string) => void;
}

export default function DisciplineRow({
  entry,
  catalog,
  characterLevel,
  kiAvailable,
  saveDC,
  forgettable,
  busy,
  onCast,
  onForget,
  onSwapStart,
}: Props) {
  const { roll } = useRoll();
  const [expanded, setExpanded] = useState(false);

  const base = catalog ? disciplineBaseCost(catalog) : 0;
  const options = catalog ? disciplineKiOptions(catalog, characterLevel, kiAvailable) : [];
  const scalable = options.length > 1;
  const canAfford = base === 0 || kiAvailable >= base;

  const [selectedKi, setSelectedKi] = useState(base);
  const effectiveKi = scalable ? (options.includes(selectedKi) ? selectedKi : options[0]) : base;

  const isSave = Boolean(catalog?.effect.saveAbility);
  const kiLabel = base > 0 ? `${base}${scalable ? "+" : ""} ki` : "no ki";

  function handleForget() {
    if (!confirm(`Forget "${entry.name}"?`)) return;
    onForget(entry.id);
  }

  function handleCast() {
    if (!catalog || busy || !canAfford) return;
    const spec = disciplineRollSpec(catalog, effectiveKi, characterLevel);
    let total = 0;
    if (spec) {
      const kind = catalog.effect.effectType === "heal" ? "healing" : `${catalog.effect.damageType ?? ""} damage`;
      total = roll(spec, `${catalog.name} — ${kind.trim()}`).total;
    }
    onCast({ type: "castDiscipline", disciplineId: catalog.id, kiSpent: effectiveKi, roll: total });
  }

  return (
    <li className="border-b border-parchment-200 py-2.5 last:border-0">
      <div className="flex items-start justify-between gap-3">
        {/* Name + toggle */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex flex-1 items-baseline gap-1.5 text-left"
          aria-expanded={expanded}
        >
          <span className="text-sm font-semibold text-parchment-900">{entry.name}</span>
          <span className="text-[10px] text-gold-700" aria-hidden="true">
            {kiLabel}
          </span>
          <span className="text-[10px] text-parchment-400" aria-hidden="true">
            {expanded ? "▲" : "▼"}
          </span>
        </button>

        {/* Cast + ki selector */}
        <div className="flex shrink-0 items-center gap-1.5">
          {scalable && (
            <select
              value={effectiveKi}
              onChange={(e) => setSelectedKi(Number(e.target.value))}
              disabled={busy}
              aria-label={`Ki to spend on ${entry.name}`}
              className="rounded-control border border-gold-300 bg-parchment-50 px-1.5 py-0.5 text-xs text-parchment-800 focus:outline-none focus:ring-1 focus:ring-gold-400"
            >
              {options.map((ki) => (
                <option key={ki} value={ki}>
                  {ki} ki
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            disabled={busy || !canAfford || !catalog}
            onClick={handleCast}
            className="rounded-control bg-gold-400 px-2.5 py-0.5 text-[11px] font-semibold text-ink hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-40"
            title={
              !canAfford
                ? `Not enough ki (needs ${base})`
                : `Cast ${entry.name}${base > 0 ? ` (${effectiveKi} ki)` : ""}`
            }
          >
            Cast
          </button>
          {forgettable && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => onSwapStart(entry.id)}
                className="rounded-control bg-parchment-100 px-2 py-0.5 text-[11px] font-semibold text-parchment-700 hover:bg-parchment-200 disabled:opacity-30"
                title={`Swap out ${entry.name}`}
              >
                Swap
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleForget}
                className="rounded-control bg-garnet-50 px-2 py-0.5 text-[11px] font-semibold text-garnet-700 hover:bg-garnet-100 disabled:opacity-30"
                title={`Forget ${entry.name}`}
              >
                Forget
              </button>
            </>
          )}
        </div>
      </div>

      {/* Expandable description + roll/save preview */}
      {expanded && (
        <div className="mt-1.5 pr-2">
          <p className="text-xs leading-relaxed text-parchment-600">{entry.description}</p>
          {catalog && (catalog.effect.dice || isSave) && (
            <p className="mt-1 text-[11px] text-gold-800">
              {catalog.effect.dice && (
                <>Rolls {formatRollSpec(disciplineRollSpec(catalog, effectiveKi, characterLevel)!)}</>
              )}
              {isSave && saveDC !== undefined && (
                <> · save DC {saveDC}</>
              )}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

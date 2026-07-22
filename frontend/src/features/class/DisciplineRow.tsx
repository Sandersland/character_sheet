/**
 * DisciplineRow — a single known elemental discipline with an expandable
 * description, a focus-scaling cast affordance, and Forget / Swap actions. Renders
 * through AbilityRowShell (shared with ManeuverRow/ShadowArtRow); the cast path
 * rolls through RollContext (→ RollResultSeal), the same player-driven roll
 * path as spell casting.
 */

import { useState } from "react";

import AbilityRowShell, { CastAbilityButton } from "@/features/class/AbilityRowShell";
import { useRoll } from "@/features/dice/RollContext";
import { formatRollSpec } from "@/lib/dice";
import {
  disciplineCastTitle,
  disciplineCastView,
  disciplineRollLabel,
  disciplineRollSpec,
  effectiveFocusSelection,
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
  focusAvailable: number;
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
  focusAvailable,
  saveDC,
  forgettable,
  busy,
  onCast,
  onForget,
  onSwapStart,
}: Props) {
  const { roll } = useRoll();

  const view = disciplineCastView(catalog, characterLevel, focusAvailable);
  const [selectedFocus, setSelectedFocus] = useState(view.base);
  const effectiveFocus = effectiveFocusSelection(view, selectedFocus);
  const isSave = Boolean(catalog?.effect.saveAbility);

  function handleForget() {
    if (!confirm(`Forget "${entry.name}"?`)) return;
    onForget(entry.id);
  }

  function handleCast() {
    if (!catalog || busy || !view.canAfford) return;
    const spec = disciplineRollSpec(catalog, effectiveFocus, characterLevel);
    const total = spec ? roll(spec, disciplineRollLabel(catalog)).total : 0;
    onCast({ type: "castDiscipline", disciplineId: catalog.id, focusSpent: effectiveFocus, roll: total });
  }

  return (
    <AbilityRowShell
      name={entry.name}
      chips={
        <span className="text-[10px] text-gold-700" aria-hidden="true">
          {view.focusLabel}
        </span>
      }
      actions={
        <>
          {view.scalable && (
            <select
              value={effectiveFocus}
              onChange={(e) => setSelectedFocus(Number(e.target.value))}
              disabled={busy}
              aria-label={`Focus to spend on ${entry.name}`}
              className="rounded-control border border-gold-300 bg-parchment-50 px-1.5 py-0.5 text-xs text-parchment-800 focus:outline-none focus:ring-1 focus:ring-gold-400"
            >
              {view.options.map((focus) => (
                <option key={focus} value={focus}>
                  {focus} focus
                </option>
              ))}
            </select>
          )}
          <CastAbilityButton
            disabled={busy || !view.canAfford || !catalog}
            onClick={handleCast}
            title={disciplineCastTitle(view, entry.name, effectiveFocus)}
          />
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
        </>
      }
    >
      <p className="text-xs leading-relaxed text-parchment-600">{entry.description}</p>
      <DisciplineRollPreview
        catalog={catalog}
        effectiveFocus={effectiveFocus}
        characterLevel={characterLevel}
        isSave={isSave}
        saveDC={saveDC}
      />
    </AbilityRowShell>
  );
}

/** The expanded row's "Rolls 3d8 · save DC 13" preview line. */
function DisciplineRollPreview({
  catalog,
  effectiveFocus,
  characterLevel,
  isSave,
  saveDC,
}: {
  catalog?: CatalogDiscipline;
  effectiveFocus: number;
  characterLevel: number;
  isSave: boolean;
  saveDC?: number;
}) {
  if (!catalog || (!catalog.effect.dice && !isSave)) return null;
  return (
    <p className="mt-1 text-[11px] text-gold-800">
      {catalog.effect.dice && (
        <>Rolls {formatRollSpec(disciplineRollSpec(catalog, effectiveFocus, characterLevel)!)}</>
      )}
      {isSave && saveDC !== undefined && (
        <> · save DC {saveDC}</>
      )}
    </p>
  );
}

/**
 * Pure Way of the Four Elements discipline row derivations (#1505). No JSX,
 * and — unlike the pre-#1381 disciplines.ts this replaces (reference only,
 * `34f5a4cf^:frontend/src/lib/disciplines.ts`) — no rule arithmetic either:
 * every selectable ki amount and its resolved roll already arrives on
 * `CatalogDiscipline.steps` (GET /api/disciplines, disciplineCastSteps
 * backend-side). This module only SELECTS among served steps and formats
 * labels; it never computes `base + step * dicePerStep` or a per-cast ki cap
 * itself (the client never computes the cap — #1505's explicit design).
 */

import type { CatalogDiscipline, DisciplineCastStep } from "@/types/character";

/** Every served step the character can currently afford — filtered by the ki
 *  in the pool, never by the real per-cast cap (that's server-enforced at
 *  cast time; offering more than the cap here is fine, since a cast over it
 *  is refused BY THE SERVER, not silently clamped client-side). */
export function affordableSteps(discipline: CatalogDiscipline, kiAvailable: number): DisciplineCastStep[] {
  return discipline.steps.filter((s) => s.ki <= kiAvailable);
}

/** Everything DisciplineRow derives from its props. */
export interface DisciplineCastView {
  /** Flat ki cost — 0 for a `cost.kind !== "pool"` row (none exist today, but the type allows one). */
  costBase: number;
  /** False for a no-dice utility discipline (e.g. Shape the Flowing River) — it still costs ki, just rolls nothing. */
  hasDice: boolean;
  /** Affordable ki amounts + their rolls, only when hasDice. */
  options: DisciplineCastStep[];
  /** True once more than one affordable amount exists — worth showing a picker. */
  scalable: boolean;
  canAfford: boolean;
  /** "1 ki" (flat) / "1-6 ki" (scalable, capped at what's affordable) / "no cost". */
  kiLabel: string;
}

export function disciplineCastView(discipline: CatalogDiscipline, kiAvailable: number): DisciplineCastView {
  const costBase = discipline.cost.kind === "pool" ? discipline.cost.base : 0;
  const hasDice = discipline.steps.length > 0;
  const options = hasDice ? affordableSteps(discipline, kiAvailable) : [];
  const scalable = options.length > 1;
  const canAfford = kiAvailable >= costBase;
  const maxAffordable = options.at(-1)?.ki;
  const kiLabel =
    costBase === 0 ? "no cost" : scalable && maxAffordable !== undefined ? `${costBase}-${maxAffordable} ki` : `${costBase} ki`;
  return { costBase, hasDice, options, scalable, canAfford, kiLabel };
}

/** The step a cast actually uses: the live selection if it's still a valid
 *  (affordable) option, else the cheapest one. Undefined when the
 *  discipline has no dice at all. */
export function effectiveStep(view: DisciplineCastView, selectedKi: number | undefined): DisciplineCastStep | undefined {
  if (!view.hasDice || view.options.length === 0) return undefined;
  return view.options.find((s) => s.ki === selectedKi) ?? view.options[0];
}

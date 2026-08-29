// Selects/formats served CatalogDiscipline.steps only; never computes dice counts or the ki cap itself.

import type { CatalogDiscipline, DisciplineCastStep } from "@/types/character";

// Filtered by the ki in the pool, never by the real per-cast cap — that's server-enforced at cast time, so offering more than the cap here is fine.
export function affordableSteps(discipline: CatalogDiscipline, kiAvailable: number): DisciplineCastStep[] {
  return discipline.steps.filter((s) => s.ki <= kiAvailable);
}

export interface DisciplineCastView {
  costBase: number;
  hasDice: boolean;
  options: DisciplineCastStep[];
  scalable: boolean;
  canAfford: boolean;
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

export function effectiveStep(view: DisciplineCastView, selectedKi: number | undefined): DisciplineCastStep | undefined {
  if (!view.hasDice || view.options.length === 0) return undefined;
  return view.options.find((s) => s.ki === selectedKi) ?? view.options[0];
}

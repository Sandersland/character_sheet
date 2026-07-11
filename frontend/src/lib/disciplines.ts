// Pure Way-of-the-Four-Elements discipline rules — mirror of the ki cap in
// backend/src/lib/disciplines.ts and the ki-scaled effect roll. No JSX.

import { resolveEffectSpec } from "@/lib/effects";
import type { RollSpec } from "@/lib/dice";
import type { CatalogDiscipline, CharacterResources } from "@/types/character";

// Max ki spendable on a single discipline by monk level (PHB Elemental Disciplines table).
export function maxKiPerDiscipline(monkLevel: number): number {
  return Math.min(6, 2 + Math.floor((monkLevel - 1) / 4));
}

// Base ki cost — 0 for a no-cost utility discipline (Elemental Attunement).
export function disciplineBaseCost(discipline: CatalogDiscipline): number {
  return discipline.cost.kind === "pool" ? discipline.cost.base : 0;
}

// A discipline scales when it costs ki per additional step and carries dice.
export function isDisciplineScalable(discipline: CatalogDiscipline): boolean {
  return (
    discipline.cost.kind === "pool" &&
    Boolean(discipline.effect.dice) &&
    (discipline.effect.scaling.dicePerStep ?? 0) > 0
  );
}

// Remaining ki from the character's derived resource pools.
export function kiRemaining(resources: CharacterResources | undefined): number {
  return resources?.pools.find((p) => p.key === "ki")?.remaining ?? 0;
}

// Selectable ki totals for a cast: base..min(cap, base + available scaling steps),
// clamped by ki on hand. Empty when the base cost can't be afforded.
export function disciplineKiOptions(
  discipline: CatalogDiscipline,
  monkLevel: number,
  available: number,
): number[] {
  const base = disciplineBaseCost(discipline);
  if (base === 0) return [];
  if (available < base) return [];
  const ceiling = isDisciplineScalable(discipline)
    ? Math.min(maxKiPerDiscipline(monkLevel), available)
    : base;
  const options: number[] = [];
  for (let ki = base; ki <= ceiling; ki++) options.push(ki);
  return options;
}

// The concrete roll for a cast at `kiSpent` ki — null for utility disciplines.
export function disciplineRollSpec(
  discipline: CatalogDiscipline,
  kiSpent: number,
  characterLevel: number,
): RollSpec | null {
  const step = Math.max(0, kiSpent - disciplineBaseCost(discipline));
  return resolveEffectSpec(discipline.effect, step, { characterLevel });
}

/** Everything DisciplineRow derives for its cast affordance (#688). */
export interface DisciplineCastView {
  base: number;
  options: number[];
  scalable: boolean;
  canAfford: boolean;
  /** "2+ ki" (scalable) / "2 ki" (flat) / "no ki". */
  kiLabel: string;
}

export function disciplineCastView(
  discipline: CatalogDiscipline | undefined,
  monkLevel: number,
  kiAvailable: number,
): DisciplineCastView {
  const base = discipline ? disciplineBaseCost(discipline) : 0;
  const options = discipline ? disciplineKiOptions(discipline, monkLevel, kiAvailable) : [];
  const scalable = options.length > 1;
  return {
    base,
    options,
    scalable,
    canAfford: base === 0 || kiAvailable >= base,
    kiLabel: base > 0 ? `${base}${scalable ? "+" : ""} ki` : "no ki",
  };
}

/** The ki a cast actually spends: the live selection, else the first option/base. */
export function effectiveKiSelection(view: DisciplineCastView, selectedKi: number): number {
  return view.scalable ? (view.options.includes(selectedKi) ? selectedKi : view.options[0]) : view.base;
}

/** RollContext label for a cast: "Name — fire damage" / "Name — healing". */
export function disciplineRollLabel(discipline: CatalogDiscipline): string {
  const { effectType, damageType } = discipline.effect;
  if (effectType === "heal") return `${discipline.name} — healing`;
  // Non-heal with no damage type (e.g. a utility/force effect with damageType
  // unset): fall back to the bare name rather than a dangling "— damage".
  if (!damageType) return discipline.name;
  return `${discipline.name} — ${damageType} damage`;
}

/** Cast-button title: explains a disabled button, or names the spend. */
export function disciplineCastTitle(view: DisciplineCastView, entryName: string, effectiveKi: number): string {
  if (!view.canAfford) return `Not enough ki (needs ${view.base})`;
  return `Cast ${entryName}${view.base > 0 ? ` (${effectiveKi} ki)` : ""}`;
}

// Pure Way-of-the-Four-Elements discipline rules — mirror of the backend focus
// cap and the focus-scaled effect roll. No JSX.

import { resolveEffectSpec } from "@/lib/effects";
import type { RollSpec } from "@/lib/dice";
import type { CatalogDiscipline, CharacterResources } from "@/types/character";

// Max focus spendable on a single discipline by monk level (PHB Elemental Disciplines table).
export function maxFocusPerDiscipline(monkLevel: number): number {
  return Math.min(6, 2 + Math.floor((monkLevel - 1) / 4));
}

// Base focus cost — 0 for a no-cost utility discipline (Elemental Attunement).
export function disciplineBaseCost(discipline: CatalogDiscipline): number {
  return discipline.cost.kind === "pool" ? discipline.cost.base : 0;
}

// A discipline scales when it costs focus per additional step and carries dice.
export function isDisciplineScalable(discipline: CatalogDiscipline): boolean {
  return (
    discipline.cost.kind === "pool" &&
    Boolean(discipline.effect.dice) &&
    (discipline.effect.scaling.dicePerStep ?? 0) > 0
  );
}

// Remaining focus from the character's derived resource pools.
export function focusRemaining(resources: CharacterResources | undefined): number {
  return resources?.pools.find((p) => p.key === "focus")?.remaining ?? 0;
}

// Selectable focus totals for a cast: base..min(cap, base + available scaling steps),
// clamped by focus on hand. Empty when the base cost can't be afforded.
export function disciplineFocusOptions(
  discipline: CatalogDiscipline,
  monkLevel: number,
  available: number,
): number[] {
  const base = disciplineBaseCost(discipline);
  if (base === 0) return [];
  if (available < base) return [];
  const ceiling = isDisciplineScalable(discipline)
    ? Math.min(maxFocusPerDiscipline(monkLevel), available)
    : base;
  const options: number[] = [];
  for (let focus = base; focus <= ceiling; focus++) options.push(focus);
  return options;
}

// The concrete roll for a cast at `focusSpent` focus — null for utility disciplines.
export function disciplineRollSpec(
  discipline: CatalogDiscipline,
  focusSpent: number,
  characterLevel: number,
): RollSpec | null {
  const step = Math.max(0, focusSpent - disciplineBaseCost(discipline));
  return resolveEffectSpec(discipline.effect, step, { characterLevel });
}

/** Everything DisciplineRow derives for its cast affordance (#688). */
export interface DisciplineCastView {
  base: number;
  options: number[];
  scalable: boolean;
  canAfford: boolean;
  /** "2+ focus" (scalable) / "2 focus" (flat) / "no focus". */
  focusLabel: string;
}

export function disciplineCastView(
  discipline: CatalogDiscipline | undefined,
  monkLevel: number,
  focusAvailable: number,
): DisciplineCastView {
  const base = discipline ? disciplineBaseCost(discipline) : 0;
  const options = discipline ? disciplineFocusOptions(discipline, monkLevel, focusAvailable) : [];
  const scalable = options.length > 1;
  return {
    base,
    options,
    scalable,
    canAfford: base === 0 || focusAvailable >= base,
    focusLabel: base > 0 ? `${base}${scalable ? "+" : ""} focus` : "no focus",
  };
}

/** The focus a cast actually spends: the live selection, else the first option/base. */
export function effectiveFocusSelection(view: DisciplineCastView, selectedFocus: number): number {
  return view.scalable ? (view.options.includes(selectedFocus) ? selectedFocus : view.options[0]) : view.base;
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
export function disciplineCastTitle(view: DisciplineCastView, entryName: string, effectiveFocus: number): string {
  if (!view.canAfford) return `Not enough focus (needs ${view.base})`;
  return `Cast ${entryName}${view.base > 0 ? ` (${effectiveFocus} focus)` : ""}`;
}

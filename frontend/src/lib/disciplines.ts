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

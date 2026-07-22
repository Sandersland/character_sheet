// Mirror of the backend combat-effects module — keep in sync. Canonical 5e effect model
// (dice + save + scaling) extracted from Spell so it can describe any activated
// ability. The one intentional divergence: resolveEffectSpec returns the real
// RollSpec from @/lib/dice (the backend has no RollSpec type).

import type { RollSpec } from "@/lib/dice";

// Kind of thing an effect does. "utility" carries no roll today; "buff" applies
// a passive stat modifier (no roll) while the granting concentration holds.
export type EffectType = "damage" | "heal" | "utility" | "buff";

// How the dice count grows: cantrips scale by character level, leveled spells by
// slot upcast steps, focus-fuelled abilities by focus spent above the base cost.
export interface EffectScaling {
  mode: "none" | "slotUpcast" | "cantripLevel" | "focus";
  dicePerStep?: number;
}

// Structured effect describing an activated ability's roll.
export interface EffectSpec {
  effectType: EffectType;
  dice?: { count: number; faces: number; modifier?: number };
  damageType?: string | null;
  attackType?: string | null;
  saveAbility?: string | null;
  saveEffect?: string | null;
  scaling: EffectScaling;
  concentration?: boolean;
  addAbilityModToHeal?: boolean;
  // Passive-modifier ("buff") payload — present only for effectType "buff".
  buffTarget?: string | null;
  buffModifier?: number | null;
}

// The flat effect columns snapshotted from the catalog.
export interface EffectColumns {
  effectKind?: string | null;
  effectDiceCount?: number | null;
  effectDiceFaces?: number | null;
  effectModifier?: number | null;
  damageType?: string | null;
  attackType?: string | null;
  saveAbility?: string | null;
  saveEffect?: string | null;
  upcastDicePerLevel?: number | null;
  cantripScaling?: boolean;
  buffTarget?: string | null;
  buffModifier?: number | null;
}

// A row carrying effect columns plus the level that decides the scaling axis.
export type EffectRow = EffectColumns & { level: number; concentration?: boolean };

// Dice resolution: a row without kind, count, or faces reads as dice-less.
// (The backend twin additionally resolves effectDieSource via a ClassDieResolver
// — frontend rows never carry that column.)
function resolveEffectDice(row: EffectRow): EffectSpec["dice"] {
  const hasDice = Boolean(row.effectKind && row.effectDiceCount && row.effectDiceFaces);
  return hasDice
    ? {
        count: row.effectDiceCount as number,
        faces: row.effectDiceFaces as number,
        modifier: row.effectModifier ?? 0,
      }
    : undefined;
}

// Scaling axis: cantrips (level 0) scale by character level; leveled rows with
// upcast dice scale by slot step; everything else is fixed. The two arms are
// mutually exclusive by `level` (0 vs >0), so only one can ever match and the
// check order is immaterial — a level-0 row never reaches the upcast arm.
function resolveEffectScaling(row: EffectRow): EffectScaling {
  if (row.level === 0 && row.cantripScaling) return { mode: "cantripLevel" };
  if (row.level > 0 && row.upcastDicePerLevel) return { mode: "slotUpcast", dicePerStep: row.upcastDicePerLevel };
  return { mode: "none" };
}

// Effect kind → spec type ladder; anything unrecognized is roll-less "utility".
function resolveEffectType(effectKind: string | null | undefined): EffectType {
  if (effectKind === "heal") return "heal";
  if (effectKind === "damage") return "damage";
  if (effectKind === "buff") return "buff";
  return "utility";
}

// Adapter over the existing flat columns — no schema migration. Reproduces the
// null-guard and scaling-mode selection from the old computeCastSpec.
export function readEffectSpec(row: EffectRow): EffectSpec {
  return {
    effectType: resolveEffectType(row.effectKind),
    dice: resolveEffectDice(row),
    damageType: row.damageType ?? null,
    attackType: row.attackType ?? null,
    saveAbility: row.saveAbility ?? null,
    saveEffect: row.saveEffect ?? null,
    scaling: resolveEffectScaling(row),
    concentration: row.concentration,
    addAbilityModToHeal: row.effectKind === "heal",
    buffTarget: row.buffTarget ?? null,
    buffModifier: row.buffModifier ?? null,
  };
}

// Resolve a spec to a concrete RollSpec. `effectiveStep` is the scaling step
// count (upcast levels above base / focus above base cost; 0 for cantrips). Returns
// null when the effect carries no dice.
export function resolveEffectSpec(
  spec: EffectSpec,
  effectiveStep: number,
  ctx: { characterLevel: number; abilityMod?: number },
): RollSpec | null {
  if (!spec.dice) return null;

  let count = spec.dice.count;
  if (spec.scaling.mode === "cantripLevel") {
    if (ctx.characterLevel >= 17) count *= 4;
    else if (ctx.characterLevel >= 11) count *= 3;
    else if (ctx.characterLevel >= 5) count *= 2;
  } else if (spec.scaling.mode === "slotUpcast" || spec.scaling.mode === "focus") {
    count += effectiveStep * (spec.scaling.dicePerStep ?? 0);
  }

  let modifier = spec.dice.modifier ?? 0;
  if (spec.effectType === "heal" && spec.addAbilityModToHeal) {
    modifier += ctx.abilityMod ?? 0;
  }

  return { count, faces: spec.dice.faces, modifier };
}

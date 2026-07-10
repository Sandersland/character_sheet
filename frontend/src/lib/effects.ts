// Mirror of backend lib/combat/effects.ts — keep in sync. Canonical 5e effect model
// (dice + save + scaling) extracted from Spell so it can describe any activated
// ability. The one intentional divergence: resolveEffectSpec returns the real
// RollSpec from @/lib/dice (the backend has no RollSpec type).

import type { RollSpec } from "@/lib/dice";

// Kind of thing an effect does. "utility" carries no roll today; "buff" applies
// a passive stat modifier (no roll) while the granting concentration holds.
export type EffectType = "damage" | "heal" | "utility" | "buff";

// How the dice count grows: cantrips scale by character level, leveled spells by
// slot upcast steps, ki-fuelled abilities by ki spent above the base cost.
export interface EffectScaling {
  mode: "none" | "slotUpcast" | "cantripLevel" | "ki";
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

// Adapter over the existing flat columns — no schema migration. Reproduces the
// null-guard and scaling-mode selection from the old computeCastSpec.
export function readEffectSpec(row: EffectRow): EffectSpec {
  const hasDice = Boolean(row.effectKind && row.effectDiceCount && row.effectDiceFaces);
  const dice = hasDice
    ? {
        count: row.effectDiceCount as number,
        faces: row.effectDiceFaces as number,
        modifier: row.effectModifier ?? 0,
      }
    : undefined;

  let scaling: EffectScaling;
  if (row.level === 0 && row.cantripScaling) {
    scaling = { mode: "cantripLevel" };
  } else if (row.level > 0 && row.upcastDicePerLevel) {
    scaling = { mode: "slotUpcast", dicePerStep: row.upcastDicePerLevel };
  } else {
    scaling = { mode: "none" };
  }

  const effectType: EffectType =
    row.effectKind === "heal"
      ? "heal"
      : row.effectKind === "damage"
        ? "damage"
        : row.effectKind === "buff"
          ? "buff"
          : "utility";

  return {
    effectType,
    dice,
    damageType: row.damageType ?? null,
    attackType: row.attackType ?? null,
    saveAbility: row.saveAbility ?? null,
    saveEffect: row.saveEffect ?? null,
    scaling,
    concentration: row.concentration,
    addAbilityModToHeal: row.effectKind === "heal",
    buffTarget: row.buffTarget ?? null,
    buffModifier: row.buffModifier ?? null,
  };
}

// Resolve a spec to a concrete RollSpec. `effectiveStep` is the scaling step
// count (upcast levels above base / ki above base cost; 0 for cantrips). Returns
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
  } else if (spec.scaling.mode === "slotUpcast" || spec.scaling.mode === "ki") {
    count += effectiveStep * (spec.scaling.dicePerStep ?? 0);
  }

  let modifier = spec.dice.modifier ?? 0;
  if (spec.effectType === "heal" && spec.addAbilityModToHeal) {
    modifier += ctx.abilityMod ?? 0;
  }

  return { count, faces: spec.dice.faces, modifier };
}

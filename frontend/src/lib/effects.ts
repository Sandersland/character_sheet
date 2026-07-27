// The effect model TYPES are single-sourced in shared-types (#1272); this file
// keeps the RUNTIME resolution mirrored from backend/src/lib/combat/effects.ts
// (follow-up work, not this change) — the one intentional divergence:
// resolveEffectSpec returns the real RollSpec from @/lib/dice (the backend has
// no RollSpec type).

import type { RollSpec } from "@/lib/dice";
export type { EffectRow, EffectSpec } from "@character-sheet/shared-types";
import type { EffectRow, EffectScaling, EffectSpec, EffectType } from "@character-sheet/shared-types";

// Dice resolution: a row without kind, count, or faces reads as dice-less.
// The wire type's effectDieSource (a class-die reference the backend resolves
// via ClassDieResolver) is never read here — frontend rows never carry a
// resolved value for it, so this stays the fixed-effectDiceFaces-only arm.
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
// count (upcast levels above base; 0 for cantrips). Returns
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
  } else if (spec.scaling.mode === "slotUpcast") {
    count += effectiveStep * (spec.scaling.dicePerStep ?? 0);
  }

  let modifier = spec.dice.modifier ?? 0;
  if (spec.effectType === "heal" && spec.addAbilityModToHeal) {
    modifier += ctx.abilityMod ?? 0;
  }

  return { count, faces: spec.dice.faces, modifier };
}

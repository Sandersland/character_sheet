// The resolved EffectSpec + EffectRoll[] are what cross the wire; the client never re-derives a roll.
export type { EffectColumns, EffectRoll, EffectRow, EffectScaling, EffectSpec } from "@character-sheet/shared-types";

import type { EffectRow, EffectScaling, EffectSpec, EffectType } from "@character-sheet/shared-types";

export type ClassDieResolver = (source: string) => number | null;

// deriveManeuverEffect is the only caller supplying a real resolveDie (via resolveClassDie).
function resolveEffectDieFaces(row: EffectRow, resolveDie?: ClassDieResolver): number | null {
  const referencedFaces = row.effectDieSource ? resolveDie?.(row.effectDieSource) ?? null : null;
  return referencedFaces ?? row.effectDiceFaces ?? null;
}

function resolveEffectDice(row: EffectRow, resolveDie?: ClassDieResolver): EffectSpec["dice"] {
  const faces = resolveEffectDieFaces(row, resolveDie);
  const hasDice = Boolean(row.effectKind && row.effectDiceCount && faces);
  return hasDice
    ? {
        count: row.effectDiceCount as number,
        faces: faces as number,
        modifier: row.effectModifier ?? 0,
      }
    : undefined;
}

// The two arms are mutually exclusive by level (0 vs >0), so check order is immaterial.
function resolveEffectScaling(row: EffectRow): EffectScaling {
  if (row.level === 0 && row.cantripScaling) return { mode: "cantripLevel" };
  if (row.level > 0 && row.upcastDicePerLevel) return { mode: "slotUpcast", dicePerStep: row.upcastDicePerLevel };
  return { mode: "none" };
}

function resolveEffectType(effectKind: string | null | undefined): EffectType {
  if (effectKind === "heal") return "heal";
  if (effectKind === "damage") return "damage";
  if (effectKind === "buff") return "buff";
  return "utility";
}

// effectModifierSource is deliberately not in shared-types' EffectColumns (earned by ClassFeature
// content, not every consumer), so it's widened here as a call-site-local type instead.
type EffectRowWithModifierSource = EffectRow & { effectModifierSource?: string | null };

// An adapter over the existing flat columns, no schema migration — resolveDie's faces supersede the
// fixed effectDiceFaces when present.
export function readEffectSpec(row: EffectRowWithModifierSource, resolveDie?: ClassDieResolver): EffectSpec {
  return {
    effectType: resolveEffectType(row.effectKind),
    dice: resolveEffectDice(row, resolveDie),
    damageType: row.damageType ?? null,
    attackType: row.attackType ?? null,
    saveAbility: row.saveAbility ?? null,
    saveEffect: row.saveEffect ?? null,
    scaling: resolveEffectScaling(row),
    concentration: row.concentration,
    addAbilityModToHeal: row.effectKind === "heal",
    buffTarget: row.buffTarget ?? null,
    buffModifier: row.buffModifier ?? null,
    modifierSource: row.effectModifierSource ?? null,
  };
}

export interface CatalogEffectRow {
  name: string;
  effectKind?: string | null;
  effectDiceCount?: number | null;
  effectDiceFaces?: number | null;
  effectModifier?: number | null;
  damageType?: string | null;
  attackType?: string | null;
  saveAbility?: string | null;
  saveEffect?: string | null;
  buffTarget?: string | null;
  buffModifier?: number | null;
}

export interface CatalogEffectConfig {
  scaling: EffectScaling;
  concentrates: (name: string) => boolean;
}

// Deliberately thin: the declarative subclass engine (#416) will subsume this row→spec mapping.
export function catalogEffectSpec(row: CatalogEffectRow, config: CatalogEffectConfig): EffectSpec {
  const hasDice = Boolean(row.effectKind && row.effectDiceCount && row.effectDiceFaces);
  const dice = hasDice
    ? { count: row.effectDiceCount as number, faces: row.effectDiceFaces as number, modifier: row.effectModifier ?? 0 }
    : undefined;
  return {
    effectType: resolveEffectType(row.effectKind),
    dice,
    damageType: row.damageType ?? null,
    attackType: row.attackType ?? null,
    saveAbility: row.saveAbility ?? null,
    saveEffect: row.saveEffect ?? null,
    scaling: config.scaling,
    concentration: config.concentrates(row.name),
    buffTarget: row.buffTarget ?? null,
    buffModifier: row.buffModifier ?? null,
  };
}

export interface BuffDescriptor {
  target: string;
  modifier: number;
}

// The cast path appends this to activeEffects instead of coercing the effect to a roll-less "utility".
export function resolveBuffSpec(spec: EffectSpec): BuffDescriptor | null {
  if (spec.effectType !== "buff") return null;
  if (!spec.buffTarget) return null;
  return { target: spec.buffTarget, modifier: spec.buffModifier ?? 0 };
}

// effectiveStep is the scaling step count (upcast levels above base, or focus/ki above base cost; 0 for cantrips).
export function resolveEffectSpec(
  spec: EffectSpec,
  effectiveStep: number,
  ctx: { characterLevel: number; classLevel?: number; abilityMod?: number },
): { count: number; faces: number; modifier: number } | null {
  if (!spec.dice) return null;

  let count = spec.dice.count;
  if (spec.scaling.mode === "cantripLevel") {
    if (ctx.characterLevel >= 17) count *= 4;
    else if (ctx.characterLevel >= 11) count *= 3;
    else if (ctx.characterLevel >= 5) count *= 2;
  } else if (spec.scaling.mode === "slotUpcast" || spec.scaling.mode === "poolStep") {
    // Same formula for both: a spell-slot upcast step and a pool (ki/focus)
    // overspend step (#1503) each add `dicePerStep` dice per step above the
    // effect's base cost.
    count += effectiveStep * (spec.scaling.dicePerStep ?? 0);
  }

  let modifier = spec.dice.modifier ?? 0;
  if (spec.effectType === "heal" && spec.addAbilityModToHeal) {
    modifier += ctx.abilityMod ?? 0;
  }
  // classLevel, not characterLevel: cantripLevel scaling uses total character level, while classLevel
  // is the granting class entry's own level — collapsing them onto one field made a Fighter 1/Wizard 19
  // heal 1d10+20. A caller resolving a ClassFeature row for a possibly-multiclass character MUST pass
  // classLevel; only "classLevel" is resolved today, other modifierSource values fall through unresolved.
  if (spec.modifierSource === "classLevel") {
    modifier += ctx.classLevel ?? ctx.characterLevel;
  }

  return { count, faces: spec.dice.faces, modifier };
}

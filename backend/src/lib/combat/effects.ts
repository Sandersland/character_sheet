// Canonical 5e effect model (dice + save + scaling), extracted from Spell so it
// can describe any activated ability, not just spells. The type declarations
// are single-sourced in shared-types (#1272); THIS file is now the only
// implementation of the runtime halves (resolution + roll math) — the former
// frontend/src/lib/effects.ts mirror is deleted (#1381). readEffectSpec /
// resolveEffectSpec resolve here in buildSpellcastingView (spell rows) and
// deriveManeuverEffect (maneuver rows); the resolved EffectSpec + EffectRoll[]
// are what cross the wire, so the client never re-derives a roll.
export type { EffectColumns, EffectRoll, EffectRow, EffectScaling, EffectSpec } from "@character-sheet/shared-types";

import type { EffectRow, EffectScaling, EffectSpec, EffectType } from "@character-sheet/shared-types";

// Resolves a class-die source key (e.g. "superiorityDice") to its die-face count.
export type ClassDieResolver = (source: string) => number | null;

// Die faces: a class-die reference (effectDieSource + resolveDie) supersedes
// the fixed effectDiceFaces. deriveManeuverEffect (classes/maneuver-effect.ts)
// is the reachable caller supplying resolveClassDie as the ClassDieResolver —
// the only way a maneuver's die (e.g. superiorityDice) resolves to real faces.
function resolveEffectDieFaces(row: EffectRow, resolveDie?: ClassDieResolver): number | null {
  const referencedFaces = row.effectDieSource ? resolveDie?.(row.effectDieSource) ?? null : null;
  return referencedFaces ?? row.effectDiceFaces ?? null;
}

// Dice resolution: a row without kind, count, or usable faces reads as dice-less.
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

// `effectModifierSource` is deliberately NOT in shared-types' EffectColumns
// (#1528 decision 3 — it's earned by ClassFeature content, not every
// EffectColumns consumer), so it's added here as a call-site-local widening
// rather than a shared-type change. Optional so every existing EffectRow
// caller (Spell/GrantedAbility snapshots, none of which set it) keeps typing.
type EffectRowWithModifierSource = EffectRow & { effectModifierSource?: string | null };

// Adapter over the existing flat columns — no schema migration. When a row
// carries effectDieSource, `resolveDie` supplies the faces (superseding the fixed
// effectDiceFaces); fixed-dice rows are unaffected. Callers: buildSpellcastingView
// (spell rows, no resolveDie), deriveManeuverEffect (maneuver rows, via
// resolveClassDie), and castSpecFromRow (ClassFeature rows, #1528, via the
// `{ ...row, level: 0 }` adapter — see its own comment for the EffectRow
// landmine this sidesteps) — all serializer/cast-side, so the client only
// ever sees the resolved EffectSpec, never these raw columns.
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

// Catalog columns a focus-fuelled ability (Shadow Art) maps to an EffectSpec.
// The row carries the dice/damage/save fields OR the buff fields; the caller
// supplies the two genuine per-subclass differences via CatalogEffectConfig.
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

// The genuine differences between focus-cast subclasses: how the effect scales
// and which ability names concentrate (a per-name set membership test).
export interface CatalogEffectConfig {
  scaling: EffectScaling;
  concentrates: (name: string) => boolean;
}

// Build a focus-fuelled ability's EffectSpec from its catalog row. Shadow Arts
// pass { mode: "none" } + their concentration set. Kept deliberately thin — the
// declarative subclass engine (#416) will subsume this row→spec mapping.
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

/** A concrete passive-modifier descriptor resolved from a buff EffectSpec. */
export interface BuffDescriptor {
  target: string;
  modifier: number;
}

// Resolve a buff spec to a concrete { target, modifier }, or null when the spec
// is not a buff (or lacks a target). The cast path appends this to activeEffects
// instead of coercing the effect to a roll-less "utility".
export function resolveBuffSpec(spec: EffectSpec): BuffDescriptor | null {
  if (spec.effectType !== "buff") return null;
  if (!spec.buffTarget) return null;
  return { target: spec.buffTarget, modifier: spec.buffModifier ?? 0 };
}

// Resolve a spec to a concrete dice roll. `effectiveStep` is the scaling step
// count (upcast levels above base / focus above base cost; 0 for cantrips). Returns
// null when the effect carries no dice.
export function resolveEffectSpec(
  spec: EffectSpec,
  effectiveStep: number,
  ctx: { characterLevel: number; abilityMod?: number },
): { count: number; faces: number; modifier: number } | null {
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
  // One more enumerated modifier source beside addAbilityModToHeal (#1528) —
  // Second Wind's `1d10 + Fighter level`. Only "classLevel" resolves today;
  // "abilityMod:<ability>" is reserved for a future consumer (Rally, still
  // hardcoded in maneuvers.ts, out of this issue's scope) and falls through
  // unresolved rather than guessing which ability.
  if (spec.modifierSource === "classLevel") {
    modifier += ctx.characterLevel;
  }

  return { count, faces: spec.dice.faces, modifier };
}

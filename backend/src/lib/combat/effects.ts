// Canonical 5e effect model (dice + save + scaling), extracted from Spell so it
// can describe any activated ability, not just spells. Hand-mirrored on the
// frontend in frontend/src/lib/effects.ts — keep the two in sync.

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
  // Passive-modifier ("buff") payload — the skill/stat target and flat modifier
  // applied while the granting concentration holds. Present only for effectType "buff".
  buffTarget?: string | null;
  buffModifier?: number | null;
}

// The 10 flat effect columns snapshotted from the catalog, shared by every
// snapshot shape (SpellEntry, custom-spell input, frontend Spell).
export interface EffectColumns {
  effectKind?: string | null;
  effectDiceCount?: number | null;
  effectDiceFaces?: number | null;
  // Class-die reference (e.g. "superiorityDice") — supersedes effectDiceFaces when it resolves.
  effectDieSource?: string | null;
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

// Resolves a class-die source key (e.g. "superiorityDice") to its die-face count.
export type ClassDieResolver = (source: string) => number | null;

// Die faces: a class-die reference (effectDieSource + resolveDie) supersedes
// the fixed effectDiceFaces. (Frontend twin lacks this arm — its rows never
// carry effectDieSource.)
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

// Adapter over the existing flat columns — no schema migration. Reproduces the
// null-guard and scaling-mode selection from the old computeCastSpec. When a row
// carries effectDieSource, `resolveDie` supplies the faces (superseding the fixed
// effectDiceFaces); fixed-dice rows are unaffected.
export function readEffectSpec(row: EffectRow, resolveDie?: ClassDieResolver): EffectSpec {
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
  };
}

// Catalog columns a ki-fuelled ability (discipline, Shadow Art) maps to an
// EffectSpec. The row carries the dice/damage/save fields OR the buff fields; the
// caller supplies the two genuine per-subclass differences via CatalogEffectConfig.
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

// The genuine differences between ki-cast subclasses: how the effect scales (ki
// vs flat) and which ability names concentrate (a per-name set membership test).
export interface CatalogEffectConfig {
  scaling: EffectScaling;
  concentrates: (name: string) => boolean;
}

// Build a ki-fuelled ability's EffectSpec from its catalog row. Disciplines pass
// { mode: "ki", dicePerStep } + their concentration set; Shadow Arts pass
// { mode: "none" } + theirs. Kept deliberately thin — the declarative subclass
// engine (#416) will subsume this row→spec mapping.
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
// count (upcast levels above base / ki above base cost; 0 for cantrips). Returns
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
  } else if (spec.scaling.mode === "slotUpcast" || spec.scaling.mode === "ki") {
    count += effectiveStep * (spec.scaling.dicePerStep ?? 0);
  }

  let modifier = spec.dice.modifier ?? 0;
  if (spec.effectType === "heal" && spec.addAbilityModToHeal) {
    modifier += ctx.abilityMod ?? 0;
  }

  return { count, faces: spec.dice.faces, modifier };
}

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

// Adapter over the existing flat columns — no schema migration. Reproduces the
// null-guard and scaling-mode selection from the old computeCastSpec. When a row
// carries effectDieSource, `resolveDie` supplies the faces (superseding the fixed
// effectDiceFaces); fixed-dice rows are unaffected.
export function readEffectSpec(row: EffectRow, resolveDie?: ClassDieResolver): EffectSpec {
  const referencedFaces = row.effectDieSource ? resolveDie?.(row.effectDieSource) ?? null : null;
  const faces = referencedFaces ?? row.effectDiceFaces ?? null;
  const hasDice = Boolean(row.effectKind && row.effectDiceCount && faces);
  const dice = hasDice
    ? {
        count: row.effectDiceCount as number,
        faces: faces as number,
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

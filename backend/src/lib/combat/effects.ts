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
// A row may set upcastInstancesPerLevel with no upcastDicePerLevel (Magic Missile, Scorching Ray)
// or vice versa (any pre-#1981 spell) — either alone is enough to select slotUpcast.
function resolveEffectScaling(row: EffectRow): EffectScaling {
  if (row.level === 0 && row.cantripScaling) return { mode: "cantripLevel" };
  // Explicit null checks, not truthiness — a stored 0 (schema-rejected today, but this is a plain
  // column read) must not silently drop the whole slotUpcast mode.
  if (row.level > 0 && (row.upcastDicePerLevel != null || row.upcastInstancesPerLevel != null)) {
    return {
      mode: "slotUpcast",
      ...(row.upcastDicePerLevel != null ? { dicePerStep: row.upcastDicePerLevel } : {}),
      ...(row.upcastInstancesPerLevel != null ? { instancesPerStep: row.upcastInstancesPerLevel } : {}),
    };
  }
  return { mode: "none" };
}

// Present only when the row sets instanceCount (Magic Missile's darts, Scorching Ray's rays,
// Eldritch Blast's beams, #1981) — absent instanceRoll on such a row defaults to "each".
function resolveInstances(row: EffectRow): EffectSpec["instances"] {
  if (row.instanceCount == null) return undefined;
  return { count: row.instanceCount, roll: row.instanceRoll ?? "each" };
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
// fixed effectDiceFaces when present. readEffectSpec and catalogEffectSpec are the two EffectSpec
// builders (Spell/ClassFeature rows vs GrantedAbility/maneuver rows) — a new EffectSpec field needs
// both updated together or one row family silently stops serving it. Exception so far: `instances`
// — CatalogEffectRow carries no instance columns, so catalogEffectSpec structurally cannot serve
// them; extend CatalogEffectRow first when a granted-ability/maneuver row needs instances.
export function readEffectSpec(row: EffectRowWithModifierSource, resolveDie?: ClassDieResolver): EffectSpec {
  const instances = resolveInstances(row);
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
    // Key omitted (not `instances: undefined`) so an un-instanced row's serialized/snapshotted
    // spec stays byte-identical to pre-#1981 — a snapshot serializer renders undefined-valued
    // keys explicitly, unlike `toEqual`.
    ...(instances ? { instances } : {}),
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
// Sibling of readEffectSpec (see its own comment) — the other EffectSpec builder to update together.
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

// characterLevel 1-4 -> tier 1 (no scaling); 5-10 -> 2; 11-16 -> 3; 17+ -> 4. No single rules-glossary
// page states this breakpoint table in either edition — each scaling cantrip's own text restates it
// (e.g. Fire Bolt, Eldritch Blast), so there is no page number to cite for the mechanic itself.
function cantripTierMultiplier(characterLevel: number): number {
  if (characterLevel >= 17) return 4;
  if (characterLevel >= 11) return 3;
  if (characterLevel >= 5) return 2;
  return 1;
}

function scaleCountAndInstances(
  spec: EffectSpec,
  effectiveStep: number,
  characterLevel: number,
): { count: number; instanceCount?: number } {
  let count = spec.dice!.count;
  let instanceCount = spec.instances?.count;

  if (spec.scaling.mode === "cantripLevel") {
    // A multi-instance cantrip (Eldritch Blast) scales its BEAM COUNT, not its dice — dice stay
    // per-instance. An un-instanced cantrip (Fire Bolt) scales dice, exactly as before #1981.
    const tier = cantripTierMultiplier(characterLevel);
    if (instanceCount !== undefined) instanceCount *= tier;
    else count *= tier;
  } else if (spec.scaling.mode === "slotUpcast" || spec.scaling.mode === "poolStep") {
    // Same formula for both: a spell-slot upcast step and a pool (ki/focus)
    // overspend step (#1503) each add `dicePerStep` dice per step above the
    // effect's base cost. instancesPerStep (Magic Missile, Scorching Ray) adds
    // instances the same way, independently — a row could in principle set both.
    count += effectiveStep * (spec.scaling.dicePerStep ?? 0);
    if (instanceCount !== undefined) {
      instanceCount += effectiveStep * (spec.scaling.instancesPerStep ?? 0);
    }
  }

  return { count, instanceCount };
}

// classLevel, not characterLevel: cantripLevel scaling uses total character level, while classLevel
// is the granting class entry's own level — collapsing them onto one field made a Fighter 1/Wizard 19
// heal 1d10+20. A caller resolving a ClassFeature row for a possibly-multiclass character MUST pass
// classLevel; only "classLevel" is resolved today, other modifierSource values fall through unresolved.
function resolveModifier(spec: EffectSpec, ctx: { characterLevel: number; classLevel?: number; abilityMod?: number }): number {
  let modifier = spec.dice!.modifier ?? 0;
  if (spec.effectType === "heal" && spec.addAbilityModToHeal) {
    modifier += ctx.abilityMod ?? 0;
  }
  if (spec.modifierSource === "classLevel") {
    modifier += ctx.classLevel ?? ctx.characterLevel;
  }
  return modifier;
}

// effectiveStep is the scaling step count (upcast levels above base, or focus/ki above base cost; 0 for cantrips).
export function resolveEffectSpec(
  spec: EffectSpec,
  effectiveStep: number,
  ctx: { characterLevel: number; classLevel?: number; abilityMod?: number },
): { count: number; faces: number; modifier: number; instanceCount?: number } | null {
  if (!spec.dice) return null;

  const { count, instanceCount } = scaleCountAndInstances(spec, effectiveStep, ctx.characterLevel);
  const modifier = resolveModifier(spec, ctx);

  return { count, faces: spec.dice.faces, modifier, ...(instanceCount !== undefined ? { instanceCount } : {}) };
}

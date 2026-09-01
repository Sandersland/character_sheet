/** "utility" carries no roll; "buff" applies a passive stat modifier while the granting concentration holds. */
export type EffectType = "damage" | "heal" | "utility" | "buff";

/** "each" rolls one instance's dice per instance (Scorching Ray, Eldritch Blast); "once" rolls the dice a single time and applies the result to every instance (2014 Magic Missile — Sage Advice Compendium: the darts strike simultaneously, so their damage is rolled once, not per dart). Per-edition seed CONTENT, not a rule fork — a row's own comment (e.g. the seeded Magic Missile rows) carries the actual citation; this is the one place the mechanic itself is documented. */
export type EffectInstanceRoll = "each" | "once";

/** cantripLevel scales by character level, slotUpcast by slot steps, poolStep by spend above base cost (`readAbilityCost`'s `effectiveStep`). */
export interface EffectScaling {
  mode: "none" | "slotUpcast" | "cantripLevel" | "poolStep";
  dicePerStep?: number;
  /** slotUpcast/poolStep only, from `upcastInstancesPerLevel` — instances added per step, alongside (never instead of) `dicePerStep`. */
  instancesPerStep?: number;
}

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
  /** Present only for effectType "buff": the skill/stat target and flat modifier applied while the granting concentration holds. */
  buffTarget?: string | null;
  buffModifier?: number | null;
  /** "classLevel" adds the character's class level (e.g. Second Wind's `1d10 + Fighter level`); "abilityMod:<ability>" is reserved — no consumer resolves it yet. */
  modifierSource?: string | null;
  /** Present only for a multi-instance effect (Magic Missile's darts, Scorching Ray's rays, Eldritch Blast's beams, #1981) — `dice` is then PER-INSTANCE, not combined. Absent = today's single-roll shape. */
  instances?: { count: number; roll: EffectInstanceRoll };
}

// Flat effect columns snapshotted from the catalog; shared by SpellEntry, custom-spell input, and frontend Spell snapshot shapes.
export interface EffectColumns {
  effectKind?: string | null;
  effectDiceCount?: number | null;
  effectDiceFaces?: number | null;
  /** Class-die reference (e.g. "superiorityDice") superseding `effectDiceFaces`; resolved server-side, so the frontend never sees this column. */
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
  /** Multi-instance columns (#1981) — see EffectSpec.instances. Null instanceCount = un-instanced. */
  instanceCount?: number | null;
  instanceRoll?: EffectInstanceRoll | null;
  upcastInstancesPerLevel?: number | null;
}

// A row carrying effect columns plus the level that decides the scaling axis.
export type EffectRow = EffectColumns & { level: number; concentration?: boolean };

/** One roll per castable slot level, not a single roll — the picker/cast sheet/grimoire preview key off whichever level the player is currently selecting. */
export interface EffectRoll {
  slotLevel: number;
  roll: { count: number; faces: number; modifier: number };
  /** Resolved instance count for this slot level (post cantrip/upcast scaling) and the spec's roll granularity — present only for a multi-instance effect. */
  instanceCount?: number;
  instanceRoll?: EffectInstanceRoll;
}

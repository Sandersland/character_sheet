// ConditionKey is used below (ConditionEntry.key) as well as re-exported — a bare
// `export … from` doesn't bind a local name, so it needs its own `import type` too.
import type { ConditionKey } from "@character-sheet/contracts";

/** The source that matching `AttackRow` entries are built from. */
export interface DerivedAttack {
  attackBonus: number;
  /** Strike counts as magical (Monk Empowered Strikes at level 6+). */
  magical?: boolean;
  damage: {
    count: number;
    faces: number;
    modifier: number;
    damageType: string;
  };
}

export interface DerivedImprovisedAttack extends DerivedAttack {
  proficient: boolean;
}

/** One labeled addend of the derived AC; rendered verbatim, never interpreted. */
export interface ArmorClassPart {
  label: string;
  value: number;
}

// Sent as { operations: ConditionOperation[] } to POST /api/characters/:id/conditions/transactions.
export type { ApplyConditionOperation, ConditionKey, ConditionOperation } from "@character-sheet/contracts";

export interface ConditionEntry {
  key: ConditionKey;
  /** Null (not absent) when not supplied. */
  source?: string | null;
  appliedAt: string;
}

/** Suspended (not cured) by an active buff, restored when the buff ends — 2014 Mindless Rage, PHB'14 p.49. */
export interface SuspendedConditionEntry extends ConditionEntry {
  gatingBuffKey: string;
}

export interface ConditionsState {
  active: ConditionEntry[];
  /** 0–6; 6 = death. Not part of `active`. */
  exhaustion: number;
  /** Backend always sends `[]`, never absent, despite the optional type. */
  suspended?: SuspendedConditionEntry[];
}

/** Absent on the wire means "concentration". */
export type BuffDuration = "concentration" | "while-active" | "until-rest";

export interface ActiveBuff {
  id: string;
  key: string;
  target: string; // skill/ability/stat key, or "meleeDamage"
  modifier: number;
  source: string;
  sourceEntryId?: string;
  // Always present on the response; the backend defaults absent values to "concentration" before serializing.
  duration: BuffDuration;
  restType?: "short" | "long";
  resistDamageTypes?: string[];
  conditionImmunities?: string[];
  rollEffects?: RollEffect[];
}

export interface ActiveEffectsState {
  buffs: ActiveBuff[];
}

/** Mirrors backend `RollEffect`/`RollModifier`. */
export type RollModeKind = "attack" | "check" | "save" | "initiative";

/** One advantage/disadvantage grant; `ability` (lowercase key) narrows it to a single ability. */
export interface AdvantageRollEffect {
  mode: "advantage" | "disadvantage";
  kind: RollModeKind;
  ability?: string;
}

/** A flat numeric d20 modifier, e.g. 2024 exhaustion's −2×level (SRD 5.2). */
export interface FlatRollEffect {
  mode: "flat";
  modifier: number;
  kind: RollModeKind;
  ability?: string;
}

export type RollEffect = AdvantageRollEffect | FlatRollEffect;

export type RollModifier = RollEffect & { source: string };

// Sent as { operations: HitPointOperation[] } to POST /api/characters/:id/hp;
// LevelUpTarget also reaches ./leveling through this re-export.
export type { HitPointOperation, LevelUpTarget } from "@character-sheet/contracts";

/** `status: "pending"` requires the client to follow up with a `ConcentrationSaveOperation` keyed by `entryId`. */
export interface ConcentrationCheck {
  status: "resolved" | "pending";
  entryId: string;
  spellName: string;
  reason: "damage" | "death";
  held: boolean | null;
  roll: number | null;
  saveBonus: number | null;
  total: number | null;
  dc: number | null;
  damage: number;
}

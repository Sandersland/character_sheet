/**
 * Combat wire types: derived attacks, conditions, buffs, roll modifiers, and HP operations.
 */

/**
 * A derived attack row — unarmed strike or improvised weapon — computed
 * server-side and surfaced on the character so `AttacksPanel` can render them
 * without reproducing combat rules on the client.
 */
export interface DerivedAttack {
  attackBonus: number;
  /** Strike counts as magical (Monk Ki-Empowered Strikes at level 6+). */
  magical?: boolean;
  damage: {
    count: number;
    faces: number;
    modifier: number;
    damageType: string;
  };
}

/** DerivedAttack extended with a proficiency flag (for improvised weapons). */
export interface DerivedImprovisedAttack extends DerivedAttack {
  proficient: boolean;
}

/** One labeled addend of the derived AC; rendered verbatim, never interpreted. */
export interface ArmorClassPart {
  label: string;
  value: number;
}

/**
 * Conditions state + operation types — mirror of `ConditionOperation` /
 * `applyConditionsOperations`. Sent as `{ operations: ConditionOperation[] }` to
 * POST /api/characters/:id/conditions/transactions.
 *
 * ConditionKey: the 14 standard 5e status condition keys (mirror of the backend `ConditionKey`).
 */
export type ConditionKey =
  | "blinded"
  | "charmed"
  | "deafened"
  | "frightened"
  | "grappled"
  | "incapacitated"
  | "invisible"
  | "paralyzed"
  | "petrified"
  | "poisoned"
  | "prone"
  | "restrained"
  | "stunned"
  | "unconscious";

export interface ConditionEntry {
  key: ConditionKey;
  /** Optional provenance, e.g. "Hold Person". Null when not supplied. */
  source?: string | null;
  appliedAt: string;
}

export interface ConditionsState {
  active: ConditionEntry[];
  /** Exhaustion level, 0–6 (6 = death). Special case, not part of `active`. */
  exhaustion: number;
}

/**
 * Active effects (buffs) — mirror of `ActiveBuff`.
 *
 * Duration axis (#455). Absent on the wire means "concentration" (byte-parity
 * with #438). while-active / until-rest are durable self-buffs (e.g. Rage).
 */
export type BuffDuration = "concentration" | "while-active" | "until-rest";

export interface ActiveBuff {
  id: string;
  key: string;
  target: string; // skill/ability/stat key, or "meleeDamage"
  modifier: number;
  source: string;
  sourceEntryId?: string;
  // Always present on the API response — the backend normalizer defaults absent
  // wire values to "concentration" before serializing, so the frontend never
  // sees an undefined duration.
  duration: BuffDuration;
  restType?: "short" | "long";
  // Damage types this buff makes the character resistant to (halved on take) (#456).
  resistDamageTypes?: string[];
  // State-driven advantage/disadvantage grants (#486), e.g. Rage's advantage on Strength checks & saves.
  rollEffects?: RollEffect[];
}

export interface ActiveEffectsState {
  buffs: ActiveBuff[];
}

/**
 * State-driven roll modifiers (#486) — mirror of `RollEffect` / `RollModifier`.
 * The four d20 roll categories a state can bind advantage/disadvantage to.
 */
export type RollModeKind = "attack" | "check" | "save" | "initiative";

/** One advantage/disadvantage grant; `ability` (lowercase key) narrows it to a single ability. */
export interface RollEffect {
  mode: "advantage" | "disadvantage";
  kind: RollModeKind;
  ability?: string;
}

/** A RollEffect resolved with its provenance label (e.g. "Rage", "Poisoned"). Derived on read. */
export interface RollModifier extends RollEffect {
  source: string;
}

export interface ApplyConditionOperation { type: "applyCondition"; key: ConditionKey; source?: string }

export interface RemoveConditionOperation { type: "removeCondition"; key: ConditionKey }

export interface SetExhaustionOperation { type: "setExhaustion"; level: number }

export type ConditionOperation =
  | ApplyConditionOperation
  | RemoveConditionOperation
  | SetExhaustionOperation;

/**
 * HP operation types — mirror of `applyHitPointOperations`. Sent as
 * `{ operations: HitPointOperation[] }` to POST /api/characters/:id/hp.
 */
/**
 * `autoRollConcentration: false` (issue #76) defers a triggered concentration
 * save to the client — the response carries a `status: "pending"` check and the
 * client follows up with a `ConcentrationSaveOperation`. Omitted = auto-roll.
 */
/**
 * `damageType` (optional, #456) drives resistance auto-halving server-side;
 * `applyResistance: false` declines the auto-halve (take the full amount).
 */
export interface DamageOperation { type: "damage"; amount: number; damageType?: string; applyResistance?: boolean; autoRollConcentration?: boolean }

export interface HealOperation { type: "heal"; amount: number }

export interface SetTempOperation { type: "setTemp"; amount: number }

/** `rolls`: one raw die value per hit die spent (rolled by the client via `rollDie`). */
export interface ShortRestOperation { type: "shortRest"; rolls: number[] }

export interface LongRestOperation { type: "longRest" }

/**
 * Which class the level-up advances (mirrors backend LevelUpTarget). Omitted =
 * the primary class (single-class default). `existing` increments a class entry;
 * `new` multiclasses into a fresh class (ability prereqs enforced server-side).
 */
export type LevelUpTarget =
  | { kind: "existing"; classEntryId: string }
  | { kind: "new"; classId: string };

/** For "roll": client rolls via `rollDie`, sends the raw die face as `roll`. */
export interface LevelUpOperation {
  type: "levelUp";
  method: "average" | "roll";
  roll?: number;
  target?: LevelUpTarget;
}

/** Client rolls d20 via `rollDie`, sends the raw value. Only valid at 0 HP. */
export interface DeathSaveOperation { type: "deathSave"; roll: number }

export interface StabilizeOperation { type: "stabilize" }

/**
 * Resolve a deferred concentration save with a client-rolled d20 (issue #76).
 * `damage` lets the server recompute the DC; `roll` is the raw d20 face.
 */
export interface ConcentrationSaveOperation { type: "concentrationSave"; entryId: string; roll: number; damage: number }

export type HitPointOperation =
  | DamageOperation
  | HealOperation
  | SetTempOperation
  | ShortRestOperation
  | LongRestOperation
  | LevelUpOperation
  | DeathSaveOperation
  | StabilizeOperation
  | ConcentrationSaveOperation;

/**
 * Result of the concentration check the server makes when a concentrating
 * character takes damage (issue #41). Returned by the HP endpoint alongside the
 * updated character.
 * - `status: "resolved"` — the save was rolled or skipped; `held` is final.
 *   `reason: "death"` means concentration ended unconditionally (dropped to 0
 *   HP) with no save — `roll`/`saveBonus`/`total`/`dc` are then null.
 * - `status: "pending"` — a manual save is deferred to the client (issue #76):
 *   `dc`/`saveBonus` are populated, `held`/`roll`/`total` are null, and the
 *   client must follow up with a `ConcentrationSaveOperation` keyed by `entryId`.
 */
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

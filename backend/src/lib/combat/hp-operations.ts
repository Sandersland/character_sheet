// ---- Operation types ----
// These op shapes intentionally mirror frontend/src/types/character.ts (the two
// workspaces share no types); the clone is inherited, not new.

/** HP damage: temp absorbs first, then current. Floors at 0. */
// fallow-ignore-next-line code-duplication -- op shape intentionally mirrors the frontend Character op types (cross-workspace clone, inherited not new)
export interface DamageOperation {
  type: "damage";
  amount: number; // raw damage; must be > 0
  /** Optional 5e damage type (e.g. "slashing"); drives resistance auto-halving (#456). */
  damageType?: string;
  /**
   * Manual override for resistance auto-halving (#456). Omitted/true auto-halves
   * when a matching resistance is active; false declines (take the full amount).
   */
  applyResistance?: boolean;
  /**
   * Whether a triggered concentration CON save is auto-rolled server-side
   * (default) or deferred for the client to roll (issue #76). Treated as
   * auto when omitted or true; only `false` defers. The death/0-HP path
   * ends concentration with no save regardless of this flag.
   */
  autoRollConcentration?: boolean;
}

/** HP healing. If current was 0 (dying), resets death saves. */
export interface HealOperation {
  type: "heal";
  amount: number; // must be > 0
}

/** Set temporary HP. 5e rule: doesn't stack — takes the higher. */
export interface SetTempOperation {
  type: "setTemp";
  amount: number; // must be >= 0
}

/**
 * Short rest: spend hit dice to heal. `rolls` is an array of raw die values
 * (1..hitDieFace), one per die spent. Client rolls via dice.ts and sends the
 * raw values; server validates range and applies the rules math.
 */
export interface ShortRestOperation {
  type: "shortRest";
  rolls: number[];
}

/** Long rest: restore full HP, clear temp, recover half spent hit dice (min 1). */
export interface LongRestOperation {
  type: "longRest";
}

/**
 * Which class a level-up advances (issue #124):
 * - omitted → position-0 self-heal, exactly as before multiclassing (BC).
 * - existing → increment an existing CharacterClassEntry by classEntryId.
 * - new → add a second class (multiclass); enforces 5e ability prerequisites.
 */
export type LevelUpTarget =
  | { kind: "existing"; classEntryId: string }
  | { kind: "new"; classId: string };

/**
 * Level-up: adds 1 to hitDice.total, increases max and current HP.
 * Requires a pending level (derivedLevel > hitDice.total).
 * For "roll" method the client rolls via dice.ts and sends the raw die face;
 * for "average" the server computes the fixed average.
 * `target` chooses which class advances; HP/hit-dice use THAT class's hit die.
 */
export interface LevelUpOperation {
  type: "levelUp";
  method: "average" | "roll";
  roll?: number; // raw die value (required when method === "roll")
  target?: LevelUpTarget;
}

/**
 * Roll a death save (d20). Only valid when current === 0.
 * Client rolls via dice.ts and sends the raw value.
 */
export interface DeathSaveOperation {
  type: "deathSave";
  roll: number; // 1..20
}

/** Stabilize the character (Medicine check success, etc.). Only valid when current === 0. */
export interface StabilizeOperation {
  type: "stabilize";
}

/**
 * Resolve a deferred concentration CON save with a client-rolled d20 (issue #76).
 * Emitted as a follow-up to a `damage` op that ran with `autoRollConcentration:
 * false` and returned a `pending` check. The server recomputes the DC from
 * `damage` (never trusts a client DC) and the save bonus from the live character;
 * `roll` is the only client-supplied value (validated 1..20, like deathSave).
 * No-op if the character is no longer concentrating on `entryId`.
 */
export interface ConcentrationSaveOperation {
  type: "concentrationSave";
  entryId: string;
  roll: number; // 1..20
  damage: number; // the damage instance this save responds to (> 0)
}

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

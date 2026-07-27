// Warrior of the Elements wire types (#1273) — de-duplicates the declarations
// that were hand-mirrored between the backend's applyWarriorOfElementsOperations
// module and frontend/src/types/character/classes.ts. Sent as
// `{ operations: WarriorOfElementsOperation[] }` to POST /api/characters/:id/elements/transactions.

/** The five elemental damage types a Warrior of the Elements can deal (PHB'24 p.90). */
export type ElementalDamageType = "acid" | "cold" | "fire" | "lightning" | "thunder";

/** Toggle Elemental Attunement on (spends 1 Focus) or off (no refund). */
export interface ToggleElementalAttunementOperation {
  type: "toggleElementalAttunement";
  active: boolean;
}

/** Elemental Burst (L6): Magic action, 2 Focus, 3× Martial Arts die, Dex save. */
export interface CastElementalBurstOperation {
  type: "castElementalBurst";
  damageType: ElementalDamageType;
  /** Client-rolled three-Martial-Arts-die total (server halves it on a made save). */
  roll: number;
}

/** Elemental Strikes rider (part of Elemental Attunement): swap the Unarmed
 *  Strike's damage type and force a Strength save to move the target 10 ft. */
export interface ElementalStrikeOperation {
  type: "elementalStrike";
  damageType: ElementalDamageType;
  /** Client-rolled Unarmed Strike damage of the chosen type (logged for the toast). */
  roll?: number;
}

export type WarriorOfElementsOperation =
  | ToggleElementalAttunementOperation
  | CastElementalBurstOperation
  | ElementalStrikeOperation;

export type ElementalSaveOutcome = "fail" | "success";

export interface ToggleAttunementResult {
  active: boolean;
  summary: string;
}

export interface ElementalBurstResult {
  dc: number;
  saveRoll: number;
  outcome: ElementalSaveOutcome;
  damageType: ElementalDamageType;
  rawDamage: number;
  appliedDamage: number;
  summary: string;
}

export interface ElementalStrikeResult {
  dc: number;
  saveRoll: number;
  outcome: ElementalSaveOutcome;
  damageType: ElementalDamageType;
  moved: boolean;
  summary: string;
}

// A union, not an all-optional bag: each op returns exactly one member, so a
// caller narrows on the fields it finds rather than null-checking every field.
export type WarriorOfElementsResult =
  | ToggleAttunementResult
  | ElementalBurstResult
  | ElementalStrikeResult;

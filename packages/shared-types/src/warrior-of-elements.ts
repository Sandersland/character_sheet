// Sent as `{ operations: WarriorOfElementsOperation[] }` to
// POST /api/characters/:id/elements/transactions.

/** The five elemental damage types a Warrior of the Elements can deal (PHB'24 p.90). */
export type ElementalDamageType = "acid" | "cold" | "fire" | "lightning" | "thunder";

/** Elemental Burst (L6): Magic action, 2 Focus, 3× Martial Arts die, Dex save. */
export interface CastElementalBurstOperation {
  type: "castElementalBurst";
  damageType: ElementalDamageType;
  /** Client-rolled three-Martial-Arts-die total (server halves it on a made save). */
  roll: number;
}

/** Elemental Strikes rider (part of Elemental Attunement): swaps the Unarmed Strike's damage type and forces a Strength save to move the target 10 ft. */
export interface ElementalStrikeOperation {
  type: "elementalStrike";
  damageType: ElementalDamageType;
  /** Client-rolled Unarmed Strike damage of the chosen type (logged for the toast). */
  roll?: number;
}

export type WarriorOfElementsOperation =
  | CastElementalBurstOperation
  | ElementalStrikeOperation;

export type ElementalSaveOutcome = "fail" | "success";

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

// A union, not an all-optional bag: each op returns exactly one member, so a caller narrows on the fields it finds rather than null-checking every field.
export type WarriorOfElementsResult =
  | ElementalBurstResult
  | ElementalStrikeResult;

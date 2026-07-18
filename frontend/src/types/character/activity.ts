/**
 * Unified activity-timeline event types (the audit-log stream).
 */

/** The unified activity timeline — every domain covered by the audit-log event stream. */
export type CharacterEventCategory =
  | "inventory"
  | "hitPoints"
  | "experience"
  | "currency"
  | "spellcasting"
  | "class"
  | "resources"
  | "advancement"
  | "session"
  | "combat"
  | "conditions"
  | "roll";

export type CharacterEventType =
  | "acquired" | "consumed" | "sold" | "bought" | "removed"  // inventory
  | "awarded" | "revoked"                                     // inventory (DM award/revoke)
  | "damage" | "heal" | "setTemp" | "shortRest" | "longRest" // hitPoints
  | "levelUp" | "levelDown" | "deathSave" | "stabilize"      // hitPoints (cont.)
  | "xpAward" | "xpSet"                                       // experience
  | "currencyAdjust"                                           // currency
  | "castSpell" | "expendSlot" | "restoreSlot"                // spellcasting
  | "learnSpell" | "forgetSpell" | "prepareSpell" | "unprepareSpell" // spellcasting (cont.)
  | "concentrationDropped"                                     // spellcasting (cont.)
  | "subclassChosen" | "subclassRemoved"                       // class
  | "fightingStyleChosen" | "fightingStyleRemoved"            // class (cont.)
  | "spendResource" | "restoreResource"                       // resources
  | "learnManeuver" | "forgetManeuver" | "maneuversReconciled" // resources (cont.)
  | "learnToolProficiency" | "forgetToolProficiency" | "toolProficienciesReconciled" // resources
  | "abilityScoreImprovement" | "featTaken"                   // advancement
  | "advancementRemoved" | "advancementsReconciled"           // advancement (cont.)
  | "equipped" | "unequipped"                                  // inventory (equip)
  | "sessionStarted" | "sessionEnded"                          // session lifecycle
  | "combatStarted" | "combatEnded" | "combatRoundAdvanced"   // combat lifecycle
  | "conditionApplied" | "conditionRemoved" | "exhaustionSet" // conditions
  | "attackRoll" | "damageRoll"                               // roll (attack/damage)
  | "checkRoll" | "saveRoll" | "initiativeRoll"               // roll (check/save/initiative)
  | "revert";                                                  // meta

export interface CharacterEventField {
  id: string;
  path: string;
  oldValue?: unknown;
  newValue?: unknown;
}

/**
 * One row from `GET /api/characters/:id/activity` — the unified event log
 * that covers all domains (inventory, HP, XP, currency) in a single
 * chronological stream. `summary` is a human-readable snapshot rendered
 * at write time. `before`/`after` carry the affected sub-state for field
 * diffs and undo. `fields` is included only when `?includeFields=1`.
 */
export interface CharacterEvent {
  id: string;
  category: CharacterEventCategory;
  type: CharacterEventType;
  summary: string;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  data?: unknown;
  actor: string;
  reverted: boolean;
  batchId?: string;
  createdAt: string;
  fields?: CharacterEventField[];
}

// Class-resource transaction wire types (#1273) — de-duplicates the declarations
// that were hand-mirrored between the backend's applyResourceOperations module
// and frontend/src/types/character/classes.ts. Sent as
// `{ operations: ResourceOperation[] }` to POST /api/characters/:id/resources/transactions.

/** Spend one or more units of a trackable resource (e.g. a superiority die). */
export interface SpendResourceOperation {
  type: "spendResource";
  key: string; // resource key, e.g. "superiorityDice"
  amount?: number; // default 1
  /** Client-rolled die value (for superiority dice) — logged but not validated. */
  roll?: number;
}

/** Restore one or more units of a spent resource (undo mis-click or Relentless). */
export interface RestoreResourceOperation {
  type: "restoreResource";
  key: string;
  amount?: number; // default 1
}

/**
 * Roll Initiative / combat start (#1239). Applies EVERY derived pool's
 * `onInitiative` regen at once — a single combat-start event, so it carries no
 * key. Inert for characters whose pools declare no onInitiative descriptor.
 */
export interface RollInitiativeOperation {
  type: "rollInitiative";
}

/** Learn a maneuver from catalog (maneuverId) or add a custom one. */
export interface LearnManeuverOperation {
  type: "learnManeuver";
  maneuverId?: string; // catalog Maneuver.id
  custom?: { name: string; description: string };
}

/** Remove a known maneuver by its per-character entry id. */
export interface ForgetManeuverOperation {
  type: "forgetManeuver";
  entryId: string;
}

/**
 * Learn an artisan's-tool proficiency from the Student of War feature.
 * `name` must match a TOOLS entry with category "artisan".
 */
export interface LearnToolProficiencyOperation {
  type: "learnToolProficiency";
  name: string; // must match TOOLS[].name where category === "artisan"
}

/** Remove a subclass-granted tool proficiency by its per-character entry id. */
export interface ForgetToolProficiencyOperation {
  type: "forgetToolProficiency";
  entryId: string;
}

/**
 * Pick an option for a generic subclass "choose N" feature (#899) — from the
 * catalog (optionId) or a custom entry. `choiceKey` selects which declared
 * choice (e.g. "huntersPrey"); the option must belong to that choice's catalog
 * source and stay within the level-derived count.
 */
export interface LearnSubclassChoiceOperation {
  type: "learnSubclassChoice";
  choiceKey: string;
  optionId?: string; // catalog GrantedAbility.id
  custom?: { name: string; description: string };
}

/** Remove a picked subclass-choice option by its per-character entry id. */
export interface ForgetSubclassChoiceOperation {
  type: "forgetSubclassChoice";
  choiceKey: string;
  entryId: string;
}

export type ResourceOperation =
  | SpendResourceOperation
  | RestoreResourceOperation
  | RollInitiativeOperation
  | LearnManeuverOperation
  | ForgetManeuverOperation
  | LearnToolProficiencyOperation
  | ForgetToolProficiencyOperation
  | LearnSubclassChoiceOperation
  | ForgetSubclassChoiceOperation;

/**
 * Per-op audit payload the dispatcher writes to the event log and echoes back on
 * the response. Most callers ignore it; rollInitiative (#1239/#1243) is read for
 * its regen summary + eventData.regenerated (whether anything actually fired) to
 * drive the combat-start toast.
 */
export interface ResourceOpAudit {
  eventType: string;
  summary: string;
  eventData: Record<string, unknown>;
}

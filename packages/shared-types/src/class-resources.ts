// Sent as `{ operations: ResourceOperation[] }` to
// POST /api/characters/:id/resources/transactions.

export interface SpendResourceOperation {
  type: "spendResource";
  key: string;
  amount?: number; // default 1
  /** Client-rolled die value (for superiority dice) — logged but not validated. */
  roll?: number;
}

export interface RestoreResourceOperation {
  type: "restoreResource";
  key: string;
  amount?: number; // default 1
}

/** Applies every derived pool's `onInitiative` regen at once — a single combat-start event with no key; inert if a character's pools declare no such descriptor. */
export interface RollInitiativeOperation {
  type: "rollInitiative";
}

export interface LearnManeuverOperation {
  type: "learnManeuver";
  maneuverId?: string; // catalog Maneuver.id
  custom?: { name: string; description: string };
}

/** Remove a known maneuver by its per-character entry id (not the catalog maneuverId). */
export interface ForgetManeuverOperation {
  type: "forgetManeuver";
  entryId: string;
}

/** Student of War: `name` must match a TOOLS entry with category "artisan". */
export interface LearnToolProficiencyOperation {
  type: "learnToolProficiency";
  name: string;
}

/** Remove a subclass-granted tool proficiency by its per-character entry id. */
export interface ForgetToolProficiencyOperation {
  type: "forgetToolProficiency";
  entryId: string;
}

/** `choiceKey` selects the declared choice (e.g. "huntersPrey"); the picked option must belong to that choice's catalog source and stay within the level-derived count. */
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

/** `skill` must already be proficient (incl. feat/item-granted); the applier validates this and the pick cap server-side, never the client. */
export interface LearnExpertiseOperation {
  type: "learnExpertise";
  skill: string; // camelCase skill key, e.g. "stealth"
}

/** Remove a chosen Expertise skill by its per-character entry id. */
export interface ForgetExpertiseOperation {
  type: "forgetExpertise";
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
  | ForgetSubclassChoiceOperation
  | LearnExpertiseOperation
  | ForgetExpertiseOperation;

/** Per-op audit payload written to the event log; rollInitiative also reads `eventData.regenerated` to drive the combat-start toast. */
export interface ResourceOpAudit {
  eventType: string;
  summary: string;
  eventData: Record<string, unknown>;
}

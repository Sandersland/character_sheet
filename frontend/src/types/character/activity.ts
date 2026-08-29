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
  | "acquired" | "consumed" | "sold" | "bought" | "removed"
  | "awarded" | "revoked"
  | "damage" | "heal" | "setTemp" | "shortRest" | "longRest"
  | "levelUp" | "levelDown" | "deathSave" | "stabilize"
  | "xpAward" | "xpSet"
  | "currencyAdjust"
  | "castSpell" | "castAbilitySlot" | "expendSlot" | "restoreSlot"
  | "learnSpell" | "forgetSpell" | "prepareSpell" | "unprepareSpell"
  | "concentrationDropped"
  | "subclassChosen" | "subclassRemoved"
  | "fightingStyleChosen" | "fightingStyleRemoved"
  | "spendResource" | "restoreResource"
  | "learnManeuver" | "forgetManeuver" | "maneuversReconciled"
  | "learnToolProficiency" | "forgetToolProficiency" | "toolProficienciesReconciled"
  | "abilityScoreImprovement" | "featTaken"
  | "advancementRemoved" | "advancementsReconciled"
  | "equipped" | "unequipped"
  | "sessionStarted" | "sessionEnded"
  | "combatStarted" | "combatEnded" | "combatRoundAdvanced"
  | "resolveAction"
  | "conditionApplied" | "conditionRemoved" | "exhaustionSet"
  | "attackRoll" | "damageRoll"
  | "checkRoll" | "saveRoll" | "initiativeRoll"
  | "revert";

export interface CharacterEventField {
  id: string;
  path: string;
  oldValue?: unknown;
  newValue?: unknown;
}

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
  /** Included only when the request passes `?includeFields=1`. */
  fields?: CharacterEventField[];
}

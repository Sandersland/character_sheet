// DropConcentrationOperation stays unexported (reached only via the union) to keep the package clean under the zero-dead-export gate.

export type SpellSchool =
  | "abjuration"
  | "conjuration"
  | "divination"
  | "enchantment"
  | "evocation"
  | "illusion"
  | "necromancy"
  | "transmutation";

export interface SpellComponents {
  verbal: boolean;
  somatic: boolean;
  material: boolean;
  materialDescription?: string;
}

// Structurally identical to the backend's CastTarget alias — the dispatcher forwards `apply.target` to castAbilityInTx unchanged.
type SpellApplyTarget = "self" | { characterId: string };

/**
 * For leveled spells `slotLevel` must be >= spell.level with a slot available;
 * cantrips skip slot expenditure. `roll` is the client-computed effect total
 * (0 for utility). `apply` optionally lands the rolled effect in the same
 * atomic batch — self or a consenting ally's sheet (healing only); never an enemy.
 */
export interface CastSpellOperation {
  type: "castSpell";
  entryId: string;
  slotLevel?: number;
  roll: number;
  apply?: { target: SpellApplyTarget; kind: "heal" | "damage"; amount: number };
}

/** `entryId` is the derived `item:<inventoryItemId>:<spellId>` seam; spends the item's own resource. */
export interface CastItemSpellOperation {
  type: "castItemSpell";
  entryId: string;
  roll: number;
  apply?: { target: SpellApplyTarget; kind: "heal" | "damage"; amount: number };
}

/** Expend one slot of a given level without associating it with a specific spell. */
export interface ExpendSlotOperation {
  type: "expendSlot";
  level: number;
}

/** Restore one previously-expended slot (undo mis-click; not Arcane Recovery). */
export interface RestoreSlotOperation {
  type: "restoreSlot";
  level: number;
}

/** Wizard Arcane Recovery: recover expended slots on a short rest, once per long rest. */
export interface ArcaneRecoveryOperation {
  type: "arcaneRecovery";
  slots: { level: number; count: number }[];
}

/** Learn a spell from the catalog by its catalog id. */
export interface LearnSpellOperation {
  type: "learnSpell";
  spellId: string;
}

/** Remove a learned spell by its per-character entry id. */
export interface ForgetSpellOperation {
  type: "forgetSpell";
  entryId: string;
}

/** Mark a non-cantrip spell as prepared. */
export interface PrepareSpellOperation {
  type: "prepareSpell";
  entryId: string;
}

/** Mark a non-cantrip spell as unprepared. */
export interface UnprepareSpellOperation {
  type: "unprepareSpell";
  entryId: string;
}

/** End the active concentration spell manually (player ends it / it was countered). */
interface DropConcentrationOperation {
  type: "dropConcentration";
}

/** Dismiss an active while-active spell buff by its spell entry id. */
export interface DismissBuffOperation {
  type: "dismissBuff";
  entryId: string;
}

/** Sorcerer Font of Magic — mutates the SP pool (resources) and slot state (spellcasting) atomically. */
export interface ConvertSorceryPointsOperation {
  type: "convertSorceryPoints";
  direction: "toSlot" | "toSorceryPoints";
  slotLevel: number;
}

export type SpellcastingOperation =
  | CastSpellOperation
  | CastItemSpellOperation
  | ExpendSlotOperation
  | RestoreSlotOperation
  | ArcaneRecoveryOperation
  | LearnSpellOperation
  | ForgetSpellOperation
  | PrepareSpellOperation
  | UnprepareSpellOperation
  | DropConcentrationOperation
  | DismissBuffOperation
  | ConvertSorceryPointsOperation;

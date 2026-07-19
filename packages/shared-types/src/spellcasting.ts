// Spellcasting transaction-op wire types — the single source of truth shared by
// the backend `applySpellcastingOperations` dispatcher and the frontend client
// (#820, pattern-setter family). Both tiers re-export the consumed names from
// their existing public surfaces (the modules owning `applySpellcastingOperations`
// / `normalizeSpellcastingMutable` on the backend, the frontend `Spell` types
// barrel) so downstream importers are unaffected.
//
// Only types consumed by name elsewhere are exported; an op that appears solely
// as a union member (dropConcentration — handled by `op.type` narrowing, never
// named) stays module-private, keeping the package clean under the repo's
// zero-dead-export gate. Add an `export` when a caller first needs one.
//
// Where the two hand-mirrors had drifted, the tighter literal unions win: the
// backend only ever read these fields into wider `string` targets, so narrowing
// is safe there, while the frontend keeps its exhaustiveness.

export type SpellSchool =
  | "abjuration"
  | "conjuration"
  | "divination"
  | "enchantment"
  | "evocation"
  | "illusion"
  | "necromancy"
  | "transmutation";

/** Spell verbal/somatic/material component flags + optional material text. */
export interface SpellComponents {
  verbal: boolean;
  somatic: boolean;
  material: boolean;
  materialDescription?: string;
}

/** Custom spell input for `learnSpell` without a catalog entry. */
export interface CustomSpellInput {
  name: string;
  level: number;
  school: SpellSchool;
  castingTime: string;
  range: string;
  duration: string;
  description: string;
  concentration?: boolean;
  ritual?: boolean;
  components?: SpellComponents;
  saveEffect?: "half" | "none";
  effectKind?: "damage" | "heal";
  effectDiceCount?: number;
  effectDiceFaces?: number;
  effectModifier?: number;
  damageType?: string;
  attackType?: "attack" | "save";
  saveAbility?: string;
  upcastDicePerLevel?: number;
  cantripScaling?: boolean;
}

// Where an applied spell effect lands: the caster, or a consenting ally's sheet
// (#462). Structurally identical to the backend's CastTarget alias, so the
// dispatcher forwards `apply.target` to castAbilityInTx unchanged.
type SpellApplyTarget = "self" | { characterId: string };

/**
 * Cast a spell. For leveled spells `slotLevel` must be >= spell.level with a slot
 * available; cantrips skip slot expenditure. `roll` is the client-computed effect
 * total (0 for utility). `apply` optionally lands the rolled effect in the same
 * atomic batch (self, or an ally's sheet — healing only); omitted for enemies.
 */
export interface CastSpellOperation {
  type: "castSpell";
  entryId: string;
  slotLevel?: number;
  roll: number;
  apply?: { target: SpellApplyTarget; kind: "heal" | "damage"; amount: number };
}

/**
 * Cast a spell granted by a held magic item (#528). `entryId` is the derived
 * `item:<inventoryItemId>:<spellId>` seam; spends the item's own resource.
 */
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

/** Wizard Arcane Recovery: recover expended slots on a short rest, once per long rest (#904). */
export interface ArcaneRecoveryOperation {
  type: "arcaneRecovery";
  slots: { level: number; count: number }[];
}

/** Learn a spell from the catalog (spellId) or add a custom one. Exactly one of spellId/custom. */
export interface LearnSpellOperation {
  type: "learnSpell";
  spellId?: string;
  custom?: CustomSpellInput;
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

/** Dismiss an active while-active spell buff by its spell entry id (#363). */
export interface DismissBuffOperation {
  type: "dismissBuff";
  entryId: string;
}

/**
 * Sorcerer Font of Magic (#903): convert sorcery points into a spell slot at the
 * 5e cost table, or expend a spell slot to gain SP equal to its level. Mutates
 * the SP pool (resources) and the slot state (spellcasting) atomically.
 */
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

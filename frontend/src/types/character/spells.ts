/**
 * Spellcasting wire types: spell entries, catalog spells, slots, and spellcasting operations.
 */

import type { ItemSpellMeta } from "./inventory";

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

/**
 * A spell entry in the character's spellcasting JSON (per-character mutable
 * state). `id` is the per-character entry UUID (operation target); `spellId`
 * is the optional catalog `Spell.id` provenance pointer (null for custom spells).
 * Effect fields are snapshotted from the catalog at learn time so they can be
 * used for auto-rolling without a live catalog join.
 */
export interface Spell {
  id: string;
  spellId?: string;   // catalog Spell.id provenance — undefined for custom spells
  /** Provenance; "subclass"/"item" mark derived, non-persisted grants (no Remove ✕). */
  source?: "subclass" | "item";
  /** Item-granted-spell metadata, present only when source === "item" (#528). */
  item?: ItemSpellMeta;
  name: string;
  level: number; // 0 = cantrip
  school: SpellSchool;
  prepared?: boolean;
  castingTime: string;
  range: string;
  duration: string;
  description: string;
  concentration?: boolean;
  ritual?: boolean;
  components?: SpellComponents | null;
  saveEffect?: "half" | "none" | null;
  // Structured effect for auto-rolling at cast time (RollSpec-shaped):
  effectKind?: "damage" | "heal" | "buff" | null;
  effectDiceCount?: number | null;
  effectDiceFaces?: number | null;
  effectModifier?: number | null;
  damageType?: string | null;
  attackType?: "attack" | "save" | null;
  saveAbility?: string | null;
  upcastDicePerLevel?: number | null;
  cantripScaling?: boolean;
  // AC-buff effect (#363): applied server-side on cast; the FE treats a buff
  // spell as no-roll (its AC change shows in armorClassBreakdown).
  buffTarget?: string | null;
  buffModifier?: number | null;
}

/**
 * Baseline catalog entry served by `GET /api/spells` — the "pick a spell
 * from the SRD" path for the spellbook editor. Mirrors the `Spell` interface
 * but without per-character fields (id here is the catalog id, not an entry id;
 * `prepared` is absent since preparation is a per-character state).
 */
export interface CatalogSpell {
  id: string;       // catalog Spell.id (used as learnSpell.spellId)
  name: string;
  level: number;
  school: SpellSchool;
  castingTime: string;
  range: string;
  duration: string;
  description: string;
  concentration: boolean;
  ritual: boolean;
  classes: string[];
  components?: SpellComponents | null;
  saveEffect?: "half" | "none" | null;
  effectKind?: "damage" | "heal" | "buff";
  effectDiceCount?: number;
  effectDiceFaces?: number;
  effectModifier?: number;
  damageType?: string;
  attackType?: "attack" | "save";
  saveAbility?: string;
  upcastDicePerLevel?: number;
  cantripScaling: boolean;
  buffTarget?: string;
  buffModifier?: number;
}

export interface SpellSlots {
  level: number;
  total: number;
  used: number;
}

/**
 * Spellcasting operation types — mirror of `applySpellcastingOperations`. Sent
 * as `{ operations: SpellcastingOperation[] }` to
 * POST /api/characters/:id/spellcasting/transactions.
 *
 * CustomSpellInput: custom spell input for learnSpell without a catalog entry.
 */
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

/**
 * Cast a spell: expend slot (if leveled), send client-computed roll total.
 * `apply` optionally applies the rolled effect to the caster's own HP in the
 * same atomic batch — used when the player targets themselves (heal or, rarely,
 * self-damage). Omitted when targeting others (no enemy entities exist).
 */
export interface CastSpellOperation {
  type: "castSpell";
  entryId: string;
  slotLevel?: number;
  roll: number;
  // "self" hits the caster; { characterId } heals a consenting ally's sheet (#462).
  apply?: { target: "self" | { characterId: string }; kind: "heal" | "damage"; amount: number };
}

/**
 * Cast a spell granted by a held magic item (#528). `entryId` is the derived
 * `item:<inventoryItemId>:<spellId>` seam; spends the item's own resource.
 */
export interface CastItemSpellOperation {
  type: "castItemSpell";
  entryId: string;
  roll: number;
  apply?: { target: "self" | { characterId: string }; kind: "heal" | "damage"; amount: number };
}

/** Bare slot expenditure (no specific spell). */
export interface ExpendSlotOperation { type: "expendSlot"; level: number }

/** Restore one previously-expended slot (undo mis-click). */
export interface RestoreSlotOperation { type: "restoreSlot"; level: number }

/** Learn a spell from catalog (spellId) or custom payload. */
export interface LearnSpellOperation { type: "learnSpell"; spellId?: string; custom?: CustomSpellInput }

/** Remove a spell from the spellbook by its per-character entry id. */
export interface ForgetSpellOperation { type: "forgetSpell"; entryId: string }

/** Mark a non-cantrip as prepared. */
export interface PrepareSpellOperation { type: "prepareSpell"; entryId: string }

/** Mark a non-cantrip as unprepared. */
export interface UnprepareSpellOperation { type: "unprepareSpell"; entryId: string }

/** End the active concentration spell manually. */
export interface DropConcentrationOperation { type: "dropConcentration" }

/** Dismiss an active while-active spell buff by its spell entry id (e.g. Mage Armor, #363). */
export interface DismissBuffOperation { type: "dismissBuff"; entryId: string }

export type SpellcastingOperation =
  | CastSpellOperation
  | CastItemSpellOperation
  | ExpendSlotOperation
  | RestoreSlotOperation
  | LearnSpellOperation
  | ForgetSpellOperation
  | PrepareSpellOperation
  | UnprepareSpellOperation
  | DropConcentrationOperation
  | DismissBuffOperation;

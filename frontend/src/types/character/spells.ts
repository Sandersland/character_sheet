/**
 * Spellcasting wire types: spell entries, catalog spells, slots, and spellcasting operations.
 */

import type { SpellComponents, SpellSchool } from "@character-sheet/shared-types";

import type { ItemSpellMeta } from "./inventory";

// Spellcasting wire types are the single cross-tier source of truth in
// shared-types (#820); the names the frontend consumes are re-exported here so
// this module stays the frontend's spell-types entry point (flowing through the
// @/types/character barrel). SpellSchool/SpellComponents are also used locally by
// Spell/CatalogSpell below.
export type { SpellComponents, SpellSchool };
export type {
  CastSpellOperation,
  CustomSpellInput,
  ForgetSpellOperation,
  LearnSpellOperation,
  SpellcastingOperation,
} from "@character-sheet/shared-types";

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

// Spellcasting operation types (CustomSpellInput, the per-op interfaces, and the
// SpellcastingOperation union) are imported from shared-types and re-exported at
// the top of this file (#820) — sent as `{ operations: SpellcastingOperation[] }`
// to POST /api/characters/:id/spellcasting/transactions.

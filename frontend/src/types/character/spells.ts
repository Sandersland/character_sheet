/**
 * Spellcasting wire types: spell entries, catalog spells, slots, and spellcasting operations.
 */

import type {
  CatalogMeta,
  EffectRoll,
  EffectSpec,
  SpellCastCostKind,
  SpellComponents,
  SpellSchool,
} from "@character-sheet/shared-types";

import type { ItemSpellMeta } from "./inventory";

// Spellcasting wire types are the single cross-tier source of truth in
// shared-types (#820); the names the frontend consumes are re-exported here so
// this module stays the frontend's spell-types entry point (flowing through the
// @/types/character barrel). SpellSchool/SpellComponents are also used locally by
// Spell/CatalogSpell below.
export type { SpellComponents, SpellSchool };
export type {
  CastSpellOperation,
  ForgetSpellOperation,
  LearnSpellOperation,
  SpellcastingOperation,
} from "@character-sheet/shared-types";

// Request body for POST/PATCH /api/spells/custom (#1787, epic #1782 4/5) —
// creating/editing a user-owned homebrew catalog spell (Spell.ownerId).
// Aliased on import: contracts calls this payload CustomSpellInput; re-exported
// under a caller-friendly name so components import HomebrewSpellInput from the
// @/types barrel rather than reaching into @character-sheet/contracts directly.
export type { CustomSpellInput as HomebrewSpellInput } from "@character-sheet/contracts";

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
  /** Provenance; "subclass"/"species"/"item" mark derived, non-persisted grants (no Remove ✕). */
  source?: "subclass" | "species" | "item";
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
  // #1381: the resolved rule (cantrip ladder, upcast dice, heal ability
  // modifier — never re-derived client-side) plus one resolved roll per
  // castable slot level, keyed by chosenSlotLevel ?? spell.level. Optional:
  // a non-caster ability row or a locally-constructed test Spell has neither.
  effect?: EffectSpec;
  effectRolls?: EffectRoll[];
  // Epic #1827 Slice 1 (#1828): the spell's `castingTime` classified into an
  // action-economy category server-side (deriveSpellCastCost) — a
  // TurnResolution's `cost.kind` reads this rather than re-parsing
  // `castingTime` text client-side.
  castCost?: SpellCastCostKind;
}

/**
 * Baseline catalog entry served by `GET /api/spells` — the "pick a spell
 * from the SRD" path for the spellbook editor. Mirrors the `Spell` interface
 * but without per-character fields (id here is the catalog id, not an entry id;
 * `prepared` is absent since preparation is a per-character state).
 */
export interface CatalogSpell {
  id: string;       // catalog Spell.id (used as learnSpell.spellId)
  // Present only on the caller's own homebrew (#1788, epic #1782 5/5) — the
  // manage UI's only signal to distinguish an editable/deletable row from a
  // seeded one; seeded rows never carry it.
  ownerId?: string;
  // Entitlement metadata (#1796/#1798, epic #1795 1/6+3/6) — scope/fork
  // provenance for the share (#1799) and fork (#1800) UI. Optional (not
  // `SpellWire.catalog`'s own required shape) so the many existing inline
  // CatalogSpell test fixtures across the frontend — built before this field
  // existed — don't all need updating; a real served row always carries it.
  catalog?: CatalogMeta;
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
 * Response shape for POST/PATCH /api/spells/custom — a user-owned homebrew
 * spell row (Spell.ownerId non-null, reusable across all of that user's
 * characters). Not derived from a contracts schema (the route has no
 * response schema, only customSpellSchema for the request): this mirrors
 * custom-spells.ts's serializeCustomSpell, one field-for-field. Once served
 * back through `GET /api/spells` (#1786) a homebrew row folds into the plain
 * CatalogSpell shape, so this type is only for the direct create/edit
 * response, not the picker.
 */
export interface HomebrewSpell {
  id: string;
  ownerId: string;
  edition: string;
  // See CatalogSpell.catalog's own comment — same optional-for-fixtures shape.
  catalog?: CatalogMeta;
  name: string;
  level: number;
  school: SpellSchool;
  castingTime: string;
  range: string;
  duration: string;
  description: string;
  concentration: boolean;
  ritual: boolean;
  components?: SpellComponents | null;
  classes: string[];
  effectKind?: "damage" | "heal";
  effectDiceCount?: number;
  effectDiceFaces?: number;
  effectModifier?: number;
  damageType?: string;
  attackType?: "attack" | "save";
  saveAbility?: string;
  saveEffect?: "half" | "none";
  upcastDicePerLevel?: number;
}

// Spellcasting operation types (the per-op interfaces and the
// SpellcastingOperation union) are imported from shared-types and re-exported at
// the top of this file (#820) — sent as `{ operations: SpellcastingOperation[] }`
// to POST /api/characters/:id/spellcasting/transactions.

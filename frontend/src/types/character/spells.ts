import type {
  CatalogMeta,
  EffectRoll,
  EffectSpec,
  SpellCastCostKind,
  SpellComponents,
  SpellSchool,
} from "@character-sheet/shared-types";

import type { ItemSpellMeta } from "./inventory";

export type { SpellComponents, SpellSchool };
export type {
  CastSpellOperation,
  ForgetSpellOperation,
  LearnSpellOperation,
  SpellcastingOperation,
} from "@character-sheet/shared-types";

// Request body for POST/PATCH /api/spells/custom; aliased from contracts' CustomSpellInput.
export type { CustomSpellInput as HomebrewSpellInput } from "@character-sheet/contracts";

/** Effect fields are snapshotted from the catalog at learn time, usable for auto-rolling without a live catalog join. */
export interface Spell {
  id: string;
  spellId?: string;   // catalog Spell.id provenance — undefined for custom spells
  /** Provenance; "subclass"/"species"/"item" mark derived, non-persisted grants (no Remove ✕). */
  source?: "subclass" | "species" | "item";
  /** Item-granted-spell metadata, present only when source === "item". */
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
  effectKind?: "damage" | "heal" | "buff" | null;
  effectDiceCount?: number | null;
  effectDiceFaces?: number | null;
  effectModifier?: number | null;
  damageType?: string | null;
  attackType?: "attack" | "save" | null;
  saveAbility?: string | null;
  upcastDicePerLevel?: number | null;
  cantripScaling?: boolean;
  // Multi-instance columns (#1981/#1984) — see shared-types' EffectColumns for the mechanic.
  instanceCount?: number | null;
  instanceRoll?: "each" | "once" | null;
  upcastInstancesPerLevel?: number | null;
  // Applied server-side on cast; the FE treats a buff spell as no-roll — its AC change shows in armorClassBreakdown.
  buffTarget?: string | null;
  buffModifier?: number | null;
  // Never re-derived client-side; effectRolls is one resolved roll per castable slot level, keyed by chosenSlotLevel ?? spell.level.
  effect?: EffectSpec;
  effectRolls?: EffectRoll[];
  // `castingTime` classified into an action-economy category server-side (deriveSpellCastCost); read this rather than re-parsing castingTime client-side.
  castCost?: SpellCastCostKind;
}

/** `id` here is the catalog id, not a per-character entry id — `prepared` is absent since preparation is per-character state. */
export interface CatalogSpell {
  id: string;       // catalog Spell.id (used as learnSpell.spellId)
  // Present only on the caller's own homebrew — the manage UI's only signal to distinguish an editable/deletable row from a seeded one.
  ownerId?: string;
  // Optional only for pre-existing test fixtures; a real served row always carries it.
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
  // Multi-instance columns (#1981/#1984) — see shared-types' EffectColumns for the mechanic.
  instanceCount?: number;
  instanceRoll?: "each" | "once";
  upcastInstancesPerLevel?: number;
  buffTarget?: string;
  buffModifier?: number;
}

export interface SpellSlots {
  level: number;
  total: number;
  used: number;
}

/** Response shape for POST/PATCH /api/spells/custom only — once served back through GET /api/spells, a homebrew row folds into the plain CatalogSpell shape. */
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
  // Multi-instance columns (#1981/#1984) — see shared-types' EffectColumns for the mechanic.
  instanceCount?: number;
  instanceRoll?: "each" | "once";
  upcastInstancesPerLevel?: number;
}

// Sent as { operations: SpellcastingOperation[] } to POST /api/characters/:id/spellcasting/transactions.

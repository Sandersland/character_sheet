// Leaf module: persisted spellcasting JSON shape + its normalizer, no back-imports.

import { Prisma } from "../generated/prisma/client.js";

// ── Canonical mutable state shape ─────────────────────────────────────────────
// Stored in Character.spellcasting JSON column.
// `slotsUsed`: slot level (as string key, JSON requirement) → used count.
// `spells`: the character's known/prepared spell list (snapshotted from catalog
//   or custom). Each entry has a locally-generated `id` (the entryId used by
//   operations) independent of the catalog Spell.id (stored as `spellId`).

export interface SpellEntry {
  id: string;             // per-character entry UUID (operation target)
  spellId?: string;       // catalog Spell.id provenance — null for custom spells
  name: string;
  level: number;          // 0 = cantrip
  school: string;         // SpellSchool value, lowercase
  prepared: boolean;      // cantrips are always treated as prepared at cast time
  castingTime: string;
  range: string;
  duration: string;
  description: string;
  concentration?: boolean;
  ritual?: boolean;
  // Spell components ({ verbal, somatic, material, materialDescription? }) and
  // save-on-damage behavior, snapshotted from the catalog at learn time.
  components?: SpellComponents | null;
  saveEffect?: string | null;    // "half" | "none" | null
  // Structured roll effect (snapshotted from catalog at learn time):
  effectKind?: string | null;    // "damage" | "heal" | null (utility)
  effectDiceCount?: number | null;
  effectDiceFaces?: number | null;
  effectModifier?: number | null; // flat bonus added to dice total
  damageType?: string | null;
  attackType?: string | null;    // "attack" | "save" | null
  saveAbility?: string | null;
  upcastDicePerLevel?: number | null;
  cantripScaling?: boolean;
}

/** Spell verbal/somatic/material component flags + optional material text. */
export interface SpellComponents {
  verbal: boolean;
  somatic: boolean;
  material: boolean;
  materialDescription?: string;
}

/**
 * The single concentration spell a character is currently maintaining, or null.
 * 5e: a character can concentrate on only one spell at a time — casting a new
 * concentration spell drops any prior one (see castSpell). `entryId` is the
 * per-character SpellEntry id; `spellName` is denormalized for display/log text.
 */
export interface ConcentrationState {
  entryId: string;
  spellName: string;
}

export interface SpellcastingMutableState {
  // JSON object keys must be strings; slot level is stored as e.g. "1", "2".
  slotsUsed: Record<string, number>;
  // Warlock Mystic Arcanum charges spent this long rest, keyed by spell level
  // (e.g. "6"). Each level has exactly one charge; 0/absent means available.
  arcanumUsed: Record<string, number>;
  spells: SpellEntry[];
  // The active concentration spell, or null when not concentrating.
  concentratingOn: ConcentrationState | null;
}

// ── Normalizer ────────────────────────────────────────────────────────────────
// Handles both the new compact format AND the legacy blob shape seeded before
// this migration (which had `ability`, `spellSaveDC`, `spellAttackBonus`,
// `slots: [{level, total, used}]`, `spells`). The legacy fields are ignored
// since they're now derived; only `used` counts and `spells` are extracted.

export function normalizeSpellcastingMutable(json: Prisma.JsonValue): SpellcastingMutableState {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null };
  }
  const obj = json as Record<string, unknown>;

  // New compact format: { slotsUsed: {...}, arcanumUsed: {...}, spells: [...] }
  if ("slotsUsed" in obj) {
    return {
      slotsUsed: (obj.slotsUsed as Record<string, number>) ?? {},
      arcanumUsed: (obj.arcanumUsed as Record<string, number>) ?? {},
      spells: (obj.spells as SpellEntry[]) ?? [],
      concentratingOn: normalizeConcentration(obj.concentratingOn),
    };
  }

  // Legacy format: { ability, spellSaveDC, ..., slots: [{level, total, used}], spells: [...] }
  const oldSlots = (obj.slots as Array<{ level: number; total: number; used: number }>) ?? [];
  const slotsUsed: Record<string, number> = {};
  for (const s of oldSlots) {
    if (s.used > 0) slotsUsed[String(s.level)] = s.used;
  }
  return {
    slotsUsed,
    arcanumUsed: {},
    spells: (obj.spells as SpellEntry[]) ?? [],
    concentratingOn: normalizeConcentration(obj.concentratingOn),
  };
}

/** Coerce a stored concentration value into a valid ConcentrationState or null. */
function normalizeConcentration(value: unknown): ConcentrationState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const c = value as Record<string, unknown>;
  if (typeof c.entryId !== "string" || c.entryId.length === 0) return null;
  return { entryId: c.entryId, spellName: typeof c.spellName === "string" ? c.spellName : "" };
}

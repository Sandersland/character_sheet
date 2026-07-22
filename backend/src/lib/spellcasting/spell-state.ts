// Leaf module: persisted spellcasting JSON shape + its normalizer, no back-imports.

import type { SpellComponents } from "@character-sheet/shared-types";

import { Prisma } from "@/generated/prisma/client.js";

// Re-exported so existing consumers (applySpellcastingOperations,
// deriveGrantedSpells) keep resolving SpellComponents from this module; the
// definition now lives in shared-types (#820).
export type { SpellComponents };

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
  effectKind?: string | null;    // "damage" | "heal" | "buff" | null (utility)
  effectDiceCount?: number | null;
  effectDiceFaces?: number | null;
  effectModifier?: number | null; // flat bonus added to dice total
  damageType?: string | null;
  attackType?: string | null;    // "attack" | "save" | null
  saveAbility?: string | null;
  upcastDicePerLevel?: number | null;
  cantripScaling?: boolean;
  // AC/stat buff effect (#363): target consumed at the AC-assembly seam
  // ("ac" | "acUnarmoredBase" | "acFloor") + the flat modifier. Present only
  // for effectKind "buff"; snapshotted from the catalog at learn time.
  buffTarget?: string | null;
  buffModifier?: number | null;
  // Provenance of the entry; "subclass" marks a derived, non-persisted grant,
  // "item" a spell granted by a held magic item (#528, cast from the item).
  source?: "subclass" | "item";
  // Item-granted-spell fields (#528), present only when source === "item".
  item?: ItemSpellMeta;
}

/**
 * Metadata for a spell granted by a magic item (#528). Carries the provenance
 * needed to cast from + track the item's resource, plus the fixed/wielder DC and
 * attack overrides the sheet renders in place of the character's own values.
 */
export interface ItemSpellMeta {
  inventoryItemId: string;
  capabilityId: string;
  itemName: string;
  castLevel: number;
  resource: string;
  usesRemaining: number; // Infinity for at-will
  usesTotal: number;     // Infinity for at-will
  dcMode: "fixed" | "wielder";
  dc?: number | null;         // resolved value when dcMode === "fixed"
  attackMode: "fixed" | "wielder";
  attack?: number | null;     // resolved value when attackMode === "fixed"
  // Charges-pool fields (#555), present when resource === "charges": the pool
  // row the cast spends from and its per-cast cost (usesRemaining/usesTotal
  // then mirror the POOL's remaining/max, shared across the item's spells).
  poolCapabilityId?: string | null;
  chargeCost?: number;
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

/**
 * Clamp prepared spells to a level-derived cap (#1127): keep the first `limit`
 * user-learned leveled prepared entries (prepared && level>0 && source==null) and
 * mark the rest unprepared — cantrips and granted/item spells never count and are
 * untouched. Pure; returns the original array (trimmedCount 0) when nothing needs
 * trimming. The single shared rule for both the level-down reconciler and the
 * clamp-on-read in serializeCharacter. `limit === null` (non-caster) is a no-op.
 */
export function clampPreparedToLimit(
  spells: SpellEntry[],
  limit: number | null,
): { spells: SpellEntry[]; trimmedCount: number } {
  if (limit == null) return { spells, trimmedCount: 0 };
  let kept = 0;
  let trimmedCount = 0;
  const clamped = spells.map((s) => {
    if (!(s.prepared && s.level > 0 && s.source == null)) return s;
    if (kept < limit) {
      kept++;
      return s;
    }
    trimmedCount++;
    return { ...s, prepared: false };
  });
  return trimmedCount > 0 ? { spells: clamped, trimmedCount } : { spells, trimmedCount: 0 };
}

/**
 * Deep-copy the spellcasting state into a before/after event snapshot. Shared by
 * the focus-cast handlers (shadow-arts) so their audit-event snapshots
 * are byte-identical (the payload feeds LIFO undo via activity.ts).
 */
export function snapshotSpellcasting(state: SpellcastingMutableState) {
  return {
    spellcasting: {
      slotsUsed: { ...state.slotsUsed },
      arcanumUsed: { ...state.arcanumUsed },
      spells: [...state.spells],
      concentratingOn: state.concentratingOn ? { ...state.concentratingOn } : null,
    },
  };
}

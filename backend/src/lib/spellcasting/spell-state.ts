// Leaf module: persisted spellcasting JSON shape + its normalizer, no back-imports.

import type { SpellComponents } from "@character-sheet/shared-types";

import { Prisma } from "@/generated/prisma/client.js";

// Re-exported so existing consumers (applySpellcastingOperations, deriveGrantedSpells) keep resolving SpellComponents from here; the definition now lives in shared-types (#820).
export type { SpellComponents };

// Stored in Character.spellcasting JSON column. Each SpellEntry's `id` (the entryId operations target) is independent of the catalog Spell.id, stored separately as `spellId`.

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
  // Snapshotted from the catalog at learn time.
  components?: SpellComponents | null;
  saveEffect?: string | null;    // "half" | "none" | null
  // Structured roll effect, snapshotted from the catalog at learn time.
  effectKind?: string | null;    // "damage" | "heal" | "buff" | null (utility)
  effectDiceCount?: number | null;
  effectDiceFaces?: number | null;
  effectModifier?: number | null; // flat bonus added to dice total
  damageType?: string | null;
  attackType?: string | null;    // "attack" | "save" | null
  saveAbility?: string | null;
  upcastDicePerLevel?: number | null;
  cantripScaling?: boolean;
  // buffTarget: "ac" | "acUnarmoredBase" | "acFloor" (#363) — present only when effectKind is "buff"; snapshotted from the catalog at learn time.
  buffTarget?: string | null;
  buffModifier?: number | null;
  // source "species" is TWO mechanisms sharing one tag, distinguished by id's shape: a #1683 species/lineage grant is derived and non-persisted, id always `granted:<name>:<spell>`-shaped; a #1689 species-CHOICE grant (e.g. High Elf's Cantrip) is player-picked and persisted, id a random per-character UUID.
  // reconcileGrantedSpells and persistSpellState key their derived-vs-persisted handling off the `granted:` id prefix for exactly this reason — a source-only check would treat a #1689 pick as a leaked #1683 grant and strip it.
  source?: "subclass" | "species" | "item";
  // Item-granted-spell fields (#528), present only when source === "item".
  item?: ItemSpellMeta;
  // Present only on a #1689 species-CHOICE entry — a #1683 species/lineage entry never sets this, which is what lets deriveSpeciesCastingAbility tell the two apart.
  // A plain string, not an AbilityName union, because this module is a leaf (no back-imports) — the value is z.enum(ABILITY_NAMES)-checked at the seam that writes it, so an invalid value can never reach here.
  castingAbility?: string;
}

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
  // Present when resource === "charges" (#555) — usesRemaining/usesTotal then mirror the pool's remaining/max, shared across the item's spells.
  poolCapabilityId?: string | null;
  chargeCost?: number;
}

// spellName is denormalized for display/log text.
export interface ConcentrationState {
  entryId: string;
  spellName: string;
}

export interface SpellcastingMutableState {
  // JSON object keys must be strings; slot level is stored as e.g. "1", "2".
  slotsUsed: Record<string, number>;
  // Warlock Mystic Arcanum charges spent this long rest, keyed by spell level (e.g. "6"); each level has exactly one charge, 0/absent means available.
  arcanumUsed: Record<string, number>;
  spells: SpellEntry[];
  concentratingOn: ConcentrationState | null;
}

// Handles both the new compact format and the legacy blob shape seeded before this migration (ability/spellSaveDC/spellAttackBonus/slots[]) — those fields are now derived and ignored; only used counts and spells are extracted.

export function normalizeSpellcastingMutable(json: Prisma.JsonValue): SpellcastingMutableState {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null };
  }
  const obj = json as Record<string, unknown>;

  if ("slotsUsed" in obj) {
    return {
      slotsUsed: (obj.slotsUsed as Record<string, number>) ?? {},
      arcanumUsed: (obj.arcanumUsed as Record<string, number>) ?? {},
      spells: (obj.spells as SpellEntry[]) ?? [],
      concentratingOn: normalizeConcentration(obj.concentratingOn),
    };
  }

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

function normalizeConcentration(value: unknown): ConcentrationState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const c = value as Record<string, unknown>;
  if (typeof c.entryId !== "string" || c.entryId.length === 0) return null;
  return { entryId: c.entryId, spellName: typeof c.spellName === "string" ? c.spellName : "" };
}

// The single shared rule for both the level-down reconciler and the clamp-on-read in serializeCharacter (#1127).
// Keeps the first `limit` user-learned leveled prepared entries (prepared && level>0 && source==null); cantrips and granted/item spells never count. limit === null (non-caster) is a no-op.
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

// Shared by the focus-cast handlers (shadow-arts) so their audit-event snapshots are byte-identical — the payload feeds LIFO undo.
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

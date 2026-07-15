// Cantrips/spells a subclass grants for free (no player choice). The mapping
// (which subclass grants which spells) is DATA — seeded `SubclassGrantedSpell`
// rows that REFERENCE the shared Spell catalog by FK (#898) — and the spell's
// content is resolved live from that catalog here, never snapshotted. Callers
// load the class entry's `subclassRef` (catalog Subclass + its grantedSpells +
// each grant's Spell) and pass it in; this stays pure over the loaded rows and
// never persists. The derived id scheme `granted:<subclass>:<spell>` is the
// disjoint id space cast/undo/concentration key on. A homebrew subclass (no
// catalog Subclass row yet, #911) resolves to null here and grants nothing.

import {
  castUsesTotal,
  chargePoolOf,
  readCapability,
  type CapabilityColumns,
  type CastSpellCapability,
  type CastStatMode,
  type ChargesCapability,
} from "@/lib/inventory/capabilities.js";
import type { EffectColumns } from "@/lib/combat/effects.js";
import type { SpellEntry, SpellComponents } from "./spell-state.js";

// The six ability scores, lowercase — the shape of Character.abilityScores.
export type AbilityScores = Record<
  "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma",
  number
>;

// The loaded shape the resolver consumes: a catalog Subclass with its granted
// spells joined to the Spell catalog. `spell` carries the catalog row fields the
// derived SpellEntry needs (a `include: { grantedSpells: { include: { spell: true } } }`
// on the character's subclassRef supplies exactly this).
// Display fields + the shared flat `EffectColumns` (roll data), so a damage grant
// carries its catalog roll through with no re-declared column list (#820 mirror).
export interface GrantedSpellCatalogSpell extends EffectColumns {
  name: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  duration: string;
  description: string;
  concentration: boolean;
  ritual: boolean;
  components: unknown;
}
export interface GrantedSpellRow {
  gateLevel: number;
  castingAbility: string;
  spell: GrantedSpellCatalogSpell;
}
export interface GrantedSpellSource {
  /** Subclass name — builds the stable `granted:<subclass>:<spell>` derived id. */
  name: string;
  grantedSpells: GrantedSpellRow[];
}

// "Way of Shadow" -> "way-of-shadow": the stable derived-id key.
function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Independent components clone per call (prior contract: callers may mutate the
// returned entry's nested components without affecting a later call).
function cloneComponents(components: unknown): SpellComponents | undefined {
  if (!components || typeof components !== "object") return undefined;
  return { ...(components as SpellComponents) };
}

// Only carry non-default optionals, so a utility grant (Minor Illusion) yields the
// same fields it did as an in-code snapshot, while a damage grant carries its roll
// data (from the catalog) so cast-time auto-rolling works with no extra code.
function optionalSpellFields(s: GrantedSpellCatalogSpell): Partial<SpellEntry> {
  const out: Partial<SpellEntry> = {};
  if (s.concentration) out.concentration = true;
  if (s.ritual) out.ritual = true;
  if (s.effectKind) {
    out.effectKind = s.effectKind;
    out.effectDiceCount = s.effectDiceCount;
    out.effectDiceFaces = s.effectDiceFaces;
    out.effectModifier = s.effectModifier;
    out.damageType = s.damageType;
    out.attackType = s.attackType;
    out.saveAbility = s.saveAbility;
    out.saveEffect = s.saveEffect;
    out.upcastDicePerLevel = s.upcastDicePerLevel;
    if (s.cantripScaling) out.cantripScaling = true;
    out.buffTarget = s.buffTarget;
    out.buffModifier = s.buffModifier;
  }
  return out;
}

// The spells a subclass grants for free at this character level, resolved live
// from the loaded catalog rows. Below a grant's gate level it is omitted; a null
// source (no subclass, or homebrew without a catalog row) grants nothing. Never
// persisted — re-derived on every read.
export function deriveGrantedSpells(
  source: GrantedSpellSource | null | undefined,
  level: number,
): SpellEntry[] {
  if (!source) return [];
  return source.grantedSpells
    .filter((g) => level >= g.gateLevel)
    .map((g) => ({
      id: `granted:${slug(source.name)}:${slug(g.spell.name)}`,
      name: g.spell.name,
      level: g.spell.level,
      school: g.spell.school,
      prepared: true,
      source: "subclass" as const,
      castingTime: g.spell.castingTime,
      range: g.spell.range,
      duration: g.spell.duration,
      description: g.spell.description,
      components: cloneComponents(g.spell.components),
      ...optionalSpellFields(g.spell),
    }));
}

const ABILITY_NAMES = new Set<string>([
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
]);

// The ability a subclass's granted spells use for save DC / attack bonus. The
// column is a plain `string`, so validate it against the six lowercase ability
// names — a mis-cased/unknown value falls back to Wisdom rather than silently
// producing a NaN modifier / wrong save DC.
export function deriveGrantedCastingAbility(
  source: GrantedSpellSource | null | undefined,
): keyof AbilityScores {
  const raw = source?.grantedSpells[0]?.castingAbility;
  return (raw && ABILITY_NAMES.has(raw) ? raw : "wisdom") as keyof AbilityScores;
}

// The minimal inventory-item shape item-spell derivation needs: an item is a
// live spell source only while equipped OR attuned (same gate as passive bonuses).
export interface ItemSpellSourceItem {
  id: string;
  name: string;
  equipped: boolean;
  attuned: boolean;
  capabilities: (CapabilityColumns & { id: string; used?: number | null })[];
}

// Item-granted spells (#528), derived at read time from a holder's active items.
// The derived entry id is the `item:<inventoryItemId>:<spellId>:<capabilityId>`
// seam — a stable, disjoint id space (like `granted:` and `shadow-art:`) that the
// cast op matches on to resolve the source capability (via meta.capabilityId), and
// that concentration/resolveConcentration key on. The trailing capabilityId keeps
// the id unique when one item carries two castSpell caps for the SAME spell.
// Never persisted: re-derived on every read from the InventoryCapability rows.
// The item's shared charge pool resolved once per item (null when the item has
// none). row carries the capability's id/used columns for the pool's remaining.
type ItemSpellCap = ItemSpellSourceItem["capabilities"][number];
type ItemChargePool = { cap: ChargesCapability; row: ItemSpellCap } | null;

// One castSpell capability's remaining/total uses. A charges-costed cast mirrors
// the shared pool's remaining/max (no per-item counter); every other resource
// tracks its own `used` column against castUsesTotal.
function itemSpellUses(
  cap: CastSpellCapability,
  used: number,
  pool: ItemChargePool,
): { total: number; remaining: number; poolCapabilityId: string | null } {
  if (cap.resource === "charges") {
    // No pool on the item = misauthored (authoring forbids it): exhausted, not a crash.
    const total = pool ? pool.cap.maxCharges : 0;
    const remaining = pool ? Math.max(0, pool.cap.maxCharges - (pool.row.used ?? 0)) : 0;
    return { total, remaining, poolCapabilityId: pool?.row.id ?? null };
  }
  const total = castUsesTotal(cap);
  const remaining = total === Infinity ? Infinity : Math.max(0, total - used);
  return { total, remaining, poolCapabilityId: null };
}

// A fixed-mode DC/attack resolves to its item value; wielder mode resolves later
// against the holder's spell stats, so it's null here.
function fixedStat(mode: CastStatMode, value: number | null | undefined): number | null {
  return mode === "fixed" ? value ?? null : null;
}

// Build the derived SpellEntry for one item's castSpell capability.
function itemSpellEntry(
  item: ItemSpellSourceItem,
  col: ItemSpellSourceItem["capabilities"][number],
  cap: CastSpellCapability,
  pool: ItemChargePool,
): SpellEntry {
  const { total, remaining, poolCapabilityId } = itemSpellUses(cap, col.used ?? 0, pool);
  return {
    id: `item:${item.id}:${cap.spellId}:${col.id}`,
    spellId: cap.spellId,
    name: cap.spellName || "Item spell",
    level: cap.spellLevel,
    school: "evocation",
    prepared: true,
    castingTime: "1 action",
    range: "—",
    duration: cap.concentration ? "Concentration" : "—",
    description: cap.description ?? "",
    concentration: cap.concentration,
    source: "item",
    item: {
      inventoryItemId: item.id,
      capabilityId: col.id,
      itemName: item.name,
      castLevel: cap.castLevel,
      resource: cap.resource,
      usesRemaining: remaining,
      usesTotal: total,
      dcMode: cap.dcMode,
      dc: fixedStat(cap.dcMode, cap.dcValue),
      attackMode: cap.attackMode,
      attack: fixedStat(cap.attackMode, cap.attackValue),
      ...(cap.resource === "charges" ? { poolCapabilityId, chargeCost: cap.chargeCost } : {}),
    },
  };
}

export function deriveItemSpells(items: ItemSpellSourceItem[]): SpellEntry[] {
  const out: SpellEntry[] = [];
  for (const item of items) {
    if (!item.equipped && !item.attuned) continue;
    // The item's shared charge pool (#555): charges-costed casts draw from it,
    // so their uses columns mirror the pool's remaining/max. Resolved once per item.
    const pool = chargePoolOf(item.capabilities);
    for (const col of item.capabilities) {
      const cap = readCapability(col);
      if (cap.kind !== "castSpell") continue;
      out.push(itemSpellEntry(item, col, cap, pool));
    }
  }
  return out;
}

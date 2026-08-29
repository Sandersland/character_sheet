// The derived id scheme `granted:<subclass>:<spell>` is the disjoint id space cast/undo/concentration key on.

import type { RulesEdition } from "@character-sheet/shared-types";

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

// Mirrors the shape of Character.abilityScores.
export type AbilityScores = Record<
  "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma",
  number
>;

// Requires `include: { grantedSpells: { include: { spell: true } } }` on the character's subclassRef — spell fields plus the shared EffectColumns roll data (#820 mirror).
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
  // NULL = granted in both editions (#1625); see admittedGrants.
  edition: RulesEdition | null;
  spell: GrantedSpellCatalogSpell;
}
export interface GrantedSpellSource {
  name: string;
  grantedSpells: GrantedSpellRow[];
}

// THE single edition-filter site for subclass grants (#1625) — every consumer filters here; a second copy is how it would diverge from admittedGrants.
// Set-wise admission (crossEditionRejection's comparison), not resolveEditionRow's pick-one fallback: a row is served when shared (NULL) or tagged with the character's edition.
function admittedGrants(source: GrantedSpellSource, edition: RulesEdition): GrantedSpellRow[] {
  return source.grantedSpells.filter((g) => g.edition === null || g.edition === edition);
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Independent clone per call — callers may mutate the returned entry's nested components without affecting a later call.
function cloneComponents(components: unknown): SpellComponents | undefined {
  if (!components || typeof components !== "object") return undefined;
  return { ...(components as SpellComponents) };
}

// Only carries non-default optionals, so a utility grant yields the same field set every consumer expects.
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

// Never persisted — re-derived on every read, which is what makes level-down free for both sources with no reconciler write.
// sourceKind (#1683) only stamps the derived SpellEntry's source literal, never forks derivation — kept as one shared function for both collectGrantedSpells (subclass) and buildSpeciesGrantedSpellSource (species).
export function deriveGrantedSpells(
  source: GrantedSpellSource | null | undefined,
  level: number,
  edition: RulesEdition,
  sourceKind: "subclass" | "species" = "subclass",
): SpellEntry[] {
  if (!source) return [];
  return admittedGrants(source, edition)
    .filter((g) => level >= g.gateLevel)
    .map((g) => ({
      id: `granted:${slug(source.name)}:${slug(g.spell.name)}`,
      name: g.spell.name,
      level: g.spell.level,
      school: g.spell.school,
      prepared: true,
      source: sourceKind,
      castingTime: g.spell.castingTime,
      range: g.spell.range,
      duration: g.spell.duration,
      description: g.spell.description,
      components: cloneComponents(g.spell.components),
      ...optionalSpellFields(g.spell),
    }));
}

// A null prevSource is a fresh subclass pick — every grant at nextLevel is newly incoming (#1139).
export function grantedSpellsGained(
  prevSource: GrantedSpellSource | null | undefined,
  prevLevel: number,
  nextSource: GrantedSpellSource | null | undefined,
  nextLevel: number,
  edition: RulesEdition,
): SpellEntry[] {
  if (!nextSource) return [];
  const next = deriveGrantedSpells(nextSource, nextLevel, edition);
  if (!prevSource) return next;
  const had = new Set(deriveGrantedSpells(prevSource, prevLevel, edition).map((s) => s.id));
  return next.filter((s) => !had.has(s.id));
}

const ABILITY_NAMES = new Set<string>([
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
]);

// Reads off the first ADMITTED grant — a cross-edition row must never set the stat for a character it isn't granted to.
// Falls back to Wisdom for a mis-cased/unknown ability value rather than silently producing a NaN modifier or wrong save DC.
export function deriveGrantedCastingAbility(
  source: GrantedSpellSource | null | undefined,
  edition: RulesEdition,
): keyof AbilityScores {
  const raw = source ? admittedGrants(source, edition)[0]?.castingAbility : undefined;
  return (raw && ABILITY_NAMES.has(raw) ? raw : "wisdom") as keyof AbilityScores;
}

// Structural subset so each of its three call sites (serialize, the spellcasting tx-op layer, the level reconciler) can build one from its own differently-shaped Prisma select (mirrors GrantedSpellRow).
export interface SpeciesGrantedSpellRow {
  variantId: string | null;
  gateLevel: number;
  spell: GrantedSpellCatalogSpell;
}

export interface SpeciesGrantSourceInput {
  name: string;
  // CharacterRace.castingAbility (#1683); null for no spell grant, a 2014 character, or before the choice existed.
  castingAbility: string | null;
  // EVERY grant row FK'd to this speciesId, spanning every variant (same Prisma relation gotcha activeTraitRows documents for species.traits) — narrowed to species-level (variantId === null) below.
  speciesGrantedSpells: SpeciesGrantedSpellRow[];
  // Already scoped to the chosen variant by Prisma — no further filtering needed (unlike speciesGrantedSpells above).
  variantGrantedSpells: SpeciesGrantedSpellRow[];
}

// Resolved through the SAME deriveGrantedSpells subclass grants use — never a fork (CLAUDE.md's one-shared-function rule).
// edition: null makes admittedGrants' cross-edition filter a no-op here — the edition gate already happened when the Species/SpeciesVariant row was resolved (characterInclude, resolveSpeciesSelection); this source is "parent-edition scoped", not filtered again.
export function buildSpeciesGrantedSpellSource(input: SpeciesGrantSourceInput | null): GrantedSpellSource | null {
  if (!input) return null;
  const speciesLevel = input.speciesGrantedSpells.filter((g) => g.variantId === null);
  const rows = [...speciesLevel, ...input.variantGrantedSpells];
  if (rows.length === 0) return null;
  const castingAbility =
    input.castingAbility && ABILITY_NAMES.has(input.castingAbility) ? input.castingAbility : "wisdom";
  return {
    name: input.name,
    grantedSpells: rows.map((r) => ({ gateLevel: r.gateLevel, castingAbility, edition: null, spell: r.spell })),
  };
}

// Shared by the level reconciler and the spellcasting tx-op layer so they don't duplicate this query fragment.
// A plain literal, not `satisfies Prisma.CharacterRaceSelect` — this module stays decoupled from the generated Prisma client; each caller applies its own `satisfies Prisma...Select`.
export const RACE_SELECTION_GRANT_SELECT = {
  castingAbility: true,
  species: { select: { name: true, grantedSpells: { select: { variantId: true, gateLevel: true, spell: true } } } },
  variant: { select: { name: true, grantedSpells: { select: { variantId: true, gateLevel: true, spell: true } } } },
} as const;

// The shape RACE_SELECTION_GRANT_SELECT resolves to; speciesGrantedSpellSourceFromRaceSelection below adapts it.
export interface RaceSelectionGrantRow {
  castingAbility: string | null;
  species: { name: string; grantedSpells: SpeciesGrantedSpellRow[] } | null;
  variant: { name: string; grantedSpells: SpeciesGrantedSpellRow[] } | null;
}

// Shared by the level reconciler and the spellcasting tx-op layer; the read-serialize path uses its own buildSpeciesGrantedSpellSourceFor since it loads a wider raceSelection shape already.
export function speciesGrantedSpellSourceFromRaceSelection(
  raceSelection: RaceSelectionGrantRow | null | undefined,
): GrantedSpellSource | null {
  if (!raceSelection?.species) return null;
  return buildSpeciesGrantedSpellSource({
    name: raceSelection.variant?.name ?? raceSelection.species.name,
    castingAbility: raceSelection.castingAbility,
    speciesGrantedSpells: raceSelection.species.grantedSpells,
    variantGrantedSpells: raceSelection.variant?.grantedSpells ?? [],
  });
}

// A live spell source only while equipped OR attuned — same gate as passive bonuses.
export interface ItemSpellSourceItem {
  id: string;
  name: string;
  equipped: boolean;
  attuned: boolean;
  capabilities: (CapabilityColumns & { id: string; used?: number | null })[];
}

// Derived entry id `item:<inventoryItemId>:<spellId>:<capabilityId>` is a stable, disjoint id space (like `granted:`/`shadow-art:`) that the cast op and resolveConcentration key on; the trailing capabilityId keeps it unique when one item carries two castSpell caps for the same spell.
// Never persisted — re-derived on every read from the InventoryCapability rows.
// The item's shared charge pool (#555), resolved once per item — null when the item has none; row carries the capability's id/used columns for the pool's remaining.
type ItemSpellCap = ItemSpellSourceItem["capabilities"][number];
type ItemChargePool = { cap: ChargesCapability; row: ItemSpellCap } | null;

// A charges-costed cast mirrors the shared pool's remaining/max (no per-item counter); every other resource tracks its own `used` column against castUsesTotal.
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

// A fixed-mode DC/attack resolves to its item value; wielder mode resolves later against the holder's spell stats, so it's null here.
function fixedStat(mode: CastStatMode, value: number | null | undefined): number | null {
  return mode === "fixed" ? value ?? null : null;
}

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
    const pool = chargePoolOf(item.capabilities);
    for (const col of item.capabilities) {
      const cap = readCapability(col);
      if (cap.kind !== "castSpell") continue;
      out.push(itemSpellEntry(item, col, cap, pool));
    }
  }
  return out;
}

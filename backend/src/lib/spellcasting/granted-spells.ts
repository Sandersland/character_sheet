// Cantrips/spells a subclass grants for free (no player choice). The mapping
// (which subclass grants which spells) is DATA — seeded `SubclassGrantedSpell`
// rows that REFERENCE the shared Spell catalog by FK (#898) — and the spell's
// content is resolved live from that catalog here, never snapshotted. Callers
// load the class entry's `subclassRef` (catalog Subclass + its grantedSpells +
// each grant's Spell) and pass it in; this stays pure over the loaded rows and
// never persists. The derived id scheme `granted:<subclass>:<spell>` is the
// disjoint id space cast/undo/concentration key on. A homebrew subclass (no
// catalog Subclass row yet, #911) resolves to null here and grants nothing.

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
  /** NULL = granted in both editions (#1625) — see admittedGrants. */
  edition: RulesEdition | null;
  spell: GrantedSpellCatalogSpell;
}
export interface GrantedSpellSource {
  /** Subclass name — builds the stable `granted:<subclass>:<spell>` derived id. */
  name: string;
  grantedSpells: GrantedSpellRow[];
}

// THE single edition-filter site for subclass grants (#1625). The loaded
// grantedSpells rows span every edition: characterInclude is a module-level
// const with no access to the character's rulesEdition (see its `features`
// comment for the in-memory-filter precedent), and Prisma can't express
// `edition IN (x, NULL)` anyway (withEditionOrShared's comment) — so every
// consumer filters here, never at an include/select, and a second copy is how
// the two would diverge. A granted-spell list is a SET, so this is
// crossEditionRejection's admission comparison applied set-wise (NOT
// resolveEditionRow's pick-one fallback): a row is served when shared (NULL)
// or tagged with exactly the character's edition — which also keeps exactly
// one row of a per-edition gateLevel fork of the same spell.
function admittedGrants(source: GrantedSpellSource, edition: RulesEdition): GrantedSpellRow[] {
  return source.grantedSpells.filter((g) => g.edition === null || g.edition === edition);
}

// "Warrior of Shadow" -> "warrior-of-shadow": the stable derived-id key.
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

// The spells a subclass OR species/lineage grants for free at this character
// level, resolved live from the loaded catalog rows. Below a grant's gate
// level it is omitted; a cross-edition row is omitted (admittedGrants); a
// null source (no subclass/species, or homebrew without a catalog row)
// grants nothing. Never persisted — re-derived on every read, which is what
// makes level-down free for both sources with no reconciler write.
//
// `sourceKind` (#1683) is the ONE parameter that changes between the two
// callers — it only stamps the derived SpellEntry's `source` literal, never
// forks the derivation itself: this stays the single shared function serving
// both `collectGrantedSpells` (subclass, serialize/spellcasting.ts) and the
// species source built by buildSpeciesGrantedSpellSource below.
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

// The grants a level-up newly turns on (#1139): derived-ids present at nextLevel
// but not at prevLevel. A null prev source is a fresh subclass pick — every ≤-level
// grant is incoming; a null next source grants nothing.
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

// The ability a granted-spell source's spells use for save DC / attack bonus
// (a subclass, or a 2024 species lineage since #1683), read off the first
// ADMITTED grant (a cross-edition row must not set the stat for a character it
// never grants to). The column is a plain `string`, so validate
// it against the six lowercase ability names — a mis-cased/unknown value falls
// back to Wisdom rather than silently producing a NaN modifier / wrong save DC.
export function deriveGrantedCastingAbility(
  source: GrantedSpellSource | null | undefined,
  edition: RulesEdition,
): keyof AbilityScores {
  const raw = source ? admittedGrants(source, edition)[0]?.castingAbility : undefined;
  return (raw && ABILITY_NAMES.has(raw) ? raw : "wisdom") as keyof AbilityScores;
}

// The SpeciesGrantedSpell rows a species/variant carries, shaped for
// buildSpeciesGrantedSpellSource below — a structural subset so each of its
// three call sites (serialize, the spellcasting transaction-op layer, the
// level reconciler) can build one from its OWN differently-shaped Prisma
// select/include (mirrors GrantedSpellRow's own role for subclass grants).
export interface SpeciesGrantedSpellRow {
  variantId: string | null;
  gateLevel: number;
  spell: GrantedSpellCatalogSpell;
}

// The input buildSpeciesGrantedSpellSource resolves into a GrantedSpellSource
// — read off a character's CharacterRace + Species/SpeciesVariant selection.
export interface SpeciesGrantSourceInput {
  /** The granting species/variant's display name — builds the derived id
   *  scheme (`granted:<name>:<spell>`), same role as GrantedSpellSource.name. */
  name: string;
  /** CharacterRace.castingAbility (#1683) — the player's Int/Wis/Cha choice,
   *  made once when the lineage/legacy was picked. Null for a species/variant
   *  with no spell grant, a 2014 character, or before the choice existed. */
  castingAbility: string | null;
  /** Species -> SpeciesGrantedSpell back-relation: EVERY grant row FK'd to
   *  this speciesId, spanning every variant (plain Prisma relation semantics
   *  — the same gotcha activeTraitRows documents for species.traits). Narrowed
   *  to species-level (variantId === null) inside this function. */
  speciesGrantedSpells: SpeciesGrantedSpellRow[];
  /** SpeciesVariant -> SpeciesGrantedSpell back-relation for the CHOSEN
   *  variant only — already scoped by Prisma, no further filtering needed. */
  variantGrantedSpells: SpeciesGrantedSpellRow[];
}

// Species/lineage-granted spells (#1683) build a second GrantedSpellSource,
// resolved through the SAME deriveGrantedSpells subclass grants use
// (sourceKind: "species", never a fork — the one-shared-function
// non-negotiable). Unlike SubclassGrantedSpell, a SpeciesGrantedSpell row
// carries no per-row castingAbility (no column on the model) and no per-row
// edition (species children have no edition column at all, unlike
// SubclassGrantedSpell's real per-row fork) — every row here is stamped with
// the SAME character-chosen ability and `edition: null`. `edition: null`
// means admittedGrants' cross-edition filter is a structural no-op for a
// species source: the edition gate already happened when the Species/
// SpeciesVariant row itself was resolved per edition at read time
// (characterInclude) and at creation (resolveSpeciesSelection) — "parent-
// edition scoped", not a second filter here.
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

// The `CharacterRace.raceSelection` sub-select two callers need when they
// AREN'T already loading species/variant for another reason (unlike
// character-include.ts, which loads species/variant WITH traits for the
// read-serialize path too, #1682) — the level reconciler and the
// spellcasting transaction-op layer. A plain literal, not `satisfies
// Prisma.CharacterRaceSelect`: this module stays decoupled from the
// generated Prisma client (pure over loaded rows, per its own header),
// structurally compatible when spread into either caller's own
// `satisfies Prisma...Select` block. Fallow flagged the two identical
// query-fragment copies this replaces.
export const RACE_SELECTION_GRANT_SELECT = {
  castingAbility: true,
  species: { select: { name: true, grantedSpells: { select: { variantId: true, gateLevel: true, spell: true } } } },
  variant: { select: { name: true, grantedSpells: { select: { variantId: true, gateLevel: true, spell: true } } } },
} as const;

/** The shape RACE_SELECTION_GRANT_SELECT resolves to — the input
 *  speciesGrantedSpellSourceFromRaceSelection below adapts. */
export interface RaceSelectionGrantRow {
  castingAbility: string | null;
  species: { name: string; grantedSpells: SpeciesGrantedSpellRow[] } | null;
  variant: { name: string; grantedSpells: SpeciesGrantedSpellRow[] } | null;
}

// The RACE_SELECTION_GRANT_SELECT-shaped adapter into buildSpeciesGrantedSpellSource
// above — shared by level-reconciliation.ts and the spellcasting transaction-op
// layer (character-include.ts's read-serialize path uses its own
// buildSpeciesGrantedSpellSourceFor, serialize/species.ts, since it loads a
// wider raceSelection shape already). One function, not two copies of the
// same null-species-guard + field mapping (fallow flagged the prior duplicate).
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

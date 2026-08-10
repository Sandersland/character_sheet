import { Prisma } from "@/generated/prisma/client.js";

import { FEATURE_ROWS_CLASS_FEATURES, FEATURE_ROWS_SUBCLASS_FEATURES } from "@/lib/classes/feature-rows-select.js";
import { resolveInventoryItem, type InventoryItemWithDetails } from "@/lib/inventory/inventory-types.js";

// Shared `include` for fetching a full character with its race/background/
// class selections. classEntries is ordered so index 0 is always the
// primary class (v1 creates exactly one; multiclass support will append
// more at increasing `position` values later). Exported for routes/
// inventory.ts to reuse — every inventory-transaction op returns the full
// serialized character, same shape as this file's own endpoints.
export const characterInclude = {
  // #1682/#1683: species/variant relations, each with their OWN trait AND
  // granted-spell rows — buildSpeciesTraitsView (serialize/species.ts) reads
  // .traits, buildSpeciesGrantedSpellSourceFor (same file) reads
  // .grantedSpells + castingAbility (a scalar column on raceSelection itself,
  // no include needed). Both species/variant resolve to null for a legacy
  // `race`-name-only creation (speciesId/variantId null, #1679's additive
  // migration) — both builders handle that as "no species picked yet", never
  // a crash.
  raceSelection: {
    include: {
      species: { include: { traits: true, grantedSpells: { orderBy: { gateLevel: "asc" }, include: { spell: true } } } },
      variant: { include: { traits: true, grantedSpells: { orderBy: { gateLevel: "asc" }, include: { spell: true } } } },
    },
  },
  backgroundSelection: true,
  classEntries: {
    orderBy: { position: "asc" },
    include: {
      // `features` (#1522/#1523/#1524): the class's OWN feature rows — see
      // FEATURE_ROWS_CLASS_FEATURES for why the filter is load-bearing. Both
      // editions load (this `include` is a module-level const with no access to
      // the character's rulesEdition); featuresFromRows does the in-memory
      // per-edition filter.
      // armorProficiencies/weaponProficiencies/extraAsiLevels/
      // fightingStyleFeatLevel (#1529): the class-table content
      // characterAdvancementSlots/characterFightingStyleFeatSlots/
      // buildMergedArmorProficiencies/buildMergedWeaponProficiencies read off
      // this relation instead of a name-keyed lib/srd/ Record.
      // `name` (#1495): the CANONICAL catalog class name, read by
      // fightingStyleGrantingClassNames for the served
      // fightingStyleGrantingClasses field — never CharacterClassEntry's own
      // `name` column, a free-to-diverge display name.
      class: {
        select: {
          name: true,
          subclassLevel: true,
          armorProficiencies: true,
          weaponProficiencies: true,
          extraAsiLevels: true,
          fightingStyleFeatLevel: true,
          features: FEATURE_ROWS_CLASS_FEATURES,
        },
      },
      // Subclass-granted spells (#898), resolved live at serialize time from the
      // catalog rows this join loads (never snapshotted). Null when no subclass or
      // a homebrew subclass without a catalog row (#911).
      // `features` (#1524): this subclass's own rows.
      subclassRef: {
        include: {
          grantedSpells: { orderBy: { gateLevel: "asc" }, include: { spell: true } },
          features: FEATURE_ROWS_SUBCLASS_FEATURES,
        },
      },
    },
  },
  // weaponDetail/armorDetail/consumableDetail/capabilities are reconstructed
  // from `snapshot` by resolveCharacterInventory below (#1649) — the four
  // Inventory* mirror relations are gone, `capabilityUses` is the only join
  // left to fetch.
  inventoryItems: {
    orderBy: { position: "asc" },
    include: { capabilityUses: true },
  },
  // Newest-first by the user-entered calendar `date`; `loggedAt desc` then
  // `createdAt desc` are stable tiebreakers so same-date NOTE rows (which share
  // a UTC-midnight date) sort by their capture time.
  // Unfiltered today (single-owner access); campaign-visible sharing means threading a userId into serializeCharacter to call the visibleEntries helper.
  journalEntries: { orderBy: [{ date: "desc" }, { loggedAt: "desc" }, { createdAt: "desc" }] },
  // Per-campaign play prefs (#537); serializeCharacter surfaces the row matching
  // the character's current campaignId (in-memory filter — at most a few rows).
  campaignPreferences: true,
} satisfies Prisma.CharacterInclude;

// The raw Prisma fetch shape — every route that does
// `tx.character.findUnique({ include: characterInclude })` gets this. Its
// `inventoryItems` carry `capabilityUses`, not weaponDetail/armorDetail/
// consumableDetail/capabilities (#1649): resolveCharacterInventory below
// reconstructs those before serializeCharacter (or anything it calls) reads a
// single field off an inventory row.
export type CharacterRow = Prisma.CharacterGetPayload<{ include: typeof characterInclude }>;

// The logical shape every serialize/*.ts submodule is written against —
// identical to the pre-#1649 CharacterWithRelations, since resolveInventoryItem
// reconstructs the same weaponDetail/armorDetail/consumableDetail/capabilities
// fields those submodules already read.
export type CharacterWithRelations = Omit<CharacterRow, "inventoryItems"> & {
  inventoryItems: InventoryItemWithDetails[];
};

// The one place a raw character fetch becomes the resolved shape (#1649) —
// called once, at the top of serializeCharacter, so every sub-builder it
// delegates to (buildInventoryContext, buildItemGrantsView, buildTargetModifiers,
// selectEquippedBodyArmor, …) keeps reading `.weaponDetail`/`.armorDetail`/
// `.consumableDetail`/`.capabilities` unchanged.
export function resolveCharacterInventory(row: CharacterRow): CharacterWithRelations {
  return { ...row, inventoryItems: row.inventoryItems.map(resolveInventoryItem) };
}

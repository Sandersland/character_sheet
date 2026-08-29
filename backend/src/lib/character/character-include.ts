import { Prisma } from "@/generated/prisma/client.js";

import { FEATURE_ROWS_CLASS_FEATURES, FEATURE_ROWS_SUBCLASS_FEATURES } from "@/lib/classes/feature-rows-select.js";
import { resolveInventoryItem, type InventoryItemWithDetails } from "@/lib/inventory/inventory-types.js";

// classEntries is ordered by position asc — index 0 is always the primary class.
export const characterInclude = {
  // species/variant resolve to null for a legacy race-name-only creation — treated as "no species picked yet", never a crash.
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
      // features load for both editions (this include has no access to the character's rulesEdition) — featuresFromRows applies the per-edition filter in memory.
      // class.name is the CANONICAL catalog name — never CharacterClassEntry's own `name` column, a free-to-diverge display name.
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
      // Subclass-granted spells (#898) are resolved live at serialize time from these rows — never snapshotted.
      subclassRef: {
        include: {
          grantedSpells: { orderBy: { gateLevel: "asc" }, include: { spell: true } },
          features: FEATURE_ROWS_SUBCLASS_FEATURES,
        },
      },
    },
  },
  // weaponDetail/armorDetail/consumableDetail/capabilities are reconstructed from snapshot by resolveCharacterInventory below (#1649) — capabilityUses is the only join left to fetch.
  inventoryItems: {
    orderBy: { position: "asc" },
    include: { capabilityUses: true },
  },
  // Newest-first by date; loggedAt desc then createdAt desc are stable tiebreakers for same-date rows.
  journalEntries: { orderBy: [{ date: "desc" }, { loggedAt: "desc" }, { createdAt: "desc" }] },
  campaignPreferences: true,
} satisfies Prisma.CharacterInclude;

export type CharacterRow = Prisma.CharacterGetPayload<{ include: typeof characterInclude }>;

export type CharacterWithRelations = Omit<CharacterRow, "inventoryItems"> & {
  inventoryItems: InventoryItemWithDetails[];
};

export function resolveCharacterInventory(row: CharacterRow): CharacterWithRelations {
  return { ...row, inventoryItems: row.inventoryItems.map(resolveInventoryItem) };
}

import { Prisma } from "@/generated/prisma/client.js";

import { FEATURE_ROWS_CLASS_FEATURES, FEATURE_ROWS_SUBCLASS_FEATURES } from "@/lib/classes/feature-rows-select.js";

// Shared `include` for fetching a full character with its race/background/
// class selections. classEntries is ordered so index 0 is always the
// primary class (v1 creates exactly one; multiclass support will append
// more at increasing `position` values later). Exported for routes/
// inventory.ts to reuse — every inventory-transaction op returns the full
// serialized character, same shape as this file's own endpoints.
export const characterInclude = {
  raceSelection: true,
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
      class: {
        select: {
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
  inventoryItems: {
    orderBy: { position: "asc" },
    include: { weaponDetail: true, armorDetail: true, consumableDetail: true, capabilities: true },
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

export type CharacterWithRelations = Prisma.CharacterGetPayload<{ include: typeof characterInclude }>;

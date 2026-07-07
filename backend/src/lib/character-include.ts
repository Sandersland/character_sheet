import { Prisma } from "../generated/prisma/client.js";

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
    include: { class: { select: { subclassLevel: true } } },
  },
  inventoryItems: {
    orderBy: { position: "asc" },
    include: { weaponDetail: true, armorDetail: true, consumableDetail: true, capabilities: true },
  },
  // Newest-first by the user-entered calendar `date`; `loggedAt desc` then
  // `createdAt desc` are stable tiebreakers so same-date NOTE rows (which share
  // a UTC-midnight date) sort by their capture time.
  // Unfiltered today (single-owner access); campaign-visible sharing means threading a userId into serializeCharacter to call the visibleEntries helper (routes/journal.ts).
  journalEntries: { orderBy: [{ date: "desc" }, { loggedAt: "desc" }, { createdAt: "desc" }] },
  // Per-campaign play prefs (#537); serializeCharacter surfaces the row matching
  // the character's current campaignId (in-memory filter — at most a few rows).
  campaignPreferences: true,
} satisfies Prisma.CharacterInclude;

export type CharacterWithRelations = Prisma.CharacterGetPayload<{ include: typeof characterInclude }>;

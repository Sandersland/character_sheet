import { randomUUID } from "node:crypto";

import type { RulesEdition } from "@character-sheet/shared-types";

import type { CatalogKind, CatalogScope } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";

// Spell.catalogEntryId is required and uniquely constrained with no default, so every Spell fixture created directly needs its own backing CatalogEntry row.
// find-then-create, not .create(): re-running this in a per-test beforeEach against an afterAll-only fixture would collide with CatalogEntry's (kind, scope, ownerUserId, ownerCampaignId, name, edition) unique constraint.
// forkedFromId is excluded from the lookup where — the unique key already pins one row, so a lineage never needs it to disambiguate.
export async function makeCatalogEntry(overrides: {
  name?: string;
  edition?: RulesEdition;
  kind?: CatalogKind;
  scope?: CatalogScope;
  ownerUserId?: string;
  ownerCampaignId?: string;
  forkedFromId?: string;
} = {}): Promise<string> {
  const {
    name = `Catalog Entry Fixture ${randomUUID()}`,
    edition = "EDITION_2024",
    kind = "SPELL",
    scope = "GLOBAL",
    ownerUserId = null,
    ownerCampaignId = null,
    forkedFromId = null,
  } = overrides;
  const where = { kind, scope, name, edition, ownerUserId, ownerCampaignId };
  const existing = await prisma.catalogEntry.findFirst({ where, select: { id: true } });
  if (existing) return existing.id;
  const entry = await prisma.catalogEntry.create({ data: { ...where, forkedFromId }, select: { id: true } });
  return entry.id;
}

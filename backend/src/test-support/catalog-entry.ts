import { randomUUID } from "node:crypto";

import type { RulesEdition } from "@character-sheet/shared-types";

import type { CatalogKind, CatalogScope } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";

// Test-only helper mirroring ensureTestOwner AND upsertEditionRow's
// find-then-write idempotency: every Spell fixture a test creates directly
// (bypassing seedSpells/custom-spells.ts's own CatalogEntry writes) needs its
// own backing CatalogEntry row — Spell.catalogEntryId is a required,
// uniquely-constrained column with no default (#1796, epic #1795 1/6).
// find-then-create, not a bare `.create()`: several call sites re-run this in
// a per-test `beforeEach` against a fixture only `afterAll` cleans up, and a
// second unconditional create would collide with CatalogEntry's own
// (kind, scope, ownerUserId, ownerCampaignId, name, edition) unique
// constraint. Returns the id either way; callers pass it as `catalogEntryId`
// on their own `prisma.spell.create` call.
//
// `forkedFromId` (#1797, epic #1795 2/6): optional so entitlement.ts's
// resolver tests can build a fork lineage (USER/CAMPAIGN entry forked from a
// GLOBAL/shared origin) without a second bespoke fixture helper. Not part of
// the lookup `where` — the unique key already pins one row per
// (kind, scope, owner, name, edition), so a lineage never needs it to
// disambiguate.
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

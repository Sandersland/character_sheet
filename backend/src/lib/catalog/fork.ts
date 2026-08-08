import type { CatalogEntry, CatalogKind, Spell } from "@/generated/prisma/client.js";
import { Prisma } from "@/generated/prisma/client.js";
import { NotFoundError } from "@/lib/auth/errors.js";
import { prisma } from "@/lib/core/prisma.js";

// A fork's landing spot (#1800, epic #1795 5/6): USER (owner = the forking
// player's own id — travels with them across campaigns) or CAMPAIGN (owner =
// that campaign's id — a DM's campaign-wide override). The two arms mirror
// catalogForkSchema's own scope/campaignId pairing (packages/contracts,
// #1796) one-to-one, so a caller that has already parsed a fork request body
// can hand this straight through.
export type ForkTarget =
  | { scope: "USER"; ownerUserId: string }
  | { scope: "CAMPAIGN"; ownerCampaignId: string };

export interface ForkedSpell {
  entry: CatalogEntry;
  spell: Spell;
  classes: string[];
}

/**
 * Deep-copies a catalog entry's content into a NEW entry the forker owns,
 * `forkedFromId` pointing at the origin (#1800). Kind-dispatched — this is
 * the ONE place the CatalogEntry supertype touches kind-specific mechanics
 * tables; every other catalog reader/writer stays kind-agnostic.
 *
 * Authorization is the CALLER's job (visibility of `entryId`; for a CAMPAIGN
 * target, DM-ness of that campaign) — this function trusts `target` and only
 * 404s when `entryId` doesn't resolve to real content. The origin row is
 * never mutated: everything below writes to a freshly `create`d entry/spell.
 */
export async function forkContent(kind: CatalogKind, entryId: string, target: ForkTarget): Promise<ForkedSpell> {
  switch (kind) {
    case "SPELL":
      return forkSpell(entryId, target);
    default: {
      // CatalogKind is a one-member union today (see its own doc comment on
      // shared-types/src/catalog.ts); this is the exhaustiveness latch a
      // second kind (Item, …) must widen alongside its own forkX branch.
      const exhaustive: never = kind;
      throw new Error(`forkContent: unsupported kind "${String(exhaustive)}"`);
    }
  }
}

async function forkSpell(entryId: string, target: ForkTarget): Promise<ForkedSpell> {
  const origin = await prisma.catalogEntry.findUnique({ where: { id: entryId } });
  if (!origin) throw new NotFoundError("Catalog entry not found");

  const originSpell = await prisma.spell.findUnique({
    where: { catalogEntryId: entryId },
    include: { classMemberships: { select: { className: true } } },
  });
  // A SPELL-kind entry with no Spell row is a data-integrity violation
  // (Spell.catalogEntryId is unique+required, #1796), not a normal "not
  // found" a caller can hit through ordinary use — still 404, since from the
  // caller's perspective there's simply nothing forkable at this id.
  if (!originSpell) throw new NotFoundError("Catalog entry not found");

  // Deep copy = every scalar EXCEPT the origin's own id/catalogEntryId (the
  // new row gets its own, tied to the new entry below); destructured out
  // rather than a hand-enumerated field list, so a future Spell column is
  // copied automatically without a second edit here.
  const { id: originSpellId, catalogEntryId: originCatalogEntryId, classMemberships, components, ...mechanics } =
    originSpell;
  void originSpellId;
  void originCatalogEntryId;

  return prisma.$transaction(async (tx) => {
    const entry = await tx.catalogEntry.create({
      data: {
        kind: "SPELL",
        scope: target.scope,
        ownerUserId: target.scope === "USER" ? target.ownerUserId : null,
        ownerCampaignId: target.scope === "CAMPAIGN" ? target.ownerCampaignId : null,
        name: origin.name,
        edition: origin.edition,
        forkedFromId: origin.id,
      },
    });
    const spell = await tx.spell.create({
      data: {
        ...mechanics,
        // Prisma requires the sentinel Prisma.JsonNull for an explicit JSON
        // null on a nullable Json column — a bare JS `null` here is
        // ambiguous with "leave unset" (same rule custom-spells.ts's own
        // customSpellWriteData already follows for this column).
        components: components ?? Prisma.JsonNull,
        catalogEntryId: entry.id,
        classMemberships: { create: classMemberships.map((m) => ({ className: m.className })) },
      },
    });
    return { entry, spell, classes: classMemberships.map((m) => m.className) };
  });
}

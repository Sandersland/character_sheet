import type { CatalogEntry, CatalogKind, Spell } from "@/generated/prisma/client.js";
import { Prisma } from "@/generated/prisma/client.js";
import { NotFoundError } from "@/lib/auth/errors.js";
import { prisma } from "@/lib/core/prisma.js";

// Mirrors catalogForkSchema's scope/campaignId pairing one-to-one.
export type ForkTarget =
  | { scope: "USER"; ownerUserId: string }
  | { scope: "CAMPAIGN"; ownerCampaignId: string };

export interface ForkedSpell {
  entry: CatalogEntry;
  spell: Spell;
  classes: string[];
}

// Kind-dispatched: the one place CatalogEntry touches kind-specific mechanics tables; every other reader/writer stays kind-agnostic.
// Authorization is the caller's job — this trusts `target` and only 404s when entryId doesn't resolve to real content.
export async function forkContent(kind: CatalogKind, entryId: string, target: ForkTarget): Promise<ForkedSpell> {
  switch (kind) {
    case "SPELL":
      return forkSpell(entryId, target);
    default: {
      // Exhaustiveness latch — a new CatalogKind needs its own forkX branch here too.
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
  // Missing Spell row here is a data-integrity violation (Spell.catalogEntryId is unique+required), not ordinary "not found" — still 404 to the caller.
  if (!originSpell) throw new NotFoundError("Catalog entry not found");

  // Destructured out (not a hand-enumerated field list) so a new Spell column is copied automatically.
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
        // Prisma.JsonNull required for explicit null on a nullable Json column (same rule customSpellWriteData follows for this column).
        components: components ?? Prisma.JsonNull,
        catalogEntryId: entry.id,
        classMemberships: { create: classMemberships.map((m) => ({ className: m.className })) },
      },
    });
    return { entry, spell, classes: classMemberships.map((m) => m.className) };
  });
}

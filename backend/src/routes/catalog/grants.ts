import { Router } from "express";
import { catalogGrantSchema } from "@character-sheet/contracts";
import type { GrantWire } from "@character-sheet/shared-types";

import { Prisma, type CatalogGrant } from "@/generated/prisma/client.js";
import { AuthorizationError, NotFoundError } from "@/lib/auth/errors.js";
import { assertCampaignMembership } from "@/lib/auth/access.js";
import { parseBodyOr400 } from "@/lib/http/parse-body.js";
import { prisma } from "@/lib/core/prisma.js";

// Grant CRUD (#1799, epic #1795 4/6): the entry owner shares/unshares a USER-
// scope homebrew CatalogEntry into a campaign they belong to. Live grant
// (Approach A, locked by the epic): CatalogGrant is a pure join row carrying
// no content snapshot, so the source Spell row (edited later by the author)
// is what every granted campaign resolves — nothing here duplicates content.
//
// Ownership-scoped plain REST, same shape as custom-spells.ts — a grant isn't
// a character's mutable state, so this is not the `POST …/transactions`
// pattern.

export const grantsRouter = Router();

function serializeGrant(grant: CatalogGrant): GrantWire {
  return { id: grant.id, catalogEntryId: grant.catalogEntryId, campaignId: grant.campaignId };
}

// Shared by POST and DELETE: 404 if the entry doesn't exist, 403 if it exists
// but isn't owned by the caller. Scope is NOT checked here — GLOBAL/CAMPAIGN
// entries have no ownerUserId, so an ownership check alone would always 403
// them before the POST handler's own scope check gets a chance to 400 (see
// its own comment).
async function assertGrantEntryOwnership(
  entryId: string,
  userId: string,
): Promise<{ id: string; scope: string; ownerUserId: string | null }> {
  const entry = await prisma.catalogEntry.findUnique({
    where: { id: entryId },
    select: { id: true, scope: true, ownerUserId: true },
  });
  if (!entry) {
    throw new NotFoundError("Catalog entry not found");
  }
  if (entry.ownerUserId !== userId) {
    throw new AuthorizationError("You do not have access to this catalog entry");
  }
  return entry;
}

/**
 * POST /api/catalog/entries/:entryId/grants
 * Grants a USER-scope catalog entry into a campaign the caller (its owner)
 * belongs to. Scope is checked BEFORE ownership: a GLOBAL/CAMPAIGN entry's
 * ownerUserId is always null, so gating on scope first is what lets a caller
 * ever reach the intended 400 instead of always seeing 403. Idempotent on the
 * (catalogEntryId, campaignId) unique key via create-then-catch (matching
 * campaignMembership.upsert's role elsewhere in this codebase, e.g.
 * campaigns.ts's own POST /campaigns/join): a find-then-create TOCTOU window
 * would let two concurrent identical POSTs both read no existing row and both
 * insert, so the loser's write hits the unique constraint — caught here as
 * P2002 and turned into a 200 of the winner's row rather than the 500 the
 * terminal error handler would otherwise map an uncaught P2002 to.
 */
grantsRouter.post("/catalog/entries/:entryId/grants", async (req, res) => {
  const data = parseBodyOr400(catalogGrantSchema, req.body, res);
  if (data === undefined) return;

  const entry = await prisma.catalogEntry.findUnique({
    where: { id: req.params.entryId },
    select: { id: true, scope: true, ownerUserId: true },
  });
  if (!entry) {
    throw new NotFoundError("Catalog entry not found");
  }
  if (entry.scope !== "USER") {
    res.status(400).json({ error: "Only USER-scope catalog entries can be granted" });
    return;
  }
  if (entry.ownerUserId !== req.user!.id) {
    throw new AuthorizationError("You do not have access to this catalog entry");
  }

  await assertCampaignMembership(prisma, req.user!.id, data.campaignId, "edit");

  try {
    const grant = await prisma.catalogGrant.create({
      data: { catalogEntryId: entry.id, campaignId: data.campaignId },
    });
    res.status(201).json(serializeGrant(grant));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.catalogGrant.findUniqueOrThrow({
        where: { catalogEntryId_campaignId: { catalogEntryId: entry.id, campaignId: data.campaignId } },
      });
      res.status(200).json(serializeGrant(existing));
      return;
    }
    throw err;
  }
});

/**
 * DELETE /api/catalog/entries/:entryId/grants/:campaignId
 * Revokes a grant. Idempotent: deleteMany rather than delete-by-unique-key,
 * so calling it on a grant that's already gone still 204s instead of 404ing —
 * matching the POST side's idempotency rather than surprising a retrying
 * client. Ownership-only (no campaign-membership check): the owner may have
 * since left the campaign and must still be able to revoke what they shared.
 */
grantsRouter.delete("/catalog/entries/:entryId/grants/:campaignId", async (req, res) => {
  const entry = await assertGrantEntryOwnership(req.params.entryId, req.user!.id);

  await prisma.catalogGrant.deleteMany({
    where: { catalogEntryId: entry.id, campaignId: req.params.campaignId },
  });
  res.status(204).end();
});

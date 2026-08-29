import { Router } from "express";
import { catalogGrantSchema } from "@character-sheet/contracts";
import type { GrantWire } from "@character-sheet/shared-types";

import { Prisma, type CatalogGrant } from "@/generated/prisma/client.js";
import { AuthorizationError, NotFoundError } from "@/lib/auth/errors.js";
import { assertCampaignMembership } from "@/lib/auth/access.js";
import { parseBodyOr400 } from "@/lib/http/parse-body.js";
import { prisma } from "@/lib/core/prisma.js";

export const grantsRouter = Router();

function serializeGrant(grant: CatalogGrant): GrantWire {
  return { id: grant.id, catalogEntryId: grant.catalogEntryId, campaignId: grant.campaignId };
}

// Requires scope === "USER", not just an ownerUserId match, so a future entry kind carrying an ownerUserId can't silently pass this check.
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
  if (entry.scope !== "USER" || entry.ownerUserId !== userId) {
    throw new AuthorizationError("You do not have access to this catalog entry");
  }
  return entry;
}

// Recovers from the POST handler's create-then-catch P2002 by re-fetching the winning row, retrying its own create once if a concurrent DELETE removed it first; `created` is true only when this call's own create won.
async function recoverFromGrantConflict(
  catalogEntryId: string,
  campaignId: string,
): Promise<{ grant: CatalogGrant; created: boolean }> {
  const existing = await prisma.catalogGrant.findUnique({
    where: { catalogEntryId_campaignId: { catalogEntryId, campaignId } },
  });
  if (existing) return { grant: existing, created: false };

  try {
    const recreated = await prisma.catalogGrant.create({ data: { catalogEntryId, campaignId } });
    return { grant: recreated, created: true };
  } catch (recreateErr) {
    if (!(recreateErr instanceof Prisma.PrismaClientKnownRequestError) || recreateErr.code !== "P2002") {
      throw recreateErr;
    }
    const winner = await prisma.catalogGrant.findUnique({
      where: { catalogEntryId_campaignId: { catalogEntryId, campaignId } },
    });
    if (!winner) throw recreateErr;
    return { grant: winner, created: false };
  }
}

/**
 * POST /api/catalog/entries/:entryId/grants
 * Grants a USER-scope catalog entry into a campaign the caller (its owner)
 * belongs to. Scope is checked before ownership, since a GLOBAL/CAMPAIGN
 * entry's ownerUserId is always null. Idempotent on the (catalogEntryId,
 * campaignId) unique key via create-then-catch, resolved by
 * recoverFromGrantConflict on a race.
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
    if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") {
      throw err;
    }
    const { grant, created } = await recoverFromGrantConflict(entry.id, data.campaignId);
    res.status(created ? 201 : 200).json(serializeGrant(grant));
  }
});

/**
 * DELETE /api/catalog/entries/:entryId/grants/:campaignId
 * Revokes a grant. Idempotent (deleteMany, so an already-gone grant still
 * 204s). Ownership-only, no campaign-membership check — the owner may have
 * since left the campaign and must still be able to revoke it.
 */
grantsRouter.delete("/catalog/entries/:entryId/grants/:campaignId", async (req, res) => {
  const entry = await assertGrantEntryOwnership(req.params.entryId, req.user!.id);

  await prisma.catalogGrant.deleteMany({
    where: { catalogEntryId: entry.id, campaignId: req.params.campaignId },
  });
  res.status(204).end();
});

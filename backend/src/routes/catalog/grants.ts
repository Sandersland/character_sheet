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

// Used only by DELETE: 404 if the entry doesn't exist, 403 if it exists but
// isn't owned by the caller. POST does its own inline lookup instead of
// calling this — it needs the scope check to run BEFORE the ownership check
// (see its own comment), which this helper's ownership-first order doesn't
// support.
//
// Requires `scope === "USER"` in addition to the `ownerUserId` match (#1815
// review finding 9): today `ownerUserId` is non-null only for USER-scope
// entries (the CHECK constraint schema.prisma's own CatalogEntry comment
// describes), so this can't currently diverge from an ownerUserId-only
// check — but "grant-owned" should mean USER-scope-and-owned, not merely
// "ownerUserId happens to match," so a future entry kind that also carries
// an ownerUserId (e.g. a co-DM CAMPAIGN entry) can't silently pass grant
// ownership without ALSO being the kind of entry grants are defined for.
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

// Recovery path for the POST handler's own create-then-catch P2002 (#1815
// review finding 6, hardened against the follow-up double-race) — pulled
// out of the route handler purely to keep it under the fallow pre-commit
// CRAP/cyclomatic ceiling (CLAUDE.md), not a behavior change from having it
// inline. Re-fetches the row that caused the conflict; if it's genuinely
// gone (a concurrent DELETE — findUnique + null check, never
// findUniqueOrThrow, which would throw an uncaught P2025 for exactly that
// case), recreates it. That recreate can ITSELF P2002 under a double-race (a
// THIRD concurrent POST winning the create in between) — caught the same
// way, one more findUnique + null check, never a third create: an
// extraordinarily narrow remaining window where rethrowing is still
// strictly better than the pre-fix uncaught-P2002-500. `created` is `true`
// only when THIS call's own create is what won, so the route handler can
// still report 201 vs 200 accurately.
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
 * belongs to. Scope is checked BEFORE ownership: a GLOBAL/CAMPAIGN entry's
 * ownerUserId is always null, so gating on scope first is what lets a caller
 * ever reach the intended 400 instead of always seeing 403. Idempotent on the
 * (catalogEntryId, campaignId) unique key via create-then-catch (matching
 * campaignMembership.upsert's role elsewhere in this codebase, e.g.
 * campaigns.ts's own POST /campaigns/join): a find-then-create TOCTOU window
 * would let two concurrent identical POSTs both read no existing row and both
 * insert, so the loser's write hits the unique constraint — caught here and
 * resolved via recoverFromGrantConflict above rather than the 500 the
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
    if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") {
      throw err;
    }
    const { grant, created } = await recoverFromGrantConflict(entry.id, data.campaignId);
    res.status(created ? 201 : 200).json(serializeGrant(grant));
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

import type { CampaignRole, Prisma, PrismaClient } from "@/generated/prisma/client.js";

import { AuthorizationError, NotFoundError } from "./errors.js";

// Accepts either the shared client or a $transaction callback's tx client, so a route can authorize inside the same transaction it mutates in.
type Db = PrismaClient | Prisma.TransactionClient;

// #116: the single chokepoint for character access — routes resolve access here, not by comparing ownerId inline, so sharing has one seam to widen. `level` is reserved for a future CharacterShare read/edit split (owner-only today). Throws 404 if the character doesn't exist, 403 if the caller isn't the owner.
export async function assertCharacterAccess(
  db: Db,
  userId: string,
  characterId: string,
  level: "view" | "edit",
): Promise<{ id: string; ownerId: string }> {
  void level;

  const character = await db.character.findUnique({
    where: { id: characterId },
    select: { id: true, ownerId: true },
  });

  if (!character) {
    throw new NotFoundError("Character not found");
  }
  if (character.ownerId !== userId) {
    throw new AuthorizationError("You do not have access to this character");
  }
  return character;
}

// The campaign-access chokepoint, mirroring assertCharacterAccess: 404 if the campaign doesn't exist, 403 if the caller isn't a member. `level` is a reserved seam (no role gradient enforced today).
export async function assertCampaignMembership(
  db: Db,
  userId: string,
  campaignId: string,
  level: "view" | "edit",
): Promise<{ campaignId: string; role: CampaignRole }> {
  void level;

  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true },
  });
  if (!campaign) {
    throw new NotFoundError("Campaign not found");
  }

  const membership = await db.campaignMembership.findUnique({
    where: { campaignId_userId: { campaignId, userId } },
    select: { role: true },
  });
  if (!membership) {
    throw new AuthorizationError("You do not have access to this campaign");
  }
  return { campaignId, role: membership.role };
}

// #1796: ownership resolves through the CatalogEntry entitlement supertype, not a Spell.ownerId column — a two-step lookup since Spell.catalogEntryId carries no Prisma relation. Two admitted paths: a USER-scope entry the caller owns, or a CAMPAIGN-scope entry whose campaign the caller DMs (delegated to assertCampaignOwner). A GLOBAL row (both owner columns null) always 403s.
// A missing `entry` 404s rather than falling through to the generic 403, so a data-integrity failure (an orphaned FK) doesn't misreport as an authz failure.
export async function assertSpellOwnership(
  db: Db,
  userId: string,
  spellId: string,
): Promise<{ id: string; catalogEntryId: string }> {
  const spell = await db.spell.findUnique({
    where: { id: spellId },
    select: { id: true, catalogEntryId: true },
  });
  if (!spell) {
    throw new NotFoundError("Spell not found");
  }

  const entry = await db.catalogEntry.findUnique({
    where: { id: spell.catalogEntryId },
    select: { scope: true, ownerUserId: true, ownerCampaignId: true },
  });
  if (!entry) {
    throw new NotFoundError("Spell not found");
  }
  if (entry.scope === "USER" && entry.ownerUserId === userId) {
    return spell;
  }
  if (entry.scope === "CAMPAIGN" && entry.ownerCampaignId) {
    await assertCampaignOwner(db, userId, entry.ownerCampaignId, "edit", "You do not have access to this spell");
    return spell;
  }
  throw new AuthorizationError("You do not have access to this spell");
}

// Owner-only campaign gate: asserts membership first (404 missing / 403 non-member), then requires the OWNER role.
export async function assertCampaignOwner(
  db: Db,
  userId: string,
  campaignId: string,
  level: "view" | "edit",
  forbiddenMessage: string,
): Promise<{ campaignId: string; role: CampaignRole }> {
  const membership = await assertCampaignMembership(db, userId, campaignId, level);
  if (membership.role !== "OWNER") {
    throw new AuthorizationError(forbiddenMessage);
  }
  return membership;
}

import type { CampaignRole, Prisma, PrismaClient } from "@/generated/prisma/client.js";

import { AuthorizationError, NotFoundError } from "./errors.js";

// Accepts either the shared client or a $transaction callback's tx client, so a
// route can authorize inside the same transaction it mutates in.
type Db = PrismaClient | Prisma.TransactionClient;

// The single chokepoint for character access decisions. Every character-scoped
// route resolves access through this function instead of comparing ownerId at
// the call site — so character sharing (#116) has exactly one seam to widen.
//
// Today it enforces owner-only for both "view" and "edit"; the `level` param is
// the documented extension point where a future CharacterShare lookup will
// distinguish read-only collaborators from editors.
//
// Returns the minimal authorized row, or throws: 404 if the character does not
// exist (preserves the pre-auth "Character not found" behavior), 403 if it
// exists but the caller is not the owner.
export async function assertCharacterAccess(
  db: Db,
  userId: string,
  characterId: string,
  level: "view" | "edit",
): Promise<{ id: string; ownerId: string }> {
  // `level` is owner-only today (both view and edit require ownership); it is
  // the reserved seam where #116 sharing will distinguish read collaborators
  // from editors. Referenced here so the contract stays explicit at call sites.
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

// The campaign-access chokepoint (#246), mirroring assertCharacterAccess: 404 if
// the campaign doesn't exist, 403 if the caller isn't a member. `level` is the
// reserved view/edit seam (no role gradient enforced today).
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

// The spell-ownership chokepoint (#1785, epic #1782 2/5; extended #1808,
// epic #1795 8/8), mirroring assertCharacterAccess: 404 if the spell doesn't
// exist, 403 if it exists but the caller has neither editable path to it.
// Ownership resolves through the CatalogEntry entitlement supertype (#1796,
// epic #1795 1/6) rather than a Spell.ownerId column (dropped by that
// migration) — a two-step lookup since Spell.catalogEntryId carries no
// Prisma relation (the supertype stays closed, see schema.prisma's own
// comment). Two admitted paths, mirroring resolveVisibleEntries'
// precedenceRank (lib/catalog/entitlement.ts) without re-deriving it: a
// USER-scope entry the caller owns outright (ownerUserId match), or a
// CAMPAIGN-scope entry whose campaign the caller DMs — delegated to
// assertCampaignOwner (#1808) rather than a second inline DM check, so the
// "campaign owner" rule stays the one place it's expressed. A seeded GLOBAL
// row (both owner columns null) always 403s — neither path can ever match it
// — which is correct: a system spell is nobody's to edit or delete. Returns
// catalogEntryId (not the CatalogEntry row itself) so a caller that needs to
// mutate/delete the entry can do so without a second fetch.
//
// A missing `entry` (Spell.catalogEntryId resolving to no CatalogEntry) 404s
// rather than falling through to the generic 403 (#1815 review finding 8):
// the FK is ON DELETE CASCADE (schema.prisma's own comment on that column),
// so an orphan can't be produced through ordinary writes — but if the
// invariant is ever violated, a 403 would misreport "you can't touch this"
// for content that doesn't actually exist, masking the real data-integrity
// failure instead of surfacing it as the "not found" it actually is.
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

// Owner-only campaign gate (#591): asserts membership first (404 missing / 403
// non-member), then requires the OWNER role — throwing AuthorizationError (403)
// with the caller-supplied action message for a member who isn't the owner.
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

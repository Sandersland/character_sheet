import crypto from "node:crypto";

import { Router } from "express";
import { z } from "zod";

import { assertCampaignMembership, assertCharacterAccess } from "@/lib/auth/access.js";
import { prisma } from "@/lib/core/prisma.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";
import { getActiveSession } from "@/lib/session/sessions.js";

// Shared-campaign backbone (#246). Plain-REST (like journal.ts): no audit log,
// no transaction-op pattern. Membership is identity state, access is gated via
// assertCampaignMembership. Mounted after requireAuth, so req.user is always set.

export const campaignsRouter = Router();

const createCampaignSchema = z.object({ name: z.string().min(1) }).strict();
const joinCampaignSchema = z.object({ inviteCode: z.string().min(1) }).strict();
const attachCharacterSchema = z.object({ characterId: z.string().min(1) }).strict();

// Same opaque-token recipe as session.ts.
function generateInviteCode(): string {
  return crypto.randomBytes(12).toString("base64url");
}

// Standard include for campaign reads: members (with user) + their characters.
const campaignInclude = {
  members: {
    include: {
      user: { select: { id: true, name: true, email: true, imageUrl: true } },
    },
  },
};

/**
 * POST /api/campaigns
 * Create a campaign + the creator's OWNER membership in one transaction.
 */
campaignsRouter.post("/campaigns", async (req, res) => {
  const parseResult = createCampaignSchema.safeParse(req.body);
  if (!parseResult.success) {
    res
      .status(400)
      .json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  const userId = req.user!.id;
  const campaign = await prisma.campaign.create({
    data: {
      name: parseResult.data.name,
      ownerId: userId,
      inviteCode: generateInviteCode(),
      members: { create: { userId, role: "OWNER" } },
    },
    include: campaignInclude,
  });

  res.status(201).json(campaign);
});

/**
 * GET /api/campaigns
 * Every campaign the caller is a member of, with their own role surfaced.
 */
campaignsRouter.get("/campaigns", async (req, res) => {
  const userId = req.user!.id;
  const campaigns = await prisma.campaign.findMany({
    where: { members: { some: { userId } } },
    include: campaignInclude,
    orderBy: { createdAt: "desc" },
  });

  res.json(
    campaigns.map((campaign) => ({
      ...campaign,
      // The membership always exists (the WHERE filters to it); ?? satisfies the type.
      role: campaign.members.find((m) => m.userId === userId)?.role ?? "PLAYER",
    })),
  );
});

/**
 * GET /api/campaigns/:id
 * Members + each member's characters (id + name).
 */
campaignsRouter.get("/campaigns/:id", async (req, res) => {
  const { role } = await assertCampaignMembership(prisma, req.user!.id, req.params.id, "view");

  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      members: {
        include: {
          user: { select: { id: true, name: true, email: true, imageUrl: true } },
        },
      },
      characters: { select: { id: true, name: true, ownerId: true } },
    },
  });

  res.json({ ...campaign, role });
});

/**
 * POST /api/campaigns/join
 * Resolve a campaign by invite code and join as PLAYER (idempotent on @@unique).
 */
campaignsRouter.post("/campaigns/join", async (req, res) => {
  const parseResult = joinCampaignSchema.safeParse(req.body);
  if (!parseResult.success) {
    res
      .status(400)
      .json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  const campaign = await prisma.campaign.findUnique({
    where: { inviteCode: parseResult.data.inviteCode },
    select: { id: true },
  });
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  const userId = req.user!.id;
  await prisma.campaignMembership.upsert({
    where: { campaignId_userId: { campaignId: campaign.id, userId } },
    create: { campaignId: campaign.id, userId, role: "PLAYER" },
    update: {},
  });

  const joined = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaign.id },
    include: campaignInclude,
  });
  res.json(joined);
});

/**
 * POST /api/campaigns/:id/characters
 * Attach one of the caller's characters to the campaign. Returns the full
 * serialized character so the frontend can swap state in one assignment.
 */
campaignsRouter.post("/campaigns/:id/characters", async (req, res) => {
  const parseResult = attachCharacterSchema.safeParse(req.body);
  if (!parseResult.success) {
    res
      .status(400)
      .json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  const userId = req.user!.id;
  const characterId = parseResult.data.characterId;
  const campaignId = req.params.id;
  await assertCharacterAccess(prisma, userId, characterId, "edit");
  await assertCampaignMembership(prisma, userId, campaignId, "view");

  // Settle a stale solo session (auto-close) before the guard read below (#1081).
  await getActiveSession(characterId);

  // Attach + PC-entity auto-register in one transaction so the character is never
  // attached without its wiki link. The conditional update guards a TOCTOU race:
  // only a null or same-campaign FK matches, so a different-campaign attach
  // matches nothing → count 0 → alreadyInCampaign, and a same-campaign re-attach
  // is a no-op success (the @unique characterId link keeps entity creation
  // idempotent). A live solo session blocks the attach (#1081): its events belong
  // to the solo timeline, so it must be ended first. Re-checked inside the tx to
  // close the TOCTOU window against a concurrent solo start.
  const outcome = await prisma.$transaction(
    async (tx): Promise<"attached" | "alreadyInCampaign" | "soloSessionActive"> => {
      const soloActive = await tx.session.findFirst({
        where: { campaignId: null, status: "active", participants: { some: { characterId } } },
        select: { id: true },
      });
      if (soloActive) return "soloSessionActive";

      const { count } = await tx.character.updateMany({
        where: { id: characterId, OR: [{ campaignId: null }, { campaignId }] },
        data: { campaignId },
      });
      if (count === 0) return "alreadyInCampaign";

      const existingLink = await tx.campaignCharacterLink.findUnique({
        where: { characterId },
        select: { id: true },
      });
      if (!existingLink) {
        const character = await tx.character.findUniqueOrThrow({
          where: { id: characterId },
          select: { name: true },
        });
        const entity = await tx.campaignEntity.create({
          data: { campaignId, type: "PC", name: character.name },
        });
        await tx.campaignCharacterLink.create({
          data: { campaignEntityId: entity.id, characterId },
        });
      }
      return "attached";
    },
  );

  if (outcome === "soloSessionActive") {
    res
      .status(409)
      .json({ error: "End the character's active solo session before joining a campaign" });
    return;
  }
  if (outcome === "alreadyInCampaign") {
    res.status(409).json({ error: "Character already in a campaign" });
    return;
  }

  const updated = await prisma.character.findUniqueOrThrow({
    where: { id: characterId },
    include: characterInclude,
  });
  res.json(serializeCharacter(updated));
});

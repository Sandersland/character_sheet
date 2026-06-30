import crypto from "node:crypto";

import { Router } from "express";
import { z } from "zod";

import { assertCampaignMembership, assertCharacterAccess } from "../lib/auth/access.js";
import { prisma } from "../lib/prisma.js";
import { serializeCharacter, characterInclude } from "./characters.js";

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

// ── POST /api/campaigns ──────────────────────────────────────────────────────
// Create a campaign + the creator's OWNER membership in one transaction.

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

// ── GET /api/campaigns ───────────────────────────────────────────────────────
// Every campaign the caller is a member of, with their own role surfaced.

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

// ── GET /api/campaigns/:id ───────────────────────────────────────────────────
// Members + each member's characters (id + name).

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

// ── POST /api/campaigns/join ─────────────────────────────────────────────────
// Resolve a campaign by invite code and join as PLAYER (idempotent on @@unique).

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

// ── POST /api/campaigns/:id/characters ───────────────────────────────────────
// Attach one of the caller's characters to the campaign. Returns the full
// serialized character so the frontend can swap state in one assignment.

campaignsRouter.post("/campaigns/:id/characters", async (req, res) => {
  const parseResult = attachCharacterSchema.safeParse(req.body);
  if (!parseResult.success) {
    res
      .status(400)
      .json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  const userId = req.user!.id;
  await assertCharacterAccess(prisma, userId, parseResult.data.characterId, "edit");
  await assertCampaignMembership(prisma, userId, req.params.id, "view");

  // Atomic conditional update guards against reassigning a character already in a
  // different campaign without a TOCTOU race: only a null or same-campaign FK
  // matches, so a same-campaign re-attach stays a no-op success and a
  // different-campaign attach matches nothing → count 0 → 409.
  const { count } = await prisma.character.updateMany({
    where: {
      id: parseResult.data.characterId,
      OR: [{ campaignId: null }, { campaignId: req.params.id }],
    },
    data: { campaignId: req.params.id },
  });
  if (count === 0) {
    res.status(409).json({ error: "Character already in a campaign" });
    return;
  }

  const updated = await prisma.character.findUniqueOrThrow({
    where: { id: parseResult.data.characterId },
    include: characterInclude,
  });
  res.json(serializeCharacter(updated));
});

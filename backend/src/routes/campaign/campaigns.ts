import crypto from "node:crypto";

import { Router } from "express";
import {
  attachCharacterSchema,
  createCampaignSchema,
  joinCampaignSchema,
} from "@character-sheet/contracts";

import {
  assertCampaignMembership,
  assertCampaignOwner,
  assertCharacterAccess,
} from "@/lib/auth/access.js";
import { attachCharacterUpdate } from "@/lib/campaign/campaign-attach.js";
import { deleteCampaignRows } from "@/lib/campaign/campaign-delete.js";
import { deletePortraitBlobBestEffort } from "@/lib/storage/portrait-blob.js";
import { parseBodyOr400 } from "@/lib/http/parse-body.js";
import { prisma } from "@/lib/core/prisma.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";
import { RULES_EDITION_LABELS } from "@/lib/rules/edition.js";
import { activeSessionForCampaign, getActiveSession } from "@/lib/session/sessions.js";
import type { RulesEdition } from "@character-sheet/shared-types";

// Shared-campaign backbone (#246). Plain-REST (like journal.ts): no audit log,
// no transaction-op pattern. Membership is identity state, access is gated via
// assertCampaignMembership. Mounted after requireAuth, so req.user is always set.
//
// createCampaignSchema/joinCampaignSchema/attachCharacterSchema live in
// @character-sheet/contracts (#1394) — rulesEdition is optional there (the
// Prisma column default applies when omitted); the picker at campaign
// creation is #1286, the column has carried it since #1285. Never patchable
// after creation: there is no PATCH /campaigns/:id route, so "frozen once
// set" holds by simple absence of a mutation path.

export const campaignsRouter = Router();

// Same opaque-token recipe as session.ts.
function generateInviteCode(): string {
  return crypto.randomBytes(12).toString("base64url");
}

// Every campaign row on the wire carries its resolved edition label next to the
// key (#1436, the #1322 precedent), so the client's edition badge needs neither a
// label table of its own nor a /api/editions round-trip. Applied at each
// campaign-returning res.json below — serializeCharacter carries its own, so the
// attach handler's response needs nothing here.
function withEditionLabel<T extends { rulesEdition: RulesEdition }>(row: T) {
  return { ...row, rulesEditionLabel: RULES_EDITION_LABELS[row.rulesEdition] };
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
  const data = parseBodyOr400(createCampaignSchema, req.body, res);
  if (data === undefined) return;

  const userId = req.user!.id;
  const campaign = await prisma.campaign.create({
    data: {
      name: data.name,
      // Omitted when absent so the column's own @default(EDITION_2024) applies
      // (one literal, not duplicated here).
      ...(data.rulesEdition ? { rulesEdition: data.rulesEdition } : {}),
      ownerId: userId,
      inviteCode: generateInviteCode(),
      members: { create: { userId, role: "OWNER" } },
    },
    include: campaignInclude,
  });

  res.status(201).json(withEditionLabel(campaign));
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
      ...withEditionLabel(campaign),
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

  res.json({ ...withEditionLabel(campaign), role });
});

/**
 * DELETE /api/campaigns/:id
 * Owner-only. One atomic row delete: every campaign child cascades except
 * characters, which survive detached (Character.campaignId is SetNull). 409s
 * while a session is active so a delete can't silently end live play.
 */
const ACTIVE_SESSION_CONFLICT = "End the campaign's active session before deleting it";

campaignsRouter.delete("/campaigns/:id", async (req, res) => {
  const campaignId = req.params.id;
  await assertCampaignOwner(
    prisma,
    req.user!.id,
    campaignId,
    "edit",
    "Only the campaign owner may delete the campaign",
  );

  const activeSession = await activeSessionForCampaign(campaignId);
  if (activeSession) {
    res.status(409).json({ error: ACTIVE_SESSION_CONFLICT });
    return;
  }

  const deletedEntities = await prisma.$transaction((tx) => deleteCampaignRows(tx, campaignId));
  if (deletedEntities === "activeSession") {
    res.status(409).json({ error: ACTIVE_SESSION_CONFLICT });
    return;
  }

  for (const { portraitKey } of deletedEntities) {
    await deletePortraitBlobBestEffort(portraitKey);
  }
  res.status(204).end();
});

/**
 * POST /api/campaigns/join
 * Resolve a campaign by invite code and join as PLAYER (idempotent on @@unique).
 */
campaignsRouter.post("/campaigns/join", async (req, res) => {
  const data = parseBodyOr400(joinCampaignSchema, req.body, res);
  if (data === undefined) return;

  const campaign = await prisma.campaign.findUnique({
    where: { inviteCode: data.inviteCode },
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
  res.json(withEditionLabel(joined));
});

/**
 * POST /api/campaigns/:id/characters
 * Attach one of the caller's characters to the campaign. Returns the full
 * serialized character so the frontend can swap state in one assignment.
 */
campaignsRouter.post("/campaigns/:id/characters", async (req, res) => {
  const data = parseBodyOr400(attachCharacterSchema, req.body, res);
  if (data === undefined) return;

  const userId = req.user!.id;
  const characterId = data.characterId;
  const campaignId = req.params.id;
  await assertCharacterAccess(prisma, userId, characterId, "edit");
  await assertCampaignMembership(prisma, userId, campaignId, "view");

  // Blocked join on edition mismatch (#1286): a character's rulesEdition is
  // write-once, so a mismatched campaign can never be joined, only refused —
  // there is no conversion path to offer. Checked before the solo-session
  // auto-close below so a doomed join doesn't have that side effect.
  const [character, campaign] = await Promise.all([
    prisma.character.findUniqueOrThrow({ where: { id: characterId }, select: { rulesEdition: true } }),
    prisma.campaign.findUniqueOrThrow({ where: { id: campaignId }, select: { rulesEdition: true } }),
  ]);
  if (character.rulesEdition !== campaign.rulesEdition) {
    res.status(409).json({
      error:
        `Can't join: this character uses the ${RULES_EDITION_LABELS[character.rulesEdition]}, but this campaign runs the ${RULES_EDITION_LABELS[campaign.rulesEdition]}. A character's rules edition is set at creation and can't be changed.`,
    });
    return;
  }

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

      // rulesEdition is deliberately not written here: joining a campaign never
      // converts a character's edition (write-once, #1281) — a mismatch is
      // rejected above, before this transaction, never reconciled here.
      // attachCharacterUpdate is extracted so campaign-attach.test.ts can pin
      // that guarantee directly, bypassing the guard above (see its comment).
      const { count } = await attachCharacterUpdate(tx, characterId, campaignId);
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
  res.json(await serializeCharacter(updated));
});

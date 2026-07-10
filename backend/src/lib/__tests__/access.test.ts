import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertCampaignOwner, assertCharacterAccess } from "@/lib/auth/access.js";
import { AuthorizationError, NotFoundError } from "@/lib/auth/errors.js";
import { prisma } from "@/lib/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";

// Unit test for the single character-access chokepoint. Real Postgres (no mocks)
// — it issues one findUnique. Two owners + one character owned by A.

const OWNER_A = "owner-access-a";
const OWNER_B = "owner-access-b";
const CHARACTER_ID = "test-access-character-1";

const FIXTURE = {
  id: CHARACTER_ID,
  name: "Access Test Fixture",
  alignment: "Lawful Good",
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 10, max: 10, temp: 0 },
  hitDice: { total: 1, die: "d8" },
  abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

describe("assertCharacterAccess", () => {
  beforeAll(async () => {
    await ensureTestOwner(OWNER_A);
    await ensureTestOwner(OWNER_B);
    await prisma.character.deleteMany({ where: { id: CHARACTER_ID } });
    await prisma.character.create({ data: { ...FIXTURE, ownerId: OWNER_A } });
  });

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { id: CHARACTER_ID } });
  });

  it("returns the minimal row for the owner (view)", async () => {
    const row = await assertCharacterAccess(prisma, OWNER_A, CHARACTER_ID, "view");
    expect(row).toEqual({ id: CHARACTER_ID, ownerId: OWNER_A });
  });

  it("returns the minimal row for the owner (edit)", async () => {
    const row = await assertCharacterAccess(prisma, OWNER_A, CHARACTER_ID, "edit");
    expect(row.ownerId).toBe(OWNER_A);
  });

  it("throws a 403 AuthorizationError for a non-owner", async () => {
    await expect(
      assertCharacterAccess(prisma, OWNER_B, CHARACTER_ID, "view"),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      assertCharacterAccess(prisma, OWNER_B, CHARACTER_ID, "edit"),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("throws a 404 NotFoundError for a missing character", async () => {
    await expect(
      assertCharacterAccess(prisma, OWNER_A, "does-not-exist", "view"),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      assertCharacterAccess(prisma, OWNER_A, "does-not-exist", "edit"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("works inside a $transaction client", async () => {
    const row = await prisma.$transaction((tx) =>
      assertCharacterAccess(tx, OWNER_A, CHARACTER_ID, "edit"),
    );
    expect(row.ownerId).toBe(OWNER_A);
  });
});

const CAMPAIGN_OWNER = "owner-campaign-owner";
const CAMPAIGN_PLAYER = "owner-campaign-player";
const CAMPAIGN_OUTSIDER = "owner-campaign-outsider";
const CAMPAIGN_ID = "test-owner-campaign-1";
const DENY = "Only the campaign owner may do the thing";

describe("assertCampaignOwner", () => {
  beforeAll(async () => {
    await ensureTestOwner(CAMPAIGN_OWNER);
    await ensureTestOwner(CAMPAIGN_PLAYER);
    await ensureTestOwner(CAMPAIGN_OUTSIDER);
    await prisma.campaign.deleteMany({ where: { id: CAMPAIGN_ID } });
    await prisma.campaign.create({
      data: {
        id: CAMPAIGN_ID,
        name: "Owner Guard Fixture",
        ownerId: CAMPAIGN_OWNER,
        inviteCode: `owner-guard-${Date.now()}`,
        members: {
          create: [
            { userId: CAMPAIGN_OWNER, role: "OWNER" },
            { userId: CAMPAIGN_PLAYER, role: "PLAYER" },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.campaign.deleteMany({ where: { id: CAMPAIGN_ID } });
  });

  it("returns the OWNER membership for the owner", async () => {
    const row = await assertCampaignOwner(prisma, CAMPAIGN_OWNER, CAMPAIGN_ID, "edit", DENY);
    expect(row).toEqual({ campaignId: CAMPAIGN_ID, role: "OWNER" });
  });

  it("throws a 403 with the supplied message for a non-owner member", async () => {
    await expect(
      assertCampaignOwner(prisma, CAMPAIGN_PLAYER, CAMPAIGN_ID, "edit", DENY),
    ).rejects.toMatchObject({ status: 403, message: DENY });
    await expect(
      assertCampaignOwner(prisma, CAMPAIGN_PLAYER, CAMPAIGN_ID, "edit", DENY),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("throws the membership 403 for a non-member (before the owner check)", async () => {
    await expect(
      assertCampaignOwner(prisma, CAMPAIGN_OUTSIDER, CAMPAIGN_ID, "edit", DENY),
    ).rejects.toMatchObject({ status: 403, message: "You do not have access to this campaign" });
  });

  it("throws a 404 for a missing campaign", async () => {
    await expect(
      assertCampaignOwner(prisma, CAMPAIGN_OWNER, "does-not-exist", "edit", DENY),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("works inside a $transaction client", async () => {
    const row = await prisma.$transaction((tx) =>
      assertCampaignOwner(tx, CAMPAIGN_OWNER, CAMPAIGN_ID, "view", DENY),
    );
    expect(row.role).toBe("OWNER");
  });
});

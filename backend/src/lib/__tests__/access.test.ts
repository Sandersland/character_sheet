import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertCampaignOwner, assertCharacterAccess, assertSpellOwnership } from "@/lib/auth/access.js";
import { AuthorizationError, NotFoundError } from "@/lib/auth/errors.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";

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

const SPELL_DM = "owner-spell-dm";
const SPELL_MEMBER = "owner-spell-member";
const SPELL_OUTSIDER = "owner-spell-outsider";
const SPELL_USER_OWNER = "owner-spell-user-owner";
const SPELL_CAMPAIGN_ID = "test-spell-ownership-campaign-1";

const SPELL_FIXTURE = {
  name: "Access Test Bolt",
  level: 1,
  school: "evocation" as const,
  castingTime: "1 action",
  range: "60 feet",
  duration: "Instantaneous",
  description: "A bolt of test energy.",
};

describe("assertSpellOwnership", () => {
  let userEntryId: string;
  let userSpellId: string;
  let campaignEntryId: string;
  let campaignSpellId: string;
  let globalEntryId: string;
  let globalSpellId: string;

  beforeAll(async () => {
    await ensureTestOwner(SPELL_DM);
    await ensureTestOwner(SPELL_MEMBER);
    await ensureTestOwner(SPELL_OUTSIDER);
    await ensureTestOwner(SPELL_USER_OWNER);

    await prisma.campaign.deleteMany({ where: { id: SPELL_CAMPAIGN_ID } });
    await prisma.campaign.create({
      data: {
        id: SPELL_CAMPAIGN_ID,
        name: "Spell Ownership Fixture",
        ownerId: SPELL_DM,
        inviteCode: `spell-ownership-${Date.now()}`,
        members: {
          create: [
            { userId: SPELL_DM, role: "OWNER" },
            { userId: SPELL_MEMBER, role: "PLAYER" },
          ],
        },
      },
    });

    const userEntry = await prisma.catalogEntry.create({
      data: { kind: "SPELL", scope: "USER", ownerUserId: SPELL_USER_OWNER, name: SPELL_FIXTURE.name, edition: "EDITION_2014" },
    });
    userEntryId = userEntry.id;
    userSpellId = (await prisma.spell.create({ data: { ...SPELL_FIXTURE, edition: "EDITION_2014", catalogEntryId: userEntryId } })).id;

    const campaignEntry = await prisma.catalogEntry.create({
      data: { kind: "SPELL", scope: "CAMPAIGN", ownerCampaignId: SPELL_CAMPAIGN_ID, name: SPELL_FIXTURE.name, edition: "EDITION_2014" },
    });
    campaignEntryId = campaignEntry.id;
    campaignSpellId = (await prisma.spell.create({ data: { ...SPELL_FIXTURE, edition: "EDITION_2014", catalogEntryId: campaignEntryId } })).id;

    const globalEntry = await prisma.catalogEntry.create({
      data: { kind: "SPELL", scope: "GLOBAL", name: SPELL_FIXTURE.name, edition: "EDITION_2014" },
    });
    globalEntryId = globalEntry.id;
    globalSpellId = (await prisma.spell.create({ data: { ...SPELL_FIXTURE, edition: "EDITION_2014", catalogEntryId: globalEntryId } })).id;
  });

  afterAll(async () => {
    await prisma.catalogEntry.deleteMany({ where: { id: { in: [userEntryId, campaignEntryId, globalEntryId] } } });
    await prisma.campaign.deleteMany({ where: { id: SPELL_CAMPAIGN_ID } });
    await prisma.user.deleteMany({ where: { id: { in: [SPELL_DM, SPELL_MEMBER, SPELL_OUTSIDER, SPELL_USER_OWNER] } } });
  });

  it("returns the spell for a USER entry's owner", async () => {
    const row = await assertSpellOwnership(prisma, SPELL_USER_OWNER, userSpellId);
    expect(row).toEqual({ id: userSpellId, catalogEntryId: userEntryId });
  });

  it("403s a different user's attempt on a USER entry", async () => {
    await expect(assertSpellOwnership(prisma, SPELL_OUTSIDER, userSpellId)).rejects.toMatchObject({ status: 403 });
  });

  it("returns the spell for a CAMPAIGN entry's DM", async () => {
    const row = await assertSpellOwnership(prisma, SPELL_DM, campaignSpellId);
    expect(row).toEqual({ id: campaignSpellId, catalogEntryId: campaignEntryId });
  });

  it("403s a non-DM member's attempt on a CAMPAIGN entry", async () => {
    await expect(assertSpellOwnership(prisma, SPELL_MEMBER, campaignSpellId)).rejects.toMatchObject({ status: 403 });
    await expect(assertSpellOwnership(prisma, SPELL_MEMBER, campaignSpellId)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("403s a non-member's attempt on a CAMPAIGN entry", async () => {
    await expect(assertSpellOwnership(prisma, SPELL_OUTSIDER, campaignSpellId)).rejects.toMatchObject({ status: 403 });
  });

  it("403s any caller on a GLOBAL entry, including the entry's own campaign DM", async () => {
    await expect(assertSpellOwnership(prisma, SPELL_DM, globalSpellId)).rejects.toMatchObject({ status: 403 });
    await expect(assertSpellOwnership(prisma, SPELL_OUTSIDER, globalSpellId)).rejects.toMatchObject({ status: 403 });
  });

  it("throws a 404 for a missing spell", async () => {
    await expect(assertSpellOwnership(prisma, SPELL_DM, "does-not-exist")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("works inside a $transaction client", async () => {
    const row = await prisma.$transaction((tx) => assertSpellOwnership(tx, SPELL_DM, campaignSpellId));
    expect(row.id).toBe(campaignSpellId);
  });

  // The Spell->CatalogEntry FK is ON DELETE CASCADE, so a real orphan can't be produced through ordinary writes; this fakes the lookups instead.
  it("throws a 404, not a 403, when the Spell's CatalogEntry is missing (data-integrity violation)", async () => {
    const fakeDb = {
      spell: { findUnique: async () => ({ id: "orphan-spell", catalogEntryId: "missing-entry" }) },
      catalogEntry: { findUnique: async () => null },
    } as unknown as Parameters<typeof assertSpellOwnership>[0];

    await expect(assertSpellOwnership(fakeDb, SPELL_DM, "orphan-spell")).rejects.toBeInstanceOf(NotFoundError);
    await expect(assertSpellOwnership(fakeDb, SPELL_DM, "orphan-spell")).rejects.toMatchObject({ status: 404 });
  });
});

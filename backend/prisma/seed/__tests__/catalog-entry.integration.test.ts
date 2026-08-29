import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";

const MADE_ENTRIES: string[] = [];
const MADE_SPELLS: string[] = [];
const MADE_USERS: string[] = [];
const MADE_CAMPAIGNS: string[] = [];

function entryFixture(overrides: Partial<Parameters<typeof prisma.catalogEntry.create>[0]["data"]> = {}) {
  return {
    kind: "SPELL" as const,
    scope: "GLOBAL" as const,
    name: `Catalog Entry Fixture ${randomUUID()}`,
    edition: "EDITION_2024" as const,
    ...overrides,
  };
}

async function makeCampaign(ownerId: string) {
  const campaign = await prisma.campaign.create({
    data: {
      name: "Catalog Entry Fixture Campaign",
      ownerId,
      inviteCode: randomUUID(),
      members: { create: { userId: ownerId, role: "OWNER" } },
    },
  });
  MADE_CAMPAIGNS.push(campaign.id);
  return campaign.id;
}

afterEach(async () => {
  if (MADE_SPELLS.length) {
    await prisma.spell.deleteMany({ where: { id: { in: MADE_SPELLS.splice(0) } } });
  }
  if (MADE_ENTRIES.length) {
    await prisma.catalogEntry.deleteMany({ where: { id: { in: MADE_ENTRIES.splice(0) } } });
  }
  if (MADE_CAMPAIGNS.length) {
    await prisma.campaign.deleteMany({ where: { id: { in: MADE_CAMPAIGNS.splice(0) } } });
  }
  if (MADE_USERS.length) {
    await prisma.user.deleteMany({ where: { id: { in: MADE_USERS.splice(0) } } });
  }
});

describe("CatalogEntry owner-arm-per-scope CHECK (#1796)", () => {
  it("rejects scope=USER with a null ownerUserId", async () => {
    await expect(
      prisma.catalogEntry.create({ data: entryFixture({ scope: "USER", ownerUserId: null }) }),
    ).rejects.toThrow(/CatalogEntry.*check/i);
  });

  it("rejects scope=GLOBAL with an owner arm set", async () => {
    const ownerId = `catalog-entry-owner-${randomUUID()}`;
    await ensureTestOwner(ownerId);
    MADE_USERS.push(ownerId);

    await expect(
      prisma.catalogEntry.create({ data: entryFixture({ scope: "GLOBAL", ownerUserId: ownerId }) }),
    ).rejects.toThrow(/CatalogEntry.*check/i);
  });

  it("rejects both owner arms set at once", async () => {
    const ownerId = `catalog-entry-owner-${randomUUID()}`;
    await ensureTestOwner(ownerId);
    MADE_USERS.push(ownerId);
    const campaignId = await makeCampaign(ownerId);

    await expect(
      prisma.catalogEntry.create({
        data: entryFixture({ scope: "USER", ownerUserId: ownerId, ownerCampaignId: campaignId }),
      }),
    ).rejects.toThrow(/CatalogEntry.*check/i);
  });

  it("allows scope=GLOBAL with both owner arms null", async () => {
    const entry = await prisma.catalogEntry.create({ data: entryFixture({ scope: "GLOBAL" }) });
    MADE_ENTRIES.push(entry.id);
    expect(entry.ownerUserId).toBeNull();
    expect(entry.ownerCampaignId).toBeNull();
  });

  it("allows scope=USER with only ownerUserId set", async () => {
    const ownerId = `catalog-entry-owner-${randomUUID()}`;
    await ensureTestOwner(ownerId);
    MADE_USERS.push(ownerId);

    const entry = await prisma.catalogEntry.create({
      data: entryFixture({ scope: "USER", ownerUserId: ownerId }),
    });
    MADE_ENTRIES.push(entry.id);
    expect(entry.ownerUserId).toBe(ownerId);
  });

  it("allows scope=CAMPAIGN with only ownerCampaignId set", async () => {
    const ownerId = `catalog-entry-owner-${randomUUID()}`;
    await ensureTestOwner(ownerId);
    MADE_USERS.push(ownerId);
    const campaignId = await makeCampaign(ownerId);

    const entry = await prisma.catalogEntry.create({
      data: entryFixture({ scope: "CAMPAIGN", ownerCampaignId: campaignId }),
    });
    MADE_ENTRIES.push(entry.id);
    expect(entry.ownerCampaignId).toBe(campaignId);
  });
});

describe("CatalogEntry (kind, scope, ownerUserId, ownerCampaignId, name, edition) unique — NULLS NOT DISTINCT (#1796)", () => {
  it("rejects a second GLOBAL entry sharing (name, edition)", async () => {
    const name = `Catalog Entry Unique Fixture ${randomUUID()}`;
    const first = await prisma.catalogEntry.create({ data: entryFixture({ name }) });
    MADE_ENTRIES.push(first.id);

    await expect(prisma.catalogEntry.create({ data: entryFixture({ name }) })).rejects.toMatchObject({
      code: "P2002",
    });
  });

  it("allows the same name under a different ownerUserId", async () => {
    const ownerA = `catalog-entry-owner-${randomUUID()}`;
    const ownerB = `catalog-entry-owner-${randomUUID()}`;
    await ensureTestOwner(ownerA);
    MADE_USERS.push(ownerA);
    await ensureTestOwner(ownerB);
    MADE_USERS.push(ownerB);

    const name = `Catalog Entry Shared Name ${randomUUID()}`;
    const fromA = await prisma.catalogEntry.create({
      data: entryFixture({ name, scope: "USER", ownerUserId: ownerA }),
    });
    MADE_ENTRIES.push(fromA.id);
    const fromB = await prisma.catalogEntry.create({
      data: entryFixture({ name, scope: "USER", ownerUserId: ownerB }),
    });
    MADE_ENTRIES.push(fromB.id);

    expect(fromA.id).not.toBe(fromB.id);
  });
});

describe("CatalogEntry cascade/SetNull behavior (#1796)", () => {
  it("cascade-deletes a user's USER-scope entries (and their linked Spell) when the user is deleted", async () => {
    const ownerId = `catalog-entry-owner-${randomUUID()}`;
    await ensureTestOwner(ownerId);
    MADE_USERS.push(ownerId);

    const entry = await prisma.catalogEntry.create({
      data: entryFixture({ scope: "USER", ownerUserId: ownerId }),
    });
    const spell = await prisma.spell.create({
      data: {
        name: "Catalog Cascade Fixture Spell",
        level: 1,
        school: "evocation",
        castingTime: "1 action",
        range: "30 feet",
        duration: "Instantaneous",
        description: "Cascade fixture.",
        edition: "EDITION_2014",
        catalogEntryId: entry.id,
      },
    });

    await prisma.user.delete({ where: { id: ownerId } });

    expect(await prisma.catalogEntry.findUnique({ where: { id: entry.id } })).toBeNull();
    expect(await prisma.spell.findUnique({ where: { id: spell.id } })).toBeNull();
  });

  it("deleting a CatalogEntry cascades its linked Spell", async () => {
    const entry = await prisma.catalogEntry.create({ data: entryFixture() });
    const spell = await prisma.spell.create({
      data: {
        name: "Catalog Entry Delete Fixture Spell",
        level: 1,
        school: "evocation",
        castingTime: "1 action",
        range: "30 feet",
        duration: "Instantaneous",
        description: "Delete-cascade fixture.",
        edition: "EDITION_2024",
        catalogEntryId: entry.id,
      },
    });

    await prisma.catalogEntry.delete({ where: { id: entry.id } });

    expect(await prisma.spell.findUnique({ where: { id: spell.id } })).toBeNull();
  });

  it("deleting a CatalogEntry cascades its CatalogGrant rows", async () => {
    const ownerId = `catalog-entry-owner-${randomUUID()}`;
    await ensureTestOwner(ownerId);
    MADE_USERS.push(ownerId);
    const campaignId = await makeCampaign(ownerId);

    const entry = await prisma.catalogEntry.create({ data: entryFixture() });
    const grant = await prisma.catalogGrant.create({ data: { catalogEntryId: entry.id, campaignId } });

    await prisma.catalogEntry.delete({ where: { id: entry.id } });

    expect(await prisma.catalogGrant.findUnique({ where: { id: grant.id } })).toBeNull();
  });

  it("nulls forkedFromId (fork survives) when its origin entry is deleted", async () => {
    const origin = await prisma.catalogEntry.create({ data: entryFixture() });
    const fork = await prisma.catalogEntry.create({
      data: entryFixture({ scope: "GLOBAL", forkedFromId: origin.id }),
    });

    await prisma.catalogEntry.delete({ where: { id: origin.id } });

    const survivor = await prisma.catalogEntry.findUnique({ where: { id: fork.id } });
    MADE_ENTRIES.push(fork.id);
    expect(survivor).not.toBeNull();
    expect(survivor?.forkedFromId).toBeNull();
  });
});

describe("Spell.catalogEntryId FK (ON DELETE CASCADE, #1796)", () => {
  it("rejects a Spell row pointing at a nonexistent CatalogEntry", async () => {
    await expect(
      prisma.spell.create({
        data: {
          name: "Catalog Entry FK Fixture Spell",
          level: 1,
          school: "evocation",
          castingTime: "1 action",
          range: "30 feet",
          duration: "Instantaneous",
          description: "FK fixture.",
          edition: "EDITION_2024",
          catalogEntryId: randomUUID(),
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("rejects a second Spell row reusing the same catalogEntryId (1:1)", async () => {
    const entry = await prisma.catalogEntry.create({ data: entryFixture() });
    MADE_ENTRIES.push(entry.id);
    const spell = await prisma.spell.create({
      data: {
        name: "Catalog Entry Unique FK Fixture Spell A",
        level: 1,
        school: "evocation",
        castingTime: "1 action",
        range: "30 feet",
        duration: "Instantaneous",
        description: "1:1 fixture.",
        edition: "EDITION_2024",
        catalogEntryId: entry.id,
      },
    });
    MADE_SPELLS.push(spell.id);

    await expect(
      prisma.spell.create({
        data: {
          name: "Catalog Entry Unique FK Fixture Spell B",
          level: 1,
          school: "evocation",
          castingTime: "1 action",
          range: "30 feet",
          duration: "Instantaneous",
          description: "1:1 fixture.",
          edition: "EDITION_2024",
          catalogEntryId: entry.id,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});

import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { makeCatalogEntry } from "@/test-support/catalog-entry.js";
import { ensureTestOwner } from "@/test-support/owner.js";

import {
  resolveSpellEntitlementForCharacter,
  resolveSpellEntryIdsForCharacter,
  resolveVisibleEntryIds,
  type CatalogViewer,
} from "../entitlement.js";
import type { CharacterWithRelations } from "@/lib/character/character-include.js";

// Manual monkeypatch, not vi.spyOn: Prisma model delegates don't restore cleanly through vi.spyOn's save/restore, leaving the method permanently broken for later tests.
function countCalls<T extends object, K extends keyof T>(
  target: T,
  key: K,
): { count: () => number; restore: () => void } {
  const original = target[key];
  const bound = (original as unknown as (...args: unknown[]) => unknown).bind(target);
  let calls = 0;
  target[key] = ((...args: unknown[]) => {
    calls++;
    return bound(...args);
  }) as T[K];
  return { count: () => calls, restore: () => (target[key] = original) };
}

const OWNER_USER_ID = `entitlement-owner-${randomUUID()}`;
const MEMBER_USER_ID = `entitlement-member-${randomUUID()}`;
const OUTSIDER_USER_ID = `entitlement-outsider-${randomUUID()}`;
// Must differ from OWNER_USER_ID or the origin would also rank as the viewer's own USER row, defeating this precedence case (#1797).
const ORIGIN_OWNER_USER_ID = `entitlement-origin-owner-${randomUUID()}`;

let campaignId: string;
let otherCampaignId: string;
const createdCatalogEntryIds: string[] = [];

async function fixtureEntry(overrides: Parameters<typeof makeCatalogEntry>[0]): Promise<string> {
  const id = await makeCatalogEntry({ name: `Entitlement Fixture ${randomUUID()}`, ...overrides });
  createdCatalogEntryIds.push(id);
  return id;
}

function viewer(overrides: Partial<CatalogViewer>): CatalogViewer {
  return { userId: OWNER_USER_ID, campaignId: null, edition: "EDITION_2024", ...overrides };
}

beforeAll(async () => {
  await ensureTestOwner(OWNER_USER_ID);
  await ensureTestOwner(MEMBER_USER_ID);
  await ensureTestOwner(OUTSIDER_USER_ID);
  await ensureTestOwner(ORIGIN_OWNER_USER_ID);

  const campaign = await prisma.campaign.create({
    data: { name: "Entitlement Fixture Campaign", ownerId: OWNER_USER_ID, inviteCode: randomUUID() },
    select: { id: true },
  });
  campaignId = campaign.id;

  const otherCampaign = await prisma.campaign.create({
    data: { name: "Entitlement Fixture Other Campaign", ownerId: OUTSIDER_USER_ID, inviteCode: randomUUID() },
    select: { id: true },
  });
  otherCampaignId = otherCampaign.id;
});

afterAll(async () => {
  // CatalogGrant cascades off catalogEntry deletion, but a GLOBAL fixture row has no owner to cascade off — delete CatalogEntry rows explicitly first.
  await prisma.catalogEntry.deleteMany({ where: { id: { in: createdCatalogEntryIds } } });
  await prisma.campaign.deleteMany({ where: { id: { in: [campaignId, otherCampaignId] } } });
  await prisma.user.deleteMany({
    where: { id: { in: [OWNER_USER_ID, MEMBER_USER_ID, OUTSIDER_USER_ID, ORIGIN_OWNER_USER_ID] } },
  });
});

describe("resolveVisibleEntryIds (#1797)", () => {
  it("a GLOBAL entry is visible for its own edition and excluded for the other edition", async () => {
    const global2024 = await fixtureEntry({ scope: "GLOBAL", edition: "EDITION_2024" });
    const global2014 = await fixtureEntry({ scope: "GLOBAL", edition: "EDITION_2014" });

    const visible2024 = await resolveVisibleEntryIds("SPELL", viewer({ edition: "EDITION_2024" }));
    expect(visible2024).toContain(global2024);
    expect(visible2024).not.toContain(global2014);

    const visible2014 = await resolveVisibleEntryIds("SPELL", viewer({ edition: "EDITION_2014" }));
    expect(visible2014).toContain(global2014);
    expect(visible2014).not.toContain(global2024);
  });

  it("a USER entry is visible to its owner in any campaign and with no campaign, never to another user", async () => {
    const userEntry = await fixtureEntry({ scope: "USER", ownerUserId: OWNER_USER_ID });

    const noCampaign = await resolveVisibleEntryIds("SPELL", viewer({ userId: OWNER_USER_ID, campaignId: null }));
    expect(noCampaign).toContain(userEntry);

    const inACampaign = await resolveVisibleEntryIds(
      "SPELL",
      viewer({ userId: OWNER_USER_ID, campaignId }),
    );
    expect(inACampaign).toContain(userEntry);

    const otherUser = await resolveVisibleEntryIds(
      "SPELL",
      viewer({ userId: MEMBER_USER_ID, campaignId: null }),
    );
    expect(otherUser).not.toContain(userEntry);
  });

  it("a granted USER entry is visible to a member only — not without the grant, not to a non-member", async () => {
    const userEntry = await fixtureEntry({ scope: "USER", ownerUserId: OWNER_USER_ID });

    const beforeGrant = await resolveVisibleEntryIds(
      "SPELL",
      viewer({ userId: MEMBER_USER_ID, campaignId }),
    );
    expect(beforeGrant).not.toContain(userEntry);

    await prisma.catalogGrant.create({ data: { catalogEntryId: userEntry, campaignId } });

    const afterGrant = await resolveVisibleEntryIds(
      "SPELL",
      viewer({ userId: MEMBER_USER_ID, campaignId }),
    );
    expect(afterGrant).toContain(userEntry);

    const nonMember = await resolveVisibleEntryIds(
      "SPELL",
      viewer({ userId: OUTSIDER_USER_ID, campaignId: otherCampaignId }),
    );
    expect(nonMember).not.toContain(userEntry);
  });

  it("a CAMPAIGN entry is visible only to characters in that campaign", async () => {
    const campaignEntry = await fixtureEntry({ scope: "CAMPAIGN", ownerCampaignId: campaignId });

    const inCampaign = await resolveVisibleEntryIds("SPELL", viewer({ campaignId }));
    expect(inCampaign).toContain(campaignEntry);

    const inOtherCampaign = await resolveVisibleEntryIds("SPELL", viewer({ campaignId: otherCampaignId }));
    expect(inOtherCampaign).not.toContain(campaignEntry);

    const noCampaign = await resolveVisibleEntryIds("SPELL", viewer({ campaignId: null }));
    expect(noCampaign).not.toContain(campaignEntry);
  });

  describe("the full precedence case: origin O, DM CAMPAIGN fork D, player USER fork P", () => {
    // Parameterized over the origin's own scope (#1797): ranking by abstract scope alone passes the GLOBAL case by accident but gets a granted USER origin backwards, so both must be exercised through the same precedence.
    // originAlwaysVisible: GLOBAL is visible everywhere for its edition; a granted USER origin is visible only inside the campaign it was granted into.
    const originVariants: Array<{
      label: string;
      makeOrigin: () => Promise<string>;
      originAlwaysVisible: boolean;
    }> = [
      {
        label: "a GLOBAL origin",
        makeOrigin: () => fixtureEntry({ scope: "GLOBAL" }),
        originAlwaysVisible: true,
      },
      {
        label: "a shared USER origin granted into the campaign",
        makeOrigin: async () => {
          const id = await fixtureEntry({ scope: "USER", ownerUserId: ORIGIN_OWNER_USER_ID });
          await prisma.catalogGrant.create({ data: { catalogEntryId: id, campaignId } });
          return id;
        },
        originAlwaysVisible: false,
      },
    ];

    it.each(originVariants)(
      "resolves USER fork > CAMPAIGN fork > origin per viewer, for $label",
      async ({ makeOrigin, originAlwaysVisible }) => {
        const origin = await makeOrigin();
        const campaignFork = await fixtureEntry({ scope: "CAMPAIGN", ownerCampaignId: campaignId, forkedFromId: origin });
        const userFork = await fixtureEntry({ scope: "USER", ownerUserId: OWNER_USER_ID, forkedFromId: origin });

        const ownerInCampaign = await resolveVisibleEntryIds("SPELL", viewer({ userId: OWNER_USER_ID, campaignId }));
        expect(ownerInCampaign).toContain(userFork);
        expect(ownerInCampaign).not.toContain(campaignFork);
        expect(ownerInCampaign).not.toContain(origin);

        const otherMemberInCampaign = await resolveVisibleEntryIds(
          "SPELL",
          viewer({ userId: MEMBER_USER_ID, campaignId }),
        );
        expect(otherMemberInCampaign).toContain(campaignFork);
        expect(otherMemberInCampaign).not.toContain(origin);
        expect(otherMemberInCampaign).not.toContain(userFork);

        const ownerOutsideCampaign = await resolveVisibleEntryIds(
          "SPELL",
          viewer({ userId: OWNER_USER_ID, campaignId: null }),
        );
        expect(ownerOutsideCampaign).toContain(userFork);
        expect(ownerOutsideCampaign).not.toContain(campaignFork);
        expect(ownerOutsideCampaign).not.toContain(origin);

        const outsiderOutsideCampaign = await resolveVisibleEntryIds(
          "SPELL",
          viewer({ userId: OUTSIDER_USER_ID, campaignId: null }),
        );
        if (originAlwaysVisible) expect(outsiderOutsideCampaign).toContain(origin);
        else expect(outsiderOutsideCampaign).not.toContain(origin);
        expect(outsiderOutsideCampaign).not.toContain(userFork);
        expect(outsiderOutsideCampaign).not.toContain(campaignFork);
      },
    );
  });

  it("a fork whose origin was deleted resolves independently, without crashing", async () => {
    const origin = await fixtureEntry({ scope: "GLOBAL" });
    const fork = await fixtureEntry({ scope: "USER", ownerUserId: OWNER_USER_ID, forkedFromId: origin });

    // onDelete: SetNull — deleting the origin nulls the fork's forkedFromId rather than cascading, so the fork survives as its own lineage root.
    await prisma.catalogEntry.delete({ where: { id: origin } });
    createdCatalogEntryIds.splice(createdCatalogEntryIds.indexOf(origin), 1);

    const result = await resolveVisibleEntryIds("SPELL", viewer({ userId: OWNER_USER_ID, campaignId: null }));
    expect(result).toContain(fork);
  });

  // Both nodes share rank 3 for this viewer — collapsing to one winner is the only way this test catches a failure to group them (#1815 finding 4).
  it("a 2-node forkedFromId cycle (data-integrity violation) still resolves to exactly one winner, deterministically", async () => {
    const nodeA = await fixtureEntry({ scope: "USER", ownerUserId: OWNER_USER_ID });
    const nodeB = await fixtureEntry({ scope: "USER", ownerUserId: OWNER_USER_ID, forkedFromId: nodeA });
    // Forces the cycle directly — forkContent's own DAG invariant would never produce this through normal use.
    await prisma.catalogEntry.update({ where: { id: nodeA }, data: { forkedFromId: nodeB } });

    const visible = await resolveVisibleEntryIds("SPELL", viewer({ userId: OWNER_USER_ID, campaignId: null }));
    const winners = visible.filter((id) => id === nodeA || id === nodeB);
    expect(winners).toHaveLength(1);
  });
});

// Pins exactly one CatalogEntry read for the candidate set — this is what makes a split-brain response impossible, not merely unlikely (#1815 finding 3).
describe("resolveSpellEntitlementForCharacter (#1815 review finding 3: single-snapshot resolution)", () => {
  function fakeCharacter(overrides: {
    ownerId: string;
    campaignId: string | null;
    rulesEdition: "EDITION_2014" | "EDITION_2024";
  }): CharacterWithRelations {
    return overrides as unknown as CharacterWithRelations;
  }

  it("resolves META and MECHANICS from a single fetchCandidates (CatalogEntry.findMany) call", async () => {
    await fixtureEntry({ scope: "GLOBAL", edition: "EDITION_2024" });

    const findMany = countCalls(prisma.catalogEntry, "findMany");
    try {
      const character = fakeCharacter({ ownerId: OWNER_USER_ID, campaignId: null, rulesEdition: "EDITION_2024" });
      const { metaByEntryId, mechanicsByEntryId } = await resolveSpellEntitlementForCharacter(character);
      expect(metaByEntryId).toBeInstanceOf(Map);
      expect(mechanicsByEntryId).toBeInstanceOf(Map);
      expect(findMany.count()).toBe(1);
    } finally {
      findMany.restore();
    }
  });
});

describe("resolveSpellEntryIdsForCharacter (#1797)", () => {
  function fakeCharacter(overrides: {
    ownerId: string;
    campaignId: string | null;
    rulesEdition: "EDITION_2014" | "EDITION_2024";
  }): CharacterWithRelations {
    return overrides as unknown as CharacterWithRelations;
  }

  it("derives the viewer from the character's ownerId/campaignId/rulesEdition and resolves through the same rule", async () => {
    const global2024 = await fixtureEntry({ scope: "GLOBAL", edition: "EDITION_2024" });
    const ownEntry = await fixtureEntry({ scope: "USER", ownerUserId: OWNER_USER_ID, edition: "EDITION_2024" });

    const character = fakeCharacter({ ownerId: OWNER_USER_ID, campaignId, rulesEdition: "EDITION_2024" });
    const result = await resolveSpellEntryIdsForCharacter(character);

    expect(result).toContain(global2024);
    expect(result).toContain(ownEntry);
  });
});

// Resolver tests for the entitlement precedence rule (#1797, epic #1795 2/6)
// — generalizes item-scope-shadowing.test.ts's (#1645/#1646) CAMPAIGN-Item
// shadow guard to the full GLOBAL/USER/CAMPAIGN/grant/fork lattice. Exercises
// resolveVisibleEntryIds directly against real CatalogEntry rows rather than
// through a route: no route consumes the resolver yet (that's slice 3).
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { makeCatalogEntry } from "@/test-support/catalog-entry.js";
import { ensureTestOwner } from "@/test-support/owner.js";

import { resolveSpellEntryIdsForCharacter, resolveVisibleEntryIds, type CatalogViewer } from "../entitlement.js";
import type { CharacterWithRelations } from "@/lib/character/character-include.js";

const OWNER_USER_ID = `entitlement-owner-${randomUUID()}`;
const MEMBER_USER_ID = `entitlement-member-${randomUUID()}`;
const OUTSIDER_USER_ID = `entitlement-outsider-${randomUUID()}`;

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
  // CatalogEntry rows first: CatalogGrant cascades off catalogEntry deletion,
  // but a GLOBAL fixture row has no owner to cascade off, so this file cleans
  // up its own rows explicitly rather than relying on the user/campaign
  // deletes below.
  await prisma.catalogEntry.deleteMany({ where: { id: { in: createdCatalogEntryIds } } });
  await prisma.campaign.deleteMany({ where: { id: { in: [campaignId, otherCampaignId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [OWNER_USER_ID, MEMBER_USER_ID, OUTSIDER_USER_ID] } } });
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
    it("resolves USER fork > CAMPAIGN fork > origin per viewer, and never shadows GLOBAL out of scope", async () => {
      const origin = await fixtureEntry({ scope: "GLOBAL" });
      const campaignFork = await fixtureEntry({ scope: "CAMPAIGN", ownerCampaignId: campaignId, forkedFromId: origin });
      const userFork = await fixtureEntry({ scope: "USER", ownerUserId: OWNER_USER_ID, forkedFromId: origin });

      // Owner's own character, in the campaign: their USER fork wins over
      // both the DM's CAMPAIGN fork and the origin.
      const ownerInCampaign = await resolveVisibleEntryIds("SPELL", viewer({ userId: OWNER_USER_ID, campaignId }));
      expect(ownerInCampaign).toContain(userFork);
      expect(ownerInCampaign).not.toContain(campaignFork);
      expect(ownerInCampaign).not.toContain(origin);

      // A different campaign member sees the DM's CAMPAIGN fork, not the
      // origin and not the other player's private USER fork.
      const otherMemberInCampaign = await resolveVisibleEntryIds(
        "SPELL",
        viewer({ userId: MEMBER_USER_ID, campaignId }),
      );
      expect(otherMemberInCampaign).toContain(campaignFork);
      expect(otherMemberInCampaign).not.toContain(origin);
      expect(otherMemberInCampaign).not.toContain(userFork);

      // Outside the campaign, the fork's own owner still resolves their USER
      // fork (it travels with them) — the CAMPAIGN fork is invisible there.
      const ownerOutsideCampaign = await resolveVisibleEntryIds(
        "SPELL",
        viewer({ userId: OWNER_USER_ID, campaignId: null }),
      );
      expect(ownerOutsideCampaign).toContain(userFork);
      expect(ownerOutsideCampaign).not.toContain(campaignFork);
      expect(ownerOutsideCampaign).not.toContain(origin);

      // Outside the campaign, anyone else falls all the way back to the
      // GLOBAL origin — it is never shadowed away for a viewer outside the
      // fork's scope.
      const outsiderOutsideCampaign = await resolveVisibleEntryIds(
        "SPELL",
        viewer({ userId: OUTSIDER_USER_ID, campaignId: null }),
      );
      expect(outsiderOutsideCampaign).toContain(origin);
      expect(outsiderOutsideCampaign).not.toContain(userFork);
      expect(outsiderOutsideCampaign).not.toContain(campaignFork);
    });
  });

  it("a fork whose origin was deleted resolves independently, without crashing", async () => {
    const origin = await fixtureEntry({ scope: "GLOBAL" });
    const fork = await fixtureEntry({ scope: "USER", ownerUserId: OWNER_USER_ID, forkedFromId: origin });

    // onDelete: SetNull — deleting the origin nulls the fork's forkedFromId
    // rather than cascading, so the fork survives as its own lineage root.
    await prisma.catalogEntry.delete({ where: { id: origin } });
    createdCatalogEntryIds.splice(createdCatalogEntryIds.indexOf(origin), 1);

    const result = await resolveVisibleEntryIds("SPELL", viewer({ userId: OWNER_USER_ID, campaignId: null }));
    expect(result).toContain(fork);
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

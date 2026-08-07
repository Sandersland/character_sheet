import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { forkContent } from "@/lib/catalog/fork.js";
import { NotFoundError } from "@/lib/auth/errors.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";

// forkContent (#1800, epic #1795 5/6): the deep-copy mechanics underneath the
// fork route (routes/catalog/__tests__/fork.test.ts covers auth/HTTP). This
// file exercises the SPELL kind-dispatch directly against real Postgres.

const FORKER = "owner-fork-lib-forker";
const CAMPAIGN_OWNER = "owner-fork-lib-campaign-owner";

let originEntryId: string;
let originSpellId: string;
let campaignId: string;

beforeAll(async () => {
  await ensureTestOwner(FORKER);
  await ensureTestOwner(CAMPAIGN_OWNER);

  const campaign = await prisma.campaign.create({
    data: { name: "Fork Lib Campaign", ownerId: CAMPAIGN_OWNER, inviteCode: "fork-lib-invite" },
  });
  campaignId = campaign.id;

  const originEntry = await prisma.catalogEntry.create({
    data: { kind: "SPELL", scope: "USER", ownerUserId: CAMPAIGN_OWNER, name: "Fork Lib Origin", edition: "EDITION_2014" },
  });
  originEntryId = originEntry.id;

  const originSpell = await prisma.spell.create({
    data: {
      name: "Fork Lib Origin",
      level: 3,
      school: "evocation",
      castingTime: "1 action",
      range: "60 feet",
      duration: "Instantaneous",
      description: "A test spell to fork.",
      concentration: false,
      ritual: false,
      components: { verbal: true, somatic: true, material: false },
      effectKind: "damage",
      effectDiceCount: 4,
      effectDiceFaces: 6,
      damageType: "fire",
      attackType: "save",
      saveAbility: "dexterity",
      saveEffect: "half",
      upcastDicePerLevel: 1,
      cantripScaling: false,
      edition: "EDITION_2014",
      catalogEntryId: originEntry.id,
      classMemberships: { create: [{ className: "wizard" }, { className: "sorcerer" }] },
    },
  });
  originSpellId = originSpell.id;
});

afterAll(async () => {
  await prisma.catalogEntry.deleteMany({ where: { ownerUserId: { in: [FORKER, CAMPAIGN_OWNER] } } });
  await prisma.catalogEntry.deleteMany({ where: { ownerCampaignId: campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [FORKER, CAMPAIGN_OWNER] } } });
});

describe("forkContent (SPELL)", () => {
  it("deep-copies entry + Spell mechanics + SpellClass rows into a new USER-scope entry, leaving the origin untouched", async () => {
    const { entry, spell, classes } = await forkContent("SPELL", originEntryId, {
      scope: "USER",
      ownerUserId: FORKER,
    });

    expect(entry.id).not.toBe(originEntryId);
    expect(entry.forkedFromId).toBe(originEntryId);
    expect(entry.scope).toBe("USER");
    expect(entry.ownerUserId).toBe(FORKER);
    expect(entry.ownerCampaignId).toBeNull();
    expect(entry.name).toBe("Fork Lib Origin");
    expect(entry.edition).toBe("EDITION_2014");

    expect(spell.id).not.toBe(originSpellId);
    expect(spell.catalogEntryId).toBe(entry.id);
    expect(spell).toMatchObject({
      name: "Fork Lib Origin",
      level: 3,
      school: "evocation",
      castingTime: "1 action",
      range: "60 feet",
      duration: "Instantaneous",
      description: "A test spell to fork.",
      concentration: false,
      ritual: false,
      effectKind: "damage",
      effectDiceCount: 4,
      effectDiceFaces: 6,
      damageType: "fire",
      attackType: "save",
      saveAbility: "dexterity",
      saveEffect: "half",
      upcastDicePerLevel: 1,
      cantripScaling: false,
      edition: "EDITION_2014",
    });
    expect(spell.components).toEqual({ verbal: true, somatic: true, material: false });

    expect(classes.sort()).toEqual(["sorcerer", "wizard"]);
    const copiedClasses = await prisma.spellClass.findMany({ where: { spellId: spell.id } });
    expect(copiedClasses.map((c) => c.className).sort()).toEqual(["sorcerer", "wizard"]);

    const origin = await prisma.catalogEntry.findUniqueOrThrow({ where: { id: originEntryId } });
    expect(origin.scope).toBe("USER");
    expect(origin.forkedFromId).toBeNull();
    const originStillHasClasses = await prisma.spellClass.findMany({ where: { spellId: originSpellId } });
    expect(originStillHasClasses.map((c) => c.className).sort()).toEqual(["sorcerer", "wizard"]);
  });

  it("deep-copies into a new CAMPAIGN-scope entry", async () => {
    const { entry, spell } = await forkContent("SPELL", originEntryId, {
      scope: "CAMPAIGN",
      ownerCampaignId: campaignId,
    });

    expect(entry.scope).toBe("CAMPAIGN");
    expect(entry.ownerCampaignId).toBe(campaignId);
    expect(entry.ownerUserId).toBeNull();
    expect(entry.forkedFromId).toBe(originEntryId);
    expect(spell.catalogEntryId).toBe(entry.id);
  });

  it("throws NotFoundError for an entryId that doesn't exist", async () => {
    await expect(
      forkContent("SPELL", "does-not-exist", { scope: "USER", ownerUserId: FORKER }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

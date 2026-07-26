import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";

import { prisma } from "@/lib/core/prisma.js";
import { attachCharacterUpdate } from "@/lib/campaign/campaign-attach.js";
import { ensureTestOwner } from "@/test-support/owner.js";

// #1286: the route's edition-mismatch guard reads fresh DB state on every
// request, so a mismatched pair can never reach this write through the real
// HTTP endpoint — that's exactly why a same-edition regression pin can never
// detect a converting write injected here. This test calls the extracted
// function DIRECTLY, seeding a DB-level mismatch, bypassing the guard entirely
// (it never touches the route or supertest) so the pin exercises exactly the
// line a converting write would live on.
const OWNER_ID = "owner-campaign-attach";
let CHARACTER_ID: string;
let CAMPAIGN_ID: string;

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);

  const character = await prisma.character.create({
    data: {
      name: "Attach Pin Character",
      alignment: "True Neutral",
      ownerId: OWNER_ID,
      initiativeBonus: 0,
      speed: 30,
      hitPoints: { current: 10, max: 10, temp: 0 },
      hitDice: { total: 1, die: "d8" },
      abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
      savingThrowProficiencies: [],
      skills: [],
      toolProficiencies: [],
      currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
      rulesEdition: "EDITION_2014",
    },
  });
  CHARACTER_ID = character.id;

  const campaign = await prisma.campaign.create({
    data: {
      name: "Attach Pin Campaign",
      ownerId: OWNER_ID,
      inviteCode: crypto.randomBytes(12).toString("base64url"),
      rulesEdition: "EDITION_2024",
    },
  });
  CAMPAIGN_ID = campaign.id;
});

afterAll(async () => {
  await prisma.character.deleteMany({ where: { id: CHARACTER_ID } });
  await prisma.campaign.deleteMany({ where: { id: CAMPAIGN_ID } });
  await prisma.user.deleteMany({ where: { id: OWNER_ID } });
});

describe("attachCharacterUpdate (#1286)", () => {
  it("sets campaignId only — a DB-seeded mismatched pair's rulesEdition survives unchanged", async () => {
    // The seeded pair disagrees (2014 vs 2024); the route's guard would 409
    // this exact pair. Calling the function directly skips that guard.
    await prisma.$transaction((tx) => attachCharacterUpdate(tx, CHARACTER_ID, CAMPAIGN_ID));

    const after = await prisma.character.findUniqueOrThrow({
      where: { id: CHARACTER_ID },
      select: { rulesEdition: true, campaignId: true },
    });
    expect(after.campaignId).toBe(CAMPAIGN_ID);
    expect(after.rulesEdition).toBe("EDITION_2014");
  });
});

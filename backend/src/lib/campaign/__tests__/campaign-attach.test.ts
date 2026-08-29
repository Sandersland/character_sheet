import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";

import { prisma } from "@/lib/core/prisma.js";
import { attachCharacterUpdate } from "@/lib/campaign/campaign-attach.js";
import { ensureTestOwner } from "@/test-support/owner.js";

// Calls attachCharacterUpdate directly, bypassing the route's edition-mismatch guard (which reads fresh DB state and would 409 this pair) — the only way to exercise this line with a mismatched pair.
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
    await prisma.$transaction((tx) => attachCharacterUpdate(tx, CHARACTER_ID, CAMPAIGN_ID));

    const after = await prisma.character.findUniqueOrThrow({
      where: { id: CHARACTER_ID },
      select: { rulesEdition: true, campaignId: true },
    });
    expect(after.campaignId).toBe(CAMPAIGN_ID);
    expect(after.rulesEdition).toBe("EDITION_2014");
  });
});

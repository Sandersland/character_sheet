import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { applySpellcastingOperations } from "@/lib/spellcasting/spellcasting.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-revert-matrix";
let COOKIE: string;

const BASE = {
  alignment: "Neutral",
  initiativeBonus: 0,
  speed: 30,
  abilityScores: { strength: 10, dexterity: 14, constitution: 12, intelligence: 16, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
});
afterEach(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "RevertMatrix" } } });
});
afterAll(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "RevertMatrix" } } });
});

async function post(url: string, body: object) {
  return supertest(app).post(url).set("Cookie", COOKIE).send(body);
}
async function getChar(id: string) {
  return (await supertest(app).get(`/api/characters/${id}`).set("Cookie", COOKIE)).body;
}
async function latestBatchId(id: string): Promise<string> {
  const act = await supertest(app).get(`/api/characters/${id}/activity`).set("Cookie", COOKIE);
  return act.body[0].batchId;
}

async function createWizard(id: string) {
  return prisma.character.create({
    data: {
      ...BASE, ownerId: OWNER_ID, id, name: `RevertMatrix ${id}`,
      experiencePoints: 900,
      hitPoints: { current: 20, max: 20, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: 3, die: "d6", spent: 0 },
      spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
      classEntries: { create: [{ name: "wizard", position: 0, level: 3 }] },
    },
  });
}

describe("revert-matrix — reverseEvent per-category undo (#615)", () => {
  it("conditions: undo restores the prior conditions + exhaustion snapshot", async () => {
    await createWizard("rm-conditions");
    const url = `/api/characters/rm-conditions/conditions/transactions`;
    const applied = await post(url, { operations: [{ type: "applyCondition", key: "prone" }, { type: "setExhaustion", level: 2 }] });
    expect(applied.status).toBe(200);
    expect(applied.body.conditions.active.map((c: { key: string }) => c.key)).toContain("prone");
    expect(applied.body.conditions.exhaustion).toBe(2);

    const batchId = await latestBatchId("rm-conditions");
    const rev = await post(`/api/characters/rm-conditions/events/${batchId}/revert`, {});
    expect(rev.status).toBe(200);

    const after = await getChar("rm-conditions");
    expect(after.conditions).toEqual({ active: [], exhaustion: 0, suspended: [] });
  });

  // PHB'14 p.291 tier 4: setExhaustion's HP clamp is a one-way write in the same event — undo must restore both exhaustion and the pre-clamp current HP.
  it("conditions: undo of a setExhaustion that halved the max ALSO restores the pre-clamp current HP", async () => {
    await prisma.character.create({
      data: {
        alignment: "Neutral",
        initiativeBonus: 0,
        speed: 30,
        abilityScores: { strength: 10, dexterity: 14, constitution: 12, intelligence: 16, wisdom: 10, charisma: 10 },
        savingThrowProficiencies: [],
        skills: [],
        toolProficiencies: [],
        currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
        ownerId: OWNER_ID,
        id: "rm-conditions-hp",
        name: "RevertMatrix rm-conditions-hp",
        rulesEdition: "EDITION_2014",
        experiencePoints: 900,
        hitPoints: { current: 25, max: 30, temp: 0, deathSaves: { successes: 0, failures: 0 } },
        hitDice: { total: 3, die: "d6", spent: 0 },
        spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
        classEntries: { create: [{ name: "wizard", position: 0, level: 3 }] },
      },
    });

    const url = `/api/characters/rm-conditions-hp/conditions/transactions`;
    const applied = await post(url, { operations: [{ type: "setExhaustion", level: 4 }] });
    expect(applied.status).toBe(200);
    expect(applied.body.hitPoints.max).toBe(15);
    expect(applied.body.hitPoints.current).toBe(15);

    const batchId = await latestBatchId("rm-conditions-hp");
    const rev = await post(`/api/characters/rm-conditions-hp/events/${batchId}/revert`, {});
    expect(rev.status).toBe(200);

    const after = await getChar("rm-conditions-hp");
    expect(after.conditions.exhaustion).toBe(0);
    expect(after.hitPoints.max).toBe(30);
    expect(after.hitPoints.current).toBe(25); // pre-clamp current restored, not left at 15
  });

  it("effects: undo of a buff cast restores activeEffects (Mage Armor removed)", async () => {
    await createWizard("rm-effects");
    // Mage Armor forked to EDITION_2014 too (#1714); pinned to 2024 here so a future edition divergence can't silently slip through this fixture.
    const spell = await prisma.spell.findFirstOrThrow({ where: { name: "Mage Armor", edition: "EDITION_2024" } });
    await applySpellcastingOperations("rm-effects", [{ type: "learnSpell", spellId: spell.id }], OWNER_ID);
    const row = await prisma.character.findUniqueOrThrow({ where: { id: "rm-effects" }, select: { spellcasting: true } });
    const entryId = (row.spellcasting as { spells: { id: string; spellId?: string }[] }).spells.find((s) => s.spellId === spell.id)!.id;
    await applySpellcastingOperations("rm-effects", [{ type: "castSpell", entryId, roll: 0 }], OWNER_ID);

    const buffed = await getChar("rm-effects");
    expect(buffed.armorClassBreakdown).toEqual(expect.arrayContaining([{ label: "Mage Armor", value: 13 }]));

    const batchId = await latestBatchId("rm-effects");
    const rev = await post(`/api/characters/rm-effects/events/${batchId}/revert`, {});
    expect(rev.status).toBe(200);

    const after = await getChar("rm-effects");
    expect(after.armorClassBreakdown).toEqual(expect.arrayContaining([{ label: "Unarmored", value: 10 }]));
    expect(after.armorClassBreakdown).not.toEqual(expect.arrayContaining([{ label: "Mage Armor", value: 13 }]));
    expect(after.activeEffects).toEqual({ buffs: [] });
  });
});

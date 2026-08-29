

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-maneuvers-multiclass-1072";
let COOKIE: string;
const FIXTURE_ID = "test-maneuvers-multiclass-1072";

// Fighter's OWN entry-scoped level (3) drives the superiority pool and maneuver save DC, not the total character level (5).
const FIXTURE_BASE = {
  id: FIXTURE_ID,
  name: "Maneuvers Multiclass Test",
  alignment: "Chaotic Neutral",
  experiencePoints: 6500,
  initiativeBonus: 2,
  speed: 30,
  hitPoints: { current: 30, max: 30, temp: 0 },
  hitDice: { total: 5, die: "d10" },
  abilityScores: { strength: 14, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

function agent() {
  return supertest.agent(app).set("Cookie", COOKIE);
}
const resourcesUrl = `/api/characters/${FIXTURE_ID}/resources/transactions`;
const maneuversUrl = `/api/characters/${FIXTURE_ID}/abilities/maneuvers/transactions`;

describe("castManeuver — Battle Master as a SECONDARY class entry (#1072)", () => {
  let tripId: string;

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    tripId = (await prisma.grantedAbility.findFirst({ where: { name: "Trip Attack" } }))!.id;
    // #1524: production always pairs classId/subclassId with the subclass string; resolved here from the real seeded catalog rows so the fixture matches that shape.
    const rogueId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Rogue" } })).id;
    const fighterId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } })).id;
    const battleMasterId = (await prisma.subclass.findFirstOrThrow({ where: { classId: fighterId, name: "Battle Master" } })).id;
    await prisma.character.create({
      data: {
        ...FIXTURE_BASE,
        ownerId: OWNER_ID,
        resources: Prisma.JsonNull,
        classEntries: {
          create: [
            { name: "rogue", classId: rogueId, position: 0, level: 2 },
            { name: "fighter", subclass: "battle master", subclassId: battleMasterId, classId: fighterId, position: 1, level: 3 },
          ],
        },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });

  it("spends and recovers a superiority die, DC derived from the fighter entry's own level", async () => {
    const learnRes = await agent().post(resourcesUrl).send({ operations: [{ type: "learnManeuver", maneuverId: tripId }] });
    expect(learnRes.status).toBe(200);
    const entry = learnRes.body.resources.maneuversKnown.at(-1);

    const res = await agent().post(maneuversUrl).send({ operations: [{ type: "castManeuver", entryId: entry.id }] });
    expect(res.status).toBe(200);
    const result = res.body.results[0];
    expect(result.saveDc).toBe(14);
    expect(result.roll).toBeGreaterThanOrEqual(1);
    expect(result.roll).toBeLessThanOrEqual(8);

    const pool = res.body.character.resources.pools.find((p: { key: string }) => p.key === "superiorityDice");
    expect(pool.total).toBe(4);
    expect(pool.remaining).toBe(3);
  });
});

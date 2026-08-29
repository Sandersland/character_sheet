// applyResourceOpInTx must derive each choice cap (e.g. maneuverChoiceCount) from the entry that grants it, not classEntries[0] (the primary) at total level (#1177).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-resource-caps-mc";
let COOKIE: string;

function agent() {
  return supertest.agent(app).set("Cookie", COOKIE);
}

const BASE = {
  alignment: "True Neutral",
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 50, max: 50, temp: 0 },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

describe("entry-scoped resource-op caps — multiclass (#1177)", () => {
  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
  });

  describe("wizard 7 (primary) / Battle Master fighter 3 (secondary) — maneuver cap", () => {
    const CHAR_ID = "test-1177-mc-maneuvers";
    const resourcesUrl = `/api/characters/${CHAR_ID}/resources/transactions`;

    beforeEach(async () => {
      const wizard = await prisma.characterClass.findFirstOrThrow({ where: { name: "Wizard" } });
      const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
      // Production always sets subclassId alongside the subclass string; resolved here so this fixture matches that shape (#1524).
      const evocation = await prisma.subclass.findFirstOrThrow({ where: { classId: wizard.id, name: "School of Evocation" } });
      const battleMaster = await prisma.subclass.findFirstOrThrow({ where: { classId: fighter.id, name: "Battle Master" } });
      await prisma.character.create({
        data: {
          ...BASE,
          id: CHAR_ID,
          name: "Res Caps MC Maneuvers",
          ownerId: OWNER_ID,
          experiencePoints: 64000,
          hitDice: { total: 10, die: "d8", spent: 0 },
          abilityScores: { strength: 14, dexterity: 12, constitution: 14, intelligence: 16, wisdom: 10, charisma: 10 },
          spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
          resources: Prisma.JsonNull,
          classEntries: {
            create: [
              { name: "wizard", subclass: "School of Evocation", subclassId: evocation.id, classId: wizard.id, position: 0, level: 7 },
              { name: "fighter", subclass: "Battle Master", subclassId: battleMaster.id, classId: fighter.id, position: 1, level: 3 },
            ],
          },
        },
      });
    });

    afterEach(async () => {
      await prisma.character.deleteMany({ where: { id: CHAR_ID } });
    });

    it("caps learnManeuver at the SECONDARY fighter entry's own level-3 count (3), not unbounded from the wizard primary", async () => {
      const maneuvers = await prisma.grantedAbility.findMany({ where: { source: "maneuver" }, take: 4, select: { id: true } });
      expect(maneuvers).toHaveLength(4);

      for (const m of maneuvers.slice(0, 3)) {
        const res = await agent().post(resourcesUrl).send({ operations: [{ type: "learnManeuver", maneuverId: m.id }] });
        expect(res.status).toBe(200);
      }
      const afterThree = await agent().get(`/api/characters/${CHAR_ID}`);
      expect(afterThree.body.resources.maneuversKnown).toHaveLength(3);
      // maneuverChoiceCount read-side clamp is buildResourcesView's job (#1177) — this test only pins the write-side cap.

      const fourth = await agent().post(resourcesUrl).send({ operations: [{ type: "learnManeuver", maneuverId: maneuvers[3].id }] });
      expect(fourth.status).toBe(400);

      const final = await agent().get(`/api/characters/${CHAR_ID}`);
      expect(final.body.resources.maneuversKnown).toHaveLength(3);
    });
  });

  describe("wizard 7 (primary) / Battle Master fighter 3 (secondary) — tool proficiency cap", () => {
    const CHAR_ID = "test-1177-mc-toolprof";
    const resourcesUrl = `/api/characters/${CHAR_ID}/resources/transactions`;

    beforeEach(async () => {
      const wizard = await prisma.characterClass.findFirstOrThrow({ where: { name: "Wizard" } });
      const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
      // Production always sets subclassId alongside the subclass string; resolved here so this fixture matches that shape (#1524).
      const evocation = await prisma.subclass.findFirstOrThrow({ where: { classId: wizard.id, name: "School of Evocation" } });
      const battleMaster = await prisma.subclass.findFirstOrThrow({ where: { classId: fighter.id, name: "Battle Master" } });
      await prisma.character.create({
        data: {
          ...BASE,
          id: CHAR_ID,
          name: "Res Caps MC ToolProf",
          ownerId: OWNER_ID,
          experiencePoints: 64000,
          hitDice: { total: 10, die: "d8", spent: 0 },
          abilityScores: { strength: 14, dexterity: 12, constitution: 14, intelligence: 16, wisdom: 10, charisma: 10 },
          spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
          resources: Prisma.JsonNull,
          classEntries: {
            create: [
              { name: "wizard", subclass: "School of Evocation", subclassId: evocation.id, classId: wizard.id, position: 0, level: 7 },
              { name: "fighter", subclass: "Battle Master", subclassId: battleMaster.id, classId: fighter.id, position: 1, level: 3 },
            ],
          },
        },
      });
    });

    afterEach(async () => {
      await prisma.character.deleteMany({ where: { id: CHAR_ID } });
    });

    // This goes through the same deriveEntryScopedResources/overlayExtrasFields path the maneuver test above exercises.
    it("caps learnToolProficiency at the SECONDARY fighter entry's Student of War count (1)", async () => {
      const first = await agent()
        .post(resourcesUrl)
        .send({ operations: [{ type: "learnToolProficiency", name: "Smith's Tools" }] });
      expect(first.status).toBe(200);

      const second = await agent()
        .post(resourcesUrl)
        .send({ operations: [{ type: "learnToolProficiency", name: "Woodcarver's Tools" }] });
      expect(second.status).toBe(400);

      const final = await agent().get(`/api/characters/${CHAR_ID}`);
      expect(final.body.resources.toolProficienciesKnown).toHaveLength(1);
    });
  });
});

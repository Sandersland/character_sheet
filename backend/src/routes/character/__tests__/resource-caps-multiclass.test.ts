/**
 * Entry-scoped resource-op caps for multiclass characters (#1177). Before the
 * fix, applyResourceOpInTx derived every choice cap (maneuverChoiceCount,
 * disciplineChoiceCount, the discipline min-level gate) from classEntries[0]
 * (the PRIMARY entry) at TOTAL level — so a non-primary Battle Master's
 * maneuver cap or a non-primary Way of the Four Elements monk's discipline
 * gate were silently derived from the wrong class at the wrong level. A
 * spellcaster primary (no maneuverChoiceCount/disciplineChoiceCount of its
 * own) made the cap check `undefined` → skipped entirely → unbounded learns.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-resource-caps-mc";
let COOKIE: string;

function agent() {
  return supertest.agent(createApp()).set("Cookie", COOKIE);
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
      await prisma.character.create({
        data: {
          ...BASE,
          id: CHAR_ID,
          name: "Res Caps MC Maneuvers",
          ownerId: OWNER_ID,
          experiencePoints: 64000, // total level 10 (wizard 7 + fighter 3), no pending level-up
          hitDice: { total: 10, die: "d8", spent: 0 },
          abilityScores: { strength: 14, dexterity: 12, constitution: 14, intelligence: 16, wisdom: 10, charisma: 10 },
          spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
          resources: Prisma.JsonNull,
          classEntries: {
            create: [
              { name: "wizard", subclass: "School of Evocation", classId: wizard.id, position: 0, level: 7 },
              { name: "fighter", subclass: "Battle Master", classId: fighter.id, position: 1, level: 3 },
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

      // First 3 (the fighter-3 Battle Master cap) succeed.
      for (const m of maneuvers.slice(0, 3)) {
        const res = await agent().post(resourcesUrl).send({ operations: [{ type: "learnManeuver", maneuverId: m.id }] });
        expect(res.status).toBe(200);
      }
      const afterThree = await agent().get(`/api/characters/${CHAR_ID}`);
      expect(afterThree.body.resources.maneuversKnown).toHaveLength(3);
      // maneuverChoiceCount on the read side is clamp-on-read territory (#1177
      // chunk 3 — buildResourcesView); this test only pins the write-side cap.

      // A 4th learn is beyond the fighter-3 cap — must be rejected. Before the
      // fix, the wizard primary carries no maneuverChoiceCount at all, so the
      // cap check was skipped entirely and this 4th learn silently succeeded.
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
      await prisma.character.create({
        data: {
          ...BASE,
          id: CHAR_ID,
          name: "Res Caps MC ToolProf",
          ownerId: OWNER_ID,
          experiencePoints: 64000, // total level 10 (wizard 7 + fighter 3), no pending level-up
          hitDice: { total: 10, die: "d8", spent: 0 },
          abilityScores: { strength: 14, dexterity: 12, constitution: 14, intelligence: 16, wisdom: 10, charisma: 10 },
          spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
          resources: Prisma.JsonNull,
          classEntries: {
            create: [
              { name: "wizard", subclass: "School of Evocation", classId: wizard.id, position: 0, level: 7 },
              { name: "fighter", subclass: "Battle Master", classId: fighter.id, position: 1, level: 3 },
            ],
          },
        },
      });
    });

    afterEach(async () => {
      await prisma.character.deleteMany({ where: { id: CHAR_ID } });
    });

    // Closes a coverage gap (not a red-first case: the write-side cap check
    // already goes through the same deriveEntryScopedResources/overlayCapFields
    // path the maneuver test above exercises, so this passes on the current fix).
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

  describe("fighter 7 (primary) / Way of the Four Elements monk 3 (secondary) — discipline level gate", () => {
    const CHAR_ID = "test-1177-mc-disciplines";
    const resourcesUrl = `/api/characters/${CHAR_ID}/resources/transactions`;
    const NAME_LOW = "Res Caps MC Disc Low"; // minLevel 3 — legal at monk entry level 3
    const NAME_HIGH = "Res Caps MC Disc High"; // minLevel 6 — illegal at monk entry level 3

    let lowId: string;
    let highId: string;

    beforeEach(async () => {
      const fighter = await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } });
      const monk = await prisma.characterClass.findFirstOrThrow({ where: { name: "Monk" } });
      const [low, high] = await Promise.all([
        prisma.grantedAbility.upsert({
          where: { name: NAME_LOW },
          create: { name: NAME_LOW, description: "Low test discipline.", minLevel: 3 },
          update: { minLevel: 3, alwaysKnown: false },
        }),
        prisma.grantedAbility.upsert({
          where: { name: NAME_HIGH },
          create: { name: NAME_HIGH, description: "High test discipline.", minLevel: 6 },
          update: { minLevel: 6, alwaysKnown: false },
        }),
      ]);
      lowId = low.id;
      highId = high.id;

      await prisma.character.create({
        data: {
          ...BASE,
          id: CHAR_ID,
          name: "Res Caps MC Disciplines",
          ownerId: OWNER_ID,
          experiencePoints: 64000, // total level 10 (fighter 7 + monk 3), no pending level-up
          hitDice: { total: 10, die: "d10", spent: 0 },
          abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 15, charisma: 10 },
          spellcasting: Prisma.JsonNull,
          resources: Prisma.JsonNull,
          classEntries: {
            create: [
              { name: "fighter", subclass: null, classId: fighter.id, position: 0, level: 7 },
              { name: "monk", subclass: "Way of the Four Elements", classId: monk.id, position: 1, level: 3 },
            ],
          },
        },
      });
    });

    afterEach(async () => {
      await prisma.character.deleteMany({ where: { id: CHAR_ID } });
    });
    afterAll(async () => {
      await prisma.grantedAbility.deleteMany({ where: { name: { in: [NAME_LOW, NAME_HIGH] } } });
    });

    it("rejects a discipline gated above the SECONDARY monk entry's own level-3, even though total level (10) would clear it", async () => {
      // Before the fix: the gate read total level (10) off the primary fighter
      // entry's derivation context, so a minLevel-6 discipline wrongly passed.
      const res = await agent().post(resourcesUrl).send({ operations: [{ type: "learnDiscipline", disciplineId: highId }] });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/requires monk level 6/);
    });

    it("a legal discipline learn records learnedAtLevel at the monk entry's own level (3), not total level (10)", async () => {
      const res = await agent().post(resourcesUrl).send({ operations: [{ type: "learnDiscipline", disciplineId: lowId }] });
      expect(res.status).toBe(200);
      const known = res.body.resources.disciplinesKnown as Array<{ disciplineId?: string; learnedAtLevel: number }>;
      const entry = known.find((d) => d.disciplineId === lowId);
      expect(entry?.learnedAtLevel).toBe(3);
    });
  });
});

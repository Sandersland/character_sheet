/**
 * Elemental Discipline casting where Way of the Four Elements Monk is a
 * SECONDARY class entry (#1072). FOCUS_CAST_CHARACTER_SELECT used take: 1 on
 * classEntries, so a non-primary monk's disciplineSaveDC/focus cap were
 * invisible to the op — resolveDisciplineCast threw "Only a ... monk".
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-disc-cast-multiclass-1072";
let COOKIE: string;
const FIXTURE_ID = "test-disc-cast-multiclass-1072";

// Fighter 2 / Monk (Way of the Four Elements) 3 — total level 5, prof +3.
// Monk's OWN effective level (3, entry-scoped) drives the focus pool (3), the
// per-cast focus cap (maxFocusPerDiscipline(3) = 2), and disciplineSaveDC
// (8 + prof 3 + Wis mod 2 = 13) — NOT the total character level (5), which
// would wrongly permit a 3-focus cast and derive a different DC.
const FIXTURE_BASE = {
  id: FIXTURE_ID,
  name: "Discipline Cast Multiclass Test",
  alignment: "Lawful Neutral",
  initiativeBonus: 2,
  speed: 30,
  hitPoints: { current: 24, max: 24, temp: 0 },
  hitDice: { total: 5, die: "d10" },
  abilityScores: { strength: 14, dexterity: 12, constitution: 12, intelligence: 10, wisdom: 14, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
  experiencePoints: 6500, // level 5 total
};

function agent() {
  return supertest.agent(createApp()).set("Cookie", COOKIE);
}
const url = `/api/characters/${FIXTURE_ID}/disciplines/transactions`;
const resourcesUrl = `/api/characters/${FIXTURE_ID}/resources/transactions`;

async function learn(disciplineId: string) {
  const res = await agent().post(resourcesUrl).send({ operations: [{ type: "learnDiscipline", disciplineId }] });
  expect(res.status).toBe(200);
}

describe("castDiscipline — Way of the Four Elements Monk as a SECONDARY class entry (#1072)", () => {
  let waterWhipId: string;

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    waterWhipId = (await prisma.grantedAbility.findUnique({ where: { name: "Water Whip" } }))!.id;
    await prisma.character.create({
      data: {
        ...FIXTURE_BASE,
        ownerId: OWNER_ID,
        resources: Prisma.JsonNull,
        classEntries: {
          create: [
            { name: "fighter", position: 0, level: 2 },
            { name: "monk", subclass: "way of the four elements", position: 1, level: 3 },
          ],
        },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });

  it("casts a learned discipline, spends focus from the monk pool, DC derived from the monk entry's own level", async () => {
    await learn(waterWhipId);

    const res = await agent().post(url).send({ operations: [{ type: "castDiscipline", disciplineId: waterWhipId, focusSpent: 2, roll: 15 }] });
    expect(res.status).toBe(200);

    const focus = res.body.resources.pools.find((p: { key: string }) => p.key === "focus");
    expect(focus.total).toBe(3); // monk's own effective level 3
    expect(focus.used).toBe(2);

    const activityRes = await agent().get(`/api/characters/${FIXTURE_ID}/activity?category=resources`);
    const castEvent = (activityRes.body as Array<{ type: string; data?: Record<string, unknown> }>).find((e) => e.type === "castDiscipline")!;
    expect(castEvent.data).toMatchObject({ disciplineId: waterWhipId, focusSpent: 2, roll: 15, saveDc: 13 });
  });

  it("rejects focus above the MONK ENTRY's own per-cast cap (2 at monk level 3), even though total character level (5) would allow 3", async () => {
    await learn(waterWhipId);

    const res = await agent().post(url).send({ operations: [{ type: "castDiscipline", disciplineId: waterWhipId, focusSpent: 3, roll: 30 }] });
    expect(res.status).toBe(400);
  });
});

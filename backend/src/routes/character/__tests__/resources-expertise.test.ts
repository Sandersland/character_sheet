/**
 * Expertise transaction ops (#1588): learnExpertise/forgetExpertise on
 * POST /api/characters/:id/resources/transactions. Uses the REAL seeded
 * Rogue class (EDITION_2014) so expertiseChoiceCount resolves from the
 * actual grantor row (rogue-features.ts), not a bespoke test catalog.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-resources-expertise";
let COOKIE: string;
const FIXTURE_ID = "test-resources-expertise-character-1";

let rogueClassId: string;

// Level-1 Rogue (2014). Proficient in stealth/perception/acrobatics; not in
// arcana. Cap at L1 is 2 (rogue-features.ts's Expertise row, minLevel 1).
const FIXTURE_BASE = {
  id: FIXTURE_ID,
  name: "Resources Expertise Test Rogue",
  alignment: "Chaotic Neutral",
  rulesEdition: "EDITION_2014" as const,
  experiencePoints: 0,
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 10, max: 10, temp: 0 },
  hitDice: { total: 1, die: "d8" },
  abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 12, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [
    { name: "stealth", ability: "dexterity", proficient: true },
    { name: "perception", ability: "wisdom", proficient: true },
    { name: "acrobatics", ability: "dexterity", proficient: true },
    { name: "arcana", ability: "intelligence", proficient: false },
  ],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

const url = `/api/characters/${FIXTURE_ID}/resources/transactions`;

function agent() {
  return supertest.agent(app).set("Cookie", COOKIE);
}

async function post(operations: unknown[]) {
  return agent().post(url).send({ operations });
}

interface ExpertiseSkill { name: string; expertise?: boolean }
function expertSkillNames(res: { body: { skills: ExpertiseSkill[] } }): string[] {
  return res.body.skills.filter((s) => s.expertise).map((s) => s.name);
}

beforeEach(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
  rogueClassId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Rogue" } })).id;

  await prisma.character.create({
    data: {
      ...FIXTURE_BASE,
      ownerId: OWNER_ID,
      classEntries: { create: [{ name: "rogue", classId: rogueClassId, position: 0, level: 1 }] },
    },
  });
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
});

afterAll(async () => {
  await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
});

describe("POST /api/characters/:id/resources/transactions — learnExpertise/forgetExpertise (#1588)", () => {
  it("learns an expertise skill the character is proficient in", async () => {
    const res = await post([{ type: "learnExpertise", skill: "stealth" }]);
    expect(res.status).toBe(200);
    expect(expertSkillNames(res)).toEqual(["stealth"]);
    expect((res.body.resources as { expertiseChoiceCount?: number }).expertiseChoiceCount).toBe(2);
  });

  it("rejects a non-proficient skill", async () => {
    const res = await post([{ type: "learnExpertise", skill: "arcana" }]);
    expect(res.status).toBe(400);
  });

  it("rejects an unknown skill key", async () => {
    const res = await post([{ type: "learnExpertise", skill: "not-a-real-skill" }]);
    expect(res.status).toBe(400);
  });

  it("rejects learning beyond the level cap (2 at L1)", async () => {
    const res = await post([
      { type: "learnExpertise", skill: "stealth" },
      { type: "learnExpertise", skill: "perception" },
      { type: "learnExpertise", skill: "acrobatics" }, // 3rd exceeds cap 2
    ]);
    expect(res.status).toBe(400);
    // Atomic: the whole batch rolls back, none of the three land.
    const check = await agent().get(`/api/characters/${FIXTURE_ID}`);
    expect(expertSkillNames(check)).toEqual([]);
  });

  it("rejects a duplicate pick", async () => {
    await post([{ type: "learnExpertise", skill: "stealth" }]);
    const dup = await post([{ type: "learnExpertise", skill: "stealth" }]);
    expect(dup.status).toBe(400);
  });

  it("forget is freely reversible (no ceremony gate, unlike maneuvers/subclass choices)", async () => {
    const learn = await post([{ type: "learnExpertise", skill: "stealth" }]);
    const entryId = (learn.body.resources.expertiseKnown as { id: string; skill: string }[])[0].id;
    const res = await post([{ type: "forgetExpertise", entryId }]);
    expect(res.status).toBe(200);
    expect(expertSkillNames(res)).toEqual([]);
  });

  it("400s forgetting an unknown entry id", async () => {
    const res = await post([{ type: "forgetExpertise", entryId: "nope" }]);
    expect(res.status).toBe(400);
  });

  // Fighter has no expertiseChoiceCount grant at all (undefined, not 0) — the
  // learn cap must still reject rather than skip the check on `undefined`
  // (Opus review: a non-grantor class could otherwise inject Expertise via a
  // crafted API call, since the UI never offers the step but the endpoint
  // must not trust reachability, CLAUDE.md).
  it("400s learnExpertise for a class that grants no Expertise at all (undefined cap treated as 0, not skipped)", async () => {
    const fighterClassId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } })).id;
    const fighterId = "test-resources-expertise-fighter-1";
    await prisma.character.create({
      data: {
        ...FIXTURE_BASE,
        id: fighterId,
        name: "Resources Expertise Test Fighter",
        ownerId: OWNER_ID,
        classEntries: { create: [{ name: "fighter", classId: fighterClassId, position: 0, level: 1 }] },
      },
    });
    try {
      const res = await agent().post(`/api/characters/${fighterId}/resources/transactions`).send({
        operations: [{ type: "learnExpertise", skill: "stealth" }],
      });
      expect(res.status).toBe(400);
    } finally {
      await prisma.character.deleteMany({ where: { id: fighterId } });
    }
  });
});

// Opus review regression (#1588): expertiseChoiceCount must SUM across
// grantor entries in a multiclass, never overlay defined-wins (registry.ts's
// overlayExtrasFields) — a 2014 Rogue 6 / Bard 3 grants 4 + 2 = 6, not
// whichever entry's own count happened to apply last. Exercises the full
// stack the pure derive-entry-scoped-resources.test.ts unit test can't: the
// learn cap (applyLearnExpertiseOp) and the clamp-on-read
// (buildResourcesPayload) both read the same summed field, so a real
// multiclass character must actually be ABLE to learn all 6 and see all 6
// survive a re-read, not just derive the number 6 in isolation.
describe("POST /api/characters/:id/resources/transactions — multiclass expertiseChoiceCount sums, never clobbers (#1588)", () => {
  const MULTI_FIXTURE_ID = "test-resources-expertise-multiclass-1";
  const multiUrl = `/api/characters/${MULTI_FIXTURE_ID}/resources/transactions`;

  async function postMulti(operations: unknown[]) {
    return agent().post(multiUrl).send({ operations });
  }

  beforeEach(async () => {
    const bardClassId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Bard" } })).id;
    await prisma.character.create({
      data: {
        ...FIXTURE_BASE,
        id: MULTI_FIXTURE_ID,
        name: "Resources Expertise Test Rogue6/Bard3",
        experiencePoints: 23000, // total level 9 (rogue 6 + bard 3)
        hitDice: { total: 9, die: "d8" },
        // Proficient in 7 skills — the full summed cap (4 + 2) plus one spare
        // (insight) so the "beyond cap" assertion below tests the CAP, not
        // proficiency — a non-proficient pick would 400 for the wrong reason.
        skills: [
          { name: "stealth", ability: "dexterity", proficient: true },
          { name: "perception", ability: "wisdom", proficient: true },
          { name: "acrobatics", ability: "dexterity", proficient: true },
          { name: "athletics", ability: "strength", proficient: true },
          { name: "performance", ability: "charisma", proficient: true },
          { name: "persuasion", ability: "charisma", proficient: true },
          { name: "insight", ability: "wisdom", proficient: true },
        ],
        ownerId: OWNER_ID,
        classEntries: {
          create: [
            { name: "rogue", classId: rogueClassId, position: 0, level: 6 },
            { name: "bard", classId: bardClassId, position: 1, level: 3 },
          ],
        },
      },
    });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: MULTI_FIXTURE_ID } });
  });

  it("the learn cap allows all 6 picks (Rogue's 4 + Bard's 2, summed not clobbered)", async () => {
    const skills = ["stealth", "perception", "acrobatics", "athletics", "performance", "persuasion"];
    const res = await postMulti(skills.map((skill) => ({ type: "learnExpertise", skill })));
    expect(res.status).toBe(200);
    expect((res.body.resources as { expertiseChoiceCount?: number }).expertiseChoiceCount).toBe(6);
    expect(expertSkillNames(res)).toEqual(skills);

    // A 7th pick — "insight", proficient but beyond the summed cap of 6 — is
    // rejected on the CAP, not on proficiency (which would pass for the wrong reason).
    const seventh = await postMulti([{ type: "learnExpertise", skill: "insight" }]);
    expect(seventh.status).toBe(400);
  });

  it("the clamp-on-read keeps all 6 on a fresh GET (not clamped down to 2 or 4)", async () => {
    const skills = ["stealth", "perception", "acrobatics", "athletics", "performance", "persuasion"];
    await postMulti(skills.map((skill) => ({ type: "learnExpertise", skill })));

    const check = await agent().get(`/api/characters/${MULTI_FIXTURE_ID}`);
    expect(expertSkillNames(check)).toEqual(skills);
    expect((check.body.resources as { expertiseChoiceCount?: number }).expertiseChoiceCount).toBe(6);
  });
});

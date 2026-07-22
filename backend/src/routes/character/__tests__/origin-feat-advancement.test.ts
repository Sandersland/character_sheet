// Origin feats (background grants, #1130) are exempt from the ASI slot cap:
// kept on read, never trimmed on level-down, never removable, and don't consume
// a slot that a real ASI/feat could use.
import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-origin-feat";
let COOKIE: string;
const app = createApp();
const CLASS_NAME = "Test Class (Origin Feat Suite)";
let classId: string;

const EMPTY_RESOURCES = {
  used: {},
  maneuversKnown: [],
  toolProficienciesKnown: [],
  choicesKnown: {},
  advancements: [] as unknown[],
  fightingStyle: null,
};

function originEntry(featName: string, improvements: unknown[]) {
  return {
    id: randomUUID(),
    level: 1,
    kind: "feat",
    origin: true,
    featName,
    featDescription: "",
    abilityDeltas: {},
    hpDelta: 0,
    initDelta: 0,
    improvements,
  };
}

function asiEntry() {
  return { id: randomUUID(), level: 8, kind: "asi", abilityDeltas: {}, hpDelta: 0, initDelta: 0 };
}

async function createChar(id: string, xp: number, advancements: unknown[], overrides: Record<string, unknown> = {}) {
  return prisma.character.create({
    data: {
      ownerId: OWNER_ID,
      id,
      name: `OriginFeat ${id}`,
      alignment: "True Neutral",
      experiencePoints: xp,
      initiativeBonus: 0, // DEX 10 → +0
      speed: 30,
      abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
      savingThrowProficiencies: [],
      skills: [],
      toolProficiencies: [],
      currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
      hitPoints: { current: 10, max: 10, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: 1, die: "d10", spent: 0 },
      spellcasting: Prisma.JsonNull,
      resources: { ...EMPTY_RESOURCES, advancements } as unknown as Prisma.InputJsonValue,
      classEntries: { create: [{ name: CLASS_NAME, classId, position: 0, level: 1 }] },
      ...overrides,
    },
  });
}

function getChar(id: string) {
  return supertest(app).get(`/api/characters/${id}`).set("Cookie", COOKIE);
}
function postAdvancement(id: string, body: object) {
  return supertest(app).post(`/api/characters/${id}/advancement/transactions`).set("Cookie", COOKIE).send(body);
}
function setXp(id: string, value: number) {
  return supertest(app).post(`/api/characters/${id}/experience`).set("Cookie", COOKIE).send({ operations: [{ type: "set", value }] });
}

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
  const cls = await prisma.characterClass.upsert({
    where: { name: CLASS_NAME },
    create: { name: CLASS_NAME, hitDie: "d10", savingThrows: ["strength"], skillChoiceCount: 2, skillChoices: ["athletics"], isSpellcaster: false, subclassLevel: 3 },
    update: {},
  });
  classId = cls.id;
});
afterAll(async () => {
  await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
});
afterEach(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "OriginFeat" } } });
});

describe("Origin feats exempt from ASI slot cap (#1130)", () => {
  it("keeps the origin entry at level 1 (0 slots), applies its improvements, and reports slots 0/0", async () => {
    await createChar("of-serialize", 0, [
      originEntry("Alert", [{ target: "initiative", amount: 1, scaling: "proficiencyBonus" }]),
      originEntry("Tough", [{ target: "maxHp", amount: 2, perLevel: true }]),
    ]);

    const res = await getChar("of-serialize");
    expect(res.status).toBe(200);
    expect(res.body.advancementSlots).toEqual({ total: 0, used: 0 });
    expect(res.body.advancements).toHaveLength(2);
    // Alert: +PB initiative (level 1 → PB 2) over the DEX-0 base.
    expect(res.body.initiativeBonus).toBe(2);
    // Tough: +2 × applied level (1) over base max 10.
    expect(res.body.hitPoints.max).toBe(12);
  });

  it("rejects removing an origin entry with 400", async () => {
    const origin = originEntry("Alert", []);
    await createChar("of-remove", 0, [origin]);

    const res = await postAdvancement("of-remove", {
      operations: [{ type: "removeAdvancement", entryId: origin.id }],
    });
    expect(res.status).toBe(400);
  });

  it("never reverses origin entries on level-down but still LIFO-trims slot feats", async () => {
    // Level 8 (XP 34000, 2 slots): origin + 2 ASIs. Drop to level 1 (0 slots).
    await createChar("of-reconcile", 34000, [originEntry("Alert", [{ target: "initiative", amount: 1, scaling: "proficiencyBonus" }]), asiEntry(), asiEntry()], {
      classEntries: { create: [{ name: CLASS_NAME, classId, position: 0, level: 8 }] },
    });

    const drop = await setXp("of-reconcile", 0);
    expect(drop.status).toBe(200);
    expect(drop.body.level).toBe(1);

    const res = await getChar("of-reconcile");
    expect(res.body.advancements).toHaveLength(1);
    expect(res.body.advancements[0].featName).toBe("Alert");
    expect(res.body.advancementSlots).toEqual({ total: 0, used: 0 });
    // Origin improvement still applied after reconcile.
    expect(res.body.initiativeBonus).toBe(2);
  });

  it("permits a level-4 ASI alongside an origin entry (origin doesn't consume the slot)", async () => {
    await createChar("of-slot", 2700, [originEntry("Alert", [])], {
      classEntries: { create: [{ name: CLASS_NAME, classId, position: 0, level: 4 }] },
    });

    const res = await postAdvancement("of-slot", {
      operations: [{ type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] }],
    });
    expect(res.status).toBe(200);
    expect(res.body.advancementSlots).toEqual({ total: 1, used: 1 });
    expect(res.body.advancements).toHaveLength(2);
  });
});

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-1123-draconic-hp";
let COOKIE: string;
let sorcererClassId: string;
let fighterClassId: string;

const NAME_PREFIX = "1123 Draconic";

const BASE_ABILITY_SCORES = {
  strength: 10,
  dexterity: 14,
  constitution: 14,
  intelligence: 10,
  wisdom: 10,
  charisma: 16,
};

function get(id: string) {
  return supertest(app).get(`/api/characters/${id}`).set("Cookie", COOKIE);
}

const invUrl = (id: string) => `/api/characters/${id}/inventory/transactions`;
const acquireEquipped = (id: string, custom: unknown) =>
  supertest(app).post(invUrl(id)).set("Cookie", COOKIE).send({ operations: [{ type: "acquire", custom, equipped: true }] });
const chainMail = { name: "Test Chain Mail", category: "armor", armor: { armorCategory: "heavy", baseArmorClass: 16 } };

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
  const sorcerer = await prisma.characterClass.findUnique({ where: { name: "Sorcerer" }, select: { id: true } });
  if (!sorcerer) throw new Error("Sorcerer class not seeded — run `prisma db seed` before tests");
  sorcererClassId = sorcerer.id;
  const fighter = await prisma.characterClass.findUnique({ where: { name: "Fighter" }, select: { id: true } });
  if (!fighter) throw new Error("Fighter class not seeded — run `prisma db seed` before tests");
  fighterClassId = fighter.id;
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
});

interface ClassEntrySpec {
  name: string;
  classId: string;
  level: number;
  subclass?: string;
}

async function createFixture(opts: {
  name: string;
  rulesEdition: "EDITION_2014" | "EDITION_2024";
  experiencePoints: number;
  storedMaxHp: number;
  currentHp?: number;
  speed?: number;
  entries: ClassEntrySpec[];
  // Defaults to the sum of entries' levels; override to simulate a pending level-up without lying about pendingLevelUps.
  hitDiceTotal?: number;
}): Promise<string> {
  const { name, rulesEdition, experiencePoints, storedMaxHp, currentHp, speed = 30, entries, hitDiceTotal } = opts;
  const char = await prisma.character.create({
    data: {
      name,
      ownerId: OWNER_ID,
      rulesEdition,
      alignment: "True Neutral",
      experiencePoints,
      initiativeBonus: 0,
      speed,
      hitPoints: { current: currentHp ?? storedMaxHp, max: storedMaxHp, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: hitDiceTotal ?? entries.reduce((sum, e) => sum + e.level, 0), die: "d6", spent: 0 },
      abilityScores: BASE_ABILITY_SCORES,
      savingThrowProficiencies: [],
      skills: [],
      toolProficiencies: [],
      currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
      spellcasting: Prisma.JsonNull,
      classEntries: {
        create: entries.map((e, i) => ({
          name: e.name,
          classId: e.classId,
          position: i,
          level: e.level,
          subclass: e.subclass,
        })),
      },
    },
  });
  return char.id;
}

const XP_FOR_LEVEL: Record<number, number> = { 1: 0, 2: 300, 3: 900, 5: 6500 };

describe("Draconic Resilience max-HP (#1123)", () => {
  it("2014: L5 Draconic sorcerer has max HP 5 higher than an equal-roll non-Draconic sorcerer", async () => {
    const draconicId = await createFixture({
      name: `${NAME_PREFIX} 2014 L5`,
      rulesEdition: "EDITION_2014",
      experiencePoints: XP_FOR_LEVEL[5],
      storedMaxHp: 30,
      entries: [{ name: "Sorcerer", classId: sorcererClassId, level: 5, subclass: "Draconic Bloodline" }],
    });
    const plainId = await createFixture({
      name: `${NAME_PREFIX} 2014 L5 plain`,
      rulesEdition: "EDITION_2014",
      experiencePoints: XP_FOR_LEVEL[5],
      storedMaxHp: 30,
      entries: [{ name: "Sorcerer", classId: sorcererClassId, level: 5 }],
    });

    const draconic = (await get(draconicId)).body;
    const plain = (await get(plainId)).body;
    expect(plain.hitPoints.max).toBe(30);
    expect(draconic.hitPoints.max).toBe(35);
    expect(draconic.hitPoints.max - plain.hitPoints.max).toBe(5);
  });

  it("2014: a non-Draconic subclass gets no override", async () => {
    const id = await createFixture({
      name: `${NAME_PREFIX} 2014 wild magic`,
      rulesEdition: "EDITION_2014",
      experiencePoints: XP_FOR_LEVEL[5],
      storedMaxHp: 30,
      entries: [{ name: "Sorcerer", classId: sorcererClassId, level: 5, subclass: "Wild Magic" }],
    });
    const res = await get(id);
    expect(res.body.hitPoints.max).toBe(30);
  });

  it.each([
    { level: 2, expectedBonus: 0 },
    { level: 3, expectedBonus: 3 },
    { level: 5, expectedBonus: 5 },
  ])("2024: L$level Draconic Sorcery bonus is +$expectedBonus", async ({ level, expectedBonus }) => {
    const id = await createFixture({
      name: `${NAME_PREFIX} 2024 L${level}`,
      rulesEdition: "EDITION_2024",
      experiencePoints: XP_FOR_LEVEL[level],
      storedMaxHp: 30,
      entries: [{ name: "Sorcerer", classId: sorcererClassId, level, subclass: "Draconic Bloodline" }],
    });
    const res = await get(id);
    expect(res.body.hitPoints.max).toBe(30 + expectedBonus);
  });

  it("current HP clamps on read when the max drops on a subclass change away from Draconic", async () => {
    const id = await createFixture({
      name: `${NAME_PREFIX} subclass change`,
      rulesEdition: "EDITION_2014",
      experiencePoints: XP_FOR_LEVEL[5],
      storedMaxHp: 30,
      currentHp: 35, // full at the Draconic effective max (30 + 5)
      entries: [{ name: "Sorcerer", classId: sorcererClassId, level: 5, subclass: "Draconic Bloodline" }],
    });
    const before = (await get(id)).body;
    expect(before.hitPoints.max).toBe(35);
    expect(before.hitPoints.current).toBe(35);

    await prisma.characterClassEntry.updateMany({ where: { characterId: id }, data: { subclass: null } });

    const after = (await get(id)).body;
    expect(after.hitPoints.max).toBe(30);
    // Clamped, not left at the stale 35.
    expect(after.hitPoints.current).toBe(30);
  });

  it("2014: a Draconic sorcerer at exhaustion 4 halves AFTER the subclass bonus is added (composition order)", async () => {
    const id = await createFixture({
      name: `${NAME_PREFIX} exhaustion`,
      rulesEdition: "EDITION_2014",
      experiencePoints: XP_FOR_LEVEL[5],
      storedMaxHp: 28,
      entries: [{ name: "Sorcerer", classId: sorcererClassId, level: 5, subclass: "Draconic Bloodline" }],
    });
    await supertest(app)
      .post(`/api/characters/${id}/conditions/transactions`)
      .set("Cookie", COOKIE)
      .send({ operations: [{ type: "setExhaustion", level: 4 }] });

    const res = await get(id);
    // floor((28 + 5) / 2) = 16 — NOT floor(28 / 2) + 5 = 19.
    expect(res.body.hitPoints.max).toBe(16);
  });

  it("multiclass: the bonus keys off the Draconic (Sorcerer) entry's OWN level, not the total character level", async () => {
    const id = await createFixture({
      name: `${NAME_PREFIX} multiclass`,
      rulesEdition: "EDITION_2014",
      experiencePoints: XP_FOR_LEVEL[5],
      storedMaxHp: 40,
      entries: [
        { name: "Sorcerer", classId: sorcererClassId, level: 3, subclass: "Draconic Bloodline" },
        { name: "Fighter", classId: fighterClassId, level: 2 },
      ],
    });
    const res = await get(id);
    // +3 (the sorcerer entry's own level) — NOT +5 (total character level).
    expect(res.body.hitPoints.max).toBe(43);
  });
});

// 2014 Dragon Wings is passive (fly speed = current speed); 2024's is a flat 60ft/1hr resource-gated ability (dragonWings pool) that #1123 scopes out — no derived flySpeed for 2024.
describe("Dragon Wings fly speed (#1123) — 2014 passive derive, 2024 withheld (resource-gated, out of scope)", () => {
  it("2014: unarmored Draconic L14 exposes flySpeed equal to walking speed", async () => {
    const id = await createFixture({
      name: `${NAME_PREFIX} wings 2014`,
      rulesEdition: "EDITION_2014",
      experiencePoints: 355000,
      storedMaxHp: 80,
      speed: 30,
      entries: [{ name: "Sorcerer", classId: sorcererClassId, level: 14, subclass: "Draconic Bloodline" }],
    });
    const res = await get(id);
    expect(res.body.speed).toBe(30);
    expect(res.body.flySpeed).toBe(30);
  });

  // flySpeed must key off the same draconicBloodlineLevel seam as the HP bonus (draconicResilienceMaxHpTerm), not the classEntry.level column, which can lag during a pending level-up.
  it("2014: flySpeed keys off the XP-derived level, not a stale classEntry.level column (pending level-up)", async () => {
    const id = await createFixture({
      name: `${NAME_PREFIX} wings pending levelup`,
      rulesEdition: "EDITION_2014",
      experiencePoints: 140000,
      storedMaxHp: 80,
      speed: 30,
      hitDiceTotal: 13, // HP roll not yet applied for the 14th level
      entries: [{ name: "Sorcerer", classId: sorcererClassId, level: 13, subclass: "Draconic Bloodline" }], // stale column
    });
    const res = await get(id);
    expect(res.body.pendingLevelUps).toBe(1);
    expect(res.body.flySpeed).toBe(30);
  });

  // Without the edition gate, this would silently regress to the 2014 walking-speed derivation.
  it("2024: unarmored Draconic L14 gets NO derived flySpeed", async () => {
    const id = await createFixture({
      name: `${NAME_PREFIX} wings 2024`,
      rulesEdition: "EDITION_2024",
      experiencePoints: 355000,
      storedMaxHp: 80,
      speed: 30,
      entries: [{ name: "Sorcerer", classId: sorcererClassId, level: 14, subclass: "Draconic Bloodline" }],
    });
    const res = await get(id);
    expect(res.body.speed).toBe(30);
    expect(res.body.flySpeed).toBeUndefined();
  });

  it("2014: wearing armor suppresses flySpeed even at L14", async () => {
    const id = await createFixture({
      name: `${NAME_PREFIX} wings armored`,
      rulesEdition: "EDITION_2014",
      experiencePoints: 355000,
      storedMaxHp: 80,
      entries: [{ name: "Sorcerer", classId: sorcererClassId, level: 14, subclass: "Draconic Bloodline" }],
    });
    await acquireEquipped(id, chainMail);
    const res = await get(id);
    expect(res.body.flySpeed).toBeUndefined();
  });

  it("2014: below L14 flySpeed is absent", async () => {
    const id = await createFixture({
      name: `${NAME_PREFIX} wings low level`,
      rulesEdition: "EDITION_2014",
      experiencePoints: XP_FOR_LEVEL[5],
      storedMaxHp: 30,
      entries: [{ name: "Sorcerer", classId: sorcererClassId, level: 5, subclass: "Draconic Bloodline" }],
    });
    const res = await get(id);
    expect(res.body.flySpeed).toBeUndefined();
  });

  it("2014: a non-Draconic subclass at L14 gets no flySpeed", async () => {
    const id = await createFixture({
      name: `${NAME_PREFIX} wings wild magic`,
      rulesEdition: "EDITION_2014",
      experiencePoints: 355000,
      storedMaxHp: 80,
      entries: [{ name: "Sorcerer", classId: sorcererClassId, level: 14, subclass: "Wild Magic" }],
    });
    const res = await get(id);
    expect(res.body.flySpeed).toBeUndefined();
  });
});

// Every stored-HP clamp/fill must compose the Draconic term through the same draconicResilienceMaxHpTerm as the read-side max, or writes clamp against a too-low max.
describe("Draconic Resilience — write-seam clamps include the subclass term (#1123)", () => {
  const postHp = (id: string, body: object) =>
    supertest(app).post(`/api/characters/${id}/hp`).set("Cookie", COOKIE).send(body);
  const postConditions = (id: string, body: object) =>
    supertest(app).post(`/api/characters/${id}/conditions/transactions`).set("Cookie", COOKIE).send(body);
  const postXp = (id: string, body: object) =>
    supertest(app).post(`/api/characters/${id}/experience`).set("Cookie", COOKIE).send(body);
  const postAdvancement = (id: string, body: object) =>
    supertest(app).post(`/api/characters/${id}/advancement/transactions`).set("Cookie", COOKIE).send(body);

  const draconicL5 = (name: string, currentHp?: number) =>
    createFixture({
      name,
      rulesEdition: "EDITION_2014",
      experiencePoints: XP_FOR_LEVEL[5],
      storedMaxHp: 30,
      currentHp,
      entries: [{ name: "Sorcerer", classId: sorcererClassId, level: 5, subclass: "Draconic Bloodline" }],
    });

  it("long rest fills current to the Draconic-inclusive max, not 5 below it", async () => {
    const id = await draconicL5(`${NAME_PREFIX} seam longrest`, 10);
    const res = await postHp(id, { operations: [{ type: "longRest" }] });
    expect(res.status).toBe(200);
    const after = (await get(id)).body;
    expect(after.hitPoints.max).toBe(35);
    expect(after.hitPoints.current).toBe(35);
  });

  it("healing can reach the top Draconic HP (heal cap includes the term)", async () => {
    const id = await draconicL5(`${NAME_PREFIX} seam heal`, 30);
    const res = await postHp(id, { operations: [{ type: "heal", amount: 20 }] });
    expect(res.status).toBe(200);
    const after = (await get(id)).body;
    expect(after.hitPoints.current).toBe(35);
  });

  it("setExhaustion 4 writes current clamped to the Draconic-inclusive halved max (PHB'14 p. 291)", async () => {
    const id = await createFixture({
      name: `${NAME_PREFIX} seam exhaustion`,
      rulesEdition: "EDITION_2014",
      experiencePoints: XP_FOR_LEVEL[5],
      storedMaxHp: 28,
      currentHp: 33, // full at the Draconic effective max (28 + 5)
      entries: [{ name: "Sorcerer", classId: sorcererClassId, level: 5, subclass: "Draconic Bloodline" }],
    });
    await postConditions(id, { operations: [{ type: "setExhaustion", level: 4 }] });
    const after = (await get(id)).body;
    // floor((28 + 5) / 2) = 16 — the one-way WRITE must not clamp to floor(28 / 2) = 14 (missing the subclass term).
    expect(after.hitPoints.max).toBe(16);
    expect(after.hitPoints.current).toBe(16);
  });

  it("XP level-down does NOT clamp current below the Draconic-inclusive max", async () => {
    const id = await draconicL5(`${NAME_PREFIX} seam leveldown`, 35);
    const res = await postXp(id, { operations: [{ type: "set", value: XP_FOR_LEVEL[3] }] });
    expect(res.status).toBe(200);
    const after = (await get(id)).body;
    // avg-fallback (d6+Con=6) per reversed level: 30 → 24 → 18; Draconic at L3 (+3) → 21.
    expect(after.hitPoints.max).toBe(21);
    expect(after.hitPoints.current).toBe(21); // NOT 18 (the term-less clamp)
  });

  // computeLevelDownState's clamp runs before reconcileClassEntryLevels — the term must use the PROJECTED post-down entries (levelDownEntryLevels), not the stale column; the corruption is masked on read, so this asserts the persisted row.
  it("multiclass XP decrease clamps against the PROJECTED post-down sorcerer level, not the stale column", async () => {
    const id = await createFixture({
      name: `${NAME_PREFIX} seam multiclass down`,
      rulesEdition: "EDITION_2014",
      experiencePoints: 85000,
      storedMaxHp: 78,
      currentHp: 88, // full at the Draconic effective max (78 + 10)
      entries: [
        { name: "Sorcerer", classId: sorcererClassId, level: 10, subclass: "Draconic Bloodline" },
        { name: "Fighter", classId: fighterClassId, level: 1 },
      ],
    });
    const res = await postXp(id, { operations: [{ type: "set", value: XP_FOR_LEVEL[3] }] });
    expect(res.status).toBe(200);

    // LIFO trim at target 3: Fighter 1 -> deleted, Sorcerer 10 -> 3.
    const entries = await prisma.characterClassEntry.findMany({
      where: { characterId: id },
      orderBy: { position: "asc" },
      select: { name: true, level: true },
    });
    expect(entries).toEqual([{ name: "Sorcerer", level: 3 }]);

    // avg-fallback (6/level) over 8 reversed levels: 78 → 30; term at the PROJECTED level 3 → 33. The stale column (10) would give 40.
    const stored = await prisma.character.findUniqueOrThrow({ where: { id }, select: { hitPoints: true } });
    expect((stored.hitPoints as { current: number }).current).toBe(33);

    const served = (await get(id)).body;
    expect(served.hitPoints.max).toBe(33);
    expect(served.hitPoints.current).toBe(33);
  });

  it("advancement-trim on level-down (reconcileAdvancements) clamps against the Draconic-inclusive max", async () => {
    // levelsToReverse = hitDice.total − targetLevel = 0 here, isolating reconcileAdvancements' own clamp as the XP op's only stored-HP write.
    const id = await createFixture({
      name: `${NAME_PREFIX} seam reconciler`,
      rulesEdition: "EDITION_2014",
      experiencePoints: XP_FOR_LEVEL[5],
      storedMaxHp: 18,
      currentHp: 21, // full at the Draconic effective max (18 + 3)
      hitDiceTotal: 3,
      entries: [{ name: "Sorcerer", classId: sorcererClassId, level: 3, subclass: "Draconic Bloodline" }],
    });
    const asi = await postAdvancement(id, {
      operations: [{ type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] }],
    });
    expect(asi.status).toBe(200);

    const res = await postXp(id, { operations: [{ type: "set", value: XP_FOR_LEVEL[3] }] });
    expect(res.status).toBe(200);
    const after = (await get(id)).body;
    expect(after.abilityScores.strength).toBe(10); // the ASI was trimmed
    expect(after.hitPoints.max).toBe(21);
    expect(after.hitPoints.current).toBe(21); // NOT 18 (the term-less clamp)
  });

  // Control: a non-Draconic character's write-path numbers are unchanged (term = 0).
  it("non-Draconic control: long rest, heal cap, exhaustion, and level-down are unchanged", async () => {
    const wildMagic = (name: string, storedMaxHp: number, currentHp: number) =>
      createFixture({
        name,
        rulesEdition: "EDITION_2014",
        experiencePoints: XP_FOR_LEVEL[5],
        storedMaxHp,
        currentHp,
        entries: [{ name: "Sorcerer", classId: sorcererClassId, level: 5, subclass: "Wild Magic" }],
      });

    const restId = await wildMagic(`${NAME_PREFIX} seam control rest`, 30, 10);
    await postHp(restId, { operations: [{ type: "longRest" }] });
    const rested = (await get(restId)).body;
    expect(rested.hitPoints.max).toBe(30);
    expect(rested.hitPoints.current).toBe(30);

    const healId = await wildMagic(`${NAME_PREFIX} seam control heal`, 30, 20);
    await postHp(healId, { operations: [{ type: "heal", amount: 50 }] });
    expect((await get(healId)).body.hitPoints.current).toBe(30);

    const exhId = await wildMagic(`${NAME_PREFIX} seam control exh`, 28, 28);
    await postConditions(exhId, { operations: [{ type: "setExhaustion", level: 4 }] });
    const exhausted = (await get(exhId)).body;
    expect(exhausted.hitPoints.max).toBe(14); // floor(28 / 2), no subclass term
    expect(exhausted.hitPoints.current).toBe(14);

    const downId = await wildMagic(`${NAME_PREFIX} seam control down`, 30, 30);
    await postXp(downId, { operations: [{ type: "set", value: XP_FOR_LEVEL[3] }] });
    const downed = (await get(downId)).body;
    expect(downed.hitPoints.max).toBe(18); // 30 − 6 − 6, no subclass term
    expect(downed.hitPoints.current).toBe(18);
  });
});

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { upsertEditionRow } from "@/lib/rules/catalog-edition.js";

const OWNER_ID = "owner-subclass-choices";
let COOKIE: string;

const XP_LVL_1 = 0;
const XP_LVL_3 = 900;
const XP_LVL_7 = 23000;
const XP_LVL_11 = 85000;
const XP_LVL_15 = 165000;

const FIXTURE_ID = "test-subclass-choices-1";

const BASE_CHARACTER = {
  alignment: "True Neutral",
  initiativeBonus: 0,
  speed: 30,
  abilityScores: {
    strength: 10, dexterity: 14, constitution: 12, intelligence: 10, wisdom: 14, charisma: 10,
  },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

function agent() {
  return supertest.agent(app).set("Cookie", COOKIE);
}

interface ChoiceEntry { id: string; name: string; optionId?: string }
interface DerivedChoice { key: string; label: string; count: number; catalogSource: string }
interface ResourcesView {
  subclassChoices: DerivedChoice[];
  choicesKnown: Record<string, ChoiceEntry[]>;
}
function resources(res: { body: { resources: ResourcesView } }): ResourcesView {
  return res.body.resources;
}

async function post(operations: unknown[]) {
  return agent().post(`/api/characters/${FIXTURE_ID}/resources/transactions`).send({ operations });
}
async function setXp(value: number) {
  return agent().post(`/api/characters/${FIXTURE_ID}/experience`).send({ operations: [{ type: "set", value }] });
}
async function getCharacter() {
  return agent().get(`/api/characters/${FIXTURE_ID}`);
}

let colossusSlayerId: string; // huntersPrey
let hordeBreakerId: string; // huntersPrey
let steelWillId: string; // defensiveTactics
let volleyId: string; // hunterMultiattack, 2014-only
let evasionId: string; // superiorHuntersDefense, 2014-only

async function createHunter(
  level: number,
  xp: number,
  resourcesJson: Prisma.InputJsonValue | typeof Prisma.JsonNull,
  rulesEdition?: "EDITION_2014" | "EDITION_2024",
) {
  // classId/subclassId must come from the real seeded rows: characterInclude's
  // ClassFeature relations key off them, so a fixture that omits them loses
  // every feature (base and subclass).
  const rangerClass = await prisma.characterClass.findUniqueOrThrow({ where: { name: "Ranger" } });
  const hunterSubclass = await prisma.subclass.findFirstOrThrow({ where: { classId: rangerClass.id, name: "Hunter" }, orderBy: { id: "asc" } });
  return prisma.character.create({
    data: {
      ...BASE_CHARACTER,
      ownerId: OWNER_ID,
      id: FIXTURE_ID,
      name: "Subclass Choices Test Hunter",
      experiencePoints: xp,
      hitPoints: { current: 40, max: 40, temp: 0, deathSaves: { successes: 0, failures: 0 } },
      hitDice: { total: level, die: "d10", spent: 0 },
      spellcasting: Prisma.JsonNull,
      resources: resourcesJson,
      ...(rulesEdition ? { rulesEdition } : {}),
      classEntries: {
        create: [{ name: "ranger", classId: rangerClass.id, subclass: "hunter", subclassId: hunterSubclass.id, position: 0, level }],
      },
    },
  });
}

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
  // Colossus Slayer/Horde Breaker fork by edition (#1230), so their EDITION_2024
  // row must be resolved explicitly; Steel Will has no 2024 row so its name stays unique.
  const byName = async (name: string, edition?: "EDITION_2014" | "EDITION_2024") => {
    const row = await prisma.grantedAbility.findFirst({ where: { name, ...(edition ? { edition } : {}) } });
    if (!row) throw new Error(`Seed missing GrantedAbility "${name}" — run prisma db seed`);
    return row.id;
  };
  colossusSlayerId = await byName("Colossus Slayer", "EDITION_2024");
  hordeBreakerId = await byName("Horde Breaker", "EDITION_2024");
  steelWillId = await byName("Steel Will", "EDITION_2014");
  volleyId = await byName("Volley", "EDITION_2014");
  evasionId = await byName("Evasion", "EDITION_2014");
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
});

describe("GET /api/subclass-choices/:source", () => {
  it("lists the 2024 Hunter's Prey option catalog — Giant Killer has no 2024 successor (#1230)", async () => {
    const res = await agent().get("/api/subclass-choices/huntersPrey?edition=EDITION_2024");
    expect(res.status).toBe(200);
    const names = (res.body as { name: string }[]).map((o) => o.name).sort();
    expect(names).toEqual(["Colossus Slayer", "Horde Breaker"]);
  });

  it("lists the 2014 Hunter's Prey option catalog — all three original options, including Giant Killer", async () => {
    const res = await agent().get("/api/subclass-choices/huntersPrey?edition=EDITION_2014");
    expect(res.status).toBe(200);
    const names = (res.body as { name: string }[]).map((o) => o.name).sort();
    expect(names).toEqual(["Colossus Slayer", "Giant Killer", "Horde Breaker"]);
  });

  it("returns an empty array for an unknown source", async () => {
    const res = await agent().get("/api/subclass-choices/notAChoice?edition=EDITION_2024");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("400s an absent or unrecognized ?edition= (#1412)", async () => {
    const bare = await agent().get("/api/subclass-choices/huntersPrey");
    expect(bare.status).toBe(400);
    expect(bare.body.error).toBe("Missing required query parameter: edition");

    const unknown = await agent().get("/api/subclass-choices/huntersPrey?edition=bogus");
    expect(unknown.status).toBe(400);
    expect(unknown.body.error).toMatch(/^Unknown edition: /);
  });

  // Fixture cleanup deletes by NAME, never by an id var that would read to
  // Prisma as "no filter" if the create threw partway.
  it("(#1412) silently omits a 2014-tagged option from a 2024 request and serves it to a 2014 one", async () => {
    const FIXTURE_NAME = "XEd Hunters Prey 2014";
    const row = await upsertEditionRow(
      prisma.grantedAbility,
      { name: FIXTURE_NAME, edition: "EDITION_2014" },
      {
        name: FIXTURE_NAME,
        source: "huntersPrey",
        edition: "EDITION_2014",
        description: "Edition-filter test fixture.",
        minLevel: 3,
      },
      { source: "huntersPrey" },
    );
    try {
      const as2024 = await agent().get("/api/subclass-choices/huntersPrey?edition=EDITION_2024");
      expect(as2024.status).toBe(200);
      expect((as2024.body as { id: string }[]).some((o) => o.id === row.id)).toBe(false);
      expect((as2024.body as { name: string }[]).map((o) => o.name)).toContain("Colossus Slayer");

      const as2014 = await agent().get("/api/subclass-choices/huntersPrey?edition=EDITION_2014");
      expect(as2014.status).toBe(200);
      expect((as2014.body as { id: string }[]).some((o) => o.id === row.id)).toBe(true);
      expect((as2014.body as { name: string }[]).map((o) => o.name)).toContain("Colossus Slayer");
    } finally {
      await prisma.grantedAbility.deleteMany({ where: { name: FIXTURE_NAME } });
    }
  });
});

describe("subclass choices — derivation + ops", () => {
  beforeEach(async () => {
    await createHunter(7, XP_LVL_7, Prisma.JsonNull);
  });

  it("surfaces only the choices reached at this level (L7: huntersPrey + defensiveTactics)", async () => {
    const view = resources(await getCharacter());
    const keys = view.subclassChoices.map((c) => c.key).sort();
    expect(keys).toEqual(["defensiveTactics", "huntersPrey"]);
    const hp = view.subclassChoices.find((c) => c.key === "huntersPrey")!;
    expect(hp).toMatchObject({ label: "Hunter's Prey", count: 1, catalogSource: "huntersPrey" });
    expect(view.choicesKnown).toEqual({});
  });

  it("learnSubclassChoice from catalog records the pick and provenance", async () => {
    const res = await post([{ type: "learnSubclassChoice", choiceKey: "huntersPrey", optionId: colossusSlayerId }]);
    expect(res.status).toBe(200);
    const known = resources(res).choicesKnown.huntersPrey;
    expect(known).toHaveLength(1);
    expect(known[0]).toMatchObject({ name: "Colossus Slayer", optionId: colossusSlayerId });

    const events = await agent().get(`/api/characters/${FIXTURE_ID}/activity?category=resources`);
    expect(events.body[0].type).toBe("learnSubclassChoice");
    expect(events.body[0].summary).toBe("Chose Hunter's Prey: Colossus Slayer");
  });

  it("enforces the choose-1 cap", async () => {
    await post([{ type: "learnSubclassChoice", choiceKey: "huntersPrey", optionId: colossusSlayerId }]);
    const res = await post([{ type: "learnSubclassChoice", choiceKey: "huntersPrey", optionId: hordeBreakerId }]);
    expect(res.status).toBe(400);
  });

  it("rejects an option from the wrong choice's catalog", async () => {
    // steelWillId belongs to defensiveTactics, not huntersPrey.
    const res = await post([{ type: "learnSubclassChoice", choiceKey: "huntersPrey", optionId: steelWillId }]);
    expect(res.status).toBe(400);
  });

  it("rejects a malformed (non-UUID) optionId as a clean 400, not a 500", async () => {
    // GrantedAbility.id is a text PK, so a garbage id resolves to null (no Prisma P2023) and 400s cleanly.
    const res = await post([{ type: "learnSubclassChoice", choiceKey: "huntersPrey", optionId: "not-a-real-uuid" }]);
    expect(res.status).toBe(400);
  });

  it("rejects a choice this 2024 Hunter never gets — hunterMultiattack is 2014-only (#1230), absent from subclassChoices at any level", async () => {
    const res = await post([{ type: "learnSubclassChoice", choiceKey: "hunterMultiattack", custom: { name: "X", description: "Y" } }]);
    expect(res.status).toBe(400);
  });

  // PHB'14 Way of the Four Elements p.81 / Battle Master p.73 bind a choose-N
  // replacement to learn-time; only a level-up ceremony's "subclassChoice" step can forget a choice.
  it("400s forgetSubclassChoice — only reachable through a level-up ceremony step", async () => {
    const learn = await post([
      { type: "learnSubclassChoice", choiceKey: "defensiveTactics", custom: { name: "Homebrew Tactic", description: "Custom." } },
    ]);
    expect(learn.status).toBe(200);
    const entry = resources(learn).choicesKnown.defensiveTactics[0];
    expect(entry.optionId).toBeUndefined();

    const forget = await post([{ type: "forgetSubclassChoice", choiceKey: "defensiveTactics", entryId: entry.id }]);
    expect(forget.status).toBe(400);
    expect(forget.body.error).toMatch(/level-up ceremony/i);
    const char = await agent().get(`/api/characters/${FIXTURE_ID}`);
    expect(resources(char).choicesKnown.defensiveTactics).toHaveLength(1);
  });

  it("400s forgetting a non-existent entry (cadence-gated before entry lookup)", async () => {
    const res = await post([{ type: "forgetSubclassChoice", choiceKey: "huntersPrey", entryId: "nope" }]);
    expect(res.status).toBe(400);
  });
});

describe("subclass choices — level-down reconciliation", () => {
  it("trims a lost tier's choice on level-down but keeps still-granted picks", async () => {
    await createHunter(7, XP_LVL_7, {
      used: {},
      choicesKnown: {
        huntersPrey: [{ id: "hp1", optionId: colossusSlayerId, name: "Colossus Slayer", description: "d8." }],
        defensiveTactics: [{ id: "dt1", optionId: steelWillId, name: "Steel Will", description: "Save adv." }],
      },
    });

    const res = await setXp(XP_LVL_3); // L7 → L3: defensiveTactics (L7) lost, huntersPrey (L3) kept
    expect(res.status).toBe(200);
    const known = resources(res).choicesKnown;
    expect(known.huntersPrey).toHaveLength(1);
    expect(known.defensiveTactics).toBeUndefined();

    const event = await prisma.characterEvent.findFirst({
      where: { characterId: FIXTURE_ID, type: "subclassChoicesReconciled" },
    });
    expect(event?.summary).toBe("1 subclass choice removed — no longer available at this level");
    // before must snapshot BOTH picks (guards against the trim corrupting it via a shared reference); after only huntersPrey.
    const before = (event?.before as { resources: { choicesKnown: Record<string, unknown[]> } }).resources;
    const after = (event?.after as { resources: { choicesKnown: Record<string, unknown[]> } }).resources;
    expect(Object.keys(before.choicesKnown).sort()).toEqual(["defensiveTactics", "huntersPrey"]);
    expect(Object.keys(after.choicesKnown)).toEqual(["huntersPrey"]);
  });

  it("trims hunterMultiattack/superiorHuntersDefense for a 2024 Hunter (key no longer granted at all), but a pre-edition-pass pick under a still-granted key is NOT option-revalidated (tracked #1968)", async () => {
    await createHunter(15, XP_LVL_15, {
      used: {},
      choicesKnown: {
        huntersPrey: [{ id: "hp1", optionId: colossusSlayerId, name: "Colossus Slayer", description: "d8." }],
        defensiveTactics: [{ id: "dt1", optionId: steelWillId, name: "Steel Will", description: "Save adv." }],
        hunterMultiattack: [{ id: "hm1", name: "Volley", description: "Ranged AoE." }],
        superiorHuntersDefense: [{ id: "shd1", name: "Evasion", description: "Half/no damage." }],
      },
    });

    // A same-level XP "set" still runs reconcileLevelGatedState.
    const res = await setXp(XP_LVL_15);
    expect(res.status).toBe(200);
    const known = resources(res).choicesKnown;
    expect(known.huntersPrey).toHaveLength(1);
    // #1968: reconcileSubclassChoices trims by CHOICE KEY only, so this Steel
    // Will pick (2014-only) survives even though it's no longer offered to this 2024 character.
    expect(known.defensiveTactics).toHaveLength(1);
    expect(known.hunterMultiattack).toBeUndefined();
    expect(known.superiorHuntersDefense).toBeUndefined();
  });

  it("clears all choices when the subclass is lost (level below grant)", async () => {
    await createHunter(3, XP_LVL_3, {
      used: {},
      choicesKnown: {
        huntersPrey: [{ id: "hp1", optionId: colossusSlayerId, name: "Colossus Slayer", description: "d8." }],
      },
    });

    const res = await setXp(XP_LVL_1); // subclass cleared → no choices granted → all trimmed
    expect(res.status).toBe(200);
    expect(resources(res).choicesKnown).toEqual({});
  });
});

describe("2014 Hunter — hunterMultiattack/superiorHuntersDefense are reachable (#1230)", () => {
  it("a 2014 Hunter can learn hunterMultiattack from the catalog end-to-end", async () => {
    await createHunter(11, XP_LVL_11, Prisma.JsonNull, "EDITION_2014");
    const res = await post([{ type: "learnSubclassChoice", choiceKey: "hunterMultiattack", optionId: volleyId }]);
    expect(res.status).toBe(200);
    const known = resources(res).choicesKnown.hunterMultiattack;
    expect(known).toHaveLength(1);
    expect(known[0]).toMatchObject({ name: "Volley", optionId: volleyId });
  });

  it("a 2014 Hunter at L15 keeps BOTH picks through a real reconciliation pass — guards against a future edition-filter edit silently deleting real 2014 picks", async () => {
    await createHunter(
      15,
      XP_LVL_15,
      {
        used: {},
        choicesKnown: {
          hunterMultiattack: [{ id: "hm1", optionId: volleyId, name: "Volley", description: "Ranged AoE." }],
          superiorHuntersDefense: [{ id: "shd1", optionId: evasionId, name: "Evasion", description: "Half/no damage." }],
        },
      },
      "EDITION_2014",
    );

    const res = await setXp(XP_LVL_15); // a same-level XP "set" still runs reconcileLevelGatedState
    expect(res.status).toBe(200);
    const known = resources(res).choicesKnown;
    expect(known.hunterMultiattack).toHaveLength(1);
    expect(known.superiorHuntersDefense).toHaveLength(1);
  });
});

afterAll(async () => {
  await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
});

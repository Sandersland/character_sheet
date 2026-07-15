/**
 * Generic subclass "choose N" mechanism (#899).
 *
 * Exercises the data-driven choice pipeline end-to-end against real Postgres:
 *   - GET /api/subclass-choices/:source lists the seeded option catalog
 *   - resources.subclassChoices surfaces only the choices reached at this level
 *   - learn/forgetSubclassChoice ops (cap, wrong-catalog, dedup, custom)
 *   - reconcileSubclassChoices trims on level-down (tier lost, then subclass lost)
 *
 * Fixture: a Ranger whose "hunter" subclass declares four choose-ones
 * (Hunter's Prey L3, Defensive Tactics L7, Multiattack L11, Superior Hunter's
 * Defense L15). The subclass key "hunter" drives deriveResources directly, so no
 * Subclass catalog row is needed. The option rows come from the standard seed.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-subclass-choices";
let COOKIE: string;
const app = createApp();

// XP thresholds (levelForExperience): L1=0, L3=900, L7=23000.
const XP_LVL_1 = 0;
const XP_LVL_3 = 900;
const XP_LVL_7 = 23000;

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

// Option ids resolved from the seeded catalog (source = catalogSource).
let colossusSlayerId: string; // huntersPrey
let hordeBreakerId: string; // huntersPrey
let steelWillId: string; // defensiveTactics

async function createHunter(level: number, xp: number, resourcesJson: Prisma.InputJsonValue | typeof Prisma.JsonNull) {
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
      // name "ranger" + subclass "hunter" drive deriveResources directly.
      classEntries: { create: [{ name: "ranger", subclass: "hunter", position: 0, level }] },
    },
  });
}

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
  const byName = async (name: string) => {
    const row = await prisma.grantedAbility.findUnique({ where: { name } });
    if (!row) throw new Error(`Seed missing GrantedAbility "${name}" — run prisma db seed`);
    return row.id;
  };
  colossusSlayerId = await byName("Colossus Slayer");
  hordeBreakerId = await byName("Horde Breaker");
  steelWillId = await byName("Steel Will");
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
});

describe("GET /api/subclass-choices/:source", () => {
  it("lists the Hunter's Prey option catalog", async () => {
    const res = await agent().get("/api/subclass-choices/huntersPrey");
    expect(res.status).toBe(200);
    const names = (res.body as { name: string }[]).map((o) => o.name).sort();
    expect(names).toEqual(["Colossus Slayer", "Giant Killer", "Horde Breaker"]);
  });

  it("returns an empty array for an unknown source", async () => {
    const res = await agent().get("/api/subclass-choices/notAChoice");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
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

  it("rejects a choice the subclass has not reached yet (Multiattack is L11)", async () => {
    const res = await post([{ type: "learnSubclassChoice", choiceKey: "hunterMultiattack", custom: { name: "X", description: "Y" } }]);
    expect(res.status).toBe(400);
  });

  it("accepts a custom option and forgets it by entry id", async () => {
    const learn = await post([
      { type: "learnSubclassChoice", choiceKey: "defensiveTactics", custom: { name: "Homebrew Tactic", description: "Custom." } },
    ]);
    expect(learn.status).toBe(200);
    const entry = resources(learn).choicesKnown.defensiveTactics[0];
    expect(entry.optionId).toBeUndefined();

    const forget = await post([{ type: "forgetSubclassChoice", choiceKey: "defensiveTactics", entryId: entry.id }]);
    expect(forget.status).toBe(200);
    // Emptied key is dropped from the map.
    expect(resources(forget).choicesKnown.defensiveTactics).toBeUndefined();
  });

  it("400s forgetting a non-existent entry", async () => {
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
    // before must snapshot BOTH picks (guards the snapshot-ordering bug where the
    // trim corrupts the before payload via a shared reference), after only huntersPrey.
    const before = (event?.before as { resources: { choicesKnown: Record<string, unknown[]> } }).resources;
    const after = (event?.after as { resources: { choicesKnown: Record<string, unknown[]> } }).resources;
    expect(Object.keys(before.choicesKnown).sort()).toEqual(["defensiveTactics", "huntersPrey"]);
    expect(Object.keys(after.choicesKnown)).toEqual(["huntersPrey"]);
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

afterAll(async () => {
  await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
});

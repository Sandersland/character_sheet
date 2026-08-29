// SRD 5.1 serves "Use an Object" where SRD 5.2 serves "Utilize" under the same key — why the class row stores the key, never the name.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { seededSpeciesAnchor } from "@/test-support/species.js";
import { resolveSubclassSlug } from "@/lib/classes/subclass-slug.js";

const OWNER_ID = "owner-regrants-served";
const EDITIONS = ["EDITION_2014", "EDITION_2024"] as const;
const XP_BY_LEVEL: Record<number, number> = { 2: 300, 3: 900 };

let COOKIE: string;
const createdIds: string[] = [];

const BASE = {
  alignment: "Chaotic Neutral",
  background: "Sage",
  abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 12, wisdom: 10, charisma: 10 },
};

async function makeCharacter(
  rulesEdition: (typeof EDITIONS)[number],
  className: "Rogue" | "Monk",
  name: string,
  level: 2 | 3,
  subclass?: string,
): Promise<string> {
  const anchor = await seededSpeciesAnchor(rulesEdition);
  const res = await supertest(app)
    .post("/api/characters")
    .set("Cookie", COOKIE)
    .send({ ...BASE, ...anchor, classes: [{ name: className }], name, rulesEdition });
  expect(res.status).toBe(201);
  const id = res.body.id as string;
  createdIds.push(id);

  // Fast Hands (Thief) is row-driven (#1912) and reads subclassRef.features via a real subclassId FK — resolveSubclassSlug + a Subclass lookup, not a raw `subclass` string, matches production's own subclass-selection path.
  const subclassId = subclass
    ? (await prisma.subclass.findFirstOrThrow({ where: { slug: resolveSubclassSlug(className, { subclass }) ?? "" } })).id
    : undefined;
  await prisma.character.update({ where: { id }, data: { experiencePoints: XP_BY_LEVEL[level] } });
  await prisma.characterClassEntry.updateMany({ where: { characterId: id }, data: { level, subclass, subclassId } });
  return id;
}

interface ServedAction {
  key: string;
  name: string;
  cost: string;
}

async function servedUniversals(edition: string): Promise<Map<string, ServedAction>> {
  const res = await supertest(app).get(`/api/reference?edition=${edition}`).set("Cookie", COOKIE);
  expect(res.status).toBe(200);
  return new Map((res.body.universalActions as ServedAction[]).map((a) => [a.key, a]));
}

async function availableActions(id: string) {
  const res = await supertest(app).get(`/api/characters/${id}`).set("Cookie", COOKIE);
  expect(res.status).toBe(200);
  return res.body.availableActions as { key: string; cost: string; regrants?: string[] }[];
}

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
});

afterAll(async () => {
  await prisma.character.deleteMany({ where: { id: { in: createdIds } } });
});

describe("GET /api/characters/:id — availableActions[].regrants", () => {
  for (const edition of EDITIONS) {
    it(`${edition}: every regranted key is served as a universal action still costing an action`, async () => {
      const rogueL2 = await makeCharacter(edition, "Rogue", `Regrants Rogue L2 ${edition}`, 2);
      const thiefL3 = await makeCharacter(edition, "Rogue", `Regrants Thief L3 ${edition}`, 3, "Thief");
      // The monk exists for `dodge` on 2024: patientDefenseFocus is the only row that regrants it, and SRD 5.1's version (#1499, no free/paid split) means a 2014 monk never sees this row, so `dodge` drops from the 2014 seen set.
      const monkL2 = await makeCharacter(edition, "Monk", `Regrants Monk L2 ${edition}`, 2);
      const served = await servedUniversals(edition);

      const seen = new Set<string>();
      for (const id of [rogueL2, thiefL3, monkL2]) {
        for (const action of await availableActions(id)) {
          for (const key of action.regrants ?? []) {
            seen.add(key);
            const row = served.get(key);
            expect(row, `${action.key} regrants "${key}", which ${edition} does not serve`).toBeDefined();
            expect(row!.cost, `served "${key}" must stay an action for ${edition}`).toBe("action");
          }
        }
      }

      // Without this, the loop above passes vacuously on an empty payload.
      // SRD 5.1 PHB'14 p.78: patientDefenseKi lets you spend 1 ki to take Dodge as a bonus action.
      const expectedKeys = ["dash", "disengage", "dodge", "hide", "useObject"];
      expect([...seen].sort()).toEqual(expectedKeys);

      expect(served.get("useObject")!.name).toBe(edition === "EDITION_2024" ? "Utilize" : "Use an Object");
    });
  }

  it("Fast Hands is a Thief-only, level-3 bonus action in both editions", async () => {
    for (const edition of EDITIONS) {
      const thief = await availableActions(
        await makeCharacter(edition, "Rogue", `Fast Hands Thief ${edition}`, 3, "Thief"),
      );
      const plain = await availableActions(
        await makeCharacter(edition, "Rogue", `Fast Hands Rogue ${edition}`, 2),
      );

      expect(thief.find((a) => a.key === "fastHands")).toMatchObject({
        cost: "bonusAction",
        regrants: ["useObject"],
      });
      expect(plain.find((a) => a.key === "fastHands")).toBeUndefined();
      expect(plain.find((a) => a.key === "cunningAction")?.regrants).toEqual(["dash", "disengage", "hide"]);
    }
  });
});

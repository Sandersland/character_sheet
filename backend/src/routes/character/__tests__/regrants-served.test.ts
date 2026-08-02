/**
 * #1431 route-level drift gate. `regrants` is a list of KEYS, and the client
 * joins each against the universal action GET /api/reference serves for the
 * character's own edition — so the two payloads must agree on the wire, not
 * just in the source arrays seed-data.test.ts checks. A key the reference
 * response omits renders an unnamed grant; a key whose served row is not
 * `cost: "action"` makes "re-costs this action" a false claim.
 *
 * Both editions, because `regrants` takes no edition parameter (the mapping is
 * invariant) while the row it resolves to does — SRD 5.1 serves "Use an Object"
 * where SRD 5.2 serves "Utilize" under the same key, which is exactly why the
 * class row stores the key and never the name.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-regrants-served";
const EDITIONS = ["EDITION_2014", "EDITION_2024"] as const;
const XP_BY_LEVEL: Record<number, number> = { 2: 300, 3: 900 };

let COOKIE: string;
const createdIds: string[] = [];

const BASE = {
  alignment: "Chaotic Neutral",
  race: "Hill Dwarf",
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
  const res = await supertest(app)
    .post("/api/characters")
    .set("Cookie", COOKIE)
    .send({ ...BASE, classes: [{ name: className }], name, rulesEdition });
  expect(res.status).toBe(201);
  const id = res.body.id as string;
  createdIds.push(id);

  await prisma.character.update({ where: { id }, data: { experiencePoints: XP_BY_LEVEL[level] } });
  await prisma.characterClassEntry.updateMany({ where: { characterId: id }, data: { level, subclass } });
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
      // The monk is here for `dodge` on EDITION_2024: patientDefenseFocus is the
      // only row that regrants it, so without a monk the loop below would never
      // reach that key and the route gate would be narrower than
      // REGRANTED_UNIVERSAL_KEYS. #1499 tags patientDefenseFocus (and its three
      // Patient Defense / Step of the Wind siblings) EDITION_2024 — SRD 5.1's
      // versions cost a flat 1 ki with no free/paid split, so a 2014 monk no
      // longer sees this row at all (matchesActionGate filters it before
      // `regrants` is ever read), and "dodge" drops out of the 2014 seen set.
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

      // Without this the loop above passes vacuously on an empty payload. The
      // set is every key any DERIVED_ACTIONS row regrants today FOR THIS
      // edition, so a new row regranting something else has to widen this
      // deliberately. EDITION_2014 omits "dodge" (see the comment above);
      // EDITION_2024 is unchanged. This narrowed 2014 list is a snapshot of an
      // intentionally incomplete slice, not settled 5e: SRD 5.1 Patient Defense
      // (PHB'14 p. 78) does buy Dodge for 1 ki ("You can spend 1 ki point to
      // take the Dodge action as a bonus action on your turn"). #1500 authors
      // the ki-costed 2014 Patient Defense row and must widen EDITION_2014's
      // expected keys back to include "dodge" — do not read this list as
      // settled.
      const expectedKeys =
        edition === "EDITION_2024"
          ? ["dash", "disengage", "dodge", "hide", "useObject"]
          : ["dash", "disengage", "hide", "useObject"];
      expect([...seen].sort()).toEqual(expectedKeys);

      // The reason the class row stores keys: this ONE key resolves to two
      // different names, and only the served row knows which one applies.
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

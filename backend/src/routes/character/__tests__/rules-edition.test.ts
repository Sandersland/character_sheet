import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

// #1285: the rulesEdition discriminator. Existing rows stamp EDITION_2024
// because the shipped catalog is uniformly 2024 — stamping 2014 would point a
// sheet at rules for which no content exists (audit on #1281).
const OWNER_ID = "owner-rules-edition";
let COOKIE: string;
const app = createApp();

const BASE = {
  alignment: "True Neutral",
  race: "Hill Dwarf",
  background: "Sage",
  classes: [{ name: "Fighter" }],
  abilityScores: { strength: 15, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 8 },
};

function create(body: object) {
  return supertest(app).post("/api/characters").set("Cookie", COOKIE).send(body);
}
function get(id: string) {
  return supertest(app).get(`/api/characters/${id}`).set("Cookie", COOKIE);
}

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
});

const cleanup = () => prisma.character.deleteMany({ where: { name: { startsWith: "RulesEdition" } } });
afterEach(cleanup);
afterAll(cleanup);

describe("rulesEdition on the character wire (#1285)", () => {
  it("a character created with no edition defaults to EDITION_2024", async () => {
    const res = await create({ ...BASE, name: "RulesEdition Default" });

    expect(res.status).toBe(201);
    expect(res.body.rulesEdition).toBe("EDITION_2024");
  });

  it("GET /api/characters/:id exposes rulesEdition", async () => {
    const created = await create({ ...BASE, name: "RulesEdition Get" });
    const res = await get(created.body.id);

    expect(res.status).toBe(200);
    expect(res.body.rulesEdition).toBe("EDITION_2024");
  });

  it("POST /api/characters honours rulesEdition: EDITION_2014", async () => {
    const res = await create({ ...BASE, name: "RulesEdition Fourteen", rulesEdition: "EDITION_2014" });

    expect(res.status).toBe(201);
    expect(res.body.rulesEdition).toBe("EDITION_2014");
  });
});

// Write-once (#1281, 2026-07-25). These are regression pins, not red-first
// tests: .strict() on updateCharacterSchema already rejects an unknown key, so
// they pass before the change. Their value is failing the day someone adds
// rulesEdition to a mutable schema.
describe("rulesEdition is write-once (#1285)", () => {
  async function make2014() {
    const res = await create({ ...BASE, name: "RulesEdition Immutable", rulesEdition: "EDITION_2014" });
    return res.body.id as string;
  }

  it("PATCH /api/characters/:id rejects rulesEdition and leaves the sheet on 2014", async () => {
    const id = await make2014();

    const patch = await supertest(app)
      .patch(`/api/characters/${id}`)
      .set("Cookie", COOKIE)
      .send({ rulesEdition: "EDITION_2024" });

    expect(patch.status).toBe(400);
    expect((await get(id)).body.rulesEdition).toBe("EDITION_2014");
  });

  it("PATCH rejects an unknown edition value", async () => {
    const id = await make2014();

    const patch = await supertest(app)
      .patch(`/api/characters/${id}`)
      .set("Cookie", COOKIE)
      .send({ rulesEdition: "EDITION_2000" });

    expect(patch.status).toBe(400);
  });

  it("an XP transaction does not change rulesEdition", async () => {
    const id = await make2014();

    const xp = await supertest(app)
      .post(`/api/characters/${id}/experience`)
      .set("Cookie", COOKIE)
      .send({ operations: [{ type: "set", value: 900 }] });

    expect(xp.status).toBe(200);
    expect(xp.body.rulesEdition).toBe("EDITION_2014");
  });
});

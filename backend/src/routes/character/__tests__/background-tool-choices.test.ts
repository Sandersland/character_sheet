// #1779: Background now carries its own toolChoices/toolChoiceCount pair
// (mirroring CharacterClass's), so a background can grant a tool CHOICE —
// PHB'14/PHB'24 Soldier's "one type of gaming set" — not just a fixed grant.
// This proves the server validates backgroundToolChoices against
// background.toolChoices/toolChoiceCount independently of the class's own
// toolChoices/toolChoiceCount pool+cap (validateToolChoicePicks in
// character-create.ts), and that a valid pick persists with source:"background".
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { seededSpeciesAnchor } from "@/test-support/species.js";

const OWNER_ID = "owner-background-tool-choices";
let COOKIE: string;
const createdCharacterIds: string[] = [];

beforeAll(async () => {
  COOKIE = await authCookie(OWNER_ID);
});

afterAll(async () => {
  await prisma.character.deleteMany({ where: { id: { in: createdCharacterIds } } });
});

async function baseBody(overrides: Record<string, unknown> = {}) {
  const anchor = await seededSpeciesAnchor("EDITION_2024");
  return {
    name: "Fixture",
    alignment: "True Neutral",
    ...anchor,
    background: "Soldier",
    classes: [{ name: "Fighter" }],
    abilityScores: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
    skillProficiencies: [] as string[],
    rulesEdition: "EDITION_2024" as const,
    ...overrides,
  };
}

describe("POST /api/characters — background tool choices (#1779)", () => {
  it("accepts a Soldier's Gaming Set pick and persists it with source: background", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send(await baseBody({ backgroundToolChoices: ["Playing Card Set"] }));

    expect(response.status).toBe(201);
    createdCharacterIds.push(response.body.id);
    expect(response.body.toolProficiencies).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Playing Card Set", source: "background" })]),
    );
    // Never pre-granted — the whole point of the choice.
    expect(response.body.toolProficiencies).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Dice Set" })]),
    );
  });

  it("rejects a background tool pick outside background.toolChoices", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send(await baseBody({ backgroundToolChoices: ["Thieves' Tools"] }));

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/background's toolChoices list/i);
    if (response.status === 201) createdCharacterIds.push(response.body.id);
  });

  it("rejects a background tool pick exceeding background.toolChoiceCount", async () => {
    const response = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send(await baseBody({ backgroundToolChoices: ["Dice Set", "Playing Card Set"] }));

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/too many background tool choices/i);
    if (response.status === 201) createdCharacterIds.push(response.body.id);
  });

  it("omitting backgroundToolChoices grants nothing extra (no auto Dice Set, no error)", async () => {
    const response = await supertest.agent(app).set("Cookie", COOKIE).post("/api/characters").send(await baseBody());

    expect(response.status).toBe(201);
    createdCharacterIds.push(response.body.id);
    expect(response.body.toolProficiencies).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Dice Set" })]),
    );
  });

  // Independence: a class tool-choice pool/cap (Bard) and the background's
  // own (Soldier) validate and persist SEPARATELY — one doesn't spend or
  // gate the other's count, and each rejects only against its OWN pool.
  it("validates class and background tool choices independently (Bard + Soldier)", async () => {
    const ok = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send(
        await baseBody({
          classes: [{ name: "Bard" }],
          toolChoices: ["Flute", "Drum", "Lute"],
          backgroundToolChoices: ["Dragonchess Set"],
        }),
      );
    expect(ok.status).toBe(201);
    createdCharacterIds.push(ok.body.id);
    const names: string[] = ok.body.toolProficiencies.map((t: { name: string }) => t.name);
    expect(names).toEqual(expect.arrayContaining(["Flute", "Drum", "Lute", "Dragonchess Set"]));

    // A background pick outside its own pool 400s even though the class picks
    // (a totally separate pool) are all individually valid.
    const rejected = await supertest
      .agent(app)
      .set("Cookie", COOKIE)
      .post("/api/characters")
      .send(
        await baseBody({
          classes: [{ name: "Bard" }],
          toolChoices: ["Flute", "Drum", "Lute"],
          backgroundToolChoices: ["Flute"], // valid for Bard's pool, not Soldier's
        }),
      );
    expect(rejected.status).toBe(400);
    expect(rejected.body.error).toMatch(/background's toolChoices list/i);
    if (rejected.status === 201) createdCharacterIds.push(rejected.body.id);
  });
});

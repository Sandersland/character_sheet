// buildOriginEntry re-resolves the origin feat by the creating character's edition, not the seed-time-baked FK on Background.originFeatId. An Origin feat is a PHB'24-only mechanic — a 2014 character gets none (#1306, #1504).
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { seededSpeciesAnchor } from "@/test-support/species.js";

const OWNER_ID = "owner-origin-feat-edition-1306";
let COOKIE: string;

const BASE = {
  alignment: "True Neutral",
  background: "Criminal",
  classes: [{ name: "Fighter" }],
  abilityScores: { strength: 10, dexterity: 13, constitution: 14, intelligence: 12, wisdom: 10, charisma: 8 },
};

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { name: { startsWith: "OriginEdition" } } });
});

async function createCriminal(name: string, rulesEdition: "EDITION_2014" | "EDITION_2024") {
  const anchor = await seededSpeciesAnchor(rulesEdition);
  const res = await supertest(app).post("/api/characters").set("Cookie", COOKIE).send({ ...BASE, ...anchor, name, rulesEdition });
  expect(res.status).toBe(201);
  return res.body;
}

describe("origin feat resolves per creating-character edition, not the seed-time FK (#1306); 2014 gets none at all (#1504)", () => {
  it("a 2024 Criminal gets the +PB Alert row; a 2014 Criminal gets no origin feat", async () => {
    const char2014 = await createCriminal("OriginEdition Criminal 2014", "EDITION_2014");
    const char2024 = await createCriminal("OriginEdition Criminal 2024", "EDITION_2024");

    expect(char2014.advancements).toHaveLength(0);
    expect(char2014.initiativeBonus).toBe(1);

    expect(char2024.advancements).toHaveLength(1);
    expect(char2024.advancements[0].featName).toBe("Alert");
    // SRD 5.2: +Proficiency Bonus, scaling.
    expect(char2024.advancements[0].improvements).toEqual([
      { target: "initiative", amount: 1, scaling: "proficiencyBonus" },
    ]);
    expect(char2024.initiativeBonus).toBe(3);
  });
});

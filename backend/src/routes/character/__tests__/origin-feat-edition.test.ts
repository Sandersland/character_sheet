/**
 * #1306 acceptance criterion: a 2014-stamped and a 2024-stamped character
 * resolve the SAME catalog lookup (Criminal's Origin feat, "Alert") to
 * DIFFERENT rows through a REAL character-creation path — not a unit test
 * calling resolveEditionRow directly on hand-picked rows.
 *
 * Criminal's Background row stays edition: null (shared) so BOTH editions can
 * select it; Background.originFeatId is a single FK fixed at seed time to the
 * 2024 row (the reference-display default, same reasoning as reference.ts's
 * subclassLevel hardcode). character-create.ts's buildOriginEntry re-resolves
 * the origin feat by name against the CREATING character's own edition rather
 * than trusting that baked FK, so a 2014 Criminal lands on the 2014 Alert row.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-origin-feat-edition-1306";
let COOKIE: string;
const app = createApp();

const BASE = {
  alignment: "True Neutral",
  race: "Human",
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
  const res = await supertest(app).post("/api/characters").set("Cookie", COOKIE).send({ ...BASE, name, rulesEdition });
  expect(res.status).toBe(201);
  return res.body;
}

describe("origin feat resolves per creating-character edition, not the seed-time FK (#1306)", () => {
  it("a 2014 Criminal gets the flat +5 Alert; a 2024 Criminal gets the +PB Alert — same name, different catalog rows", async () => {
    const char2014 = await createCriminal("OriginEdition Criminal 2014", "EDITION_2014");
    const char2024 = await createCriminal("OriginEdition Criminal 2024", "EDITION_2024");

    expect(char2014.advancements).toHaveLength(1);
    expect(char2024.advancements).toHaveLength(1);
    expect(char2014.advancements[0].featName).toBe("Alert");
    expect(char2024.advancements[0].featName).toBe("Alert");

    // Different catalog rows resolved for the same lookup — the acceptance bar.
    expect(char2014.advancements[0].featId).not.toBe(char2024.advancements[0].featId);

    // PHB'14 p.165: flat +5 initiative, no scaling.
    expect(char2014.advancements[0].improvements).toEqual([{ target: "initiative", amount: 5 }]);
    // SRD 5.2: +Proficiency Bonus, scaling.
    expect(char2024.advancements[0].improvements).toEqual([
      { target: "initiative", amount: 1, scaling: "proficiencyBonus" },
    ]);

    // DEX 13 → +1 base. 2014: +1 + flat 5 = 6. 2024 (level 1, PB +2): +1 + 2 = 3.
    expect(char2014.initiativeBonus).toBe(6);
    expect(char2024.initiativeBonus).toBe(3);
  });
});

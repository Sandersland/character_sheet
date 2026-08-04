/**
 * #1306 acceptance criterion: a 2024-stamped character resolves Criminal's
 * Origin feat ("Alert") by the CREATING character's own edition, not the
 * seed-time-baked FK — through a REAL character-creation path, not a unit
 * test calling resolveEditionRow directly on hand-picked rows.
 *
 * Criminal's Background row stays edition: null (shared) so both editions can
 * select it; Background.originFeatId is a single FK fixed at seed time to the
 * 2024 row (the reference-display default, same reasoning as reference.ts's
 * subclassLevel hardcode). character-create.ts's buildOriginEntry re-resolves
 * the origin feat by name against the creating character's edition rather
 * than trusting that baked FK — proven here by resolving a real feat, not by
 * asserting the FK was ignored in the abstract.
 *
 * #1504 (2026-08-03) found the 2014 half of this file's original premise was
 * itself the bug: an Origin feat is a PHB'24-only mechanic, so a 2014
 * character must get NONE, not "the 2014-flavored Alert" — this file now
 * proves both halves from the same real-creation-path pattern.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-origin-feat-edition-1306";
let COOKIE: string;

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

describe("origin feat resolves per creating-character edition, not the seed-time FK (#1306); 2014 gets none at all (#1504)", () => {
  it("a 2024 Criminal gets the +PB Alert row; a 2014 Criminal gets no origin feat", async () => {
    const char2014 = await createCriminal("OriginEdition Criminal 2014", "EDITION_2014");
    const char2024 = await createCriminal("OriginEdition Criminal 2024", "EDITION_2024");

    // #1504: Origin feats are a PHB'24-only mechanic — a 2014 Criminal gets
    // NEITHER edition's Alert, not "the 2014-flavored one" (the live bug this
    // issue found: a real, derived +5 initiative on a 2014 sheet).
    expect(char2014.advancements).toHaveLength(0);
    expect(char2014.initiativeBonus).toBe(1); // DEX 13 → +1, no Alert bonus.

    // #1306: still resolved by the creating character's OWN edition, not the
    // seed-time-baked FK (which points at the 2024 row).
    expect(char2024.advancements).toHaveLength(1);
    expect(char2024.advancements[0].featName).toBe("Alert");
    // SRD 5.2: +Proficiency Bonus, scaling.
    expect(char2024.advancements[0].improvements).toEqual([
      { target: "initiative", amount: 1, scaling: "proficiencyBonus" },
    ]);
    // DEX 13 → +1 base, +PB (2 at level 1) from Alert = 3.
    expect(char2024.initiativeBonus).toBe(3);
  });
});

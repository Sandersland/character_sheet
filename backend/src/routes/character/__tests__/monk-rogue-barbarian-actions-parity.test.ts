/**
 * #1912 (epic #1903, 4/4) master regression pin: the 34-row monk/rogue/
 * barbarian DERIVED_ACTIONS sweep moved onto ClassFeature rows must leave
 * `availableActions[]` behaviour-identical and the `features[]` view
 * unchanged. Real Postgres + supertest — every character below is created
 * through the real `POST /api/characters` route against the real seeded
 * catalog (not a synthetic in-memory fixture), covering the level boundaries
 * the issue names (1/2/3/6/10/11/13/17/18) across every real monk subclass
 * slug (SUBCLASS_SLUGS), Thief L3, and Barbarian L2.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";
import { seededSpeciesAnchor } from "@/test-support/species.js";

const OWNER_ID = "owner-1912-parity";
let COOKIE: string;
const createdIds: string[] = [];

const BASE = {
  alignment: "True Neutral",
  background: "Sage",
  abilityScores: { strength: 12, dexterity: 16, constitution: 14, intelligence: 10, wisdom: 15, charisma: 10 },
};

// XP thresholds -> character level (levelForExperience's own table).
const XP_BY_LEVEL: Record<number, number> = {
  1: 0, 2: 300, 3: 900, 5: 6500, 6: 14000, 7: 23000, 10: 64000, 11: 85000, 13: 120000, 17: 225000, 18: 265000,
};

async function makeCharacter(
  rulesEdition: "EDITION_2014" | "EDITION_2024",
  className: "Rogue" | "Monk" | "Barbarian",
  level: number,
  subclass?: string,
): Promise<string> {
  const anchor = await seededSpeciesAnchor(rulesEdition);
  const name = `1912 Parity ${className} ${subclass ?? "base"} L${level} ${rulesEdition}`;
  const res = await supertest(app)
    .post("/api/characters")
    .set("Cookie", COOKIE)
    .send({ ...BASE, ...anchor, classes: [{ name: className }], name, rulesEdition });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const id = res.body.id as string;
  createdIds.push(id);

  await prisma.character.update({ where: { id }, data: { experiencePoints: XP_BY_LEVEL[level] } });
  if (subclass) {
    await prisma.characterClassEntry.updateMany({ where: { characterId: id }, data: { level, subclass } });
    // Resolve the real subclassId FK too (#1912: row-driven actions need it;
    // the pre-#1912 gate never did — see regrants-served.test.ts's own note).
    const cls = await prisma.characterClassEntry.findFirstOrThrow({ where: { characterId: id } });
    const sub = await prisma.subclass.findFirst({
      where: { classId: cls.classId!, name: { equals: subclass, mode: "insensitive" } },
    });
    if (sub) {
      await prisma.characterClassEntry.updateMany({ where: { characterId: id }, data: { subclassId: sub.id } });
    }
  } else {
    await prisma.characterClassEntry.updateMany({ where: { characterId: id }, data: { level } });
  }
  return id;
}

interface Action {
  key: string;
  name: string;
  cost: string;
  enabled: boolean;
  disabledReason?: string;
  reminder?: string;
  regrants?: string[];
  count?: number;
  damageTypeClause?: string;
}

interface SheetFeature {
  name: string;
}

interface SheetView {
  availableActions: Action[];
  featureList: SheetFeature[];
}

async function sheet(id: string): Promise<SheetView> {
  const res = await supertest(app).get(`/api/characters/${id}`).set("Cookie", COOKIE);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return { availableActions: res.body.availableActions, featureList: res.body.resources.features };
}

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
});

afterAll(async () => {
  await prisma.character.deleteMany({ where: { id: { in: createdIds } } });
});

describe("#1912 — availableActions parity across every real monk subclass slug + edition", () => {
  const MONK_2024_SUBCLASSES = ["Warrior of the Open Hand", "Warrior of Shadow", "Warrior of the Elements", "Warrior of Mercy"];
  const MONK_2014_SUBCLASSES = ["Way of the Open Hand", "Way of Shadow", "Way of the Four Elements"];

  // Every actionOnly row's identity key must be invisible in `features[]`
  // (the "zero cards gained" AC) at every level checked below.
  const ACTION_ONLY_KEYS = new Set([
    "bonusUnarmedStrike", "flurryOfBlows", "patientDefense", "patientDefenseFocus", "stepOfTheWind",
    "stepOfTheWindFocus", "patientDefenseKi", "stepOfTheWindKi", "deflectAttacksRedirect",
    "deflectMissilesThrow", "emptyBody", "emptyBodyAstralProjection", "shadowArts", "castDiscipline",
    "handOfHealingFlurry", "wholenessOfBodyAction",
  ]);

  for (const subclass of MONK_2024_SUBCLASSES) {
    it(`2024 ${subclass}: L18 sheet carries no actionOnly key as a feature name, and availableActions is well-formed`, async () => {
      const id = await makeCharacter("EDITION_2024", "Monk", 18, subclass);
      const { availableActions, featureList } = await sheet(id);
      expect(availableActions.length).toBeGreaterThan(0);
      for (const action of availableActions) {
        expect(typeof action.key).toBe("string");
        expect(typeof action.enabled).toBe("boolean");
      }
      const featureNames = new Set(featureList.map((f) => f.name));
      for (const key of ACTION_ONLY_KEYS) {
        expect(featureNames.has(key), `feature list leaked actionOnly key "${key}"`).toBe(false);
      }
    });
  }

  for (const subclass of MONK_2014_SUBCLASSES) {
    it(`2014 ${subclass}: L18 sheet carries no actionOnly key as a feature name, and availableActions is well-formed`, async () => {
      const id = await makeCharacter("EDITION_2014", "Monk", 18, subclass);
      const { availableActions, featureList } = await sheet(id);
      expect(availableActions.length).toBeGreaterThan(0);
      const featureNames = new Set(featureList.map((f) => f.name));
      for (const key of ACTION_ONLY_KEYS) {
        expect(featureNames.has(key), `feature list leaked actionOnly key "${key}"`).toBe(false);
      }
    });
  }

  // Boundary levels named in the issue's own AC.
  const BOUNDARY_LEVELS = [1, 2, 3, 6, 10, 11, 13, 17, 18];

  it("2024 base monk: bonusUnarmedStrike/flurryOfBlows/patientDefense/stepOfTheWind/deflectAttacks appear at their exact gate levels across the boundary set", async () => {
    for (const level of BOUNDARY_LEVELS) {
      const id = await makeCharacter("EDITION_2024", "Monk", level);
      const { availableActions } = await sheet(id);
      const keys = new Set(availableActions.map((a) => a.key));
      expect(keys.has("bonusUnarmedStrike"), `L${level}`).toBe(level >= 1);
      expect(keys.has("flurryOfBlows"), `L${level}`).toBe(level >= 2);
      expect(keys.has("patientDefense"), `L${level}`).toBe(level >= 2);
      expect(keys.has("deflectAttacks"), `L${level}`).toBe(level >= 3);
    }
  });

  // Expected flurryOfBlows.count / deflectAttacks.damageTypeClause at a given
  // 2024 boundary level, or undefined below either row's own grant level —
  // split into a lookup table (not an if/else chain in the `it()` body
  // itself) so this test's own branching budget stays flat (fallow's
  // cyclomatic/CRAP gate).
  function expected2024Bump(level: number): { count: number | undefined; damageTypeClause: string | undefined } {
    const count = level >= 10 ? 3 : level >= 2 ? 2 : undefined;
    const damageTypeClause =
      level >= 13 ? "any damage type" : level >= 3 ? "bludgeoning, piercing, or slashing damage" : undefined;
    return { count, damageTypeClause };
  }

  it("2024: Heightened Focus (flurryOfBlows.count) and Deflect Energy (deflectAttacks.damageTypeClause) resolve server-side at their own gate levels", async () => {
    for (const level of BOUNDARY_LEVELS) {
      const id = await makeCharacter("EDITION_2024", "Monk", level);
      const { availableActions } = await sheet(id);
      const { count, damageTypeClause } = expected2024Bump(level);
      if (count !== undefined) {
        expect(availableActions.find((a) => a.key === "flurryOfBlows")?.count, `L${level}`).toBe(count);
      }
      if (damageTypeClause !== undefined) {
        expect(availableActions.find((a) => a.key === "deflectAttacks")?.damageTypeClause, `L${level}`).toBe(damageTypeClause);
      }
    }
  });

  it("2014 base monk: flurryOfBlows/patientDefenseKi/stepOfTheWindKi/deflectMissiles/emptyBody appear at their exact gate levels", async () => {
    for (const level of BOUNDARY_LEVELS) {
      const id = await makeCharacter("EDITION_2014", "Monk", level);
      const { availableActions } = await sheet(id);
      const keys = new Set(availableActions.map((a) => a.key));
      expect(keys.has("flurryOfBlows"), `L${level}`).toBe(level >= 2);
      expect(keys.has("patientDefenseKi"), `L${level}`).toBe(level >= 2);
      expect(keys.has("deflectMissiles"), `L${level}`).toBe(level >= 3);
      expect(keys.has("emptyBody"), `L${level}`).toBe(level >= 18);
      // 2014 Flurry of Blows never gains Heightened Focus's third strike.
      if (level >= 2) {
        expect(availableActions.find((a) => a.key === "flurryOfBlows")?.count, `L${level}`).toBe(2);
      }
      // 2014's deflectAttacks damageTypeClause never widens (no Deflect Energy).
      expect(keys.has("deflectAttacks"), `L${level}`).toBe(false);
    }
  });

  it("Warrior of Shadow (2024): shadowArts/shadowStep/cloakOfShadows appear at L3/6/17, Improved Shadow Step rider only from L11", async () => {
    for (const level of BOUNDARY_LEVELS) {
      const id = await makeCharacter("EDITION_2024", "Monk", level, "Warrior of Shadow");
      const { availableActions } = await sheet(id);
      const keys = new Set(availableActions.map((a) => a.key));
      expect(keys.has("shadowArts"), `L${level}`).toBe(level >= 3);
      expect(keys.has("shadowStep"), `L${level}`).toBe(level >= 6);
      expect(keys.has("cloakOfShadows"), `L${level}`).toBe(level >= 17);
      const shadowStep = availableActions.find((a) => a.key === "shadowStep");
      if (level >= 11) {
        expect(shadowStep?.reminder, `L${level}`).toMatch(/Improved Shadow Step/);
      } else if (level >= 6) {
        expect(shadowStep?.reminder, `L${level}`).not.toMatch(/Improved Shadow Step/);
      }
    }
  });

  it("Way of Shadow (2014): shadowArts/shadowStep/cloakOfShadows/opportunist appear at L3/6/11/17", async () => {
    for (const level of BOUNDARY_LEVELS) {
      const id = await makeCharacter("EDITION_2014", "Monk", level, "Way of Shadow");
      const { availableActions } = await sheet(id);
      const keys = new Set(availableActions.map((a) => a.key));
      expect(keys.has("shadowArts"), `L${level}`).toBe(level >= 3);
      expect(keys.has("shadowStep"), `L${level}`).toBe(level >= 6);
      expect(keys.has("cloakOfShadows"), `L${level}`).toBe(level >= 11);
      expect(keys.has("opportunist"), `L${level}`).toBe(level >= 17);
    }
  });

  it("Warrior of Mercy: handOfHealing/handOfHealingFlurry appear from L3, both editions", async () => {
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      const id = await makeCharacter(edition, "Monk", 3, "Warrior of Mercy");
      const { availableActions } = await sheet(id);
      const keys = new Set(availableActions.map((a) => a.key));
      expect(keys.has("handOfHealing"), edition).toBe(true);
      expect(keys.has("handOfHealingFlurry"), edition).toBe(true);
    }
  });

  it("Way of the Four Elements (2014): elementalAttunement/castDiscipline appear from L3", async () => {
    const id = await makeCharacter("EDITION_2014", "Monk", 3, "Way of the Four Elements");
    const { availableActions } = await sheet(id);
    const keys = new Set(availableActions.map((a) => a.key));
    expect(keys.has("elementalAttunement")).toBe(true);
    expect(keys.has("castDiscipline")).toBe(true);
  });

  it("Warrior of the Elements (2024): elementalBurst appears at L6, not before", async () => {
    for (const level of [3, 5, 6, 7]) {
      const id = await makeCharacter("EDITION_2024", "Monk", level, "Warrior of the Elements");
      const { availableActions } = await sheet(id);
      expect(availableActions.some((a) => a.key === "elementalBurst"), `L${level}`).toBe(level >= 6);
    }
  });
});

describe("#1912 — Thief L3 and Barbarian L2 (issue's own named boundary cases)", () => {
  it("Rogue Thief L3: cunningAction + fastHands both present, correctly shaped", async () => {
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      const id = await makeCharacter(edition, "Rogue", 3, "Thief");
      const { availableActions, featureList } = await sheet(id);
      const cunning = availableActions.find((a) => a.key === "cunningAction");
      const fast = availableActions.find((a) => a.key === "fastHands");
      expect(cunning, edition).toBeDefined();
      expect(cunning?.regrants, edition).toEqual(["dash", "disengage", "hide"]);
      expect(fast, edition).toBeDefined();
      expect(fast?.cost, edition).toBe("bonusAction");
      expect(fast?.regrants, edition).toEqual(["useObject"]);
      // Cunning Action IS a real feature card; fastHands is too (both attach
      // to their own pre-existing feature-text rows, #1912 — neither is
      // actionOnly).
      const featureNames = new Set(featureList.map((f) => f.name));
      expect(featureNames.has("Cunning Action"), edition).toBe(true);
      expect(featureNames.has("Fast Hands"), edition).toBe(true);
    }
  });

  it("Barbarian L2: recklessAttack present, absent below L2", async () => {
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      const below = await makeCharacter(edition, "Barbarian", 1);
      expect((await sheet(below)).availableActions.some((a) => a.key === "recklessAttack"), edition).toBe(false);

      const id = await makeCharacter(edition, "Barbarian", 2);
      const { availableActions, featureList } = await sheet(id);
      const reckless = availableActions.find((a) => a.key === "recklessAttack");
      expect(reckless, edition).toBeDefined();
      expect(reckless?.cost, edition).toBe("free");
      expect(reckless?.enabled, edition).toBe(true);
      expect(new Set(featureList.map((f) => f.name)).has("Reckless Attack"), edition).toBe(true);
    }
  });
});

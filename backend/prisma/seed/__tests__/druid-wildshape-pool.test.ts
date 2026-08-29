// Wild Shape's pool is row-driven in both editions (#906/#1226): the
// EDITION_2024 row carries resourceTotals/shortRestRegain; EDITION_2014's own
// base row carries the `total: 99` Archdruid tier at level 20 (SRD 5.1 is
// correct, not legacy), with Circle of the Moon overriding it via its own
// Circle Forms row. DB-backed via loadDbFeatureRows — the real
// deriveResources path a sheet resolves through, which is what lets this also
// prove Moonlight Step never double-emits.
//
// Lives prisma-side because it imports DRUID_FEATURES — a src file importing
// anything under prisma/ is a TS6059 compile error (rootDir "src").
import { describe, expect, it } from "vitest";

import { deriveResources } from "@/lib/classes/class-features.js";
import { loadDbFeatureRows } from "@/lib/classes/__tests__/db-feature-rows.fixture.js";
import { restPoolRegain } from "@/lib/combat/rest.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { DRUID_FEATURES } from "../druid-features.js";

const BASE_SCORES = { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };

async function wildShapePool(level: number, edition: "EDITION_2014" | "EDITION_2024", subclass?: string) {
  const featureRows = await loadDbFeatureRows("druid", subclass);
  const info = deriveResources("druid", subclass, level, BASE_SCORES, proficiencyBonusForLevel(level), featureRows, edition);
  return info?.resources.find((r) => r.key === "wildShape");
}

async function moonlightStepPool(level: number, wisdom: number, edition: "EDITION_2014" | "EDITION_2024") {
  const featureRows = await loadDbFeatureRows("druid", "circle of the moon");
  const info = deriveResources(
    "druid",
    "circle of the moon",
    level,
    { ...BASE_SCORES, wisdom },
    proficiencyBonusForLevel(level),
    featureRows,
    edition,
  );
  return info?.resources.find((r) => r.key === "moonlightStep");
}

describe("Wild Shape pool, EDITION_2024 (#1226): 2/3/4 tiers, longRest + shortRestRegain: 1", () => {
  const TOTALS: [level: number, total: number][] = [
    [2, 2], [3, 2], [4, 2], [5, 2],
    [6, 3], [10, 3], [16, 3],
    [17, 4], [18, 4], [19, 4], [20, 4],
  ];

  it.each(TOTALS)("level %i -> total %i", async (level, total) => {
    const pool = await wildShapePool(level, "EDITION_2024");
    expect(pool?.total).toBe(total);
  });

  it("absent below level 2", async () => {
    expect(await wildShapePool(1, "EDITION_2024")).toBeUndefined();
  });

  it("recharge is longRest and shortRestRegain is 1 at every level >= 2", async () => {
    for (const level of [2, 6, 17, 20]) {
      const pool = await wildShapePool(level, "EDITION_2024");
      expect(pool?.recharge, `level ${level}`).toBe("longRest");
      expect(pool?.shortRestRegain, `level ${level}`).toBe(1);
    }
  });

  it("restPoolRegain: a Short Rest restores exactly 1 of 2 used; a Long Rest restores all", async () => {
    const pool = await wildShapePool(2, "EDITION_2024");
    expect(restPoolRegain(pool!, 2, "short")).toEqual({ nextUsed: 1, restored: 1 });
    expect(restPoolRegain(pool!, 2, "long")).toEqual({ nextUsed: 0, restored: 2 });
  });

  it("the pool's description is IDENTICAL to the EDITION_2024 Wild Shape row's own description (#1528 no-second-string)", async () => {
    const pool = await wildShapePool(10, "EDITION_2024");
    const row = DRUID_FEATURES.find((r) => r.subclassSlug === null && r.name === "Wild Shape" && r.edition === "EDITION_2024");
    expect(pool?.description).toBe(row?.description);
  });

  it("Circle of the Moon at level 6 and level 20 yields exactly ONE wildShape pool with the base totals (no duplicate from the subclass)", async () => {
    const atSix = await wildShapePool(6, "EDITION_2024", "circle of the moon");
    const atTwenty = await wildShapePool(20, "EDITION_2024", "circle of the moon");
    expect(atSix?.total).toBe(3);
    expect(atTwenty?.total).toBe(4);
    const featureRows = await loadDbFeatureRows("druid", "circle of the moon");
    const info = deriveResources("druid", "circle of the moon", 20, BASE_SCORES, proficiencyBonusForLevel(20), featureRows, "EDITION_2024");
    expect(info?.resources.filter((r) => r.key === "wildShape")).toHaveLength(1);
  });

  it("NEGATIVE: total is never 99 at any level 1-20, and is exactly 4 at level 20", async () => {
    for (let level = 1; level <= 20; level++) {
      const pool = await wildShapePool(level, "EDITION_2024");
      expect(pool?.total, `level ${level}`).not.toBe(99);
    }
    expect((await wildShapePool(20, "EDITION_2024"))?.total).toBe(4);
  });

  it("NEGATIVE: no 2024 Druid pool description matches max CR / hour(s) / Unlimited uses", async () => {
    const base = await wildShapePool(10, "EDITION_2024");
    const moon = await wildShapePool(10, "EDITION_2024", "circle of the moon");
    const land = await wildShapePool(10, "EDITION_2024", "circle of the land");
    for (const pool of [base, moon, land]) {
      expect(pool?.description).not.toMatch(/max CR|hour\(s\)|Unlimited uses/);
    }
  });
});

describe("Moonlight Step pool (Circle of the Moon, EDITION_2024, #1226): Wisdom-modifier total, Long Rest recharge", () => {
  it("total equals the Wisdom modifier (min 1): Wis 10 -> 1, Wis 20 -> 5", async () => {
    expect((await moonlightStepPool(10, 10, "EDITION_2024"))?.total).toBe(1);
    expect((await moonlightStepPool(10, 20, "EDITION_2024"))?.total).toBe(5);
  });

  it("floors at 1 even with a negative Wisdom modifier", async () => {
    expect((await moonlightStepPool(10, 6, "EDITION_2024"))?.total).toBe(1);
  });

  it("recharge is longRest", async () => {
    expect((await moonlightStepPool(10, 16, "EDITION_2024"))?.recharge).toBe("longRest");
  });

  it("absent below level 10", async () => {
    expect(await moonlightStepPool(9, 16, "EDITION_2024")).toBeUndefined();
  });

  it("absent entirely under EDITION_2014 (Moonlight Step doesn't exist in SRD 5.1)", async () => {
    expect(await moonlightStepPool(20, 16, "EDITION_2014")).toBeUndefined();
  });

  it("the pool's description agrees with the EDITION_2024 Moonlight Step row's own text (#1528 no-second-string)", async () => {
    const pool = await moonlightStepPool(10, 16, "EDITION_2024");
    const row = DRUID_FEATURES.find(
      (r) => r.name === "Moonlight Step" && r.edition === "EDITION_2024" && r.subclassSlug === "druid-circle-of-the-moon",
    );
    expect(pool?.description).toBe(row?.description);
  });

  it("never double-emits: exactly one moonlightStep pool at level 20", async () => {
    const featureRows = await loadDbFeatureRows("druid", "circle of the moon");
    const info = deriveResources("druid", "circle of the moon", 20, { ...BASE_SCORES, wisdom: 16 }, proficiencyBonusForLevel(20), featureRows, "EDITION_2024");
    expect(info?.resources.filter((r) => r.key === "moonlightStep")).toHaveLength(1);
  });
});

describe("EDITION_2014 regression check (#906/#1226): row-driven now, no resourceFn left in druid.ts (deleted)", () => {
  // The CR cap's own coverage lives in druid-wildshape-cr.test.ts.
  it("level 20 still has total 99, the row's own description, and an 'Uses: Unlimited (Archdruid)' detail", async () => {
    const pool = await wildShapePool(20, "EDITION_2014");
    const row = DRUID_FEATURES.find((r) => r.subclassSlug === null && r.name === "Wild Shape" && r.edition === "EDITION_2014");
    expect(pool?.total).toBe(99);
    expect(pool?.description).toBe(row?.description);
    expect(pool?.details).toContainEqual({ label: "Uses", value: "Unlimited (Archdruid)" });
  });

  it("the 'Uses' detail is absent below level 20", async () => {
    const pool = await wildShapePool(19, "EDITION_2014");
    expect(pool?.details?.find((d) => d.label === "Uses")).toBeUndefined();
  });

  it("the 'Duration' detail scales with half druid level, rounded down (minimum 1)", async () => {
    expect((await wildShapePool(2, "EDITION_2014"))?.details).toContainEqual({ label: "Duration", value: "1 hour(s)" });
    expect((await wildShapePool(8, "EDITION_2014"))?.details).toContainEqual({ label: "Duration", value: "4 hour(s)" });
  });

  it("recharge stays short-or-long, with no shortRestRegain field at all (SRD 5.1 long-or-short-rest full regain)", async () => {
    const pool = await wildShapePool(10, "EDITION_2014");
    expect(pool?.recharge).toBe("short-or-long");
    expect(pool?.shortRestRegain).toBeUndefined();
  });
});

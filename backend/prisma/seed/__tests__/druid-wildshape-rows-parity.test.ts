// Row-vs-fn parity for Wild Shape's EDITION_2014 pool (#906/#1226): proves
// poolsFromRows' overrideRows mechanism (class-feature-rows.ts) reproduces
// the deleted druid.ts resourceFn's arithmetic byte-for-byte across every
// level and subclass case, before that fn was deleted. The fn is gone now,
// so this is a permanent regression test pinned against hardcoded values —
// the same end shape bard/sorcerer/paladin's own retabs left behind.
//
// Lives prisma-side because it imports DRUID_FEATURES — a src file importing
// anything under prisma/ is a TS6059 compile error (rootDir "src").
import { describe, expect, it } from "vitest";

import { deriveResources } from "@/lib/classes/class-features.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { DRUID_FEATURES } from "../druid-features.js";

const BASE_ROWS = DRUID_FEATURES.filter((r) => r.subclassSlug === null);
const LAND_ROWS = DRUID_FEATURES.filter((r) => r.subclassSlug === "druid-circle-of-the-land");
const MOON_ROWS = DRUID_FEATURES.filter((r) => r.subclassSlug === "druid-circle-of-the-moon");

const ABILITIES = { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 16, charisma: 10 };

// PHB'14 p.66's own carrier text — the pool's description ALWAYS resolves to
// this, even for an active Circle of the Moon (S2 ruling): description is
// the carrier feature's own text, not a descriptor column an override swaps.
const BASE_WILD_SHAPE_DESCRIPTION = BASE_ROWS.find((r) => r.name === "Wild Shape" && r.edition === "EDITION_2014")!.description;
// Anti-vacuity: Circle Forms' own text must actually differ from the base
// row's, or the description assertions below would pass even with the
// carve-out wired backwards (serving the override's text by mistake).
const CIRCLE_FORMS_DESCRIPTION = MOON_ROWS.find((r) => r.name === "Circle Forms" && r.edition === "EDITION_2014")!.description;

type SubclassCase = [subclass: string | undefined, subclassRows: typeof MOON_ROWS];
const SUBCLASS_CASES: SubclassCase[] = [
  [undefined, []],
  ["circle of the land", LAND_ROWS],
  ["circle of the moon", MOON_ROWS],
];

function wildShapePool(
  subclass: string | undefined,
  subclassRows: typeof MOON_ROWS,
  level: number,
  edition: "EDITION_2014" | "EDITION_2024",
  subclassLevel = 2,
) {
  const info = deriveResources(
    "druid",
    subclass,
    level,
    ABILITIES,
    proficiencyBonusForLevel(level),
    { classRows: BASE_ROWS, subclassRows, subclassLevel },
    edition,
  );
  return info?.resources.find((r) => r.key === "wildShape");
}

// PHB'14 p.66 (base)/p.69 (Circle Forms): the deleted resourceFn's own
// arithmetic — Max CR (wildShapeCrCap composed with wildShapeSpeedNote),
// Duration = floor(level / 2) hours (minimum 1), and Uses only from level 20.
function expectedMaxCr(level: number, subclass: string | undefined): string {
  if (subclass === "circle of the moon") {
    const cap = level >= 6 ? Math.max(1, Math.floor(level / 3)) : 1;
    return `${cap}${expectedSpeedNote(level)}`;
  }
  const cap = level >= 8 ? "1" : level >= 4 ? "1/2" : "1/4";
  return `${cap}${expectedSpeedNote(level)}`;
}

function expectedSpeedNote(level: number): string {
  return level >= 8 ? "" : level >= 4 ? " (no flying speed)" : " (no flying or swimming speed)";
}

function expectedDetails(level: number, subclass: string | undefined): { label: string; value: string }[] {
  const hours = Math.max(1, Math.floor(level / 2));
  return [
    { label: "Max CR", value: expectedMaxCr(level, subclass) },
    { label: "Duration", value: `${hours} hour(s)` },
    ...(level >= 20 ? [{ label: "Uses", value: "Unlimited (Archdruid)" }] : []),
  ];
}

// Split out of the it.each callback below to keep it a plain loop (fallow's
// cyclomatic/CRAP gate) — every field the deleted resourceFn used to compute
// for ONE level, including the S2 description carve-out.
function assertWildShapePoolAtLevel(subclass: string | undefined, subclassRows: typeof MOON_ROWS, level: number): void {
  const pool = wildShapePool(subclass, subclassRows, level, "EDITION_2014");
  if (level < 2) {
    expect(pool, `level ${level}`).toBeUndefined();
    return;
  }
  expect(pool?.label, `level ${level}`).toBe("Wild Shape");
  expect(pool?.recharge, `level ${level}`).toBe("short-or-long");
  expect(pool?.total, `level ${level}`).toBe(level >= 20 ? 99 : 2);
  expect(pool?.shortRestRegain, `level ${level}`).toBeUndefined();
  expect(pool?.details, `level ${level}`).toEqual(expectedDetails(level, subclass));
  // S2 ruling: description is the base row's own text at every level, for
  // every subclass — Circle Forms' own text never serves as the pool description.
  expect(pool?.description, `level ${level}`).toBe(BASE_WILD_SHAPE_DESCRIPTION);
}

describe("Wild Shape row-vs-fn parity, EDITION_2014, levels 1-20, three subclass cases (#906/#1226)", () => {
  it.each(SUBCLASS_CASES)("%s: label/recharge/total/details match the deleted resourceFn's arithmetic at every level", (subclass, subclassRows) => {
    for (let level = 1; level <= 20; level++) {
      assertWildShapePoolAtLevel(subclass, subclassRows, level);
    }
  });

  it("exactly one wildShape pool at every level, even for Circle of the Moon (base-wins dedup drops the subclass layer's own copy)", () => {
    for (let level = 2; level <= 20; level++) {
      const info = deriveResources(
        "druid",
        "circle of the moon",
        level,
        ABILITIES,
        proficiencyBonusForLevel(level),
        { classRows: BASE_ROWS, subclassRows: MOON_ROWS, subclassLevel: 2 },
        "EDITION_2014",
      );
      expect(info?.resources.filter((r) => r.key === "wildShape"), `level ${level}`).toHaveLength(1);
    }
  });
});

describe("EDITION_2024 stays unaffected by the EDITION_2014 override mechanism (#1226)", () => {
  it.each(SUBCLASS_CASES)("%s: total is unmoved at level 10 (flat, subclass-invariant 2024 row)", (subclass, subclassRows) => {
    expect(wildShapePool(subclass, subclassRows, 10, "EDITION_2024")?.total).toBe(3);
  });
});

describe("activeSubclassRows gating (#906): the override applies only when the subclass is ACTUALLY active", () => {
  it("Circle Forms' own text differs from the base row's (anti-vacuity for the description carve-out below)", () => {
    expect(CIRCLE_FORMS_DESCRIPTION).not.toBe(BASE_WILD_SHAPE_DESCRIPTION);
  });

  it("Moon at level 2 with subclassLevel 3 (not yet active): base Max CR curve, not Moon's", () => {
    const pool = wildShapePool("circle of the moon", MOON_ROWS, 2, "EDITION_2014", 3);
    expect(pool?.details).toEqual(expectedDetails(2, undefined));
    expect(pool?.description).toBe(BASE_WILD_SHAPE_DESCRIPTION);
  });

  it("Moon at level 2 with subclassLevel 2 (active): Moon's own Max CR curve", () => {
    const pool = wildShapePool("circle of the moon", MOON_ROWS, 2, "EDITION_2014", 2);
    expect(pool?.details).toEqual(expectedDetails(2, "circle of the moon"));
    expect(pool?.description).toBe(BASE_WILD_SHAPE_DESCRIPTION);
  });
});

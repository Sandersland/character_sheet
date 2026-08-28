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

type SubclassCase = [subclass: string | undefined, subclassRows: typeof MOON_ROWS];
const SUBCLASS_CASES: SubclassCase[] = [
  [undefined, []],
  ["circle of the land", LAND_ROWS],
  ["circle of the moon", MOON_ROWS],
];

function wildShapePool(subclass: string | undefined, subclassRows: typeof MOON_ROWS, level: number, edition: "EDITION_2014" | "EDITION_2024") {
  const info = deriveResources(
    "druid",
    subclass,
    level,
    ABILITIES,
    proficiencyBonusForLevel(level),
    { classRows: BASE_ROWS, subclassRows, subclassLevel: 2 },
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

describe("Wild Shape row-vs-fn parity, EDITION_2014, levels 1-20, three subclass cases (#906/#1226)", () => {
  it.each(SUBCLASS_CASES)("%s: label/recharge/total/details match the deleted resourceFn's arithmetic at every level", (subclass, subclassRows) => {
    for (let level = 1; level <= 20; level++) {
      const pool = wildShapePool(subclass, subclassRows, level, "EDITION_2014");
      if (level < 2) {
        expect(pool, `level ${level}`).toBeUndefined();
        continue;
      }
      expect(pool?.label, `level ${level}`).toBe("Wild Shape");
      expect(pool?.recharge, `level ${level}`).toBe("short-or-long");
      expect(pool?.total, `level ${level}`).toBe(level >= 20 ? 99 : 2);
      expect(pool?.shortRestRegain, `level ${level}`).toBeUndefined();
      expect(pool?.details, `level ${level}`).toEqual(expectedDetails(level, subclass));
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

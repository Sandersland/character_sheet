// #1501: Way of the Open Hand (SRD 5.1 p.78) — the 2014 monastic tradition
// that forks off "Warrior of the Open Hand" into its own EDITION_2014-only
// subclass rather than sharing that slug's rows. Mirrors monk-2014-snapshot
// .test.ts's byte-identity-pin shape, scoped to this one subclass, plus an
// integration-level DB-backed proof (mirrors monk-2024-content.test.ts's own
// "Warrior of the Elements" integration block) that the real seeded rows
// resolve through deriveResources at the right levels.
import { describe, expect, it } from "vitest";

import { deriveResources } from "@/lib/classes/class-features.js";
import { loadDbFeatureRows } from "@/lib/classes/__tests__/db-feature-rows.fixture.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { MONK_FEATURES } from "../monk-features.js";

const WAY_OPEN_HAND = "monk-way-of-the-open-hand";

interface Pinned {
  name: string;
  level: number;
  description: string;
}

const PINNED_2014_WAY_OF_THE_OPEN_HAND: Pinned[] = [
  {
    name: "Open Hand Technique",
    level: 3,
    description:
      "Whenever you hit a creature with one of the attacks granted by your Flurry of Blows, you can impose one effect: it must succeed on a Dexterity save or be knocked prone; it must make a Strength save or you can push it up to 15 ft away from you; or it can't take reactions until the end of your next turn (no save).",
  },
  {
    name: "Wholeness of Body",
    level: 6,
    description:
      "As an action, regain hit points equal to three times your monk level. You must finish a long rest before you can use this feature again.",
  },
  {
    name: "Tranquility",
    level: 11,
    description:
      "At the end of a long rest, you gain the effect of a sanctuary spell that lasts until the start of your next long rest (the spell can end early as normal). The saving throw DC equals your ki save DC.",
  },
  {
    name: "Quivering Palm",
    level: 17,
    description:
      "When you hit a creature with an unarmed strike, you can spend 3 ki points to start imperceptible vibrations in its body, lasting a number of days equal to your monk level. You can have only one creature under this effect at a time, and you can end the vibrations harmlessly without using an action. To end them harmfully, you and the target must be on the same plane of existence — use your action to force a Constitution save: on a failure the target drops to 0 hit points; on a success it takes 10d10 necrotic damage.",
  },
];

function byName(rows: typeof MONK_FEATURES, name: string) {
  const found = rows.filter((r) => r.name === name);
  expect(found, name).toHaveLength(1);
  return found[0];
}

describe("2014 Way of the Open Hand — real SRD 5.1 / PHB'14 content (#1501)", () => {
  const rows2014 = MONK_FEATURES.filter((r) => r.subclassSlug === WAY_OPEN_HAND && r.edition === "EDITION_2014");

  it("has exactly the 4 pinned features, each at the pinned level with the pinned text", () => {
    expect(rows2014).toHaveLength(PINNED_2014_WAY_OF_THE_OPEN_HAND.length);
    for (const pinned of PINNED_2014_WAY_OF_THE_OPEN_HAND) {
      const actual = byName(rows2014, pinned.name);
      expect(actual.level, pinned.name).toBe(pinned.level);
      expect(actual.description, pinned.name).toBe(pinned.description);
    }
  });

  it("no EDITION_2024 row exists under this slug — it's a SEPARATE 2014-only subclass, not a fork", () => {
    expect(MONK_FEATURES.filter((r) => r.subclassSlug === WAY_OPEN_HAND && r.edition === "EDITION_2024")).toHaveLength(0);
  });

  it("Wholeness of Body's pool is row-owned: fixed total 1 from level 6, long-rest recharge", () => {
    const wholeness = byName(rows2014, "Wholeness of Body");
    expect(wholeness.resourceKey).toBe("wholenessOfBody");
    expect(wholeness.resourceRecharge).toBe("longRest");
    expect(wholeness.resourceTotals).toEqual([{ minLevel: 6, total: 1 }]);
  });

  it("shares three feature NAMES with Warrior of the Open Hand (2024) but different text on all three — Fleet Step/Tranquility have no counterpart at all", () => {
    const rows2024 = MONK_FEATURES.filter((r) => r.subclassSlug === "monk-warrior-of-the-open-hand" && r.edition === "EDITION_2024");
    for (const name of ["Open Hand Technique", "Wholeness of Body", "Quivering Palm"]) {
      const row2014 = byName(rows2014, name);
      const row2024 = byName(rows2024, name);
      expect(row2014.description, name).not.toBe(row2024.description);
    }
    expect(rows2024.map((r) => r.name)).not.toContain("Tranquility");
    expect(rows2014.map((r) => r.name)).not.toContain("Fleet Step");
  });
});

const ABILITY_SCORES = {
  strength: 10,
  dexterity: 16,
  constitution: 14,
  intelligence: 8,
  wisdom: 15,
  charisma: 10,
};

describe("integration (#1501): a real seeded L17 Way of the Open Hand monk resolves its four 2014 features", () => {
  it("EDITION_2014 sees all four subclass features; EDITION_2024 sees none (no 2024 row exists)", async () => {
    const featureRows = await loadDbFeatureRows("monk", "way of the open hand");
    const profBonus = proficiencyBonusForLevel(17);

    const at2014 = deriveResources("monk", "way of the open hand", 17, ABILITY_SCORES, profBonus, featureRows, "EDITION_2014");
    const names2014 = (at2014?.features ?? []).filter((f) => f.source === "subclass").map((f) => f.name);
    for (const name of ["Open Hand Technique", "Wholeness of Body", "Tranquility", "Quivering Palm"]) {
      expect(names2014, `missing ${name}`).toContain(name);
    }

    const at2024 = deriveResources("monk", "way of the open hand", 17, ABILITY_SCORES, profBonus, featureRows, "EDITION_2024");
    expect((at2024?.features ?? []).filter((f) => f.source === "subclass")).toEqual([]);
  });

  it("a L6 monk has the wholenessOfBody pool with total 1, recharging on a long rest", async () => {
    const featureRows = await loadDbFeatureRows("monk", "way of the open hand");
    const profBonus = proficiencyBonusForLevel(6);
    const info = deriveResources("monk", "way of the open hand", 6, ABILITY_SCORES, profBonus, featureRows, "EDITION_2014");
    const pool = (info?.resources ?? []).find((r) => r.key === "wholenessOfBody");
    expect(pool).toBeDefined();
    expect(pool?.total).toBe(1);
    expect(pool?.recharge).toBe("longRest");
  });

  it("a L2 monk (below the subclass's grant level 3) has zero subclass features", async () => {
    const featureRows = await loadDbFeatureRows("monk", "way of the open hand");
    const profBonus = proficiencyBonusForLevel(2);
    const info = deriveResources("monk", "way of the open hand", 2, ABILITY_SCORES, profBonus, featureRows, "EDITION_2014");
    expect((info?.features ?? []).filter((f) => f.source === "subclass")).toEqual([]);
  });
});

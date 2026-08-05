// #1675 (chunk 0 of epic #1313): Monk's rows are now literal seed data
// (monk-features.ts), mirroring the eleven other classes' own
// "-2024-content"/"-2024-srd" suites. Unlike those, THIS slice authors no
// edition-diverging content — the 2014 rewrite is #1500-#1503's job — so
// every assertion below is about TRANSPORT correctness (counts, uniqueness,
// descriptor columns landing exactly where monk.ts's AuthoredFeature entries
// had them, and the real seeded rows reaching a serialized derivation) rather
// than a 2014-vs-2024 content diff. monk-2014-snapshot.test.ts is the
// byte-identity proof against the pre-#1675 tree; this file is the
// structural/DB-integration counterpart the other eleven classes' content
// suites establish.
import { describe, expect, it } from "vitest";

import { deriveResources } from "@/lib/classes/class-features.js";
import { loadDbFeatureRows } from "@/lib/classes/__tests__/db-feature-rows.fixture.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { MONK_FEATURES } from "../monk-features.js";

type Edition = "EDITION_2014" | "EDITION_2024";

function rowsNamed(subclassSlug: string | null, name: string) {
  return MONK_FEATURES.filter((r) => r.subclassSlug === subclassSlug && r.name === name);
}

/** Exactly one row for (subclassSlug, name, edition), or the test fails with a precise locator. */
function row(subclassSlug: string | null, name: string, edition: Edition) {
  const found = rowsNamed(subclassSlug, name).filter((r) => r.edition === edition);
  expect(found, `${subclassSlug ?? "(base)"}/${name}/${edition}`).toHaveLength(1);
  return found[0];
}

const BASE = null;
const OPEN_HAND = "monk-warrior-of-the-open-hand";
const SHADOW = "monk-warrior-of-shadow";
const ELEMENTS = "monk-warrior-of-the-elements";
const MERCY = "monk-warrior-of-mercy";

describe("Per-partition counts: base 17(2014)/18(2024), subclasses open hand 4, shadow 4, elements 5, mercy 6 — identical for 2014/2024 (#1500 forks the base class; #1675 subclasses stay a transport-only twin pending #1501-#1503)", () => {
  it("counts match exactly (36 total 2014, 37 total 2024)", () => {
    const count = (slug: string | null, edition: Edition) => MONK_FEATURES.filter((r) => r.subclassSlug === slug && r.edition === edition).length;
    expect(count(BASE, "EDITION_2014")).toBe(17);
    expect(count(BASE, "EDITION_2024")).toBe(18);
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      expect(count(OPEN_HAND, edition)).toBe(4);
      expect(count(SHADOW, edition)).toBe(4);
      expect(count(ELEMENTS, edition)).toBe(5);
      expect(count(MERCY, edition)).toBe(6);
    }
    const total2014 = MONK_FEATURES.filter((r) => r.edition === "EDITION_2014").length;
    const total2024 = MONK_FEATURES.filter((r) => r.edition === "EDITION_2024").length;
    expect(total2014).toBe(36);
    expect(total2024).toBe(37);
    expect(MONK_FEATURES).toHaveLength(73);
  });
});

describe("structural: the @@unique([classId, subclassId, name, edition]) constraint expressed as a unit test", () => {
  it("no two rows share (subclassSlug, name, edition)", () => {
    const keys = MONK_FEATURES.map((r) => `${r.subclassSlug ?? "null"}::${r.name}::${r.edition}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("Extra Attack (#1530): derivedStat/derivedStatTiers transcribed unchanged onto the literal base-class row", () => {
  it("both editions carry the same flat L5 tier", () => {
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      const r = row(BASE, "Extra Attack", edition);
      expect(r.derivedStat).toBe("attacksPerAction");
      expect(r.derivedStatTiers).toEqual([{ minLevel: 5, value: 2 }]);
    }
  });
});

describe("Elemental Attunement (#1686): the toggle descriptor block transcribed unchanged onto the literal subclass row", () => {
  it("both editions carry the same toggle/cost/effectBuffs block", () => {
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      const r = row(ELEMENTS, "Elemental Attunement", edition);
      expect(r.resourceKey).toBe("elementalAttunement");
      expect(r.activationCost).toBe("free");
      expect(r.resolverKind).toBe("toggle");
      expect(r.costKind).toBe("pool");
      expect(r.costPoolKey).toBe("focus");
      expect(r.costBase).toBe(1);
      expect(r.effectBuffs).toEqual([
        { key: "elementalAttunement", target: "elementalAttunement", modifier: 0, duration: "while-active" },
      ]);
    }
  });

  it("every OTHER row leaves every descriptor column undefined", () => {
    for (const r of MONK_FEATURES) {
      if (r.name === "Extra Attack" && r.subclassSlug === null) continue;
      if (r.name === "Elemental Attunement" && r.subclassSlug === ELEMENTS) continue;
      expect(r.resourceKey, `${r.subclassSlug ?? "base"}/${r.name}`).toBeUndefined();
      expect(r.derivedStat, `${r.subclassSlug ?? "base"}/${r.name}`).toBeUndefined();
    }
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

// Integration-level proof (mirrors wizard-2024-content.test.ts's own
// loadDbFeatureRows pattern): the REAL seeded rows, read through the REAL
// derivation path, actually reach a serialized character's derived
// features — not just MONK_FEATURES' in-memory shape. Both editions read
// identically in this slice (no edition fork authored yet), so the proof is
// that a real L17 Warrior of the Elements monk sees all five subclass
// features under EITHER edition, and that a L2 monk (below every subclass
// gate) sees none.
describe("integration (#1675): a real seeded L17 Warrior of the Elements monk has all five subclass features, both editions", () => {
  it("EDITION_2014 and EDITION_2024 resolve to the identical feature-name set", async () => {
    const featureRows = await loadDbFeatureRows("monk", "warrior of the elements");
    const profBonus = proficiencyBonusForLevel(17);

    const expectedNames = ["Manipulate Elements", "Elemental Attunement", "Elemental Burst", "Stride of the Elements", "Elemental Epitome"];

    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      const info = deriveResources("monk", "warrior of the elements", 17, ABILITY_SCORES, profBonus, featureRows, edition);
      const subclassNames = (info?.features ?? []).filter((f) => f.source === "subclass").map((f) => f.name);
      for (const name of expectedNames) {
        expect(subclassNames, `${edition} missing ${name}`).toContain(name);
      }
    }
  });

  it("a L2 monk (below every subclass's grant level 3) has zero subclass features, both editions", async () => {
    const featureRows = await loadDbFeatureRows("monk", "warrior of the elements");
    const profBonus = proficiencyBonusForLevel(2);
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      const info = deriveResources("monk", "warrior of the elements", 2, ABILITY_SCORES, profBonus, featureRows, edition);
      expect((info?.features ?? []).filter((f) => f.source === "subclass")).toEqual([]);
    }
  });
});

describe("#1500: the 2014 base-class row count reflects real SRD 5.1 content (17, not 2024's 18)", () => {
  it("the 2014 base-class row count is 17", () => {
    expect(MONK_FEATURES.filter((r) => r.subclassSlug === null && r.edition === "EDITION_2014")).toHaveLength(17);
  });
});

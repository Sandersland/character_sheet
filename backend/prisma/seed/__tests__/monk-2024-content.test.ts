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
const WAY_OPEN_HAND = "monk-way-of-the-open-hand";
const SHADOW = "monk-warrior-of-shadow";
const WAY_OF_SHADOW = "monk-way-of-shadow";
const ELEMENTS = "monk-warrior-of-the-elements";
const MERCY = "monk-warrior-of-mercy";
const FOUR_ELEMENTS = "monk-way-of-the-four-elements";

describe("Per-partition counts: base 17(2014)/18(2024); open hand (#1501), shadow (#1502), and the elements (#1503) each fork into two EDITION-EXCLUSIVE subclasses; mercy 6 is the one remaining subclass still identical for 2014/2024", () => {
  it("counts match exactly (33 total 2014, 37 total 2024)", () => {
    const count = (slug: string | null, edition: Edition) => MONK_FEATURES.filter((r) => r.subclassSlug === slug && r.edition === edition).length;
    expect(count(BASE, "EDITION_2014")).toBe(17);
    expect(count(BASE, "EDITION_2024")).toBe(18);
    // Open Hand forked (#1501): "Warrior of the Open Hand" is 2024-only,
    // "Way of the Open Hand" is its own 2014-only sibling — neither slug has
    // rows in the other edition.
    expect(count(OPEN_HAND, "EDITION_2014")).toBe(0);
    expect(count(OPEN_HAND, "EDITION_2024")).toBe(4);
    expect(count(WAY_OPEN_HAND, "EDITION_2014")).toBe(4);
    expect(count(WAY_OPEN_HAND, "EDITION_2024")).toBe(0);
    // Mercy is the one subclass with no 2014 fork yet — still shared/untagged,
    // expanded to both editions.
    expect(count(MERCY, "EDITION_2014")).toBe(6);
    expect(count(MERCY, "EDITION_2024")).toBe(6);
    // Warrior of Shadow (2024) and Way of Shadow (2014, #1502) are now
    // DISTINCT slugs, each populated in exactly its own edition — the 2014/
    // 2024 swap between them nets to zero on both totals below.
    expect(count(SHADOW, "EDITION_2014")).toBe(0);
    expect(count(SHADOW, "EDITION_2024")).toBe(4);
    expect(count(WAY_OF_SHADOW, "EDITION_2014")).toBe(4);
    expect(count(WAY_OF_SHADOW, "EDITION_2024")).toBe(0);
    // Warrior of the Elements (2024, retagged) and Way of the Four Elements
    // (2014, brand new — no 2024 counterpart of its own, #1503) are also
    // DISTINCT slugs.
    expect(count(ELEMENTS, "EDITION_2014")).toBe(0);
    expect(count(ELEMENTS, "EDITION_2024")).toBe(5);
    expect(count(FOUR_ELEMENTS, "EDITION_2014")).toBe(2);
    expect(count(FOUR_ELEMENTS, "EDITION_2024")).toBe(0);
    const total2014 = MONK_FEATURES.filter((r) => r.edition === "EDITION_2014").length;
    const total2024 = MONK_FEATURES.filter((r) => r.edition === "EDITION_2024").length;
    expect(total2014).toBe(33);
    expect(total2024).toBe(37);
    expect(MONK_FEATURES).toHaveLength(70);
  });
});

describe("Way of the Four Elements (#1503): 2014-only, feature text carries the discipline-progression rule, not just the pool mechanism", () => {
  it("Disciple of the Elements and Elemental Attunement exist for EDITION_2014 only", () => {
    const r1 = row(FOUR_ELEMENTS, "Disciple of the Elements", "EDITION_2014");
    expect(r1.level).toBe(3);
    expect(r1.description).toMatch(/PHB'14/);
    const r2 = row(FOUR_ELEMENTS, "Elemental Attunement", "EDITION_2014");
    expect(r2.level).toBe(3);
    expect(r2.description).toMatch(/PHB'14/);
  });

  it("carries no EDITION_2024 rows at all", () => {
    expect(MONK_FEATURES.filter((r) => r.subclassSlug === FOUR_ELEMENTS && r.edition === "EDITION_2024")).toEqual([]);
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
  // #1503 retagged this row's edition (EDITION_2024, alongside its Subclass
  // row) — a single-edition check now, not a both-editions loop.
  it("carries the toggle/cost/effectBuffs block", () => {
    const r = row(ELEMENTS, "Elemental Attunement", "EDITION_2024");
    expect(r.resourceKey).toBe("elementalAttunement");
    expect(r.activationCost).toBe("free");
    expect(r.resolverKind).toBe("toggle");
    expect(r.costKind).toBe("pool");
    expect(r.costPoolKey).toBe("focus");
    expect(r.costBase).toBe(1);
    expect(r.effectBuffs).toEqual([
      { key: "elementalAttunement", target: "elementalAttunement", modifier: 0, duration: "while-active" },
    ]);
  });

  it("every OTHER row leaves every descriptor column undefined", () => {
    for (const r of MONK_FEATURES) {
      if (isExemptDescriptorRow(r)) continue;
      expect(r.resourceKey, `${r.subclassSlug ?? "base"}/${r.name}`).toBeUndefined();
      expect(r.derivedStat, `${r.subclassSlug ?? "base"}/${r.name}`).toBeUndefined();
    }
  });
});

// The three rows populated elsewhere in this suite — pulled out of the loop
// above to keep that test's own cyclomatic/cognitive score flat (mirrors
// class-feature-migration.test.ts's own POPULATED_ROW_PREDICATES pattern).
function isExemptDescriptorRow(r: (typeof MONK_FEATURES)[number]): boolean {
  if (r.name === "Extra Attack" && r.subclassSlug === null) return true;
  if (r.name === "Elemental Attunement" && r.subclassSlug === ELEMENTS) return true;
  // #1501: Way of the Open Hand's Wholeness of Body is the third row-owned
  // descriptor block — a row-owned FIXED pool total (resourceKey/
  // resourceRecharge/resourceTotals), not the toggle shape the other two
  // exemptions above carry. See monk-2014-open-hand.test.ts for its own
  // dedicated assertions on this row's exact descriptor values.
  if (r.name === "Wholeness of Body" && r.subclassSlug === WAY_OPEN_HAND) return true;
  return false;
}

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
// features — not just MONK_FEATURES' in-memory shape. #1503 retagged every
// Warrior of the Elements row EDITION_2024-only, so — unlike before that
// retag — the two editions no longer read identically: a real L17 EDITION_2024
// Warrior of the Elements monk still sees all five subclass features, but the
// SAME subclass name under EDITION_2014 now resolves to none (a 2014
// character's real equivalent is Way of the Four Elements, a different
// slug/name entirely — see the Way of the Four Elements integration test
// below). A L2 monk (below every subclass's grant level 3) sees none either way.
describe("integration (#1503): a real seeded L17 Warrior of the Elements monk has all five subclass features under EDITION_2024 only", () => {
  it("EDITION_2024 resolves the full feature-name set; EDITION_2014 resolves none (its Subclass row no longer exists for that edition)", async () => {
    const featureRows = await loadDbFeatureRows("monk", "warrior of the elements");
    const profBonus = proficiencyBonusForLevel(17);

    const expectedNames = ["Manipulate Elements", "Elemental Attunement", "Elemental Burst", "Stride of the Elements", "Elemental Epitome"];

    const info2024 = deriveResources("monk", "warrior of the elements", 17, ABILITY_SCORES, profBonus, featureRows, "EDITION_2024");
    const subclassNames2024 = (info2024?.features ?? []).filter((f) => f.source === "subclass").map((f) => f.name);
    for (const name of expectedNames) {
      expect(subclassNames2024, `EDITION_2024 missing ${name}`).toContain(name);
    }

    const info2014 = deriveResources("monk", "warrior of the elements", 17, ABILITY_SCORES, profBonus, featureRows, "EDITION_2014");
    expect((info2014?.features ?? []).filter((f) => f.source === "subclass")).toEqual([]);
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

// Way of the Four Elements' own integration proof — the 2014 slug/name pair.
describe("integration (#1503): a real seeded L17 Way of the Four Elements monk has both feature rows under EDITION_2014 only", () => {
  it("EDITION_2014 resolves Disciple of the Elements + Elemental Attunement; EDITION_2024 resolves none", async () => {
    const featureRows = await loadDbFeatureRows("monk", "way of the four elements");
    const profBonus = proficiencyBonusForLevel(17);

    const info2014 = deriveResources("monk", "way of the four elements", 17, ABILITY_SCORES, profBonus, featureRows, "EDITION_2014");
    const subclassNames2014 = (info2014?.features ?? []).filter((f) => f.source === "subclass").map((f) => f.name);
    expect(subclassNames2014).toContain("Disciple of the Elements");
    expect(subclassNames2014).toContain("Elemental Attunement");

    const info2024 = deriveResources("monk", "way of the four elements", 17, ABILITY_SCORES, profBonus, featureRows, "EDITION_2024");
    expect((info2024?.features ?? []).filter((f) => f.source === "subclass")).toEqual([]);
  });
});

describe("#1500: the 2014 base-class row count reflects real SRD 5.1 content (17, not 2024's 18)", () => {
  it("the 2014 base-class row count is 17", () => {
    expect(MONK_FEATURES.filter((r) => r.subclassSlug === null && r.edition === "EDITION_2014")).toHaveLength(17);
  });
});

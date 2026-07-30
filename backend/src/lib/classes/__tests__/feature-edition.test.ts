// #1374: DerivedFeature.edition — the predicate that filters subclass/class
// feature TEXT by edition (mirrors Subclass.edition, #1306), plus the
// wire-boundary strip (#1272).
//
// #1524 REWRITE (arbiter-corrected AC): featureAppliesToEdition retired —
// feature TEXT now resolves from seeded ClassFeature rows via featuresFromRows
// (lib/classes/class-feature-rows.ts), the new "one place this rule lives".
// All four describe blocks below are DB-backed (loadDbFeatureRows) rather
// than calling deriveResources with bare strings, which post-swap derives an
// empty carrier and `features: []` for every class. featuresFromRows' own
// truth table (untagged/tagged/level-gate/dedup-by-construction) is unit-
// tested directly in class-feature-rows.test.ts; this file's job is the
// real-content sweep against the SEEDED catalog, which only a DB round-trip
// can prove. Both anti-vacuity floors (triplesVisited >= 158, subclassesVisited
// >= 31) and the EXPECTED_EDITION_TAGGED_FEATURES ledger carry across unedited.
import { describe, expect, it } from "vitest";

import { deriveResources } from "@/lib/classes/class-features.js";
import type { DerivedFeature } from "@/lib/classes/types.js";
import { toWireFeatures } from "@/lib/character/serialize/classes.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { CLASS_SUBCLASSES, LITERAL_ROW_CLASSES } from "./class-subclasses.fixture.js";
import { loadDbFeatureRows } from "./db-feature-rows.fixture.js";

const ABILITY_SCORES = {
  strength: 14,
  dexterity: 16,
  constitution: 12,
  intelligence: 10,
  wisdom: 13,
  charisma: 15,
};

function feature(overrides: Partial<DerivedFeature> & Pick<DerivedFeature, "edition">): DerivedFeature {
  return { name: "Test Feature", level: 1, description: "test", source: "subclass", ...overrides };
}

// Replaces the old featureAppliesToEdition truth table: proves the SAME
// property (a fork resolves to exactly one edition's text, never both, never
// neither) end-to-end against a REAL seeded fork — Cleric/Life Domain's
// Domain Spells, also ledgered below. featuresFromRows' pure truth table
// (untagged/level-gate/dedup) lives in class-feature-rows.test.ts.
describe("a real seeded edition fork resolves through deriveResources (#1374, retired from featureAppliesToEdition)", () => {
  it("Cleric/Life Domain's Domain Spells: 2014 gets the 2014-worded row, 2024 gets the 2024-worded row, never both", async () => {
    const featureRows = await loadDbFeatureRows("cleric", "life domain");
    const profBonus = proficiencyBonusForLevel(1);

    const at2014 = deriveResources("cleric", "life domain", 1, ABILITY_SCORES, profBonus, featureRows, "EDITION_2014");
    const at2024 = deriveResources("cleric", "life domain", 3, ABILITY_SCORES, proficiencyBonusForLevel(3), featureRows, "EDITION_2024");

    const domainSpells2014 = (at2014?.features ?? []).filter((f) => f.name === "Domain Spells");
    const domainSpells2024 = (at2024?.features ?? []).filter((f) => f.name === "Domain Spells");
    expect(domainSpells2014).toHaveLength(1);
    expect(domainSpells2024).toHaveLength(1);
    expect(domainSpells2014[0].description).not.toBe(domainSpells2024[0].description);
    expect(domainSpells2014[0].edition).toBe("EDITION_2014");
    expect(domainSpells2024[0].edition).toBe("EDITION_2024");
  });

  it("mutation proof: deleting a class's EDITION_2024 rows fails on ABSENCE, not a 2014 fallback (ClassFeature.edition is non-nullable — resolveEditionRow's shared-row fallback is unreachable by type for this model)", async () => {
    const featureRows = await loadDbFeatureRows("cleric", "life domain");
    const only2014 = { classRows: featureRows.classRows.filter((r) => r.edition !== "EDITION_2024"), subclassRows: featureRows.subclassRows.filter((r) => r.edition !== "EDITION_2024") };

    const at2024 = deriveResources("cleric", "life domain", 3, ABILITY_SCORES, proficiencyBonusForLevel(3), only2014, "EDITION_2024");
    // Absence, not a silent 2014 fallback: the 2024 request derives ZERO
    // features from a carrier holding only 2014 rows.
    expect(at2024?.features ?? []).toHaveLength(0);
  });
});

// A fork always shares its `name` across the two edition-tagged rows (plan
// §C) — each edition still resolves to exactly one row per forked name — so
// this name-set-equality invariant holds. Meaningful today: it breaks if the
// base-layer filter ever excludes an untagged class feature by accident.
describe("real-content sweep: feature-name sets agree across editions (#1374 AC 2)", () => {
  it("every class × subclass at level 20 derives the same feature-name set under both editions", async () => {
    const profBonus = proficiencyBonusForLevel(20);
    let triplesVisited = 0;
    for (const [className, subclasses] of Object.entries(CLASS_SUBCLASSES)) {
      for (const subclass of subclasses) {
        const featureRows = await loadDbFeatureRows(className, subclass);
        const at2014 = deriveResources(className, subclass, 20, ABILITY_SCORES, profBonus, featureRows, "EDITION_2014");
        const at2024 = deriveResources(className, subclass, 20, ABILITY_SCORES, profBonus, featureRows, "EDITION_2024");
        const names2014 = new Set((at2014?.features ?? []).map((f) => f.name));
        const names2024 = new Set((at2024?.features ?? []).map((f) => f.name));
        // Fighter (#1227) is the first class whose 2024 content genuinely
        // diverges by design — it adds several 2024-only feature names
        // (Weapon Mastery, Tactical Mind, Two/Three Extra Attacks, ...) and
        // renames one (Battle Master's L18 "Improved Combat Superiority
        // (d12)" -> "Ultimate Combat Superiority"), so its name sets are
        // SUPPOSED to differ across editions. Exempted from the equality
        // check but still visited and still counted toward the anti-vacuity
        // floor below — dropping it from the loop entirely would have
        // silently shrunk that floor's real measured value.
        if (!LITERAL_ROW_CLASSES.has(className)) {
          expect(names2014).toEqual(names2024);
        }
        triplesVisited += names2024.size;
      }
    }
    // Anti-vacuity floor: the issue's own count of source:"subclass" entries.
    expect(triplesVisited).toBeGreaterThanOrEqual(158);
  });
});

describe("toWireFeatures strips DerivedFeature.edition at the wire boundary (#1374, #1272)", () => {
  it("projects exactly {name, level, description, source}; a tagged feature's other fields survive verbatim", () => {
    const tagged = feature({ name: "Domain Spells", level: 1, description: "tagged text", edition: "EDITION_2014" });
    const untagged = feature({ name: "Bonus Proficiency", level: 1, description: "untagged text", edition: "EDITION_2024" });

    const wire = toWireFeatures([tagged, untagged]);

    expect(wire).toHaveLength(2);
    for (const f of wire) {
      expect(Object.keys(f).sort()).toEqual(["description", "level", "name", "source"]);
    }
    expect(wire[0]).toEqual({ name: "Domain Spells", level: 1, description: "tagged text", source: "subclass" });
  });
});

// Ledger: every (class, subclass, feature name) that legitimately carries an
// edition tag. Set-equality catches all four failure modes at once — a fork
// lost, a fork leaked to the wrong edition, a blanket tagging pass, and an
// accidental extra tag — none of which the name-set-equality sweep above can
// tell apart on its own (forks share a name by construction, so that sweep
// stays green even when a fork mistags).
// Fighter's 30 new triples (#1227). `collectTaggedFeatureKeys` combines
// `classRows` (Fighter's BASE rows — always ALL of them, regardless of which
// subclass was requested) with `subclassRows` (that one subclass's own rows)
// before calling taggedNamesFor — see loadDbFeatureRows.ts. So the 5 base
// names that diverge by edition (Fighting Style, Second Wind, Action Surge,
// Extra Attack, Indomitable) show up under EVERY subclass context Fighter
// has (undefined/battle master/champion/eldritch knight), not just once —
// 4 contexts x 5 base names = 20, plus Champion's own 5 and Battle Master's
// own 5 = 30. The base-class rows (subclass slot "undefined" below) come from
// CLASS_SUBCLASSES.fighter's own `undefined` entry, which
// collectTaggedFeatureKeys' template literal stringifies to the literal
// string "undefined" here — not a typo, matches the production key exactly.
// Two Fighter renames are DELIBERATELY excluded: Battle Master's L18
// "Improved Combat Superiority (d12)" (2014) / "Ultimate Combat Superiority"
// (2024) share no name, so they're two unrelated single-description rows,
// never a tagged pair (see fighter-features.ts's comment on that row). Every
// wholly 2024-only name (Weapon Mastery, Tactical Mind, Two/Three Extra
// Attacks, Tactical Shift, Tactical Master, Studied Attacks, Epic Boon,
// Heroic Warrior) has exactly one description under its name too — absent
// from a 2014 row entirely, not diverged from one — so none of those are
// tagged either.
const EXPECTED_EDITION_TAGGED_FEATURES = [
  ["cleric", "life domain", "Domain Spells"],
  ["cleric", "trickery domain", "Domain Spells"],
  ["warlock", "the fiend", "Expanded Spell List"],
  ["warlock", "the archfey", "Expanded Spell List"],
  ["warlock", "the great old one", "Expanded Spell List"],
  ["fighter", "undefined", "Fighting Style"],
  ["fighter", "undefined", "Second Wind"],
  ["fighter", "undefined", "Action Surge"],
  ["fighter", "undefined", "Extra Attack"],
  ["fighter", "undefined", "Indomitable"],
  ["fighter", "champion", "Fighting Style"],
  ["fighter", "champion", "Second Wind"],
  ["fighter", "champion", "Action Surge"],
  ["fighter", "champion", "Extra Attack"],
  ["fighter", "champion", "Indomitable"],
  ["fighter", "champion", "Improved Critical"],
  ["fighter", "champion", "Remarkable Athlete"],
  ["fighter", "champion", "Additional Fighting Style"],
  ["fighter", "champion", "Superior Critical"],
  ["fighter", "champion", "Survivor"],
  ["fighter", "battle master", "Fighting Style"],
  ["fighter", "battle master", "Second Wind"],
  ["fighter", "battle master", "Action Surge"],
  ["fighter", "battle master", "Extra Attack"],
  ["fighter", "battle master", "Indomitable"],
  ["fighter", "battle master", "Combat Superiority"],
  ["fighter", "battle master", "Student of War"],
  ["fighter", "battle master", "Know Your Enemy"],
  ["fighter", "battle master", "Improved Combat Superiority (d10)"],
  ["fighter", "battle master", "Relentless"],
  ["fighter", "eldritch knight", "Fighting Style"],
  ["fighter", "eldritch knight", "Second Wind"],
  ["fighter", "eldritch knight", "Action Surge"],
  ["fighter", "eldritch knight", "Extra Attack"],
  ["fighter", "eldritch knight", "Indomitable"],
] as const;

// A (class, subclass, name) is "tagged" if its two seeded rows carry
// DIFFERENT descriptions — an actual fork — mirrors the pre-#1524 in-memory
// check (`f.edition !== undefined` on a DerivedFeature literal), now
// expressed over ROWS instead: every DERIVED feature's edition is always
// defined post-#1524 (the type itself makes it required), so the old literal
// check is no longer meaningful — the fork now lives at the row layer.
// Split out of collectTaggedFeatureKeys so neither function nests past two
// loops (keeps both under the repo's cognitive-complexity gate).
function taggedNamesFor(rows: { name: string; description: string }[]): string[] {
  const descByName = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = descByName.get(row.name) ?? new Set<string>();
    set.add(row.description);
    descByName.set(row.name, set);
  }
  return [...descByName.entries()].filter(([, descs]) => descs.size > 1).map(([name]) => name);
}

async function collectTaggedFeatureKeys(): Promise<Set<string>> {
  const tagged = new Set<string>();
  for (const [className, subclasses] of Object.entries(CLASS_SUBCLASSES)) {
    for (const subclass of subclasses) {
      const featureRows = await loadDbFeatureRows(className, subclass);
      const rows = [...featureRows.classRows, ...featureRows.subclassRows];
      for (const name of taggedNamesFor(rows)) tagged.add(`${className}|${subclass}|${name}`);
    }
  }
  return tagged;
}

describe("edition-tagged feature ledger (#1374)", () => {
  it("only the ledgered (class, subclass, name) triples ever carry an edition tag", async () => {
    const tagged = await collectTaggedFeatureKeys();
    const expected = new Set(EXPECTED_EDITION_TAGGED_FEATURES.map(([c, s, n]) => `${c}|${s}|${n}`));
    expect(tagged).toEqual(expected);
  });
});

// Risk 2: if a future author tags a fork's two rows with the SAME edition
// instead of one each, mergeLayers would emit both under that edition while
// collectEntryScopedFeatures' name-dedup silently drops one — the two
// derivation paths would then disagree and the client would log a
// duplicate-key warning (ClassFeaturesList keys on `${source}-${name}`).
describe("per-edition duplicate-name invariant (#1374 risk 2)", () => {
  it("no class × subclass × edition derives two features sharing a name", async () => {
    const profBonus = proficiencyBonusForLevel(20);
    let subclassesVisited = 0;
    for (const [className, subclasses] of Object.entries(CLASS_SUBCLASSES)) {
      for (const subclass of subclasses) {
        if (subclass === undefined) continue;
        subclassesVisited++;
        const featureRows = await loadDbFeatureRows(className, subclass);
        for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
          const info = deriveResources(className, subclass, 20, ABILITY_SCORES, profBonus, featureRows, edition);
          const names = (info?.features ?? []).map((f) => f.name);
          expect(new Set(names).size).toBe(names.length);
        }
      }
    }
    // Anti-vacuity floor: the fixture's actual subclass-definition count.
    expect(subclassesVisited).toBeGreaterThanOrEqual(31);
  });
});

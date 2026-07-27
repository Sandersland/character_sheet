// #1374: DerivedFeature.edition — the predicate that filters subclass/class
// feature TEXT by edition (mirrors Subclass.edition, #1306), plus the
// wire-boundary strip (#1272). See featureAppliesToEdition's header
// (lib/classes/registry.ts) for where the rule itself lives.
import { describe, expect, it } from "vitest";

import { deriveResources, featureAppliesToEdition } from "@/lib/classes/class-features.js";
import type { DerivedFeature } from "@/lib/classes/types.js";
import { toWireFeatures } from "@/lib/character/serialize/classes.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { CLASS_SUBCLASSES } from "./class-subclasses.fixture.js";

const ABILITY_SCORES = {
  strength: 14,
  dexterity: 16,
  constitution: 12,
  intelligence: 10,
  wisdom: 13,
  charisma: 15,
};

function feature(overrides: Partial<DerivedFeature> = {}): DerivedFeature {
  return { name: "Test Feature", level: 1, description: "test", source: "subclass", ...overrides };
}

describe("featureAppliesToEdition predicate truth table (#1374)", () => {
  // Hand-built literal fixtures, not derived content — non-vacuous by
  // construction. If the default ever flips from include to exclude, the
  // first two assertions (edition: undefined) fail.
  it("edition: undefined applies to both editions", () => {
    expect(featureAppliesToEdition(feature({ edition: undefined }), "EDITION_2014")).toBe(true);
    expect(featureAppliesToEdition(feature({ edition: undefined }), "EDITION_2024")).toBe(true);
  });

  it("edition: EDITION_2014 applies only to 2014", () => {
    expect(featureAppliesToEdition(feature({ edition: "EDITION_2014" }), "EDITION_2014")).toBe(true);
    expect(featureAppliesToEdition(feature({ edition: "EDITION_2014" }), "EDITION_2024")).toBe(false);
  });

  it("edition: EDITION_2024 applies only to 2024", () => {
    expect(featureAppliesToEdition(feature({ edition: "EDITION_2024" }), "EDITION_2014")).toBe(false);
    expect(featureAppliesToEdition(feature({ edition: "EDITION_2024" }), "EDITION_2024")).toBe(true);
  });
});

// A fork always shares its `name` across the two edition-tagged rows (plan
// §C) — each edition still resolves to exactly one row per forked name — so
// this name-set-equality invariant holds both pre-fork (chunk 1, nothing
// tagged yet) and post-fork (chunks 2-3, Cleric/Warlock forked). Meaningful
// today: it breaks if the base-layer filter ever excludes an untagged class
// feature by accident.
describe("real-content sweep: feature-name sets agree across editions (#1374 AC 2)", () => {
  it("every class × subclass at level 20 derives the same feature-name set under both editions", () => {
    const profBonus = proficiencyBonusForLevel(20);
    let triplesVisited = 0;
    for (const [className, subclasses] of Object.entries(CLASS_SUBCLASSES)) {
      for (const subclass of subclasses) {
        const at2014 = deriveResources(className, subclass, 20, ABILITY_SCORES, profBonus, "EDITION_2014");
        const at2024 = deriveResources(className, subclass, 20, ABILITY_SCORES, profBonus, "EDITION_2024");
        const names2014 = new Set((at2014?.features ?? []).map((f) => f.name));
        const names2024 = new Set((at2024?.features ?? []).map((f) => f.name));
        expect(names2014).toEqual(names2024);
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
    const untagged = feature({ name: "Bonus Proficiency", level: 1, description: "untagged text" });

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
const EXPECTED_EDITION_TAGGED_FEATURES = [
  ["cleric", "life domain", "Domain Spells"],
  ["cleric", "trickery domain", "Domain Spells"],
  ["warlock", "the fiend", "Expanded Spell List"],
  ["warlock", "the archfey", "Expanded Spell List"],
  ["warlock", "the great old one", "Expanded Spell List"],
] as const;

// Every tagged (class, subclass, name) key at one class/subclass, both
// editions — split out of collectTaggedFeatureKeys so neither function nests
// past two loops (keeps both under the repo's cognitive-complexity gate).
function taggedFeatureKeysFor(className: string, subclass: string | undefined, level: number, profBonus: number): string[] {
  const keys: string[] = [];
  for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
    const info = deriveResources(className, subclass, level, ABILITY_SCORES, profBonus, edition);
    for (const f of info?.features ?? []) {
      if (f.edition !== undefined) keys.push(`${className}|${subclass}|${f.name}`);
    }
  }
  return keys;
}

function collectTaggedFeatureKeys(level: number): Set<string> {
  const profBonus = proficiencyBonusForLevel(level);
  const tagged = new Set<string>();
  for (const [className, subclasses] of Object.entries(CLASS_SUBCLASSES)) {
    for (const subclass of subclasses) {
      for (const key of taggedFeatureKeysFor(className, subclass, level, profBonus)) tagged.add(key);
    }
  }
  return tagged;
}

describe("edition-tagged feature ledger (#1374)", () => {
  it("only the ledgered (class, subclass, name) triples ever carry an edition tag", () => {
    const tagged = collectTaggedFeatureKeys(20);
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
  it("no class × subclass × edition derives two features sharing a name", () => {
    const profBonus = proficiencyBonusForLevel(20);
    let subclassesVisited = 0;
    for (const [className, subclasses] of Object.entries(CLASS_SUBCLASSES)) {
      for (const subclass of subclasses) {
        if (subclass === undefined) continue;
        subclassesVisited++;
        for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
          const info = deriveResources(className, subclass, 20, ABILITY_SCORES, profBonus, edition);
          const names = (info?.features ?? []).map((f) => f.name);
          expect(new Set(names).size).toBe(names.length);
        }
      }
    }
    // Anti-vacuity floor: the fixture's actual subclass-definition count.
    expect(subclassesVisited).toBeGreaterThanOrEqual(31);
  });
});

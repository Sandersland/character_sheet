// Unit tests for the pure class-choice picker extracted from seed-verify.ts main().
import { describe, it, expect } from "vitest";

import {
  assertCatalogPopulated,
  pickClassChoice,
  pickSpecies,
  planInventory,
  type CatalogRow,
  type ReferenceCatalog,
  type RefClass,
  type RefSpecies,
} from "../seed-verify-helpers.js";

describe("pickClassChoice", () => {
  it("prefers a class that does not pick its subclass at level 1", () => {
    const classes: RefClass[] = [
      { name: "Cleric", subclassLevel: 1, subclasses: [{ id: "s1" }] },
      { name: "Fighter", subclassLevel: 3, subclasses: [{ id: "s2" }] },
    ];
    const result = pickClassChoice(classes);
    expect(result.needsSubclass).toBe(false);
    expect(result.chosenClass.name).toBe("Fighter");
    expect(result.classChoice).toEqual({ name: "Fighter" });
  });

  it("treats a null subclassLevel as no-subclass-at-L1", () => {
    const classes: RefClass[] = [{ name: "Wizard", subclassLevel: null, subclasses: [] }];
    const result = pickClassChoice(classes);
    expect(result.needsSubclass).toBe(false);
    expect(result.classChoice).toEqual({ name: "Wizard" });
  });

  it("falls back to the first class + its first subclass id when every class picks at L1", () => {
    const classes: RefClass[] = [
      { name: "Cleric", subclassLevel: 1, subclasses: [{ id: "s1" }] },
      { name: "Sorcerer", subclassLevel: 1, subclasses: [{ id: "s2" }] },
    ];
    const result = pickClassChoice(classes);
    expect(result.needsSubclass).toBe(true);
    expect(result.chosenClass.name).toBe("Cleric");
    expect(result.classChoice).toEqual({ name: "Cleric", subclassId: "s1" });
  });

  it("throws when the fallback class needs a subclass but the catalog has none", () => {
    const classes: RefClass[] = [{ name: "Cleric", subclassLevel: 1, subclasses: [] }];
    expect(() => pickClassChoice(classes)).toThrow(/needs a subclass at L1 but the catalog has none/);
  });
});

describe("pickSpecies", () => {
  // #1739 review: pickSpecies had no coverage of its own despite mirroring
  // pickClassChoice's branching (a 5-condition "simple" filter, a variant
  // fallback, and a throw path) — pinned here the same way pickClassChoice's
  // three shapes are above.
  it("prefers a species that needs no extra creation fields over one that does", () => {
    const species: RefSpecies[] = [
      {
        id: "sp-elf",
        name: "Elf",
        variants: [{ id: "v-elf-1" }], // fails the "no variants" leg
        abilityIncreases: [],
        needsCastingAbility: false,
        chooseSkills: { count: 1 },
        chooseCantrip: null,
        chooseOriginFeat: false,
      },
      {
        id: "sp-dwarf",
        name: "Dwarf",
        variants: [],
        abilityIncreases: [{ ability: "constitution" }], // fixed-only, passes the ability-increase leg
        needsCastingAbility: false,
        chooseSkills: null,
        chooseCantrip: null,
        chooseOriginFeat: false,
      },
    ];
    const result = pickSpecies(species);
    expect(result).toEqual({ speciesId: "sp-dwarf" });
  });

  it("falls back to the first species + its first variant id when every species needs extra fields", () => {
    const species: RefSpecies[] = [
      {
        id: "sp-human",
        name: "Human",
        variants: [{ id: "v-human-1" }, { id: "v-human-2" }],
        abilityIncreases: [],
        needsCastingAbility: false,
        chooseSkills: { count: 1 }, // fails the chooseSkills leg — no species here is "simple"
        chooseCantrip: null,
        chooseOriginFeat: true,
      },
    ];
    const result = pickSpecies(species);
    expect(result).toEqual({ speciesId: "sp-human", variantId: "v-human-1" });
  });

  it("throws when every species needs extra fields and the catalog has no variant fallback either", () => {
    const species: RefSpecies[] = [
      {
        id: "sp-aasimar",
        name: "Aasimar",
        variants: [],
        abilityIncreases: [],
        needsCastingAbility: true, // fails the needsCastingAbility leg
        chooseSkills: null,
        chooseCantrip: null,
        chooseOriginFeat: false,
      },
    ];
    expect(() => pickSpecies(species)).toThrow(
      /needs extra creation fields this script doesn't supply, and the catalog has no variant fallback either/,
    );
  });
});

describe("planInventory", () => {
  const rows: CatalogRow[] = [
    { id: "w1", name: "Longsword", weapon: {} },
    { id: "a1", name: "Chain Mail", armor: {} },
    { id: "t1", name: "Bell" },
    { id: "t2", name: "Candle" },
    { id: "t3", name: "Chalk" },
  ];

  it("acquires an equipped weapon + armor and two trinkets", () => {
    const { acquireOps, trinketIds } = planInventory(rows);
    expect(acquireOps).toEqual([
      { type: "acquire", itemId: "w1", quantity: 1, equipped: true },
      { type: "acquire", itemId: "a1", quantity: 1, equipped: true },
      { type: "acquire", itemId: "t1", quantity: 3 },
      { type: "acquire", itemId: "t2", quantity: 3 },
    ]);
    expect([...trinketIds]).toEqual(["t1", "t2"]);
  });

  it("skips missing weapon/armor slots without emitting falsy ops", () => {
    const { acquireOps, trinketIds } = planInventory([{ id: "t1", name: "Bell" }]);
    expect(acquireOps).toEqual([{ type: "acquire", itemId: "t1", quantity: 3 }]);
    expect([...trinketIds]).toEqual(["t1"]);
  });

  it("returns no ops for an empty catalog", () => {
    const { acquireOps, trinketIds } = planInventory([]);
    expect(acquireOps).toEqual([]);
    expect(trinketIds.size).toBe(0);
  });
});

describe("assertCatalogPopulated", () => {
  const full: ReferenceCatalog = {
    species: [{}],
    classes: [{}],
    backgrounds: [{}],
    conditions: [{}],
    universalActions: [{}],
  };

  it("returns null when every list is populated", () => {
    expect(assertCatalogPopulated(full)).toBeNull();
  });

  // #1506: a half-shipped edition can leave the two EDITION-FORKED lists
  // (universalActions, conditions) empty while species/classes/backgrounds
  // still resolve fine off the shared/NULL rows — exactly the failure this
  // function exists to catch. This proves it does, without a running backend.
  it("fails loudly when universalActions is empty for the requested edition", () => {
    const message = assertCatalogPopulated({ ...full, universalActions: [] });
    expect(message).toMatch(/universalActions/);
  });

  it("fails loudly when conditions is empty for the requested edition", () => {
    const message = assertCatalogPopulated({ ...full, conditions: [] });
    expect(message).toMatch(/conditions/);
  });

  it("names every empty list at once", () => {
    const message = assertCatalogPopulated({ ...full, species: [], classes: [] });
    expect(message).toMatch(/species/);
    expect(message).toMatch(/classes/);
    expect(message).not.toMatch(/backgrounds/);
  });
});

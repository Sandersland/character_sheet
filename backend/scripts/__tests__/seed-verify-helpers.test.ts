// Unit tests for the pure class-choice picker extracted from seed-verify.ts main().
import { describe, it, expect } from "vitest";

import { pickClassChoice, planInventory, type CatalogRow, type RefClass } from "../seed-verify-helpers.js";

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

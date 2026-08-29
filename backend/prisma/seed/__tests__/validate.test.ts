// NO database — pure checks on assertSeedContentValid, the seed-time zod gate
// (#1277). Two concerns: it actually rejects a malformed row, and the
// permanent positive control (#1370's lesson): a validator that
// short-circuits, has an empty registry, or is `.optional()` all the way down
// would report "all valid" vacuously. familiesChecked/rowsChecked make that
// impossible to fake — and feeding a deliberately-broken FIXTURE array (never
// the real SUBCLASSES) through the real schema proves the schema itself still
// rejects bad content, independent of what's currently seeded.
//
// SEED_FAMILIES is NOT every seeded content array — ITEMS, PACKS, FEATS,
// BACKGROUNDS, and ACTIONS are seeded too but carry no zod schema yet; the
// families/rows floors below cover only what's registered, not the whole
// seeded surface.
import { describe, it, expect } from "vitest";

import { assertSeedContentValid, assertCatalogNamesResolve, assertNoDuplicatePoolDeclaringRows, assertNoDuplicateChoiceDeclaringRows, rowIdentity } from "../validate.js";
import { subclassSeedSchema } from "../subclasses.js";

describe("assertSeedContentValid — positive control (#1277, #1370)", () => {
  // 16 families today (SEED_FAMILIES in validate.ts) — >= floors rather than
  // exact counts so this doesn't need editing every time a family is added.
  // The floor is bumped in the SAME diff that registers a new family —
  // writing toBe(N) here would keep passing if a registration were silently
  // dropped (#1370's exact failure shape).
  it("visited at least 16 families and 1000 rows", () => {
    const summary = assertSeedContentValid();
    expect(summary.familiesChecked).toBeGreaterThanOrEqual(16);
    expect(summary.rowsChecked).toBeGreaterThanOrEqual(1000);
  });

  it("the real content passes cleanly", () => {
    expect(() => assertSeedContentValid()).not.toThrow();
  });

  it("subclassSeedSchema rejects a broken FIXTURE row (never the real SUBCLASSES array)", () => {
    const brokenFixture = [
      { className: "Fighter", name: "Champion", description: "ok", slug: "fighter-champion" },
      { className: "Fighter", name: "Broken", description: "", slug: "not-a-real-slug" },
    ];
    const bad = brokenFixture.map((row, i) => ({ index: i, result: subclassSeedSchema.safeParse(row) }));
    expect(bad[0].result.success).toBe(true);
    expect(bad[1].result.success).toBe(false);
  });

  // #1533 [R3]/[R4] mutation proof: a FIXTURE row (never the real
  // STARTING_EQUIPMENT_PACKAGES) whose catalogName resolves against NEITHER
  // ITEMS nor PACKS must be named in the thrown error.
  it("assertCatalogNamesResolve rejects a catalogName that resolves against neither ITEMS nor PACKS", () => {
    const brokenFixture = [
      {
        className: "Fighter",
        edition: "EDITION_2014" as const,
        package: {
          gold: { diceCount: 1, diceFaces: 4, multiplier: 1 },
          groups: [
            {
              label: "test group",
              options: [{ label: "test option", items: [{ catalogName: "Not A Real Catalog Item" }] }],
            },
          ],
        },
      },
    ];
    expect(() => assertCatalogNamesResolve(brokenFixture)).toThrow(/Not A Real Catalog Item/);
  });

  it("assertCatalogNamesResolve accepts a Pack-only catalogName (resolveFixedItems checks Pack before Item)", () => {
    const okFixture = [
      {
        className: "Fighter",
        edition: "EDITION_2014" as const,
        package: {
          gold: { diceCount: 1, diceFaces: 4, multiplier: 1 },
          groups: [
            {
              label: "test group",
              options: [{ label: "test option", items: [{ catalogName: "Dungeoneer's Pack" }] }],
            },
          ],
        },
      },
    ];
    expect(() => assertCatalogNamesResolve(okFixture)).not.toThrow();
  });

  // #1564: the PHB'24 catalog additions (11 fixed items + 9 new
  // musical instruments, Lute already existed) must resolve the same way any
  // other ITEMS row does — a FIXTURE package referencing all of them, never
  // the real STARTING_EQUIPMENT_PACKAGES (which doesn't cite them until #1535).
  it("assertCatalogNamesResolve accepts every #1564 catalog addition", () => {
    const newNames = [
      "Greatsword", "Flail", "Spear", "Sickle", "Studded Leather Armor", "Chain Shirt",
      "Quiver", "Robe", "Crystal", "Orb", "Herbalism Kit",
      "Bagpipes", "Drum", "Dulcimer", "Flute", "Horn", "Lyre", "Pan Flute", "Shawm", "Viol",
    ];
    const fixture = [
      {
        className: "Fighter",
        edition: "EDITION_2014" as const,
        package: {
          gold: { diceCount: 1, diceFaces: 4, multiplier: 1 },
          groups: [
            {
              label: "test group",
              options: [{ label: "test option", items: newNames.map((catalogName) => ({ catalogName })) }],
            },
          ],
        },
      },
    ];
    expect(() => assertCatalogNamesResolve(fixture)).not.toThrow();
  });

  // #906: findOverrideRow picks the FIRST matching row — two pool-declaring
  // rows sharing (class, subclass, resourceKey, edition) is content
  // ambiguity, never a legal seed shape.
  it("assertNoDuplicatePoolDeclaringRows rejects two rows sharing (class, subclass, resourceKey, edition)", () => {
    const brokenFixture = [
      { className: "Druid", subclassSlug: "druid-circle-of-the-moon", edition: "EDITION_2014", resourceKey: "wildShape", resourceTotals: [{ minLevel: 2, total: 2 }] },
      { className: "Druid", subclassSlug: "druid-circle-of-the-moon", edition: "EDITION_2014", resourceKey: "wildShape", resourceTotals: [{ minLevel: 2, total: 3 }] },
    ];
    expect(() => assertNoDuplicatePoolDeclaringRows(brokenFixture)).toThrow(/duplicate pool-declaring ClassFeature row/);
  });

  it("assertNoDuplicatePoolDeclaringRows accepts the same resourceKey across DIFFERENT subclasses/editions", () => {
    const okFixture = [
      { className: "Druid", subclassSlug: null, edition: "EDITION_2014", resourceKey: "wildShape", resourceTotals: [{ minLevel: 2, total: 2 }] },
      { className: "Druid", subclassSlug: "druid-circle-of-the-moon", edition: "EDITION_2014", resourceKey: "wildShape", resourceTotals: [{ minLevel: 2, total: 2 }] },
      { className: "Druid", subclassSlug: null, edition: "EDITION_2024", resourceKey: "wildShape", resourceTotals: [{ minLevel: 2, total: 2 }] },
    ];
    expect(() => assertNoDuplicatePoolDeclaringRows(okFixture)).not.toThrow();
  });

  it("assertNoDuplicatePoolDeclaringRows ignores identity-only rows (resourceKey with no resourceTotals, the Metamagic pattern)", () => {
    const okFixture = [
      { className: "Sorcerer", subclassSlug: null, edition: "EDITION_2014", resourceKey: "metamagic" },
      { className: "Sorcerer", subclassSlug: null, edition: "EDITION_2024", resourceKey: "metamagic" },
    ];
    expect(() => assertNoDuplicatePoolDeclaringRows(okFixture)).not.toThrow();
  });

  it("assertNoDuplicateChoiceDeclaringRows rejects two rows sharing (class, subclass, choiceKey, edition)", () => {
    const brokenFixture = [
      { className: "Monk", subclassSlug: "monk-way-of-the-four-elements", edition: "EDITION_2014", choiceKey: "fourElementsDisciplines" },
      { className: "Monk", subclassSlug: "monk-way-of-the-four-elements", edition: "EDITION_2014", choiceKey: "fourElementsDisciplines" },
    ];
    expect(() => assertNoDuplicateChoiceDeclaringRows(brokenFixture)).toThrow(/duplicate choice-declaring ClassFeature row/);
  });

  it("assertNoDuplicateChoiceDeclaringRows accepts the same choiceKey across DIFFERENT editions", () => {
    const okFixture = [
      { className: "Monk", subclassSlug: "monk-way-of-the-four-elements", edition: "EDITION_2014", choiceKey: "fourElementsDisciplines" },
      { className: "Monk", subclassSlug: "monk-way-of-the-four-elements", edition: "EDITION_2024", choiceKey: "fourElementsDisciplines" },
    ];
    expect(() => assertNoDuplicateChoiceDeclaringRows(okFixture)).not.toThrow();
  });

  it("assertCatalogNamesResolve accepts every #1565 catalog addition", () => {
    const newNames = [
      "Traveler's Clothes", "Common Clothes", "Pouch", "Calligrapher's Supplies", "Prayer Book",
      "Dice Set", "Dragonchess Set", "Playing Card Set", "Three-Dragon Ante Set",
    ];
    const fixture = [
      {
        className: "Fighter",
        edition: "EDITION_2014" as const,
        package: {
          gold: { diceCount: 1, diceFaces: 4, multiplier: 1 },
          groups: [
            {
              label: "test group",
              options: [{ label: "test option", items: newNames.map((catalogName) => ({ catalogName })) }],
            },
          ],
        },
      },
    ];
    expect(() => assertCatalogNamesResolve(fixture)).not.toThrow();
  });
});

describe("rowIdentity — the error-message identity tag (#1980)", () => {
  it("returns empty string for a non-object row", () => {
    expect(rowIdentity("not-a-row")).toBe("");
    expect(rowIdentity(42)).toBe("");
    expect(rowIdentity(undefined)).toBe("");
  });

  it("returns empty string for null", () => {
    expect(rowIdentity(null)).toBe("");
  });

  it("returns empty string when neither a label nor an edition field is present", () => {
    expect(rowIdentity({ someOtherField: 1 })).toBe("");
  });

  it("tags (name, edition) when both are present", () => {
    expect(rowIdentity({ name: "Fireball", edition: "EDITION_2014" })).toBe(" (Fireball, EDITION_2014)");
  });

  it("falls back to className when name is absent", () => {
    expect(rowIdentity({ className: "Fighter", edition: "EDITION_2024" })).toBe(" (Fighter, EDITION_2024)");
  });

  it("falls back to backgroundName when neither name nor className is present", () => {
    expect(rowIdentity({ backgroundName: "Soldier", edition: "EDITION_2014" })).toBe(" (Soldier, EDITION_2014)");
  });

  it("prefers name over className over backgroundName when more than one is present", () => {
    expect(rowIdentity({ name: "Fireball", className: "Wizard", backgroundName: "Sage", edition: "EDITION_2014" })).toBe(
      " (Fireball, EDITION_2014)",
    );
  });

  it("omits the edition segment when a label is present but edition is absent", () => {
    expect(rowIdentity({ name: "Fireball" })).toBe(" (Fireball)");
  });

  it("tags just the edition when no label field is present", () => {
    expect(rowIdentity({ edition: "EDITION_2024" })).toBe(" (EDITION_2024)");
  });

  it("ignores a non-string label or edition value", () => {
    expect(rowIdentity({ name: 123, edition: "EDITION_2014" })).toBe(" (EDITION_2014)");
    expect(rowIdentity({ name: "Fireball", edition: 2014 })).toBe(" (Fireball)");
  });
});

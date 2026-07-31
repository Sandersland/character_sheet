// NO database — pure checks on assertSeedContentValid, the seed-time zod gate
// (#1277). Two concerns:
//   1. it actually rejects a malformed row (the M1/M3-shaped mutations,
//      reverted after confirming the failure — transcript in the PR);
//   2. the permanent positive control (#1370's lesson): a validator that
//      short-circuits, has an empty registry, or is `.optional()` all the way
//      down would report "all valid" vacuously. familiesChecked/rowsChecked
//      make that impossible to fake — and feeding a deliberately-broken
//      FIXTURE array (never the real SUBCLASSES) through the real schema
//      proves the schema itself still rejects bad content, independent of
//      what's currently seeded.
import { describe, it, expect } from "vitest";

import { assertSeedContentValid, assertCatalogNamesResolve } from "../validate.js";
import { subclassSeedSchema } from "../subclasses.js";

describe("assertSeedContentValid — positive control (#1277, #1370)", () => {
  // 4 families today: SUBCLASSES, SUBCLASS_GRANTED_SPELLS, CLASS_FEATURES
  // (#1523, 522 rows), and STARTING_EQUIPMENT_PACKAGES (#1533, 24 rows) —
  // >= floors rather than exact counts so this doesn't need editing every
  // time a family is added. The floor is bumped 3->4 in the SAME diff that
  // registers the fourth family — writing toBe(3)/31 here would keep passing
  // if the registration were silently dropped (#1370's exact failure shape).
  it("visited at least 4 families and 60 rows", () => {
    const summary = assertSeedContentValid();
    expect(summary.familiesChecked).toBeGreaterThanOrEqual(4);
    expect(summary.rowsChecked).toBeGreaterThanOrEqual(60);
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

  // #1564: the twelve PHB'24 catalog additions (11 fixed items + 9 new
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
});

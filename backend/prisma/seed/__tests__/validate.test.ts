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

import { assertSeedContentValid } from "../validate.js";
import { subclassSeedSchema } from "../subclasses.js";

describe("assertSeedContentValid — positive control (#1277, #1370)", () => {
  // 3 families today: SUBCLASSES, SUBCLASS_GRANTED_SPELLS, and CLASS_FEATURES
  // (#1523, 522 rows) — >= floors rather than exact counts so this doesn't
  // need editing every time a family is added.
  it("visited at least 3 families and 31 rows", () => {
    const summary = assertSeedContentValid();
    expect(summary.familiesChecked).toBeGreaterThanOrEqual(3);
    expect(summary.rowsChecked).toBeGreaterThanOrEqual(31);
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
});

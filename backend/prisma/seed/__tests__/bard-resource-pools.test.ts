import { describe, expect, it } from "vitest";

import { poolsFromRows } from "@/lib/classes/class-feature-rows.js";

import { BARD_FEATURES } from "../bard-features.js";

const BASE_ROWS = BARD_FEATURES.filter((r) => r.subclassSlug === null);

function poolAt(key: string, level: number, edition: "EDITION_2014" | "EDITION_2024", charisma: number) {
  return poolsFromRows(BASE_ROWS, level, { charisma }, 0, edition).find((p) => p.key === key);
}

// SRD 5.1 p.53 / SRD 5.2 p.31: a minimum of once, equal to your Charisma
// modifier — die d6/d8/d10/d12 at L1/5/10/15, longRest recharge upgrading to
// short-or-long at Font of Inspiration (L5). Both editions agree on every
// axis, matching the deleted bard.ts resourceFn's arithmetic exactly (proven
// row-vs-fn parity across levels 1-20, both editions, before the fn's deletion).
describe("bardicInspiration rides Bard's own row — the pool bard.ts's resourceFn used to declare", () => {
  it.each(["EDITION_2014", "EDITION_2024"] as const)("%s: total is max(1, Cha modifier)", (edition) => {
    expect(poolAt("bardicInspiration", 1, edition, 8)?.total).toBe(1); // Cha 8, -1 mod, floors at 1
    expect(poolAt("bardicInspiration", 1, edition, 18)?.total).toBe(4); // Cha 18, +4 mod
  });

  it.each(["EDITION_2014", "EDITION_2024"] as const)("%s: die is d6 below L5, d8 at L5, d10 at L10, d12 at L15", (edition) => {
    expect(poolAt("bardicInspiration", 4, edition, 10)?.die).toBe("d6");
    expect(poolAt("bardicInspiration", 5, edition, 10)?.die).toBe("d8");
    expect(poolAt("bardicInspiration", 10, edition, 10)?.die).toBe("d10");
    expect(poolAt("bardicInspiration", 15, edition, 10)?.die).toBe("d12");
    expect(poolAt("bardicInspiration", 20, edition, 10)?.die).toBe("d12");
  });

  it.each(["EDITION_2014", "EDITION_2024"] as const)("%s: recharges longRest below L5, short-or-long from L5 (Font of Inspiration)", (edition) => {
    expect(poolAt("bardicInspiration", 4, edition, 10)?.recharge).toBe("longRest");
    expect(poolAt("bardicInspiration", 5, edition, 10)?.recharge).toBe("short-or-long");
    expect(poolAt("bardicInspiration", 20, edition, 10)?.recharge).toBe("short-or-long");
  });

  it("present from level 1 in both editions (grant IS level 1)", () => {
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      expect(poolAt("bardicInspiration", 1, edition, 10)?.label).toBe("Bardic Inspiration");
    }
  });

  // #1528 no-second-string rule: the pool's description is the row's own
  // text, never a second, level-interpolated string.
  it("each edition's pool description is its own Bardic Inspiration row text", () => {
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      const row = BASE_ROWS.find((r) => r.name === "Bardic Inspiration" && r.edition === edition)!;
      expect(poolAt("bardicInspiration", 1, edition, 10)?.description).toBe(row.description);
    }
  });
});

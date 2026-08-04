// #1232 commit 3 of 3: every Sorcerer pool that is a flat, level-gated total
// moved off lib/classes/sorcerer.ts's resourceFns onto its ClassFeature row's
// own resourceKey/resourceLabel/resourceRecharge/resourceTotals columns, read
// here through the SAME poolsFromRows a real character's derivation calls
// (registry.ts's deriveBaseLayer/deriveSubclassLayer) — never a hand-rolled
// re-derivation of the tier table. Modelled on warlock-resource-pools.test.ts.
import { describe, expect, it } from "vitest";

import { poolsFromRows } from "@/lib/classes/class-feature-rows.js";
import { deriveResources } from "@/lib/classes/class-features.js";
import { sorcerer } from "@/lib/classes/sorcerer.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { SORCERER_FEATURES } from "../sorcerer-features.js";

const BASE_ROWS = SORCERER_FEATURES.filter((r) => r.subclassSlug === null);
const DRACONIC_ROWS = SORCERER_FEATURES.filter((r) => r.subclassSlug === "sorcerer-draconic-bloodline");
const WILD_ROWS = SORCERER_FEATURES.filter((r) => r.subclassSlug === "sorcerer-wild-magic");

// abilityScores/profBonus are unused here — every Sorcerer resourceTotals
// tier is a flat number, never a #1685 formula — so `{}`/`0` are inert.
function poolAt(rows: typeof SORCERER_FEATURES, key: string, level: number, edition: "EDITION_2014" | "EDITION_2024") {
  return poolsFromRows(rows, level, {}, 0, edition).find((p) => p.key === key);
}

describe("Innate Sorcery (base class, #1232): 2024 only, L1, 2/long rest — the first pool a 2024 Sorcerer has", () => {
  it("present at level 1 and level 20 (no gate above its own grant level), absent one level below (never fires — grant IS level 1)", () => {
    const at1 = poolAt(BASE_ROWS, "innateSorcery", 1, "EDITION_2024");
    expect(at1?.total).toBe(2);
    expect(at1?.recharge).toBe("longRest");
    expect(at1?.label).toBe("Innate Sorcery");
    expect(poolAt(BASE_ROWS, "innateSorcery", 20, "EDITION_2024")?.total).toBe(2);
  });

  it("absent entirely under EDITION_2014 (no 2014 row declares this key)", () => {
    expect(poolAt(BASE_ROWS, "innateSorcery", 20, "EDITION_2014")).toBeUndefined();
  });

  it("the row's own description IS the pool's description (#1528 no-second-string rule)", () => {
    const row = BASE_ROWS.find((r) => r.name === "Innate Sorcery" && r.edition === "EDITION_2024")!;
    const pool = poolAt(BASE_ROWS, "innateSorcery", 1, "EDITION_2024")!;
    expect(pool.description).toBe(row.description);
  });
});

describe("Sorcerous Restoration (base class, #1232): 2024 only, L5, 1/long rest", () => {
  it("absent at level 4, present at level 5 and level 20", () => {
    expect(poolAt(BASE_ROWS, "sorcerousRestoration", 4, "EDITION_2024")).toBeUndefined();
    const at5 = poolAt(BASE_ROWS, "sorcerousRestoration", 5, "EDITION_2024");
    expect(at5?.total).toBe(1);
    expect(at5?.recharge).toBe("longRest");
    expect(poolAt(BASE_ROWS, "sorcerousRestoration", 20, "EDITION_2024")?.total).toBe(1);
  });

  it("absent entirely under EDITION_2014 (the 2014 row has no use limit, and gets no pool)", () => {
    expect(poolAt(BASE_ROWS, "sorcerousRestoration", 20, "EDITION_2014")).toBeUndefined();
  });
});

describe("Tides of Chaos (Wild Magic, #1232): a real cross-edition pair — L1 in 2014, L3 in 2024, both flat 1/long rest", () => {
  it("EDITION_2014: absent at level 0-equivalent gate check skipped (grant is L1), present at level 1 and level 20", () => {
    const at1 = poolAt(WILD_ROWS, "tidesOfChaos", 1, "EDITION_2014");
    expect(at1?.total).toBe(1);
    expect(at1?.recharge).toBe("longRest");
    expect(poolAt(WILD_ROWS, "tidesOfChaos", 20, "EDITION_2014")?.total).toBe(1);
  });

  it("EDITION_2024: absent at level 2, present at level 3 and level 20", () => {
    expect(poolAt(WILD_ROWS, "tidesOfChaos", 2, "EDITION_2024")).toBeUndefined();
    const at3 = poolAt(WILD_ROWS, "tidesOfChaos", 3, "EDITION_2024");
    expect(at3?.total).toBe(1);
    expect(at3?.recharge).toBe("longRest");
    expect(poolAt(WILD_ROWS, "tidesOfChaos", 20, "EDITION_2024")?.total).toBe(1);
  });
});

describe("Dragon Wings (Draconic Bloodline, #1232): 2024 only, L14, 1/long rest", () => {
  it("absent at level 13, present at level 14 and level 20", () => {
    expect(poolAt(DRACONIC_ROWS, "dragonWings", 13, "EDITION_2024")).toBeUndefined();
    const at14 = poolAt(DRACONIC_ROWS, "dragonWings", 14, "EDITION_2024");
    expect(at14?.total).toBe(1);
    expect(at14?.recharge).toBe("longRest");
    expect(poolAt(DRACONIC_ROWS, "dragonWings", 20, "EDITION_2024")?.total).toBe(1);
  });

  it("absent entirely under EDITION_2014 (the 2014 row has no use limit at all)", () => {
    expect(poolAt(DRACONIC_ROWS, "dragonWings", 20, "EDITION_2014")).toBeUndefined();
  });
});

describe("Tamed Surge (Wild Magic, #1232): 2024 only, L18, 1/long rest", () => {
  it("absent at level 17, present at level 18 and level 20", () => {
    expect(poolAt(WILD_ROWS, "tamedSurge", 17, "EDITION_2024")).toBeUndefined();
    const at18 = poolAt(WILD_ROWS, "tamedSurge", 18, "EDITION_2024");
    expect(at18?.total).toBe(1);
    expect(at18?.recharge).toBe("longRest");
    expect(poolAt(WILD_ROWS, "tamedSurge", 20, "EDITION_2024")?.total).toBe(1);
  });

  it("absent entirely under EDITION_2014 (no 2014 row of this name)", () => {
    expect(poolAt(WILD_ROWS, "tamedSurge", 20, "EDITION_2014")).toBeUndefined();
  });
});

describe("cross-edition absence at level 20 (#1232 §1.3 proof): innateSorcery/sorcerousRestoration/dragonWings/tamedSurge never appear under EDITION_2014", () => {
  it("all four keys are absent from the full derivation at level 20 under EDITION_2014", () => {
    const abilityScores = { strength: 10, dexterity: 14, constitution: 12, intelligence: 8, wisdom: 13, charisma: 18 };
    const profBonus = proficiencyBonusForLevel(20);
    const featureRows = { classRows: BASE_ROWS, subclassRows: DRACONIC_ROWS };
    const info = deriveResources("sorcerer", "draconic bloodline", 20, abilityScores, profBonus, featureRows, "EDITION_2014");
    const keys = new Set((info?.resources ?? []).map((r) => r.key));
    for (const key of ["innateSorcery", "sorcerousRestoration", "dragonWings", "tamedSurge"]) {
      expect(keys.has(key), key).toBe(false);
    }
  });
});

describe("sorceryPoints stays in resourceFn, never on a row (#1232 §1.1)", () => {
  it("poolsFromRows over the base rows never contains a sorceryPoints key, in either edition", () => {
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      expect(poolsFromRows(BASE_ROWS, 20, {}, 0, edition).some((p) => p.key === "sorceryPoints")).toBe(false);
    }
  });

  it("deriveResources still yields total === level for sorceryPoints, both editions", () => {
    const abilityScores = { strength: 10, dexterity: 14, constitution: 12, intelligence: 8, wisdom: 13, charisma: 18 };
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      const profBonus = proficiencyBonusForLevel(10);
      const info = deriveResources("sorcerer", undefined, 10, abilityScores, profBonus, { classRows: BASE_ROWS, subclassRows: [] }, edition);
      const pool = info?.resources.find((r) => r.key === "sorceryPoints");
      expect(pool?.total, edition).toBe(10);
    }
  });

  it("the 2024 resourceFn description agrees with the 2024 Font of Magic row's text (the Dark One's Own Luck no-second-string pattern)", () => {
    const fnPools = sorcerer.resourceFn!(10, { charisma: 18 }, 2, undefined, "EDITION_2024");
    const fnDescription = fnPools.find((p) => p.key === "sorceryPoints")?.description ?? "";
    const rowDescription = BASE_ROWS.find((r) => r.name === "Font of Magic" && r.edition === "EDITION_2024")!.description;
    expect(fnDescription).toContain("minimum Sorcerer level 2");
    expect(rowDescription).toContain("minimum Sorcerer level 2");
  });

  it("the 2014 resourceFn description is unchanged from before this retab", () => {
    const fnPools = sorcerer.resourceFn!(10, { charisma: 18 }, 2, undefined, "EDITION_2014");
    const fnDescription = fnPools.find((p) => p.key === "sorceryPoints")?.description ?? "";
    expect(fnDescription).toBe("Convert to spell slots or fuel Metamagic options (Font of Magic). Regain all points on a long rest.");
  });
});

import { describe, expect, it } from "vitest";

import { poolsFromRows } from "@/lib/classes/class-feature-rows.js";
import { deriveResources } from "@/lib/classes/class-features.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { SORCERER_FEATURES } from "../sorcerer-features.js";

const BASE_ROWS = SORCERER_FEATURES.filter((r) => r.subclassSlug === null);
const DRACONIC_ROWS = SORCERER_FEATURES.filter((r) => r.subclassSlug === "sorcerer-draconic-bloodline");
const WILD_ROWS = SORCERER_FEATURES.filter((r) => r.subclassSlug === "sorcerer-wild-magic");

// abilityScores/profBonus default to `{}`/`0` — no Sorcerer resourceTotals
// tier is an ability/proficiency formula. Signature matches warlock-resource-pools' poolAt.
function poolAt(
  rows: typeof SORCERER_FEATURES,
  key: string,
  level: number,
  edition: "EDITION_2014" | "EDITION_2024",
  abilityScores: Record<string, number> = {},
) {
  return poolsFromRows(rows, level, abilityScores, 0, edition).find((p) => p.key === key);
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

describe("sorceryPoints rides the Font of Magic rows — the pool the deleted resourceFn used to declare", () => {
  // PHB'14 p.101 / SRD 5.2 p.140: Sorcery Points equal sorcerer level, from
  // level 2, regained on a Long Rest.
  it("absent at level 1, then total === level with longRest recharge for every level 2-20, both editions", () => {
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      expect(poolAt(BASE_ROWS, "sorceryPoints", 1, edition), edition).toBeUndefined();
      for (let level = 2; level <= 20; level++) {
        const pool = poolAt(BASE_ROWS, "sorceryPoints", level, edition);
        expect(pool?.label, `${edition} L${level}`).toBe("Sorcery Points");
        expect(pool?.total, `${edition} L${level}`).toBe(level);
        expect(pool?.recharge, `${edition} L${level}`).toBe("longRest");
      }
    }
  });

  it("deriveResources yields total === level for sorceryPoints, both editions", () => {
    const abilityScores = { strength: 10, dexterity: 14, constitution: 12, intelligence: 8, wisdom: 13, charisma: 18 };
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      const profBonus = proficiencyBonusForLevel(10);
      const info = deriveResources("sorcerer", undefined, 10, abilityScores, profBonus, { classRows: BASE_ROWS, subclassRows: [] }, edition);
      const pool = info?.resources.find((r) => r.key === "sorceryPoints");
      expect(pool?.total, edition).toBe(10);
    }
  });

  it("each edition's pool description IS its own Font of Magic row text (#1528 no-second-string rule), and 2024's keeps the Min. Sorcerer Level clause", () => {
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      const row = BASE_ROWS.find((r) => r.name === "Font of Magic" && r.edition === edition)!;
      expect(poolAt(BASE_ROWS, "sorceryPoints", 2, edition)?.description, edition).toBe(row.description);
    }
    const row2024 = BASE_ROWS.find((r) => r.name === "Font of Magic" && r.edition === "EDITION_2024")!;
    expect(row2024.description).toContain("minimum Sorcerer level 2");
  });
});

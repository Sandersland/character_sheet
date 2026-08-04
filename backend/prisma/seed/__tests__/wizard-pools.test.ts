// #1234 commit 3 of 4: Arcane Recovery's and Illusory Self's resource pools
// move off lib/classes/wizard.ts's two retired resourceFns onto their rows'
// resourceKey/resourceLabel/resourceRecharge/resourceTotals columns
// (wizard-features.ts), read here through the SAME poolsFromRows a real
// character's derivation calls (registry.ts's deriveBaseLayer/
// deriveSubclassLayer) — never a hand-rolled re-derivation. Mirrors
// barbarian-rage-pool.test.ts's shape.
//
// This file is red until both rows' resource columns are populated to match
// the retired resourceFns' exact outputs (the "pools derive identically
// after the move" proof) and wizard.ts's resourceFns are deleted in the same
// commit (a resourceFn pool wins over a row pool of the same key —
// mergePoolSources, registry.ts — so the row is inert while either
// resourceFn survives).
import { describe, expect, it } from "vitest";

import { poolsFromRows } from "@/lib/classes/class-feature-rows.js";
import { loadDbFeatureRows } from "@/lib/classes/__tests__/db-feature-rows.fixture.js";
import { deriveResources } from "@/lib/classes/class-features.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

import { WIZARD_FEATURES } from "../wizard-features.js";

// Base-class rows only (subclassSlug null) — mirrors the `classRows` half of
// the real ClassFeatureRowsCarrier a Wizard's own class.features relation
// loads (characterInclude; subclassId: null).
const BASE_ROWS = WIZARD_FEATURES.filter((r) => r.subclassSlug === null);
const ILLUSION_ROWS = WIZARD_FEATURES.filter((r) => r.subclassSlug === "wizard-school-of-illusion");

// abilityScores/profBonus are unused — both pools are flat numbers, never a
// #1685 formula tier.
function arcaneRecoveryAt(level: number, edition: "EDITION_2014" | "EDITION_2024") {
  return poolsFromRows(BASE_ROWS, level, {}, 0, edition).find((p) => p.key === "arcaneRecovery");
}

function illusorySelfAt(level: number, edition: "EDITION_2014" | "EDITION_2024") {
  return poolsFromRows(ILLUSION_ROWS, level, {}, 0, edition).find((p) => p.key === "illusorySelf");
}

describe("Arcane Recovery pool (#1234) — the retired resourceFn's exact outputs, both editions", () => {
  it.each([1, 5, 20] as const)("level %i: total 1, longRest recharge, no shortRestRegain, both editions", (level) => {
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      const pool = arcaneRecoveryAt(level, edition);
      expect(pool?.total, edition).toBe(1);
      expect(pool?.recharge, edition).toBe("longRest");
      expect(pool?.shortRestRegain, edition).toBeUndefined();
    }
  });

  it("description equals the feature row's own description (#1528's no-second-string rule)", () => {
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      const row = BASE_ROWS.find((r) => r.name === "Arcane Recovery" && r.edition === edition)!;
      const pool = arcaneRecoveryAt(1, edition);
      expect(pool?.description).toBe(row.description);
    }
  });
});

describe("Illusory Self pool (#1234) — the retired resourceFn's `if (level < 10) return []` gate, now row data", () => {
  it.each(["EDITION_2014", "EDITION_2024"] as const)("%s: absent at level 9, present at level 10 and level 20", (edition) => {
    expect(illusorySelfAt(9, edition)).toBeUndefined();
    expect(illusorySelfAt(10, edition)?.total).toBe(1);
    expect(illusorySelfAt(20, edition)?.total).toBe(1);
  });

  it.each(["EDITION_2014", "EDITION_2024"] as const)("%s: short-or-long recharge at level 10", (edition) => {
    expect(illusorySelfAt(10, edition)?.recharge).toBe("short-or-long");
  });

  it("description equals the feature row's own description, both editions", () => {
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      const row = ILLUSION_ROWS.find((r) => r.name === "Illusory Self" && r.edition === edition)!;
      const pool = illusorySelfAt(10, edition);
      expect(pool?.description).toBe(row.description);
    }
  });
});

const ABILITY_SCORES = {
  strength: 10,
  dexterity: 12,
  constitution: 14,
  intelligence: 18,
  wisdom: 13,
  charisma: 8,
};

// DB-backed, through the REAL derivation path (mirrors barbarian-rage-
// pool.test.ts's own integration case, and the pattern wizard-2024-
// content.test.ts's own integration describes use).
describe("integration (#1234): loadDbFeatureRows('wizard','school of illusion') -> deriveResources at L10 yields both pools, both editions", () => {
  it("both arcaneRecovery and illusorySelf resolve", async () => {
    const featureRows = await loadDbFeatureRows("wizard", "school of illusion");
    const profBonus = proficiencyBonusForLevel(10);
    for (const edition of ["EDITION_2014", "EDITION_2024"] as const) {
      const info = deriveResources("wizard", "school of illusion", 10, ABILITY_SCORES, profBonus, featureRows, edition);
      const keys = (info?.resources ?? []).map((r) => r.key);
      expect(keys, edition).toEqual(expect.arrayContaining(["arcaneRecovery", "illusorySelf"]));
    }
  });
});

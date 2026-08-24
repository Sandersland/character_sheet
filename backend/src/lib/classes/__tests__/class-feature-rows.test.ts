// #1524: featuresFromRows — the ONE place the edition rule for feature TEXT
// lives, retired here from featureAppliesToEdition (registry.ts). Truth-table
// coverage for the predicate (edition match + level gate), plus the
// no-Prisma-import assertion that keeps lib/classes/ a pure leaf (mirrors
// lib/spellcasting/granted-spells.ts's GrantedSpellSource pattern).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  conditionImmunitiesFromRows,
  derivedStatFromRows,
  evaluateBuffModifier,
  evaluateResourceTotal,
  featuresFromRows,
  improvementsFromRows,
  poolsFromRows,
  type ClassFeatureRow,
} from "@/lib/classes/class-feature-rows.js";
import { proficiencyBonusForLevel } from "@/lib/leveling/experience.js";

function row(overrides: Partial<ClassFeatureRow> = {}): ClassFeatureRow {
  return { name: "Test Feature", level: 1, description: "test description", edition: "EDITION_2014", ...overrides };
}

describe("featuresFromRows edition + level truth table (#1524, retired from #1374's featureAppliesToEdition)", () => {
  it("a row tagged for the matching edition, at or below the character's level, is included", () => {
    const rows = [row({ edition: "EDITION_2014", level: 3 })];
    expect(featuresFromRows(rows, 3, "class", "EDITION_2014")).toHaveLength(1);
    expect(featuresFromRows(rows, 20, "class", "EDITION_2014")).toHaveLength(1);
  });

  it("a row tagged for the OTHER edition is excluded — never falls back (unlike AuthoredFeature's optional edition, every ClassFeature row names its own)", () => {
    const rows = [row({ edition: "EDITION_2014" })];
    expect(featuresFromRows(rows, 20, "class", "EDITION_2024")).toHaveLength(0);
  });

  it("a row above the character's level is excluded regardless of edition match", () => {
    const rows = [row({ edition: "EDITION_2024", level: 5 })];
    expect(featuresFromRows(rows, 4, "class", "EDITION_2024")).toHaveLength(0);
    expect(featuresFromRows(rows, 5, "class", "EDITION_2024")).toHaveLength(1);
  });

  it("a fork's two rows (same name, opposite edition) never both survive one edition's filter — proves the filter runs on the way OUT of the rows, before any merge could arbitrate between them", () => {
    const rows = [
      row({ name: "Domain Spells", level: 1, edition: "EDITION_2014", description: "2014 text" }),
      row({ name: "Domain Spells", level: 1, edition: "EDITION_2024", description: "2024 text" }),
    ];
    const at2014 = featuresFromRows(rows, 20, "subclass", "EDITION_2014");
    const at2024 = featuresFromRows(rows, 20, "subclass", "EDITION_2024");
    expect(at2014).toHaveLength(1);
    expect(at2014[0].description).toBe("2014 text");
    expect(at2024).toHaveLength(1);
    expect(at2024[0].description).toBe("2024 text");
  });

  it("stamps the requested `source` on every mapped feature and carries the row's own edition through (DerivedFeature.edition is required)", () => {
    const rows = [row({ name: "Rage", level: 1, edition: "EDITION_2024" })];
    const [feature] = featuresFromRows(rows, 1, "class", "EDITION_2024");
    expect(feature.source).toBe("class");
    expect(feature.edition).toBe("EDITION_2024");

    const [subFeature] = featuresFromRows(rows, 1, "subclass", "EDITION_2024");
    expect(subFeature.source).toBe("subclass");
  });

  it("an empty row list produces an empty feature list (the no-carrier default every narrow-select caller falls back to)", () => {
    expect(featuresFromRows([], 20, "class", "EDITION_2024")).toEqual([]);
  });
});

describe("derivedStatFromRows (#1530) — same edition/level truth table as featuresFromRows, plus MAX-across-rows", () => {
  it("a row tagged for the matching edition, at or below level, whose tier is reached, contributes its value", () => {
    const rows = [row({ derivedStat: "attacksPerAction", derivedStatTiers: [{ minLevel: 5, value: 2 }] })];
    expect(derivedStatFromRows(rows, 4, "EDITION_2014", "attacksPerAction")).toBeUndefined();
    expect(derivedStatFromRows(rows, 5, "EDITION_2014", "attacksPerAction")).toBe(2);
  });

  it("a row above the character's level is excluded regardless of tier content", () => {
    const rows = [row({ level: 5, derivedStat: "attacksPerAction", derivedStatTiers: [{ minLevel: 5, value: 2 }] })];
    expect(derivedStatFromRows(rows, 4, "EDITION_2014", "attacksPerAction")).toBeUndefined();
  });

  it("a row tagged for the OTHER edition is excluded — never falls back", () => {
    const rows = [row({ edition: "EDITION_2014", derivedStat: "attacksPerAction", derivedStatTiers: [{ minLevel: 1, value: 2 }] })];
    expect(derivedStatFromRows(rows, 20, "EDITION_2024", "attacksPerAction")).toBeUndefined();
  });

  it("a row naming a DIFFERENT derivedStat is excluded", () => {
    const rows = [row({ derivedStat: "somethingElse", derivedStatTiers: [{ minLevel: 1, value: 99 }] })];
    expect(derivedStatFromRows(rows, 20, "EDITION_2014", "attacksPerAction")).toBeUndefined();
  });

  it("takes the MAX across every qualifying row, not the first match — lets a base-class row and a subclass row compose", () => {
    const rows = [
      row({ name: "Extra Attack", derivedStat: "attacksPerAction", derivedStatTiers: [{ minLevel: 5, value: 2 }] }),
      row({ name: "Some Subclass Bonus Attack", derivedStat: "attacksPerAction", derivedStatTiers: [{ minLevel: 5, value: 4 }] }),
    ];
    expect(derivedStatFromRows(rows, 20, "EDITION_2014", "attacksPerAction")).toBe(4);
  });

  it("a row whose derivedStatTiers has a string value (e.g. a future crit-range column) is ignored, not coerced", () => {
    const rows = [row({ derivedStat: "attacksPerAction", derivedStatTiers: [{ minLevel: 1, value: "19-20" }] })];
    expect(derivedStatFromRows(rows, 20, "EDITION_2014", "attacksPerAction")).toBeUndefined();
  });

  it("an empty row list returns undefined (the caller supplies the floor, not this function)", () => {
    expect(derivedStatFromRows([], 20, "EDITION_2024", "attacksPerAction")).toBeUndefined();
  });
});

describe("evaluateResourceTotal (#1685) — the formula vocabulary poolFromRow reads, also #1686's future evaluator for buff modifiers", () => {
  const ctx = { level: 6, abilityScores: { wisdom: 16, charisma: 8 }, profBonus: 3 };

  it("a plain number passes through unchanged (pre-existing shape)", () => {
    expect(evaluateResourceTotal(4, ctx)).toBe(4);
  });

  it('"proficiencyBonus" reads ctx.profBonus', () => {
    expect(evaluateResourceTotal("proficiencyBonus", { ...ctx, profBonus: 5 })).toBe(5);
  });

  it("{ abilityMod } reads the named ability's modifier, unfloored when no min is given", () => {
    expect(evaluateResourceTotal({ abilityMod: "wisdom" }, ctx)).toBe(3); // Wis 16 -> +3
  });

  it("{ abilityMod, min } floors a low/negative modifier at min — the Math.max(1, mod) shape every migrated pool uses", () => {
    expect(evaluateResourceTotal({ abilityMod: "charisma", min: 1 }, ctx)).toBe(1); // Cha 8 -> -1, floored to 1
    expect(evaluateResourceTotal({ abilityMod: "wisdom", min: 1 }, ctx)).toBe(3); // above min, min is a no-op
  });

  it("{ levelTimes } multiplies ctx.level — the Lay on Hands (5 x level) shape", () => {
    expect(evaluateResourceTotal({ levelTimes: 5 }, { ...ctx, level: 7 })).toBe(35);
  });
});

describe("poolsFromRows resolves a tier's formula total end to end (#1685)", () => {
  it('a flat number tier is unaffected by the widening', () => {
    const rows = [row({ resourceKey: "flat", resourceTotals: [{ minLevel: 1, total: 4 }] })];
    expect(poolsFromRows(rows, 5, {}, 3, "EDITION_2014")[0].total).toBe(4);
  });

  it('"proficiencyBonus" scales when profBonus crosses a level boundary (L4 -> L5)', () => {
    const rows = [row({ resourceKey: "pb", resourceTotals: [{ minLevel: 1, total: "proficiencyBonus" }] })];
    expect(poolsFromRows(rows, 4, {}, proficiencyBonusForLevel(4), "EDITION_2014")[0].total).toBe(2);
    expect(poolsFromRows(rows, 5, {}, proficiencyBonusForLevel(5), "EDITION_2014")[0].total).toBe(3);
  });

  it("{ abilityMod, min } reads the row's own abilityScores/profBonus inputs, floored at min", () => {
    const rows = [row({ resourceKey: "cha", resourceTotals: [{ minLevel: 1, total: { abilityMod: "charisma", min: 1 } }] })];
    expect(poolsFromRows(rows, 1, { charisma: 8 }, 2, "EDITION_2014")[0].total).toBe(1);
    expect(poolsFromRows(rows, 1, { charisma: 20 }, 2, "EDITION_2014")[0].total).toBe(5);
  });

  it("{ levelTimes } scales with the character's level, not a fixed tier value", () => {
    const rows = [row({ resourceKey: "loh", resourceTotals: [{ minLevel: 1, total: { levelTimes: 5 } }] })];
    expect(poolsFromRows(rows, 3, {}, 2, "EDITION_2014")[0].total).toBe(15);
    expect(poolsFromRows(rows, 7, {}, 2, "EDITION_2014")[0].total).toBe(35);
  });
});

describe("poolsFromRows resolves resourceRechargeTiers (level-tiered recharge cadence)", () => {
  const rechargeTiers = [
    { minLevel: 1, recharge: "longRest" },
    { minLevel: 5, recharge: "short-or-long" },
  ];

  it("below the first tier's minLevel, falls back to the scalar resourceRecharge", () => {
    const rows = [
      row({
        resourceKey: "bardic",
        resourceTotals: [{ minLevel: 1, total: 2 }],
        resourceRecharge: "longRest",
        resourceRechargeTiers: [{ minLevel: 5, recharge: "short-or-long" }],
      }),
    ];
    expect(poolsFromRows(rows, 4, {}, 2, "EDITION_2014")[0].recharge).toBe("longRest");
  });

  it("at/above a tier's minLevel, the tier's recharge wins over the scalar — last-match-wins across two tiers", () => {
    const rows = [
      row({ resourceKey: "bardic", resourceTotals: [{ minLevel: 1, total: 2 }], resourceRecharge: "none", resourceRechargeTiers: rechargeTiers }),
    ];
    expect(poolsFromRows(rows, 1, {}, 2, "EDITION_2014")[0].recharge).toBe("longRest");
    expect(poolsFromRows(rows, 4, {}, 2, "EDITION_2014")[0].recharge).toBe("longRest");
    expect(poolsFromRows(rows, 5, {}, 2, "EDITION_2014")[0].recharge).toBe("short-or-long");
    expect(poolsFromRows(rows, 20, {}, 2, "EDITION_2014")[0].recharge).toBe("short-or-long");
  });

  it("with no resourceRechargeTiers, resolves from the scalar resourceRecharge unchanged", () => {
    const rows = [row({ resourceKey: "flat", resourceTotals: [{ minLevel: 1, total: 1 }], resourceRecharge: "shortRest" })];
    expect(poolsFromRows(rows, 1, {}, 2, "EDITION_2014")[0].recharge).toBe("shortRest");
  });

  it("with neither resourceRechargeTiers nor resourceRecharge, resolves to \"none\"", () => {
    const rows = [row({ resourceKey: "flat", resourceTotals: [{ minLevel: 1, total: 1 }] })];
    expect(poolsFromRows(rows, 1, {}, 2, "EDITION_2014")[0].recharge).toBe("none");
  });
});

describe("improvementsFromRows (#1691) — same edition/level truth table as featuresFromRows, flattened across rows", () => {
  it("a row tagged for the matching edition, at or below the character's level, contributes its improvements", () => {
    const rows = [row({ level: 3, improvements: [{ target: "armorProficiency", amount: 1, key: "heavy" }] })];
    expect(improvementsFromRows(rows, 2, "EDITION_2014")).toEqual([]);
    expect(improvementsFromRows(rows, 3, "EDITION_2014")).toEqual([{ target: "armorProficiency", amount: 1, key: "heavy" }]);
  });

  it("a row tagged for the OTHER edition is excluded — never falls back", () => {
    const rows = [row({ edition: "EDITION_2014", improvements: [{ target: "initiative", amount: 1 }] })];
    expect(improvementsFromRows(rows, 20, "EDITION_2024")).toEqual([]);
  });

  it("a row with no improvements contributes nothing, even when active", () => {
    const rows = [row({ edition: "EDITION_2014", level: 1 })];
    expect(improvementsFromRows(rows, 20, "EDITION_2014")).toEqual([]);
  });

  it("flattens improvements across every qualifying row (a numeric target + a keyed proficiency target both reach the caller)", () => {
    const rows = [
      row({ name: "A", level: 1, edition: "EDITION_2014", improvements: [{ target: "skillProficiency", amount: 1, key: "athletics" }] }),
      row({ name: "B", level: 3, edition: "EDITION_2014", improvements: [{ target: "armorClass", amount: 1 }] }),
    ];
    expect(improvementsFromRows(rows, 3, "EDITION_2014")).toEqual([
      { target: "skillProficiency", amount: 1, key: "athletics" },
      { target: "armorClass", amount: 1 },
    ]);
    // Below B's level, only A's grant is active.
    expect(improvementsFromRows(rows, 2, "EDITION_2014")).toEqual([
      { target: "skillProficiency", amount: 1, key: "athletics" },
    ]);
  });

  it("an empty row list produces an empty improvements list (the no-carrier default every narrow-select caller falls back to)", () => {
    expect(improvementsFromRows([], 20, "EDITION_2024")).toEqual([]);
  });
});

describe("conditionImmunitiesFromRows (#1121) — same edition/level truth table as featuresFromRows, plus the requireActiveBuff gate", () => {
  it("a row tagged for the matching edition, at or below level, with no requireActiveBuff, is unconditional (Beguiling Defenses/Nature's Ward's shape)", () => {
    const rows = [row({ name: "Nature's Ward", level: 10, conditionImmunities: ["poisoned"] })];
    expect(conditionImmunitiesFromRows(rows, 9, "EDITION_2014", new Set())).toEqual([]);
    expect(conditionImmunitiesFromRows(rows, 10, "EDITION_2014", new Set())).toEqual(["poisoned"]);
  });

  it("a row tagged for the OTHER edition is excluded — never falls back", () => {
    const rows = [row({ edition: "EDITION_2014", conditionImmunities: ["charmed"] })];
    expect(conditionImmunitiesFromRows(rows, 20, "EDITION_2024", new Set())).toEqual([]);
  });

  it("a row naming requireActiveBuff contributes ONLY while that buff key is active (Mindless Rage's shape)", () => {
    const rows = [
      row({
        name: "Mindless Rage",
        level: 6,
        conditionImmunities: ["charmed", "frightened"],
        conditionImmunitiesRequireActiveBuff: "rage",
      }),
    ];
    expect(conditionImmunitiesFromRows(rows, 6, "EDITION_2014", new Set())).toEqual([]);
    expect(conditionImmunitiesFromRows(rows, 6, "EDITION_2014", new Set(["rage"]))).toEqual(["charmed", "frightened"]);
    // A different active buff key doesn't satisfy the gate.
    expect(conditionImmunitiesFromRows(rows, 6, "EDITION_2014", new Set(["bardicInspiration"]))).toEqual([]);
  });

  it("below the row's own level, contributes nothing even while the gating buff is active (a raging Berserker under L6)", () => {
    const rows = [
      row({
        name: "Mindless Rage",
        level: 6,
        conditionImmunities: ["charmed", "frightened"],
        conditionImmunitiesRequireActiveBuff: "rage",
      }),
    ];
    expect(conditionImmunitiesFromRows(rows, 5, "EDITION_2014", new Set(["rage"]))).toEqual([]);
  });

  it("unions across multiple qualifying rows, deduped", () => {
    const rows = [
      row({ name: "A", level: 1, conditionImmunities: ["poisoned"] }),
      row({ name: "B", level: 1, conditionImmunities: ["poisoned", "charmed"] }),
    ];
    expect(conditionImmunitiesFromRows(rows, 1, "EDITION_2014", new Set())).toEqual(["poisoned", "charmed"]);
  });

  it("a row with no conditionImmunities contributes nothing, even when active", () => {
    const rows = [row({ level: 1 })];
    expect(conditionImmunitiesFromRows(rows, 20, "EDITION_2014", new Set())).toEqual([]);
  });

  it("an empty row list produces an empty immunity list", () => {
    expect(conditionImmunitiesFromRows([], 20, "EDITION_2024", new Set())).toEqual([]);
  });
});

describe("evaluateBuffModifier (#1686) — evaluateResourceTotal's formula vocabulary PLUS a tier array", () => {
  const ctx = { level: 6, abilityScores: { wisdom: 16, charisma: 8 }, profBonus: 3 };

  it("a plain number passes through unchanged, same as evaluateResourceTotal", () => {
    expect(evaluateBuffModifier(2, ctx)).toBe(2);
  });

  it('"proficiencyBonus" reads ctx.profBonus, same as evaluateResourceTotal', () => {
    expect(evaluateBuffModifier("proficiencyBonus", { ...ctx, profBonus: 5 })).toBe(5);
  });

  it("{ abilityMod, min } floors at min, same as evaluateResourceTotal", () => {
    expect(evaluateBuffModifier({ abilityMod: "charisma", min: 1 }, ctx)).toBe(1);
  });

  // Rage's own shape: +2 at L1, +3 at L9, +4 at L16 (rageMeleeDamageBonus).
  const RAGE_TIERS = [
    { minLevel: 1, value: 2 },
    { minLevel: 9, value: 3 },
    { minLevel: 16, value: 4 },
  ];

  it("a tier array resolves the LAST tier whose minLevel <= level — never a sum", () => {
    expect(evaluateBuffModifier(RAGE_TIERS, { ...ctx, level: 1 })).toBe(2);
    expect(evaluateBuffModifier(RAGE_TIERS, { ...ctx, level: 8 })).toBe(2);
    expect(evaluateBuffModifier(RAGE_TIERS, { ...ctx, level: 9 })).toBe(3);
    expect(evaluateBuffModifier(RAGE_TIERS, { ...ctx, level: 15 })).toBe(3);
  });

  it("a L16 character gets exactly the top tier (+4), not the sum of every tier crossed (2+3+4=9)", () => {
    expect(evaluateBuffModifier(RAGE_TIERS, { ...ctx, level: 16 })).toBe(4);
    expect(evaluateBuffModifier(RAGE_TIERS, { ...ctx, level: 20 })).toBe(4);
  });

  it("a tier array below its first minLevel resolves to 0 (no tier reached)", () => {
    expect(evaluateBuffModifier([{ minLevel: 5, value: 3 }], { ...ctx, level: 1 })).toBe(0);
  });
});

describe("lib/classes/ stays a pure leaf (#1524)", () => {
  it("class-feature-rows.ts imports no Prisma module", () => {
    const path = fileURLToPath(new URL("../class-feature-rows.ts", import.meta.url));
    const source = readFileSync(path, "utf8");
    expect(source).not.toMatch(/from ["'].*prisma/i);
    expect(source).not.toMatch(/require\(["'].*prisma/i);
  });
});

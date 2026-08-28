import { describe, expect, it } from "vitest";

import { poolsFromRows, type ClassFeatureRow, type InitiativeRegenRow } from "@/lib/classes/class-feature-rows.js";
import { deriveMartialArtsDie } from "@/lib/srd/weapon-damage.js";
import { monk } from "@/lib/classes/monk.js";

const ABILITY_SCORES = { strength: 10, dexterity: 16, constitution: 14, intelligence: 10, wisdom: 14, charisma: 10 };

function row(overrides: Partial<ClassFeatureRow> = {}): ClassFeatureRow {
  return { name: "Test Feature", level: 1, description: "test description", edition: "EDITION_2014", ...overrides };
}

// Hand-authored rows; monk.resourceFn is imported only as the expectation
// they must resolve to, never as the fixture's source.
const FOCUS_ON_INITIATIVE: InitiativeRegenRow[] = [
  {
    id: "uncannyMetabolism",
    amount: "all",
    oncePerLongRest: true,
    bonusHeal: { sourceName: "Uncanny Metabolism", dieFaces: "martialArtsDie", flatBonus: { levelTimes: 1 } },
  },
  { id: "perfectFocus", minLevel: 15, amount: 4 },
];

const PERFECT_SELF_ON_INITIATIVE: InitiativeRegenRow[] = [{ id: "perfectSelf", minLevel: 20, amount: 4, threshold: 0 }];

function focusRow(): ClassFeatureRow {
  return row({
    edition: "EDITION_2024",
    resourceKey: "focus",
    resourceTotals: [{ minLevel: 2, total: { levelTimes: 1 } }],
    resourceOnInitiative: FOCUS_ON_INITIATIVE,
  });
}

function kiRow(): ClassFeatureRow {
  return row({
    edition: "EDITION_2014",
    resourceKey: "ki",
    resourceTotals: [{ minLevel: 2, total: { levelTimes: 1 } }],
    resourceOnInitiative: PERFECT_SELF_ON_INITIATIVE,
  });
}

describe("poolsFromRows resolves resourceOnInitiative (#1522) — the row-driven InitiativeRegen vocabulary", () => {
  describe("reproduces monk.ts's real descriptors byte-for-byte", () => {
    it("2024 Focus at L15+: uncannyMetabolism + perfectFocus both present, in authored order", () => {
      for (const level of [15, 16, 20]) {
        const rows = [focusRow()];
        const resolved = poolsFromRows(rows, level, ABILITY_SCORES, 3, "EDITION_2024")[0];
        const expected = monk.resourceFn!(level, ABILITY_SCORES, 3, undefined, "EDITION_2024")[0];
        expect(resolved.onInitiative).toEqual(expected.onInitiative);
      }
    });

    it("2024 Focus below L15: only uncannyMetabolism, dieFaces from deriveMartialArtsDie across a band boundary (L4 -> L5)", () => {
      for (const level of [2, 4, 5, 10, 14]) {
        const rows = [focusRow()];
        const resolved = poolsFromRows(rows, level, ABILITY_SCORES, 2, "EDITION_2024")[0];
        const expected = monk.resourceFn!(level, ABILITY_SCORES, 2, undefined, "EDITION_2024")[0];
        expect(resolved.onInitiative).toEqual(expected.onInitiative);
        expect(resolved.onInitiative).toEqual([
          {
            id: "uncannyMetabolism",
            amount: "all",
            oncePerLongRest: true,
            bonusHeal: { sourceName: "Uncanny Metabolism", dieFaces: deriveMartialArtsDie(level, "EDITION_2024"), flatBonus: level },
          },
        ]);
      }
    });

    it("2014 Ki at L20: Perfect Self ({amount:4, threshold:0}), and no onInitiative key at all below L20", () => {
      const rowsAt20 = [kiRow()];
      const resolvedAt20 = poolsFromRows(rowsAt20, 20, ABILITY_SCORES, 6, "EDITION_2014")[0];
      const expectedAt20 = monk.resourceFn!(20, ABILITY_SCORES, 6, undefined, "EDITION_2014")[0];
      expect(resolvedAt20.onInitiative).toEqual(expectedAt20.onInitiative);
      expect(resolvedAt20.onInitiative).toEqual([{ id: "perfectSelf", amount: 4, threshold: 0 }]);

      const rowsAt19 = [kiRow()];
      const resolvedAt19 = poolsFromRows(rowsAt19, 19, ABILITY_SCORES, 6, "EDITION_2014")[0];
      expect(resolvedAt19).not.toHaveProperty("onInitiative");
    });
  });

  it("additive gating: an ungated entry and a minLevel-gated entry both survive at a high level, in authored order — NOT tier last-match-wins", () => {
    const rows = [
      row({
        resourceKey: "pool",
        resourceTotals: [{ minLevel: 1, total: 5 }],
        resourceOnInitiative: [
          { id: "always", amount: "all" },
          { id: "gated", minLevel: 10, amount: 2 },
        ],
      }),
    ];
    const below = poolsFromRows(rows, 9, {}, 2, "EDITION_2014")[0];
    expect(below.onInitiative).toEqual([{ id: "always", amount: "all" }]);

    const above = poolsFromRows(rows, 10, {}, 2, "EDITION_2014")[0];
    expect(above.onInitiative).toEqual([{ id: "always", amount: "all" }, { id: "gated", amount: 2 }]);
  });

  it("omits oncePerLongRest/threshold/bonusHeal keys entirely when the row omits them", () => {
    const rows = [
      row({
        resourceKey: "pool",
        resourceTotals: [{ minLevel: 1, total: 5 }],
        resourceOnInitiative: [{ id: "bare", amount: 3 }],
      }),
    ];
    const pool = poolsFromRows(rows, 1, {}, 2, "EDITION_2014")[0];
    expect(pool.onInitiative).toEqual([{ id: "bare", amount: 3 }]);
    const [entry] = pool.onInitiative as { id: string; amount: number }[];
    expect(entry).not.toHaveProperty("oncePerLongRest");
    expect(entry).not.toHaveProperty("threshold");
    expect(entry).not.toHaveProperty("bonusHeal");
  });

  it("bonusHeal with a numeric dieFaces passes it through unchanged, and an absent flatBonus resolves to 0", () => {
    const rows = [
      row({
        resourceKey: "pool",
        resourceTotals: [{ minLevel: 1, total: 5 }],
        resourceOnInitiative: [{ id: "heal", amount: "all", bonusHeal: { sourceName: "Test Heal", dieFaces: 8 } }],
      }),
    ];
    const pool = poolsFromRows(rows, 1, {}, 2, "EDITION_2014")[0];
    expect(pool.onInitiative).toEqual([{ id: "heal", amount: "all", bonusHeal: { sourceName: "Test Heal", dieFaces: 8, flatBonus: 0 } }]);
  });

  it("martialArtsDie forks by edition at the same level", () => {
    const onInitiative: InitiativeRegenRow[] = [
      { id: "heal", amount: "all", bonusHeal: { sourceName: "Test Heal", dieFaces: "martialArtsDie" } },
    ];
    const rowFor = (edition: ClassFeatureRow["edition"]) =>
      row({ edition, resourceKey: "pool", resourceTotals: [{ minLevel: 1, total: 5 }], resourceOnInitiative: onInitiative });
    const pool2014 = poolsFromRows([rowFor("EDITION_2014")], 5, {}, 2, "EDITION_2014")[0];
    const pool2024 = poolsFromRows([rowFor("EDITION_2024")], 5, {}, 2, "EDITION_2024")[0];
    expect((pool2014.onInitiative as { bonusHeal: { dieFaces: number } }[])[0].bonusHeal.dieFaces).toBe(deriveMartialArtsDie(5, "EDITION_2014"));
    expect((pool2024.onInitiative as { bonusHeal: { dieFaces: number } }[])[0].bonusHeal.dieFaces).toBe(deriveMartialArtsDie(5, "EDITION_2024"));
    expect(deriveMartialArtsDie(5, "EDITION_2014")).not.toBe(deriveMartialArtsDie(5, "EDITION_2024"));
  });

  it("an override row's resourceOnInitiative replaces the base row's wholesale, never merges (#906's whole-block-swap rule)", () => {
    const baseRows = [
      row({
        resourceKey: "wildShape",
        resourceTotals: [{ minLevel: 1, total: 2 }],
        resourceOnInitiative: [{ id: "base", amount: "all" }],
      }),
    ];
    const overrideRows = [
      row({
        resourceKey: "wildShape",
        resourceTotals: [{ minLevel: 1, total: 5 }],
        resourceOnInitiative: [{ id: "override", amount: 3 }],
      }),
    ];
    const pool = poolsFromRows(baseRows, 1, {}, 0, "EDITION_2014", overrideRows)[0];
    expect(pool.onInitiative).toEqual([{ id: "override", amount: 3 }]);
  });

  it("an override row that OMITS resourceOnInitiative erases the base row's descriptors entirely, leaving no onInitiative key", () => {
    const baseRows = [
      row({
        resourceKey: "wildShape",
        resourceTotals: [{ minLevel: 1, total: 2 }],
        resourceOnInitiative: [{ id: "base", amount: "all" }],
      }),
    ];
    const overrideRows = [row({ resourceKey: "wildShape", resourceTotals: [{ minLevel: 1, total: 5 }] })];
    const pool = poolsFromRows(baseRows, 1, {}, 0, "EDITION_2014", overrideRows)[0];
    expect(pool).not.toHaveProperty("onInitiative");
  });

  it("a pool row without resourceOnInitiative mints a pool with no onInitiative key at all (regression pin)", () => {
    const rows = [row({ resourceKey: "pool", resourceTotals: [{ minLevel: 1, total: 5 }] })];
    const pool = poolsFromRows(rows, 1, {}, 2, "EDITION_2014")[0];
    expect(pool).not.toHaveProperty("onInitiative");
  });

  it("an empty resourceOnInitiative array also mints a pool with no onInitiative key", () => {
    const rows = [row({ resourceKey: "pool", resourceTotals: [{ minLevel: 1, total: 5 }], resourceOnInitiative: [] })];
    const pool = poolsFromRows(rows, 1, {}, 2, "EDITION_2014")[0];
    expect(pool).not.toHaveProperty("onInitiative");
  });
});

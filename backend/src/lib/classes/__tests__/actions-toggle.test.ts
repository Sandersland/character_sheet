// Pure (no DB) tests for the #1686 generic "toggle" resolver: a ClassFeature
// row with resolverKind "toggle" synthesizes an activate/end AvailableAction
// pair (deriveEntryScopedActions -> actionsFromRows -> toggleActionsFromRow,
// unexported — reached the same way entry-scoped-actions.test.ts reaches
// Fighter's row-driven Second Wind/Action Surge), and toggleRowOps builds the
// applyBuff/clearBuff/spendResource op list the routes-layer dispatcher runs.
import { describe, expect, it } from "vitest";

import { deriveEntryScopedActions, endActionKey, toggleRowOps } from "@/lib/classes/actions.js";
import type { ClassFeatureRow } from "@/lib/classes/class-feature-rows.js";

const TOGGLE_ROW: ClassFeatureRow = {
  name: "Test Toggle",
  level: 1,
  description: "test",
  edition: "EDITION_2024",
  resolverKind: "toggle",
  activationCost: "bonusAction",
  resourceKey: "testToggle",
  costKind: "pool",
  costPoolKey: "testToggle",
  costBase: 1,
  effectBuffs: [
    { key: "testBuff", target: "meleeDamage", modifier: 2, duration: "while-active" },
  ],
};

const getFeatureRows = () => ({ classRows: [TOGGLE_ROW], subclassRows: [] });

describe("endActionKey (#1686)", () => {
  it("capitalizes the activate key and prefixes 'end' — 'rage' -> 'endRage' (byte-stable for turnHooks.ts)", () => {
    expect(endActionKey("rage")).toBe("endRage");
  });

  it("works for a longer camelCase key too", () => {
    expect(endActionKey("elementalAttunement")).toBe("endElementalAttunement");
  });
});

describe("toggleActionsFromRow (via deriveEntryScopedActions) — synthesizes an activate/end pair from ONE row", () => {
  const entries = [{ name: "test", subclass: undefined, level: 1 }];

  it("produces exactly two actions: the row's own key, and its 'end' twin", () => {
    const actions = deriveEntryScopedActions(entries, 1, [{ key: "testToggle", remaining: 1 }], true, "EDITION_2024", getFeatureRows);
    const keys = actions.map((a) => a.key);
    expect(keys).toContain("testToggle");
    expect(keys).toContain("endTestToggle");
  });

  it("both carry resolverKind 'toggle' and the row's own name/cost", () => {
    const actions = deriveEntryScopedActions(entries, 1, [{ key: "testToggle", remaining: 1 }], true, "EDITION_2024", getFeatureRows);
    const activate = actions.find((a) => a.key === "testToggle")!;
    const end = actions.find((a) => a.key === "endTestToggle")!;
    expect(activate.resolverKind).toBe("toggle");
    expect(activate.name).toBe("Test Toggle");
    expect(activate.cost).toBe("bonusAction");
    expect(end.resolverKind).toBe("toggle");
    expect(end.name).toBe("End Test Toggle");
    expect(end.cost).toBe("bonusAction");
  });

  it("the end action is always enabled — no server-tracked 'is this active' gate, mirrors the retired endRage row", () => {
    const actions = deriveEntryScopedActions(entries, 1, [{ key: "testToggle", remaining: 0 }], true, "EDITION_2024", getFeatureRows);
    expect(actions.find((a) => a.key === "endTestToggle")!.enabled).toBe(true);
  });

  it("the activate action is disabled when its cost pool is exhausted — checked against costPoolKey, not a separate resourceKey pool", () => {
    const actions = deriveEntryScopedActions(entries, 1, [{ key: "testToggle", remaining: 0 }], true, "EDITION_2024", getFeatureRows);
    const activate = actions.find((a) => a.key === "testToggle")!;
    expect(activate.enabled).toBe(false);
    expect(activate.disabledReason).toBe("No testToggle remaining");
  });

  it("a row below its grant level, or off-edition, contributes neither half", () => {
    const belowLevel = deriveEntryScopedActions(
      [{ name: "test", subclass: undefined, level: 1 }],
      1,
      [],
      true,
      "EDITION_2024",
      () => ({ classRows: [{ ...TOGGLE_ROW, level: 5 }], subclassRows: [] }),
    );
    expect(belowLevel.some((a) => a.key === "testToggle" || a.key === "endTestToggle")).toBe(false);

    const offEdition = deriveEntryScopedActions(entries, 1, [], true, "EDITION_2014", getFeatureRows);
    expect(offEdition.some((a) => a.key === "testToggle" || a.key === "endTestToggle")).toBe(false);
  });
});

describe("toggleRowOps (#1686) — the generic activate/end effect handler", () => {
  const ctx = { level: 1, abilityScores: {}, profBonus: 2 };

  it("activate produces an applyBuff op with the evaluated modifier, then a spendResource op — buff first, matching every hand-authored ACTION_EFFECT_FN pair's order", () => {
    const ops = toggleRowOps(TOGGLE_ROW, ctx, false);
    expect(ops).toEqual([
      {
        type: "applyBuff",
        buff: { key: "testBuff", target: "meleeDamage", modifier: 2, source: "Test Toggle", duration: "while-active" },
      },
      { type: "spendResource", key: "testToggle" },
    ]);
  });

  it("end produces a clearBuff op per effectBuffs entry, with no spendResource — early end never refunds", () => {
    const ops = toggleRowOps(TOGGLE_ROW, ctx, true);
    expect(ops).toEqual([{ type: "clearBuff", key: "testBuff", reason: "Test Toggle ended" }]);
  });

  it("omits the spendResource op when the row's cost is 'none' (a free toggle)", () => {
    const freeRow: ClassFeatureRow = { ...TOGGLE_ROW, costKind: undefined, costPoolKey: undefined, costBase: undefined };
    const ops = toggleRowOps(freeRow, ctx, false);
    expect(ops.some((o) => o.type === "spendResource")).toBe(false);
  });

  it("throws on activation when a pool-cost row has no active buffs — never silently drains the pool (#1686 review)", () => {
    // A misauthored/misgated toggle (null effectBuffs, or all entries gated
    // above ctx.level) would otherwise push spendResource with no applyBuff.
    const emptyRow: ClassFeatureRow = { ...TOGGLE_ROW, effectBuffs: [] };
    expect(() => toggleRowOps(emptyRow, ctx, false)).toThrow(/no active effectBuffs at level/);
    // End is still safe — clearing an empty buff list is a no-op, not a spend.
    expect(toggleRowOps(emptyRow, ctx, true)).toEqual([]);
  });

  it("carries resistDamageTypes/rollEffects through to the applyBuff op (Rage needs both)", () => {
    const row: ClassFeatureRow = {
      ...TOGGLE_ROW,
      effectBuffs: [
        {
          key: "rage",
          target: "meleeDamage",
          modifier: 2,
          duration: "while-active",
          resistDamageTypes: ["bludgeoning", "piercing", "slashing"],
          rollEffects: [{ mode: "advantage", kind: "check", ability: "strength" }],
        },
      ],
    };
    const ops = toggleRowOps(row, ctx, false);
    const buffOp = ops.find((o) => o.type === "applyBuff") as { buff: { resistDamageTypes?: string[]; rollEffects?: unknown[] } };
    expect(buffOp.buff.resistDamageTypes).toEqual(["bludgeoning", "piercing", "slashing"]);
    expect(buffOp.buff.rollEffects).toEqual([{ mode: "advantage", kind: "check", ability: "strength" }]);
  });

  it("evaluates a tiered modifier off ctx.level — a L16 context gets exactly the top tier, never a sum", () => {
    const row: ClassFeatureRow = {
      ...TOGGLE_ROW,
      effectBuffs: [
        {
          key: "rage",
          target: "meleeDamage",
          modifier: [
            { minLevel: 1, value: 2 },
            { minLevel: 9, value: 3 },
            { minLevel: 16, value: 4 },
          ],
          duration: "while-active",
        },
      ],
    };
    const l16Ops = toggleRowOps(row, { ...ctx, level: 16 }, false);
    const buffOp = l16Ops.find((o) => o.type === "applyBuff") as { buff: { modifier: number } };
    expect(buffOp.buff.modifier).toBe(4);
  });

  it("drops a minLevel-gated buff entry below its own gate, includes it once reached (Song of Victory's shape — a whole entry, not a tier)", () => {
    const row: ClassFeatureRow = {
      ...TOGGLE_ROW,
      effectBuffs: [
        { key: "always", target: "meleeDamage", modifier: 1, duration: "while-active" },
        { key: "lateJoiner", target: "attackRoll", modifier: 1, duration: "while-active", minLevel: 14 },
      ],
    };
    const below = toggleRowOps(row, { ...ctx, level: 10 }, false);
    expect(below.filter((o) => o.type === "applyBuff")).toHaveLength(1);

    const above = toggleRowOps(row, { ...ctx, level: 14 }, false);
    expect(above.filter((o) => o.type === "applyBuff")).toHaveLength(2);
  });

  it("admits a marker buff (target === key, modifier 0) — Elemental Attunement's shape", () => {
    const row: ClassFeatureRow = {
      ...TOGGLE_ROW,
      resourceKey: "elementalAttunement",
      effectBuffs: [{ key: "elementalAttunement", target: "elementalAttunement", modifier: 0, duration: "while-active" }],
    };
    const ops = toggleRowOps(row, ctx, false);
    const buffOp = ops.find((o) => o.type === "applyBuff") as { buff: { key: string; target: string; modifier: number } };
    expect(buffOp.buff).toMatchObject({ key: "elementalAttunement", target: "elementalAttunement", modifier: 0 });
  });
});

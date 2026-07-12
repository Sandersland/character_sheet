/**
 * Unit tests for lib/actions.ts:
 *   - deriveActions: class/subclass/level gates, resource gating, case-insensitivity
 *   - ACTION_EFFECT_FN: per-key op arrays for every handler in the dispatch table
 *
 * Pure logic — no DB or HTTP layer. Mirrors lib/__tests__/experience.test.ts style.
 */

import { describe, expect, it } from "vitest";

import {
  deriveActions,
  ACTION_EFFECT_FN,
  ACTION_CAST_FN,
  rageMeleeDamageBonus,
  type AvailableAction,
} from "@/lib/classes/actions.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Build a resource pool entry. */
function pool(key: string, remaining: number) {
  return { key, remaining };
}

/** Pluck only the keys from an AvailableAction array. */
function keys(actions: AvailableAction[]) {
  return actions.map((a) => a.key);
}

// ── deriveActions ─────────────────────────────────────────────────────────────

describe("deriveActions — class gates", () => {
  it("Fighter L1 gets secondWind, L2 adds actionSurge", () => {
    const l1 = keys(deriveActions("fighter", undefined, 1, []));
    expect(l1).toContain("secondWind");
    expect(l1).not.toContain("actionSurge");

    const l2 = keys(deriveActions("fighter", undefined, 2, []));
    expect(l2).toContain("secondWind");
    expect(l2).toContain("actionSurge");
  });

  it("Barbarian L1 gets rage, L2 adds recklessAttack", () => {
    const l1 = keys(deriveActions("barbarian", undefined, 1, []));
    expect(l1).toContain("rage");
    expect(l1).not.toContain("recklessAttack");

    const l2 = keys(deriveActions("barbarian", undefined, 2, []));
    expect(l2).toContain("recklessAttack");
  });

  it("Monk L2 gets flurryOfBlows/patientDefense/stepOfTheWind; L5 adds stunningStrike", () => {
    const l2 = keys(deriveActions("monk", undefined, 2, []));
    expect(l2).toContain("flurryOfBlows");
    expect(l2).toContain("patientDefense");
    expect(l2).toContain("stepOfTheWind");
    expect(l2).not.toContain("stunningStrike");

    const l5 = keys(deriveActions("monk", undefined, 5, []));
    expect(l5).toContain("stunningStrike");
  });

  it("Paladin L1 gets divineSense/layOnHands; L3 adds channelDivinityPaladin", () => {
    const l1 = keys(deriveActions("paladin", undefined, 1, []));
    expect(l1).toContain("divineSense");
    expect(l1).toContain("layOnHands");
    expect(l1).not.toContain("channelDivinityPaladin");

    const l3 = keys(deriveActions("paladin", undefined, 3, []));
    expect(l3).toContain("channelDivinityPaladin");
  });

  it("Bard L1 gets bardicInspiration; Cleric L2 gets channelDivinityCleric", () => {
    expect(keys(deriveActions("bard", undefined, 1, []))).toContain("bardicInspiration");
    expect(keys(deriveActions("cleric", undefined, 2, []))).toContain("channelDivinityCleric");
  });

  it("Druid L2 gets wildShape; Rogue L2 gets cunningAction; Sorcerer L3 gets metamagic", () => {
    expect(keys(deriveActions("druid", undefined, 2, []))).toContain("wildShape");
    expect(keys(deriveActions("rogue", undefined, 2, []))).toContain("cunningAction");
    expect(keys(deriveActions("sorcerer", undefined, 3, []))).toContain("metamagic");
  });

  it("class gate: fighter result contains no barbarian-only actions", () => {
    const result = keys(deriveActions("fighter", undefined, 20, []));
    expect(result).not.toContain("rage");
    expect(result).not.toContain("recklessAttack");
    expect(result).not.toContain("flurryOfBlows");
  });
});

describe("deriveActions — universal actions excluded", () => {
  it("does not include generic actions like attack/dodge/dash", () => {
    // Universal actions (attack, castSpell, dodge, etc.) are handled client-side
    // by turnRules.ts UNIVERSAL_ACTIONS and must NOT appear in availableActions.
    const result = keys(deriveActions("fighter", undefined, 5, []));
    const universalKeys = ["attack", "castSpell", "dodge", "dash", "disengage", "help", "hide", "search", "ready"];
    for (const key of universalKeys) {
      expect(result).not.toContain(key);
    }
  });
});

describe("deriveActions — case-insensitivity", () => {
  it("matches class name regardless of case", () => {
    expect(keys(deriveActions("Fighter", undefined, 2, []))).toContain("secondWind");
    expect(keys(deriveActions("FIGHTER", undefined, 2, []))).toContain("actionSurge");
    expect(keys(deriveActions("Barbarian", undefined, 1, []))).toContain("rage");
  });
});

describe("deriveActions — resource gating", () => {
  it("rage is enabled when remaining > 0", () => {
    const actions = deriveActions("barbarian", undefined, 1, [pool("rage", 2)]);
    const rage = actions.find((a) => a.key === "rage");
    expect(rage?.enabled).toBe(true);
    expect(rage?.disabledReason).toBeUndefined();
  });

  it("rage is disabled with 'No rage remaining' when remaining is 0", () => {
    const actions = deriveActions("barbarian", undefined, 1, [pool("rage", 0)]);
    const rage = actions.find((a) => a.key === "rage");
    expect(rage?.enabled).toBe(false);
    expect(rage?.disabledReason).toBe("No rage remaining");
  });

  it("flurryOfBlows needs ki×2: disabled with 'Need 2 ki, have 1' when ki=1", () => {
    const actions = deriveActions("monk", undefined, 2, [pool("ki", 1)]);
    const flurry = actions.find((a) => a.key === "flurryOfBlows");
    expect(flurry?.enabled).toBe(false);
    expect(flurry?.disabledReason).toBe("Need 2 ki, have 1");
  });

  it("flurryOfBlows is enabled when ki >= 2", () => {
    const actions = deriveActions("monk", undefined, 2, [pool("ki", 3)]);
    const flurry = actions.find((a) => a.key === "flurryOfBlows");
    expect(flurry?.enabled).toBe(true);
  });

  it("actions without a resourceKey are always enabled", () => {
    // recklessAttack has no resourceKey — should always be enabled.
    const actions = deriveActions("barbarian", undefined, 2, []);
    const reckless = actions.find((a) => a.key === "recklessAttack");
    expect(reckless?.enabled).toBe(true);
  });

  it("empty pools default to 0 remaining (action disabled)", () => {
    // No pool entry for "secondWind" → defaults to remaining=0 → disabled.
    const actions = deriveActions("fighter", undefined, 1, []);
    const secondWind = actions.find((a) => a.key === "secondWind");
    expect(secondWind?.enabled).toBe(false);
    expect(secondWind?.disabledReason).toBe("No secondWind remaining");
  });
});

// ── ACTION_EFFECT_FN ──────────────────────────────────────────────────────────

describe("ACTION_EFFECT_FN — no-op keys return []", () => {
  const noOpKeys = [
    "attack", "castSpell", "dodge", "dash", "disengage", "help",
    "hide", "search", "ready", "grapple", "opportunityAttack",
    "castSpellReaction", "recklessAttack", "cunningAction",
  ];

  for (const key of noOpKeys) {
    it(`${key} returns []`, () => {
      expect(ACTION_EFFECT_FN[key]({})).toEqual([]);
    });
  }
});

describe("ACTION_EFFECT_FN — single spendResource keys", () => {
  const singleResource: Array<[string, string]> = [
    ["bardicInspiration", "bardicInspiration"],
    ["channelDivinityCleric", "channelDivinity"],
    ["channelDivinityPaladin", "channelDivinity"],
    ["wildShape", "wildShape"],
    ["actionSurge", "actionSurge"],
    ["divineSense", "divineSense"],
  ];

  for (const [key, resourceKey] of singleResource) {
    it(`${key} → [spendResource key="${resourceKey}"]`, () => {
      const ops = ACTION_EFFECT_FN[key]({});
      expect(ops).toEqual([{ type: "spendResource", key: resourceKey }]);
    });
  }
});

describe("ACTION_EFFECT_FN — Rage durable buff (#457)", () => {
  it("rage applies a while-active meleeDamage buff (level bonus) and spends a rage", () => {
    expect(ACTION_EFFECT_FN.rage({ rageDamageBonus: 3 })).toEqual([
      {
        type: "applyBuff",
        buff: { key: "rage", target: "meleeDamage", modifier: 3, source: "Rage", duration: "while-active", resistDamageTypes: ["bludgeoning", "piercing", "slashing"] },
      },
      { type: "spendResource", key: "rage" },
    ]);
  });

  it("rage defaults the buff modifier to +2 when no bonus is supplied", () => {
    const ops = ACTION_EFFECT_FN.rage({}) as Array<{ type: string; buff?: { modifier: number } }>;
    expect(ops[0].buff?.modifier).toBe(2);
  });

  it("endRage clears the rage buff by key (manual + auto both route here)", () => {
    expect(ACTION_EFFECT_FN.endRage({})).toEqual([
      { type: "clearBuff", key: "rage", reason: "Rage ended" },
    ]);
  });

  it("rageMeleeDamageBonus scales +2 / +3 / +4 by barbarian level", () => {
    expect(rageMeleeDamageBonus(1)).toBe(2);
    expect(rageMeleeDamageBonus(8)).toBe(2);
    expect(rageMeleeDamageBonus(9)).toBe(3);
    expect(rageMeleeDamageBonus(15)).toBe(3);
    expect(rageMeleeDamageBonus(16)).toBe(4);
    expect(rageMeleeDamageBonus(20)).toBe(4);
  });

  it("endRage is a barbarian bonus action from L1", () => {
    expect(keys(deriveActions("barbarian", undefined, 1, []))).toContain("endRage");
    expect(keys(deriveActions("fighter", undefined, 20, []))).not.toContain("endRage");
  });
});

describe("ACTION_EFFECT_FN — monk ki actions", () => {
  it("flurryOfBlows → spendResource ki amount:2", () => {
    expect(ACTION_EFFECT_FN.flurryOfBlows({})).toEqual([
      { type: "spendResource", key: "ki", amount: 2 },
    ]);
  });

  it("patientDefense → spendResource ki (no amount)", () => {
    expect(ACTION_EFFECT_FN.patientDefense({})).toEqual([
      { type: "spendResource", key: "ki" },
    ]);
  });

  it("stepOfTheWind → spendResource ki", () => {
    expect(ACTION_EFFECT_FN.stepOfTheWind({})).toEqual([
      { type: "spendResource", key: "ki" },
    ]);
  });

  it("stunningStrike → spendResource ki", () => {
    expect(ACTION_EFFECT_FN.stunningStrike({})).toEqual([
      { type: "spendResource", key: "ki" },
    ]);
  });
});

describe("Monk Stunning Strike — combat feature wiring (#392)", () => {
  it("is granted at monk L5 via deriveActions", () => {
    expect(keys(deriveActions("monk", undefined, 5, []))).toContain("stunningStrike");
  });

  it("is absent at monk L4 (level 5 gate)", () => {
    expect(keys(deriveActions("monk", undefined, 4, []))).not.toContain("stunningStrike");
  });

  it("spends 1 ki when invoked", () => {
    const ops = ACTION_EFFECT_FN.stunningStrike({});
    expect(ops).toHaveLength(1);
    const [op] = ops as Array<{ type: string; key: string; amount?: number }>;
    expect(op.type).toBe("spendResource");
    expect(op.key).toBe("ki");
    // amount omitted defaults to 1 in the spendResource handler.
    expect(op.amount ?? 1).toBe(1);
  });
});

describe("Way of Shadow — Shadow Step / Opportunist (#440)", () => {
  const SHADOW = "Way of Shadow";

  it("Shadow monk gets shadowStep as a bonus action at L6, not at L5", () => {
    expect(keys(deriveActions("monk", SHADOW, 5, []))).not.toContain("shadowStep");
    const l6 = deriveActions("monk", SHADOW, 6, []);
    const shadowStep = l6.find((a) => a.key === "shadowStep");
    expect(shadowStep).toBeDefined();
    expect(shadowStep?.cost).toBe("bonusAction");
  });

  it("Shadow monk gets opportunist as a reaction at L17, not at L16", () => {
    expect(keys(deriveActions("monk", SHADOW, 16, []))).not.toContain("opportunist");
    const l17 = deriveActions("monk", SHADOW, 17, []);
    const opportunist = l17.find((a) => a.key === "opportunist");
    expect(opportunist).toBeDefined();
    expect(opportunist?.cost).toBe("reaction");
  });

  it("both are always enabled (no resourceKey gate)", () => {
    const l17 = deriveActions("monk", SHADOW, 17, []);
    const shadowStep = l17.find((a) => a.key === "shadowStep");
    const opportunist = l17.find((a) => a.key === "opportunist");
    expect(shadowStep?.enabled).toBe(true);
    expect(shadowStep?.disabledReason).toBeUndefined();
    expect(opportunist?.enabled).toBe(true);
    expect(opportunist?.disabledReason).toBeUndefined();
  });

  it("subclass gate: a non-Shadow monk gets neither at L17", () => {
    const openHand = keys(deriveActions("monk", "Way of the Open Hand", 17, []));
    expect(openHand).not.toContain("shadowStep");
    expect(openHand).not.toContain("opportunist");
    const noSub = keys(deriveActions("monk", undefined, 17, []));
    expect(noSub).not.toContain("shadowStep");
    expect(noSub).not.toContain("opportunist");
  });

  it("class gate: a non-monk gets neither even with a Shadow-like subclass", () => {
    const rogue = keys(deriveActions("rogue", SHADOW, 20, []));
    expect(rogue).not.toContain("shadowStep");
    expect(rogue).not.toContain("opportunist");
  });

  it("matches the subclass substring case-insensitively", () => {
    expect(keys(deriveActions("Monk", "way of shadow", 6, []))).toContain("shadowStep");
  });

  it("are pure reminder actions — no server effect fn (no ACTION_EFFECT_FN/ACTION_CAST_FN)", () => {
    expect(ACTION_EFFECT_FN.shadowStep).toBeUndefined();
    expect(ACTION_CAST_FN.shadowStep).toBeUndefined();
    expect(ACTION_EFFECT_FN.opportunist).toBeUndefined();
    expect(ACTION_CAST_FN.opportunist).toBeUndefined();
  });
});

describe("ACTION_CAST_FN — secondWind (#420)", () => {
  it("is a cast-core action, not an op-list action", () => {
    // The migration moved Second Wind off ACTION_EFFECT_FN onto the cast core.
    expect(ACTION_CAST_FN.secondWind).toBeDefined();
    expect(ACTION_EFFECT_FN.secondWind).toBeUndefined();
  });

  it("spends the secondWind pool (base 1) and self-heals 1d10 with the client roll", () => {
    const spec = ACTION_CAST_FN.secondWind({ roll: 7 });
    expect(spec.name).toBe("Second Wind");
    expect(spec.cost).toEqual({ kind: "pool", key: "secondWind", base: 1 });
    expect(spec.effect.effectType).toBe("heal");
    expect(spec.effect.dice).toEqual({ count: 1, faces: 10 });
    expect(spec.apply).toEqual({ target: "self", kind: "heal", amount: 7 });
  });

  it("without a roll: spends the pool but applies no heal", () => {
    const spec = ACTION_CAST_FN.secondWind({});
    expect(spec.cost).toEqual({ kind: "pool", key: "secondWind", base: 1 });
    expect(spec.apply).toBeUndefined();
  });

  it("with roll=0: applies no heal (self-apply is guarded on amount > 0)", () => {
    const spec = ACTION_CAST_FN.secondWind({ roll: 0 });
    expect(spec.apply).toBeUndefined();
  });
});

describe("ACTION_EFFECT_FN — actionSurge stays a counter (#420)", () => {
  it("spends the actionSurge resource with no heal/extra-action server effect", () => {
    // The extra-action grant is client-side (grantExtraAction) — nothing to apply.
    expect(ACTION_EFFECT_FN.actionSurge({})).toEqual([
      { type: "spendResource", key: "actionSurge" },
    ]);
    expect(ACTION_CAST_FN.actionSurge).toBeUndefined();
  });
});

describe("ACTION_EFFECT_FN — layOnHands", () => {
  it("with roll=5: spends layOnHands amount:5 + heals 5", () => {
    expect(ACTION_EFFECT_FN.layOnHands({ roll: 5 })).toEqual([
      { type: "spendResource", key: "layOnHands", amount: 5 },
      { type: "heal", amount: 5 },
    ]);
  });

  it("without roll (amount=0): spends layOnHands amount:0, no heal", () => {
    expect(ACTION_EFFECT_FN.layOnHands({})).toEqual([
      { type: "spendResource", key: "layOnHands", amount: 0 },
    ]);
  });
});

describe("ACTION_EFFECT_FN — metamagic", () => {
  it("with roll=3: spends sorceryPoints amount:3", () => {
    expect(ACTION_EFFECT_FN.metamagic({ roll: 3 })).toEqual([
      { type: "spendResource", key: "sorceryPoints", amount: 3 },
    ]);
  });

  it("without roll: defaults to amount:1", () => {
    expect(ACTION_EFFECT_FN.metamagic({})).toEqual([
      { type: "spendResource", key: "sorceryPoints", amount: 1 },
    ]);
  });
});

describe("ACTION_EFFECT_FN — useObject", () => {
  it("with inventoryItemId + roll: decrements quantity and heals", () => {
    expect(ACTION_EFFECT_FN.useObject({ inventoryItemId: "item-x", roll: 4 })).toEqual([
      { type: "adjustQuantity", inventoryItemId: "item-x", delta: -1 },
      { type: "heal", amount: 4 },
    ]);
  });

  it("with inventoryItemId but no roll: decrements only", () => {
    expect(ACTION_EFFECT_FN.useObject({ inventoryItemId: "item-x" })).toEqual([
      { type: "adjustQuantity", inventoryItemId: "item-x", delta: -1 },
    ]);
  });

  it("with inventoryItemId and roll=0: decrements only (no heal at 0)", () => {
    expect(ACTION_EFFECT_FN.useObject({ inventoryItemId: "item-x", roll: 0 })).toEqual([
      { type: "adjustQuantity", inventoryItemId: "item-x", delta: -1 },
    ]);
  });

  it("without inventoryItemId: returns []", () => {
    expect(ACTION_EFFECT_FN.useObject({ roll: 4 })).toEqual([]);
    expect(ACTION_EFFECT_FN.useObject({})).toEqual([]);
  });
});

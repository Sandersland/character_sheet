/**
 * Unit tests for deriveActions / ACTION_EFFECT_FN:
 *   - deriveActions: class/subclass/level gates, resource gating, case-insensitivity
 *   - ACTION_EFFECT_FN: per-key op arrays for every handler in the dispatch table
 *
 * Pure logic — no DB or HTTP layer. Mirrors lib/__tests__/experience.test.ts style.
 */

import { describe, expect, it } from "vitest";

import {
  deriveActions,
  deriveEntryScopedActions,
  ACTION_EFFECT_FN,
  ACTION_CAST_FN,
  rageMeleeDamageBonus,
  type AvailableAction,
  type ResourcePool,
} from "@/lib/classes/actions.js";
import { monk } from "@/lib/classes/monk.js";
import { SUBCLASS_IDENTITY, type SubclassSlug } from "@/lib/classes/subclass-slug.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Build a resource pool entry. */
function pool(key: string, remaining: number) {
  return { key, remaining };
}

/** Pluck only the keys from an AvailableAction array. */
function keys(actions: AvailableAction[]) {
  return actions.map((a) => a.key);
}

// deriveActions is slug-native now (#1277); `at` goes through the real
// resolveSubclassSlug-backed resolver (deriveEntryScopedActions) so the
// display-name fallback path is exercised too, not just the slug. Behaviour-
// identical to the old bare deriveActions for one entry:
// effectiveEntryLevel(l, 1, l) === l (effective-levels.ts:9-11) — a rename of
// every call site below, not a semantic edit. A handful of calls stay direct
// `deriveActions(cls, "monk-warrior-of-shadow", …)` further down so the
// slug-native contract is asserted without going through the resolver too.
const at = (
  cls: string,
  subclass: string | undefined,
  level: number,
  pools: ResourcePool[] = [],
  unarmored = true,
) => deriveEntryScopedActions([{ name: cls, subclass, level }], level, pools, unarmored);

// ── deriveActions ─────────────────────────────────────────────────────────────

describe("deriveActions — class gates", () => {
  it("Fighter L1 gets secondWind, L2 adds actionSurge", () => {
    const l1 = keys(at("fighter", undefined, 1, []));
    expect(l1).toContain("secondWind");
    expect(l1).not.toContain("actionSurge");

    const l2 = keys(at("fighter", undefined, 2, []));
    expect(l2).toContain("secondWind");
    expect(l2).toContain("actionSurge");
  });

  it("Barbarian L1 gets rage, L2 adds recklessAttack", () => {
    const l1 = keys(at("barbarian", undefined, 1, []));
    expect(l1).toContain("rage");
    expect(l1).not.toContain("recklessAttack");

    const l2 = keys(at("barbarian", undefined, 2, []));
    expect(l2).toContain("recklessAttack");
  });

  it("Monk L2 gets flurryOfBlows/patientDefense(+Focus)/stepOfTheWind(+Focus); stunningStrike is not a catalog action (#1242)", () => {
    const l2 = keys(at("monk", undefined, 2, []));
    expect(l2).toContain("flurryOfBlows");
    expect(l2).toContain("patientDefense");
    expect(l2).toContain("patientDefenseFocus");
    expect(l2).toContain("stepOfTheWind");
    expect(l2).toContain("stepOfTheWindFocus");
    // Stunning Strike (L5) is a post-hit rider, not a catalog action — see
    // stunning-strike.test.ts (#1242).
    expect(l2).not.toContain("stunningStrike");
    const l5 = keys(at("monk", undefined, 5, []));
    expect(l5).not.toContain("stunningStrike");
  });

  it("Monk L1 gets bonusUnarmedStrike (Martial Arts, #1218)", () => {
    expect(keys(at("monk", undefined, 1, []))).toContain("bonusUnarmedStrike");
  });

  it("Paladin L1 gets divineSense/layOnHands; L3 adds channelDivinity", () => {
    const l1 = keys(at("paladin", undefined, 1, []));
    expect(l1).toContain("divineSense");
    expect(l1).toContain("layOnHands");
    expect(l1).not.toContain("channelDivinity");

    const l3 = keys(at("paladin", undefined, 3, []));
    expect(l3).toContain("channelDivinity");
  });

  it("Bard L1 gets bardicInspiration; Cleric L2 gets channelDivinity", () => {
    expect(keys(at("bard", undefined, 1, []))).toContain("bardicInspiration");
    expect(keys(at("cleric", undefined, 2, []))).toContain("channelDivinity");
  });

  it("Druid L2 gets wildShape; Rogue L2 gets cunningAction; Sorcerer L3 gets metamagic", () => {
    expect(keys(at("druid", undefined, 2, []))).toContain("wildShape");
    expect(keys(at("rogue", undefined, 2, []))).toContain("cunningAction");
    expect(keys(at("sorcerer", undefined, 3, []))).toContain("metamagic");
  });

  it("class gate: fighter result contains no barbarian-only actions", () => {
    const result = keys(at("fighter", undefined, 20, []));
    expect(result).not.toContain("rage");
    expect(result).not.toContain("recklessAttack");
    expect(result).not.toContain("flurryOfBlows");
  });
});

describe("deriveActions — universal actions excluded", () => {
  it("does not include generic actions like attack/dodge/dash", () => {
    // Universal actions (attack, castSpell, dodge, etc.) are served per edition
    // by referenceRouter's universalActions (#1430) and must NOT also appear in
    // availableActions, or TurnHub would render each of them twice.
    const result = keys(at("fighter", undefined, 5, []));
    const universalKeys = ["attack", "castSpell", "dodge", "dash", "disengage", "help", "hide", "search", "ready"];
    for (const key of universalKeys) {
      expect(result).not.toContain(key);
    }
  });
});

describe("deriveActions — case-insensitivity", () => {
  it("matches class name regardless of case", () => {
    expect(keys(at("Fighter", undefined, 2, []))).toContain("secondWind");
    expect(keys(at("FIGHTER", undefined, 2, []))).toContain("actionSurge");
    expect(keys(at("Barbarian", undefined, 1, []))).toContain("rage");
  });
});

describe("deriveActions — resource gating", () => {
  it("rage is enabled when remaining > 0", () => {
    const actions = at("barbarian", undefined, 1, [pool("rage", 2)]);
    const rage = actions.find((a) => a.key === "rage");
    expect(rage?.enabled).toBe(true);
    expect(rage?.disabledReason).toBeUndefined();
  });

  it("rage is disabled with 'No rage remaining' when remaining is 0", () => {
    const actions = at("barbarian", undefined, 1, [pool("rage", 0)]);
    const rage = actions.find((a) => a.key === "rage");
    expect(rage?.enabled).toBe(false);
    expect(rage?.disabledReason).toBe("No rage remaining");
  });

  it("flurryOfBlows needs 1 focus: disabled with 'No focus remaining' at 0 (#1217)", () => {
    const actions = at("monk", undefined, 2, [pool("focus", 0)]);
    const flurry = actions.find((a) => a.key === "flurryOfBlows");
    expect(flurry?.enabled).toBe(false);
    expect(flurry?.disabledReason).toBe("No focus remaining");
  });

  it("flurryOfBlows is enabled when focus >= 1 (still usable without the Attack action)", () => {
    const actions = at("monk", undefined, 2, [pool("focus", 1)]);
    const flurry = actions.find((a) => a.key === "flurryOfBlows");
    expect(flurry?.enabled).toBe(true);
  });

  it("actions without a resourceKey are always enabled", () => {
    // recklessAttack has no resourceKey — should always be enabled.
    const actions = at("barbarian", undefined, 2, []);
    const reckless = actions.find((a) => a.key === "recklessAttack");
    expect(reckless?.enabled).toBe(true);
  });

  it("empty pools default to 0 remaining (action disabled)", () => {
    // No pool entry for "secondWind" → defaults to remaining=0 → disabled.
    const actions = at("fighter", undefined, 1, []);
    const secondWind = actions.find((a) => a.key === "secondWind");
    expect(secondWind?.enabled).toBe(false);
    expect(secondWind?.disabledReason).toBe("No secondWind remaining");
  });
});

describe("deriveActions — requiresUnarmored gate (Bonus Unarmed Strike, #1218)", () => {
  it("is enabled when unarmoredUnshielded is true (default)", () => {
    const actions = at("monk", undefined, 1, []);
    const bonusUnarmedStrike = actions.find((a) => a.key === "bonusUnarmedStrike");
    expect(bonusUnarmedStrike?.enabled).toBe(true);
    expect(bonusUnarmedStrike?.disabledReason).toBeUndefined();
  });

  it("is disabled with 'Requires no armor or Shield' when unarmoredUnshielded is false", () => {
    const actions = at("monk", undefined, 1, [], false);
    const bonusUnarmedStrike = actions.find((a) => a.key === "bonusUnarmedStrike");
    expect(bonusUnarmedStrike?.enabled).toBe(false);
    expect(bonusUnarmedStrike?.disabledReason).toBe("Requires no armor or Shield");
  });

  it("has no resourceKey — spends no resource", () => {
    const bonusUnarmedStrike = at("monk", undefined, 1, []).find(
      (a) => a.key === "bonusUnarmedStrike",
    );
    expect(bonusUnarmedStrike?.cost).toBe("bonusAction");
    expect(ACTION_EFFECT_FN.bonusUnarmedStrike({})).toEqual([]);
  });

  it("actions with no requiresUnarmored flag ignore the unarmoredUnshielded param", () => {
    // Rage carries no requiresUnarmored — armored/shielded is irrelevant to it.
    const actions = at("barbarian", undefined, 1, [pool("rage", 1)], false);
    const rage = actions.find((a) => a.key === "rage");
    expect(rage?.enabled).toBe(true);
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
    ["channelDivinity", "channelDivinity"],
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
        buff: {
          key: "rage",
          target: "meleeDamage",
          modifier: 3,
          source: "Rage",
          duration: "while-active",
          resistDamageTypes: ["bludgeoning", "piercing", "slashing"],
          rollEffects: [
            { mode: "advantage", kind: "check", ability: "strength" },
            { mode: "advantage", kind: "save", ability: "strength" },
          ],
        },
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
    expect(keys(at("barbarian", undefined, 1, []))).toContain("endRage");
    expect(keys(at("fighter", undefined, 20, []))).not.toContain("endRage");
  });
});

describe("ACTION_EFFECT_FN — monk focus actions", () => {
  it("flurryOfBlows → spendResource focus (1, no amount override) (#1217)", () => {
    expect(ACTION_EFFECT_FN.flurryOfBlows({})).toEqual([
      { type: "spendResource", key: "focus" },
    ]);
  });
});

describe("Patient Defense / Step of the Wind — 2024 free vs 1-Focus variants (#1240)", () => {
  it("both are granted at monk L2, in both the free and Focus-spend forms", () => {
    const l2 = keys(at("monk", undefined, 2, []));
    expect(l2).toEqual(
      expect.arrayContaining(["patientDefense", "patientDefenseFocus", "stepOfTheWind", "stepOfTheWindFocus"]),
    );
  });

  it("free variants are always enabled — no resourceKey gate — regardless of remaining focus", () => {
    const noFocus = at("monk", undefined, 2, [pool("focus", 0)]);
    const patientFree = noFocus.find((a) => a.key === "patientDefense");
    const stepFree = noFocus.find((a) => a.key === "stepOfTheWind");
    expect(patientFree?.enabled).toBe(true);
    expect(stepFree?.enabled).toBe(true);
  });

  it("Focus variants are gated on 1 remaining focus, like any other resource-gated action", () => {
    const noFocus = at("monk", undefined, 2, [pool("focus", 0)]);
    expect(noFocus.find((a) => a.key === "patientDefenseFocus")?.enabled).toBe(false);
    expect(noFocus.find((a) => a.key === "stepOfTheWindFocus")?.enabled).toBe(false);

    const withFocus = at("monk", undefined, 2, [pool("focus", 1)]);
    expect(withFocus.find((a) => a.key === "patientDefenseFocus")?.enabled).toBe(true);
    expect(withFocus.find((a) => a.key === "stepOfTheWindFocus")?.enabled).toBe(true);
  });

  it("Patient Defense reminders name Disengage-only free vs Disengage+Dodge paid", () => {
    const l2 = at("monk", undefined, 2, [pool("focus", 1)]);
    const patientFree = l2.find((a) => a.key === "patientDefense");
    const patientFocus = l2.find((a) => a.key === "patientDefenseFocus");
    expect(patientFree).toBeDefined();
    expect(patientFocus).toBeDefined();
    expect(patientFree!.reminder).toMatch(/disengage/i);
    expect(patientFree!.reminder).not.toMatch(/dodge/i);
    expect(patientFocus!.reminder).toMatch(/disengage/i);
    expect(patientFocus!.reminder).toMatch(/dodge/i);
  });

  it("Step of the Wind reminders name Dash-only free vs Disengage+Dash+doubled-jump paid", () => {
    const l2 = at("monk", undefined, 2, [pool("focus", 1)]);
    const stepFree = l2.find((a) => a.key === "stepOfTheWind");
    const stepFocus = l2.find((a) => a.key === "stepOfTheWindFocus");
    expect(stepFree).toBeDefined();
    expect(stepFocus).toBeDefined();
    expect(stepFree!.reminder).toMatch(/dash/i);
    expect(stepFree!.reminder).not.toMatch(/disengage/i);
    expect(stepFocus!.reminder).toMatch(/disengage/i);
    expect(stepFocus!.reminder).toMatch(/dash/i);
    expect(stepFocus!.reminder).toMatch(/jump/i);
  });

  it("free variants are pure reminder actions — no server effect fn (like Shadow Step/Opportunist)", () => {
    expect(ACTION_EFFECT_FN.patientDefense).toBeUndefined();
    expect(ACTION_CAST_FN.patientDefense).toBeUndefined();
    expect(ACTION_EFFECT_FN.stepOfTheWind).toBeUndefined();
    expect(ACTION_CAST_FN.stepOfTheWind).toBeUndefined();
  });

  it("patientDefenseFocus spends exactly 1 focus", () => {
    expect(ACTION_EFFECT_FN.patientDefenseFocus({})).toEqual([
      { type: "spendResource", key: "focus" },
    ]);
  });

  it("stepOfTheWindFocus spends exactly 1 focus", () => {
    expect(ACTION_EFFECT_FN.stepOfTheWindFocus({})).toEqual([
      { type: "spendResource", key: "focus" },
    ]);
  });
});

describe("Heightened Focus (monk L10, #1244) — Patient Defense temp HP + reminder upgrades", () => {
  it("patientDefenseFocus adds a tempHp op when ctx carries a pre-rolled heightenedFocusTempHp amount", () => {
    expect(ACTION_EFFECT_FN.patientDefenseFocus({ heightenedFocusTempHp: 11 })).toEqual([
      { type: "spendResource", key: "focus" },
      { type: "tempHp", amount: 11 },
    ]);
  });

  it("patientDefenseFocus adds no tempHp op when ctx omits heightenedFocusTempHp (below L10)", () => {
    expect(ACTION_EFFECT_FN.patientDefenseFocus({})).toEqual([
      { type: "spendResource", key: "focus" },
    ]);
  });

  it("stepOfTheWindFocus has no server effect change — the move-ally rider is narrated only", () => {
    expect(ACTION_EFFECT_FN.stepOfTheWindFocus({ heightenedFocusTempHp: 11 })).toEqual([
      { type: "spendResource", key: "focus" },
    ]);
  });

  it("patientDefenseFocus reminder names the temp-HP rider only at monk L10+", () => {
    const l9 = at("monk", undefined, 9, [pool("focus", 1)]);
    const l10 = at("monk", undefined, 10, [pool("focus", 1)]);
    expect(l9.find((a) => a.key === "patientDefenseFocus")?.reminder).not.toMatch(/temporary hit points/i);
    expect(l10.find((a) => a.key === "patientDefenseFocus")?.reminder).toMatch(/temporary hit points/i);
    expect(l10.find((a) => a.key === "patientDefenseFocus")?.reminder).toMatch(/martial arts die/i);
  });

  it("stepOfTheWindFocus reminder names the move-a-willing-creature rider only at monk L10+", () => {
    const l9 = at("monk", undefined, 9, [pool("focus", 1)]);
    const l10 = at("monk", undefined, 10, [pool("focus", 1)]);
    expect(l9.find((a) => a.key === "stepOfTheWindFocus")?.reminder).not.toMatch(/creature/i);
    expect(l10.find((a) => a.key === "stepOfTheWindFocus")?.reminder).toMatch(/creature/i);
    expect(l10.find((a) => a.key === "stepOfTheWindFocus")?.reminder).toMatch(/opportunity attack/i);
  });
});

// Stunning Strike (#392's bare-spend stub) is superseded by the dedicated
// stunning-strike.ts vertical (#1242) — see stunning-strike.test.ts for its
// once-per-turn guard, DC math, and fail/success outcome coverage.
describe("Monk Stunning Strike — not a catalog action (#1242)", () => {
  it("has no DERIVED_ACTIONS entry at any level", () => {
    expect(keys(at("monk", undefined, 4, []))).not.toContain("stunningStrike");
    expect(keys(at("monk", undefined, 5, []))).not.toContain("stunningStrike");
    expect(keys(at("monk", undefined, 20, []))).not.toContain("stunningStrike");
  });

  it("has no ACTION_EFFECT_FN entry (post-hit rider, not a selectable action)", () => {
    expect(ACTION_EFFECT_FN.stunningStrike).toBeUndefined();
  });
});

describe("Warrior of Shadow — Shadow Step (2024 rewrite, #1246)", () => {
  const SHADOW = "Warrior of Shadow";

  it("Shadow monk gets shadowStep as a bonus action at L6, not at L5", () => {
    expect(keys(at("monk", SHADOW, 5, []))).not.toContain("shadowStep");
    const l6 = at("monk", SHADOW, 6, []);
    const shadowStep = l6.find((a) => a.key === "shadowStep");
    expect(shadowStep).toBeDefined();
    expect(shadowStep?.cost).toBe("bonusAction");
  });

  it("is always enabled (no resourceKey gate)", () => {
    const l17 = at("monk", SHADOW, 17, []);
    const shadowStep = l17.find((a) => a.key === "shadowStep");
    expect(shadowStep?.enabled).toBe(true);
    expect(shadowStep?.disabledReason).toBeUndefined();
  });

  it("has no opportunist entry at any level (2014 L17 feature retired)", () => {
    for (const level of [17, 20]) {
      expect(keys(at("monk", SHADOW, level, []))).not.toContain("opportunist");
    }
  });

  it("subclass gate: a non-Shadow monk doesn't get shadowStep at L17", () => {
    const openHand = keys(at("monk", "Warrior of the Open Hand", 17, []));
    expect(openHand).not.toContain("shadowStep");
    const noSub = keys(at("monk", undefined, 17, []));
    expect(noSub).not.toContain("shadowStep");
  });

  it("class gate: a non-monk doesn't get shadowStep even with a Shadow-like subclass", () => {
    const rogue = keys(at("rogue", SHADOW, 20, []));
    expect(rogue).not.toContain("shadowStep");
  });

  it("matches the subclass NAME case-insensitively", () => {
    expect(keys(at("Monk", "warrior of shadow", 6, []))).toContain("shadowStep");
  });

  it("carries its rule text as a reminder for in-session surfacing", () => {
    const l6 = at("monk", SHADOW, 6, []);
    const shadowStep = l6.find((a) => a.key === "shadowStep");
    expect(shadowStep?.reminder).toMatch(/teleport/i);
    expect(shadowStep?.reminder).toMatch(/dim light|darkness/i);
    expect(shadowStep?.reminder).toMatch(/unarmed strike/i);
  });

  it("Improved Shadow Step (L11) upgrades the reminder in place — no separate catalog row", () => {
    const l10 = at("monk", SHADOW, 10, []).find((a) => a.key === "shadowStep");
    const l11 = at("monk", SHADOW, 11, []).find((a) => a.key === "shadowStep");
    expect(l10?.reminder).not.toMatch(/1 focus/i);
    expect(l11?.reminder).toMatch(/1 focus/i);
    expect(keys(at("monk", SHADOW, 11, []))).not.toContain("improvedShadowStep");
  });

  it("resource-gated class actions carry no reminder (reminder is Shadow-only)", () => {
    const flurry = at("monk", SHADOW, 17, []).find((a) => a.key === "flurryOfBlows");
    expect(flurry?.reminder).toBeUndefined();
  });

  it("is a pure reminder action — no server effect fn (no ACTION_EFFECT_FN/ACTION_CAST_FN)", () => {
    expect(ACTION_EFFECT_FN.shadowStep).toBeUndefined();
    expect(ACTION_CAST_FN.shadowStep).toBeUndefined();
  });
});

describe("Monk Deflect Attacks / Deflect Energy (#1241)", () => {
  it("is granted at monk L3 as a reaction with no resourceKey (free reminder, base reduction costs nothing)", () => {
    expect(keys(at("monk", undefined, 2, []))).not.toContain("deflectAttacks");
    const l3 = at("monk", undefined, 3, []);
    const deflect = l3.find((a) => a.key === "deflectAttacks");
    expect(deflect).toBeDefined();
    expect(deflect?.cost).toBe("reaction");
    expect(deflect?.enabled).toBe(true);
    expect(deflect?.disabledReason).toBeUndefined();
  });

  it("carries its rule text as a reminder for in-session surfacing", () => {
    const deflect = at("monk", undefined, 3, []).find((a) => a.key === "deflectAttacks");
    expect(deflect?.reminder).toMatch(/bludgeoning, piercing, or slashing/i);
    expect(deflect?.reminder).toMatch(/reaction/i);
  });

  it("is a pure reminder action — no server effect fn for the base reduction", () => {
    // Mirrors Warrior of Shadow's shadowStep (#1246): the client rolls
    // 1d10 + Dex + monk level and never calls the transactions endpoint for the
    // base reduction (nothing persisted). Only the redirect spends Focus.
    expect(ACTION_EFFECT_FN.deflectAttacks).toBeUndefined();
    expect(ACTION_CAST_FN.deflectAttacks).toBeUndefined();
  });

  it("deflectAttacksRedirect is granted at monk L3 as a free-cost Focus spend", () => {
    expect(keys(at("monk", undefined, 2, []))).not.toContain("deflectAttacksRedirect");
    const l3 = at("monk", undefined, 3, [pool("focus", 3)]);
    const redirect = l3.find((a) => a.key === "deflectAttacksRedirect");
    expect(redirect).toBeDefined();
    expect(redirect?.cost).toBe("free");
    expect(redirect?.enabled).toBe(true);
  });

  it("deflectAttacksRedirect is disabled with no Focus remaining", () => {
    const redirect = at("monk", undefined, 3, [pool("focus", 0)]).find(
      (a) => a.key === "deflectAttacksRedirect",
    );
    expect(redirect?.enabled).toBe(false);
    expect(redirect?.disabledReason).toBe("No focus remaining");
  });

  it("deflectAttacksRedirect spends 1 focus", () => {
    expect(ACTION_EFFECT_FN.deflectAttacksRedirect({})).toEqual([
      { type: "spendResource", key: "focus" },
    ]);
  });

  it("class gate: a non-monk gets neither key", () => {
    const fighter = keys(at("fighter", undefined, 20, []));
    expect(fighter).not.toContain("deflectAttacks");
    expect(fighter).not.toContain("deflectAttacksRedirect");
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

describe("Warrior of the Open Hand — Wholeness of Body / Fleet Step (#1245)", () => {
  const OPEN_HAND = "Warrior of the Open Hand";

  it("Open Hand monk gets wholenessOfBody as a bonus action at L6, not at L5", () => {
    expect(keys(at("monk", OPEN_HAND, 5, []))).not.toContain("wholenessOfBody");
    const l6 = at("monk", OPEN_HAND, 6, []);
    const wholeness = l6.find((a) => a.key === "wholenessOfBody");
    expect(wholeness).toBeDefined();
    expect(wholeness?.cost).toBe("bonusAction");
  });

  it("wholenessOfBody is gated on the wholenessOfBody pool like any other resource-gated action", () => {
    const noUses = at("monk", OPEN_HAND, 6, [pool("wholenessOfBody", 0)]);
    expect(noUses.find((a) => a.key === "wholenessOfBody")?.enabled).toBe(false);
    const withUses = at("monk", OPEN_HAND, 6, [pool("wholenessOfBody", 1)]);
    expect(withUses.find((a) => a.key === "wholenessOfBody")?.enabled).toBe(true);
  });

  it("wholenessOfBody: with roll=8, spends 1 use and heals 8", () => {
    expect(ACTION_EFFECT_FN.wholenessOfBody({ roll: 8 })).toEqual([
      { type: "spendResource", key: "wholenessOfBody" },
      { type: "heal", amount: 8 },
    ]);
  });

  it("wholenessOfBody: without a roll, spends the use but heals nothing", () => {
    expect(ACTION_EFFECT_FN.wholenessOfBody({})).toEqual([
      { type: "spendResource", key: "wholenessOfBody" },
    ]);
  });

  it("Open Hand monk gets fleetStep as a free-cost reminder at L11, not at L10", () => {
    expect(keys(at("monk", OPEN_HAND, 10, []))).not.toContain("fleetStep");
    const l11 = at("monk", OPEN_HAND, 11, []);
    const fleetStep = l11.find((a) => a.key === "fleetStep");
    expect(fleetStep).toBeDefined();
    expect(fleetStep?.cost).toBe("free");
    expect(fleetStep?.enabled).toBe(true);
    expect(fleetStep?.reminder).toMatch(/step of the wind/i);
  });

  it("fleetStep is a pure reminder — no server effect fn (like recklessAttack/metamagic's free cost siblings)", () => {
    expect(ACTION_EFFECT_FN.fleetStep).toBeUndefined();
    expect(ACTION_CAST_FN.fleetStep).toBeUndefined();
  });

  it("subclass gate: a non-Open-Hand monk gets neither at L11+", () => {
    const shadow = keys(at("monk", "Warrior of Shadow", 17, []));
    expect(shadow).not.toContain("wholenessOfBody");
    expect(shadow).not.toContain("fleetStep");
    const noSub = keys(at("monk", undefined, 17, []));
    expect(noSub).not.toContain("wholenessOfBody");
    expect(noSub).not.toContain("fleetStep");
  });

  it("Open Hand Technique and Quivering Palm are post-hit riders, not catalog actions", () => {
    const l20 = keys(at("monk", OPEN_HAND, 20, []));
    expect(l20).not.toContain("openHandTechnique");
    expect(l20).not.toContain("quiveringPalm");
    expect(ACTION_EFFECT_FN.openHandTechnique).toBeUndefined();
    expect(ACTION_EFFECT_FN.quiveringPalm).toBeUndefined();
  });
});

describe("Warrior of Mercy — Hand of Healing (#1248)", () => {
  const MERCY = "Warrior of Mercy";

  it("Warrior of Mercy monk gets handOfHealing (action) and handOfHealingFlurry (bonus action) at L3", () => {
    const l3 = at("monk", MERCY, 3, []);
    const healing = l3.find((a) => a.key === "handOfHealing");
    expect(healing).toBeDefined();
    expect(healing?.cost).toBe("action");
    const flurry = l3.find((a) => a.key === "handOfHealingFlurry");
    expect(flurry).toBeDefined();
    expect(flurry?.cost).toBe("bonusAction");
  });

  it("handOfHealing is gated on the focus pool like any other resource-gated action", () => {
    const noFocus = at("monk", MERCY, 3, [pool("focus", 0)]);
    expect(noFocus.find((a) => a.key === "handOfHealing")?.enabled).toBe(false);
    const withFocus = at("monk", MERCY, 3, [pool("focus", 1)]);
    expect(withFocus.find((a) => a.key === "handOfHealing")?.enabled).toBe(true);
  });

  it("handOfHealingFlurry has no resource gate — it's always enabled once granted", () => {
    const noFocus = at("monk", MERCY, 3, [pool("focus", 0)]);
    expect(noFocus.find((a) => a.key === "handOfHealingFlurry")?.enabled).toBe(true);
  });

  it("handOfHealing: with roll=8, spends 1 focus and heals 8", () => {
    expect(ACTION_EFFECT_FN.handOfHealing({ roll: 8 })).toEqual([
      { type: "spendResource", key: "focus" },
      { type: "heal", amount: 8 },
    ]);
  });

  it("handOfHealing: without a roll, spends focus but heals nothing", () => {
    expect(ACTION_EFFECT_FN.handOfHealing({})).toEqual([{ type: "spendResource", key: "focus" }]);
  });

  it("handOfHealingFlurry: with roll=8, heals 8 and spends no focus", () => {
    expect(ACTION_EFFECT_FN.handOfHealingFlurry({ roll: 8 })).toEqual([{ type: "heal", amount: 8 }]);
  });

  it("handOfHealingFlurry: without a roll, does nothing", () => {
    expect(ACTION_EFFECT_FN.handOfHealingFlurry({})).toEqual([]);
  });

  it("subclass gate: a non-Warrior-of-Mercy monk gets neither at L3+", () => {
    const shadow = keys(at("monk", "Way of Shadow", 20, []));
    expect(shadow).not.toContain("handOfHealing");
    expect(shadow).not.toContain("handOfHealingFlurry");
    const noSub = keys(at("monk", undefined, 20, []));
    expect(noSub).not.toContain("handOfHealing");
    expect(noSub).not.toContain("handOfHealingFlurry");
  });

  it("Hand of Harm and Hand of Ultimate Mercy are dedicated verticals, not catalog actions", () => {
    const l20 = keys(at("monk", MERCY, 20, []));
    expect(l20).not.toContain("handOfHarm");
    expect(l20).not.toContain("handOfUltimateMercy");
    expect(ACTION_EFFECT_FN.handOfHarm).toBeUndefined();
    expect(ACTION_EFFECT_FN.handOfUltimateMercy).toBeUndefined();
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

// #1315: migrates the Warrior of Shadow feature-availability gates off
// DerivedClassInfo booleans and onto DERIVED_ACTIONS rows, like shadowStep/
// fleetStep above. The dedicated endpoint (shadow-arts.ts) still owns the
// actual cast/activate — these rows only express the level gate as data.
describe("Warrior of Shadow — Shadow Arts / Cloak of Shadows catalog rows (#1315)", () => {
  // Direct deriveActions calls with a slug literal (not `at()`) — asserts the
  // slug-native contract itself, not just the name-fallback path (#1277).
  const SHADOW: SubclassSlug = "monk-warrior-of-shadow";

  it("Shadow monk gets shadowArts at L3, not L2", () => {
    expect(keys(deriveActions("monk", SHADOW, 2, []))).not.toContain("shadowArts");
    const l3 = deriveActions("monk", SHADOW, 3, [pool("focus", 1)]);
    const shadowArts = l3.find((a) => a.key === "shadowArts");
    expect(shadowArts).toBeDefined();
    expect(shadowArts?.cost).toBe("action");
  });

  it("shadowArts is gated on 1 focus like any other resource-gated action", () => {
    const noFocus = deriveActions("monk", SHADOW, 3, [pool("focus", 0)]);
    expect(noFocus.find((a) => a.key === "shadowArts")?.enabled).toBe(false);
    const withFocus = deriveActions("monk", SHADOW, 3, [pool("focus", 1)]);
    expect(withFocus.find((a) => a.key === "shadowArts")?.enabled).toBe(true);
  });

  it("Shadow monk gets cloakOfShadows at L17, not L16", () => {
    expect(keys(deriveActions("monk", SHADOW, 16, []))).not.toContain("cloakOfShadows");
    const l17 = deriveActions("monk", SHADOW, 17, [pool("focus", 3)]);
    const cloak = l17.find((a) => a.key === "cloakOfShadows");
    expect(cloak).toBeDefined();
    expect(cloak?.cost).toBe("action");
  });

  it("cloakOfShadows costs 3 focus", () => {
    const short = deriveActions("monk", SHADOW, 17, [pool("focus", 2)]);
    expect(short.find((a) => a.key === "cloakOfShadows")?.enabled).toBe(false);
    const enough = deriveActions("monk", SHADOW, 17, [pool("focus", 3)]);
    expect(enough.find((a) => a.key === "cloakOfShadows")?.enabled).toBe(true);
  });

  it("subclass gate: a non-Shadow monk gets neither at any level", () => {
    const openHand = keys(at("monk", "Warrior of the Open Hand", 20, [pool("focus", 5)]));
    expect(openHand).not.toContain("shadowArts");
    expect(openHand).not.toContain("cloakOfShadows");
    const noSub = keys(at("monk", undefined, 20, [pool("focus", 5)]));
    expect(noSub).not.toContain("shadowArts");
    expect(noSub).not.toContain("cloakOfShadows");
  });

  it("both cast through the dedicated /abilities/shadow-arts endpoint — no ACTION_EFFECT_FN/ACTION_CAST_FN entry", () => {
    expect(ACTION_EFFECT_FN.shadowArts).toBeUndefined();
    expect(ACTION_CAST_FN.shadowArts).toBeUndefined();
    expect(ACTION_EFFECT_FN.cloakOfShadows).toBeUndefined();
    expect(ACTION_CAST_FN.cloakOfShadows).toBeUndefined();
  });
});

describe("Warrior of the Elements — Elemental Attunement / Elemental Burst catalog rows (#1315)", () => {
  const ELEMENTS = "Warrior of the Elements";

  it("gets elementalAttunement at L3, not L2, as a no-action (free) toggle", () => {
    expect(keys(at("monk", ELEMENTS, 2, []))).not.toContain("elementalAttunement");
    const l3 = at("monk", ELEMENTS, 3, [pool("focus", 1)]);
    const attune = l3.find((a) => a.key === "elementalAttunement");
    expect(attune).toBeDefined();
    expect(attune?.cost).toBe("free");
  });

  it("gets elementalBurst at L6, not L5, as a Magic action", () => {
    expect(keys(at("monk", ELEMENTS, 5, []))).not.toContain("elementalBurst");
    const l6 = at("monk", ELEMENTS, 6, [pool("focus", 2)]);
    const burst = l6.find((a) => a.key === "elementalBurst");
    expect(burst).toBeDefined();
    expect(burst?.cost).toBe("action");
  });

  it("elementalAttunement costs 1 focus, elementalBurst costs 2", () => {
    const noFocus = at("monk", ELEMENTS, 6, [pool("focus", 0)]);
    expect(noFocus.find((a) => a.key === "elementalAttunement")?.enabled).toBe(false);
    expect(noFocus.find((a) => a.key === "elementalBurst")?.enabled).toBe(false);
    const oneFocus = at("monk", ELEMENTS, 6, [pool("focus", 1)]);
    expect(oneFocus.find((a) => a.key === "elementalAttunement")?.enabled).toBe(true);
    expect(oneFocus.find((a) => a.key === "elementalBurst")?.enabled).toBe(false);
  });

  it("subclass gate: a non-Elements monk gets neither at any level", () => {
    const shadow = keys(at("monk", "Warrior of Shadow", 20, [pool("focus", 5)]));
    expect(shadow).not.toContain("elementalAttunement");
    expect(shadow).not.toContain("elementalBurst");
    const noSub = keys(at("monk", undefined, 20, [pool("focus", 5)]));
    expect(noSub).not.toContain("elementalAttunement");
    expect(noSub).not.toContain("elementalBurst");
  });

  it("both cast through the dedicated /abilities/warrior-of-elements endpoint — no ACTION_EFFECT_FN/ACTION_CAST_FN entry", () => {
    expect(ACTION_EFFECT_FN.elementalAttunement).toBeUndefined();
    expect(ACTION_CAST_FN.elementalAttunement).toBeUndefined();
    expect(ACTION_EFFECT_FN.elementalBurst).toBeUndefined();
    expect(ACTION_CAST_FN.elementalBurst).toBeUndefined();
  });
});

// #1340: cleric.ts and paladin.ts both grant a feature named "Channel
// Divinity" (cleric at L2, paladin at L3) drawing on the same channelDivinity
// pool. Before the fix, DERIVED_ACTIONS carried two rows (channelDivinityCleric/
// channelDivinityPaladin) — a single-class read only ever sees its own class's
// row, but a multiclass read surfaced both as duplicate cards. PHB'14 p.164:
// one feature, one pool, one card — merged via the single-class-gate-or-class
// grantClasses array so matchesActionGate keeps one class-gate code path
// (classGatesOf normalizes both the legacy grantClass/grantLevel shape and the
// new grantClasses shape).
describe("Channel Divinity — one merged row, gated cleric≥2 OR paladin≥3 (#1340)", () => {
  it("granted class gate: cleric reaches it at L2, paladin at L3, in isolation", () => {
    expect(keys(at("cleric", undefined, 1, []))).not.toContain("channelDivinity");
    expect(keys(at("cleric", undefined, 2, []))).toContain("channelDivinity");
    expect(keys(at("paladin", undefined, 2, []))).not.toContain("channelDivinity");
    expect(keys(at("paladin", undefined, 3, []))).toContain("channelDivinity");
  });

  it("no other class gets it at any level", () => {
    expect(keys(at("fighter", undefined, 20, []))).not.toContain("channelDivinity");
    expect(keys(at("bard", undefined, 20, []))).not.toContain("channelDivinity");
  });

  it("the reminder names both classes' effect menus", () => {
    const cleric = at("cleric", undefined, 2, []).find((a) => a.key === "channelDivinity");
    expect(cleric?.reminder).toMatch(/Cleric/);
    expect(cleric?.reminder).toMatch(/Paladin/);
  });

  it("spends the channelDivinity pool, gated on the merged remaining count", () => {
    expect(ACTION_EFFECT_FN.channelDivinity({})).toEqual([{ type: "spendResource", key: "channelDivinity" }]);
    const disabled = at("cleric", undefined, 2, [pool("channelDivinity", 0)]).find(
      (a) => a.key === "channelDivinity",
    );
    expect(disabled?.enabled).toBe(false);
    expect(disabled?.disabledReason).toBe("No channelDivinity remaining");
  });

  it("the old per-class keys no longer exist in either dispatch table", () => {
    expect(ACTION_EFFECT_FN.channelDivinityCleric).toBeUndefined();
    expect(ACTION_EFFECT_FN.channelDivinityPaladin).toBeUndefined();
  });
});

// #1339 fixed this ONE gate's substring bleed (a 2014 "Way of Shadow" monk
// passing the 2024 "Warrior of Shadow" gate purely because "shadow" ⊂ "way of
// shadow") by matching the display name EXACTLY. #1277 replaces that exact-
// name table with resolveSubclassSlug (FK preferred, exact name as fallback)
// — this block now exercises the fallback path via `at()`, which resolves
// through the real resolver, so a display-name gate and a slug gate are
// asserted by the SAME mechanism.
describe("subclass gate resolves via slug — FK preferred, exact name as fallback, never substring (#1339, #1277)", () => {
  it('a 2014 "Way of Shadow" monk gets none of the Warrior of Shadow rows at L20', () => {
    const wayOfShadow = keys(at("monk", "Way of Shadow", 20, [pool("focus", 5)]));
    expect(wayOfShadow).not.toContain("shadowArts");
    expect(wayOfShadow).not.toContain("cloakOfShadows");
    expect(wayOfShadow).not.toContain("shadowStep");
  });

  it('the 2024 "Warrior of Shadow" monk is unaffected at every gate level', () => {
    expect(keys(at("monk", "Warrior of Shadow", 2, []))).not.toContain("shadowArts");
    expect(keys(at("monk", "Warrior of Shadow", 3, [pool("focus", 1)]))).toContain("shadowArts");
    expect(keys(at("monk", "Warrior of Shadow", 5, []))).not.toContain("shadowStep");
    expect(keys(at("monk", "Warrior of Shadow", 6, []))).toContain("shadowStep");
    expect(keys(at("monk", "Warrior of Shadow", 16, [pool("focus", 3)]))).not.toContain("cloakOfShadows");
    expect(keys(at("monk", "Warrior of Shadow", 17, [pool("focus", 3)]))).toContain("cloakOfShadows");
  });

  it("a homebrew name containing a seeded subclass's name inherits nothing", () => {
    const openHandbook = keys(
      at("monk", "Warrior of the Open Handbook", 20, [pool("wholenessOfBody", 5)]),
    );
    expect(openHandbook).not.toContain("wholenessOfBody");
    expect(openHandbook).not.toContain("fleetStep");

    const mercyReborn = keys(at("monk", "Way of Mercy Reborn", 20, [pool("focus", 5)]));
    expect(mercyReborn).not.toContain("handOfHealing");
    expect(mercyReborn).not.toContain("handOfHealingFlurry");

    const elementsPrime = keys(at("monk", "Warrior of the Elements Prime", 20, [pool("focus", 5)]));
    expect(elementsPrime).not.toContain("elementalAttunement");
    expect(elementsPrime).not.toContain("elementalBurst");
  });

  it("normalizes case and stray whitespace on both sides", () => {
    expect(keys(at("Monk", "  WARRIOR OF SHADOW  ", 6, []))).toContain("shadowStep");
  });

  it("the other three families still match their registry names exactly", () => {
    const elements = keys(at("monk", "warrior of the elements", 6, [pool("focus", 2)]));
    expect(elements).toContain("elementalAttunement");
    expect(elements).toContain("elementalBurst");

    const openHand = keys(at("monk", "warrior of the open hand", 11, [pool("wholenessOfBody", 1)]));
    expect(openHand).toContain("wholenessOfBody");
    expect(openHand).toContain("fleetStep");

    const mercy = keys(at("monk", "warrior of mercy", 3, [pool("focus", 1)]));
    expect(mercy).toContain("handOfHealing");
    expect(mercy).toContain("handOfHealingFlurry");
  });

  // Drift latch, RETARGETED for #1277: was a hand-maintained
  // Record<string, string[]> keyed by display name (DERIVED_ACTIONS being
  // unexported meant a new subclass-gated row needed adding here by hand or
  // the latch silently stopped covering it). The key type now widens to
  // Record<Extract<SubclassSlug, `monk-${string}`>, string[]> — exhaustive
  // over EVERY monk slug, so a fifth monk subclass fails TYPECHECK instead of
  // silently escaping the latch (strictly stronger than the old hand-
  // maintained table). Still exercises the name-fallback path at runtime: for
  // each slug, resolve its accepted NAME via SUBCLASS_IDENTITY and call
  // through `at()`, so this is the same mechanism the FK path uses, minus the FK.
  const MONK_SUBCLASS_GRANT_KEYS: Record<Extract<SubclassSlug, `monk-${string}`>, string[]> = {
    "monk-warrior-of-shadow": ["shadowStep", "shadowArts", "cloakOfShadows"],
    "monk-warrior-of-the-elements": ["elementalAttunement", "elementalBurst"],
    "monk-warrior-of-the-open-hand": ["wholenessOfBody", "fleetStep"],
    "monk-warrior-of-mercy": ["handOfHealing", "handOfHealingFlurry"],
  };
  it("every subclass-gated row is reachable from its accepted name (#1339, retargeted #1277)", () => {
    for (const [slug, expectedKeys] of Object.entries(MONK_SUBCLASS_GRANT_KEYS) as [SubclassSlug, string[]][]) {
      const name = SUBCLASS_IDENTITY[slug].nameKey;
      const granted = keys(at("monk", name, 20, [pool("focus", 5), pool("wholenessOfBody", 5)]));
      for (const key of expectedKeys) {
        expect(granted).toContain(key);
      }
    }
  });

  // Ties the DERIVED_ACTIONS vocabulary to the subclasses-registry vocabulary
  // (monk.ts's `subclasses` map) — RETARGETED for #1277: was "every accepted
  // NAME is a registry key" (validity was runtime-checked here); now every
  // grantSubclassSlugs entry must be a monk SubclassDefinition's OWN slug, and
  // the *validity* half (is it a real SubclassSlug at all) is the compiler's
  // job via the Record type above — this test keeps only the "agrees with the
  // resource/feature gate's identity" half, which the compiler can't check.
  it("every grantSubclassSlugs entry is a monk subclass definition's slug (#1339, retargeted #1277)", () => {
    const monkDefSlugs = Object.values(monk.subclasses ?? {}).map((sub) => sub.slug);
    for (const slug of Object.keys(MONK_SUBCLASS_GRANT_KEYS) as SubclassSlug[]) {
      expect(monkDefSlugs).toContain(slug);
    }
  });
});

// Standing invariant (#1340 scope item 3): discharges the action half of the
// audit — Channel Divinity must stay the only cross-class DERIVED_ACTIONS
// name/row-set. Loops every class × its subclasses (mirrors class-features-
// snapshot.test.ts's CLASS_SUBCLASSES table) at the max level so the next
// action a second class grants under the same display name fails THIS test
// instead of silently shipping two identical cards.
describe("no two DERIVED_ACTIONS rows from different classes share a display name (#1340)", () => {
  const CLASS_SUBCLASSES: Record<string, (string | undefined)[]> = {
    barbarian: [undefined, "totem warrior", "berserker"],
    bard: [undefined, "college of lore", "college of valor"],
    cleric: [undefined, "life domain", "trickery domain"],
    druid: [undefined, "circle of the land", "circle of the moon"],
    fighter: [undefined, "battle master", "champion", "eldritch knight"],
    monk: [undefined, "warrior of the open hand", "warrior of shadow", "warrior of the elements", "warrior of mercy"],
    paladin: [undefined, "oath of devotion", "oath of the ancients", "oath of vengeance"],
    ranger: [undefined, "hunter", "beast master"],
    rogue: [undefined, "arcane trickster", "assassin", "thief"],
    sorcerer: [undefined, "draconic bloodline", "wild magic"],
    warlock: [undefined, "the fiend", "the archfey", "the great old one"],
    wizard: [undefined, "school of evocation", "school of abjuration", "school of illusion"],
  };

  it("every action name maps to at most one granting class", () => {
    const classesByName = new Map<string, Set<string>>();
    for (const [className, subclasses] of Object.entries(CLASS_SUBCLASSES)) {
      for (const subclass of subclasses) {
        for (const action of at(className, subclass, 20, [])) {
          const classes = classesByName.get(action.name) ?? new Set<string>();
          classes.add(className);
          classesByName.set(action.name, classes);
        }
      }
    }
    const crossClassNames = [...classesByName.entries()]
      .filter(([, classes]) => classes.size > 1)
      .map(([name]) => name);
    expect(crossClassNames).toEqual(["Channel Divinity"]);
  });
});

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
  matchesActionGate,
  actionGrantLevel,
  ACTION_EFFECT_FN,
  castSpecFromRow,
  REGRANTED_UNIVERSAL_KEYS,
  toggleRowOps,
  type AvailableAction,
  type ResourcePool,
} from "@/lib/classes/actions.js";
import type { ClassFeatureRow } from "@/lib/classes/class-feature-rows.js";
import { monk } from "@/lib/classes/monk.js";
import { SUBCLASS_IDENTITY, type SubclassSlug } from "@/lib/classes/subclass-slug.js";
import { testFeatureRowsFor } from "@/lib/classes/__tests__/test-feature-rows.fixture.js";

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
// Defaults to EDITION_2024 (#1499) — every existing call in this file exercises
// 2024 behavior, which is the byte-identical-output AC for this slice; the
// edition-fork tests below pass "EDITION_2014" explicitly.
const at = (
  cls: string,
  subclass: string | undefined,
  level: number,
  pools: ResourcePool[] = [],
  unarmored = true,
  edition: "EDITION_2014" | "EDITION_2024" = "EDITION_2024",
) => deriveEntryScopedActions([{ name: cls, subclass, level }], level, pools, unarmored, edition);

// Row-aware variant of `at` (#1909) — threads testFeatureRowsFor's
// getFeatureRows carrier (mirrors entry-scoped-actions.test.ts's own
// `getFeatureRows`), so a caller that needs to see a row-driven action
// (bardicInspiration/wildShape/divineSense/layOnHands/metamagic/
// channelDivinity, all moved off DERIVED_ACTIONS onto their class's own
// ClassFeature rows) uses this instead of bare `at`. `at` itself deliberately
// stays row-BLIND (its own doc comment, and the "Fighter has no DERIVED_
// ACTIONS entries" test right below, depend on that isolation to prove a row-
// driven action is ABSENT from the hand-rolled table).
const atRows = (
  cls: string,
  subclass: string | undefined,
  level: number,
  pools: ResourcePool[] = [],
  unarmored = true,
  edition: "EDITION_2014" | "EDITION_2024" = "EDITION_2024",
) =>
  deriveEntryScopedActions([{ name: cls, subclass, level }], level, pools, unarmored, edition, (entry) =>
    testFeatureRowsFor(entry.name, entry.subclass),
  );

// ── deriveActions ─────────────────────────────────────────────────────────────

describe("deriveActions — class gates", () => {
  it("Fighter has no DERIVED_ACTIONS entries (#1528 — Second Wind/Action Surge are row-driven now; see entry-scoped-actions.test.ts's deriveEntryScopedActions coverage)", () => {
    const l2 = keys(at("fighter", undefined, 2, []));
    expect(l2).not.toContain("secondWind");
    expect(l2).not.toContain("actionSurge");
  });

  it("Barbarian L2 adds recklessAttack (rage/endRage are row-driven now, #1686 — see the dedicated describe block below)", () => {
    const l1 = keys(atRows("barbarian", undefined, 1, []));
    expect(l1).not.toContain("recklessAttack");

    const l2 = keys(atRows("barbarian", undefined, 2, []));
    expect(l2).toContain("recklessAttack");
  });

  it("Monk L2 gets flurryOfBlows/patientDefense(+Focus)/stepOfTheWind(+Focus); stunningStrike is not a catalog action (#1242)", () => {
    const l2 = keys(atRows("monk", undefined, 2, []));
    expect(l2).toContain("flurryOfBlows");
    expect(l2).toContain("patientDefense");
    expect(l2).toContain("patientDefenseFocus");
    expect(l2).toContain("stepOfTheWind");
    expect(l2).toContain("stepOfTheWindFocus");
    // Stunning Strike (L5) is a post-hit rider, not a catalog action — see
    // stunning-strike.test.ts (#1242).
    expect(l2).not.toContain("stunningStrike");
    const l5 = keys(atRows("monk", undefined, 5, []));
    expect(l5).not.toContain("stunningStrike");
  });

  it("Monk L1 gets bonusUnarmedStrike (Martial Arts, #1218)", () => {
    expect(keys(atRows("monk", undefined, 1, []))).toContain("bonusUnarmedStrike");
  });

  it("Paladin has no DERIVED_ACTIONS entries left for divineSense/layOnHands/channelDivinity (#1909 — row-driven now)", () => {
    const l3 = keys(at("paladin", undefined, 3, [], true, "EDITION_2014"));
    expect(l3).not.toContain("divineSense");
    expect(l3).not.toContain("layOnHands");
    expect(l3).not.toContain("channelDivinity");
  });

  it("Paladin L1 gets divineSense/layOnHands (EDITION_2014, row-driven, #1909); L3 adds channelDivinity", () => {
    const l1 = keys(atRows("paladin", undefined, 1, [], true, "EDITION_2014"));
    expect(l1).toContain("divineSense");
    expect(l1).toContain("layOnHands");
    expect(l1).not.toContain("channelDivinity");

    const l3 = keys(atRows("paladin", undefined, 3, [], true, "EDITION_2014"));
    expect(l3).toContain("channelDivinity");
  });

  // #1229: divineSense is EDITION_2014-only — 2024 folds it into the base
  // Channel Divinity option "Channel Divinity: Divine Sense" instead (cast
  // through the abilities endpoint, not this actions dispatch). layOnHands
  // survives in both editions.
  it("Paladin L1 (EDITION_2024, row-driven, #1909): layOnHands present, divineSense absent", () => {
    const l1 = keys(atRows("paladin", undefined, 1, [], true, "EDITION_2024"));
    expect(l1).toContain("layOnHands");
    expect(l1).not.toContain("divineSense");
  });

  it("Bard L1 gets bardicInspiration; Cleric L2 gets channelDivinity (row-driven, #1909)", () => {
    expect(keys(atRows("bard", undefined, 1, []))).toContain("bardicInspiration");
    expect(keys(atRows("cleric", undefined, 2, []))).toContain("channelDivinity");
  });

  it("Druid L2 gets wildShape (row-driven, #1909); Rogue L2 gets cunningAction; Sorcerer L3 gets metamagic (row-driven, #1909)", () => {
    expect(keys(atRows("druid", undefined, 2, []))).toContain("wildShape");
    expect(keys(atRows("rogue", undefined, 2, []))).toContain("cunningAction");
    expect(keys(atRows("sorcerer", undefined, 3, []))).toContain("metamagic");
  });

  it("class gate: fighter result contains no barbarian-only actions", () => {
    const result = keys(atRows("fighter", undefined, 20, []));
    expect(result).not.toContain("rage");
    expect(result).not.toContain("recklessAttack");
    expect(result).not.toContain("flurryOfBlows");
  });

  // #1232 commit 2b: SRD 5.2 grants Metamagic at Sorcerer level 2, not
  // PHB'14's level 3 — sorcerer-features.ts's metamagic row forks its `level`
  // per edition (row-driven now, #1909; featuresFromRows-style filters on
  // edition before the class/level gate).
  it("Metamagic level fork (#1232): 2024 grants at L2, 2014 still grants at L3", () => {
    expect(keys(atRows("sorcerer", undefined, 2, [], true, "EDITION_2024"))).toContain("metamagic");
    expect(keys(atRows("sorcerer", undefined, 2, [], true, "EDITION_2014"))).not.toContain("metamagic");
    expect(keys(atRows("sorcerer", undefined, 3, [], true, "EDITION_2014"))).toContain("metamagic");
  });
});

describe("deriveActions — universal actions excluded", () => {
  it("does not include generic actions like attack/dodge/dash", () => {
    // Universal actions (attack, castSpell, dodge, etc.) are served per edition
    // by referenceRouter's universalActions (#1430) and must NOT also appear in
    // availableActions, or TurnHub would render each of them twice.
    const result = keys(atRows("fighter", undefined, 5, []));
    const universalKeys = ["attack", "castSpell", "dodge", "dash", "disengage", "help", "hide", "search", "ready"];
    for (const key of universalKeys) {
      expect(result).not.toContain(key);
    }
  });

  // The exclusion above can only ever pass, because no DERIVED_ACTIONS row sets
  // `universal` — so deleting matchesActionGate's guard would break nothing
  // observable. This is the latch, asserted against a synthetic record: the SAME
  // row with and without the flag, so a green "false" can only come from the
  // universal branch and not from a class/level gate (#1431).
  it("matchesActionGate rejects a universal record that every other gate accepts (#1431)", () => {
    const row = { key: "syntheticUniversal", name: "Synthetic", cost: "action" as const, grantClass: "rogue", grantLevel: 1 };
    expect(matchesActionGate(row, "rogue", undefined, 20, "EDITION_2024")).toBe(true);
    expect(matchesActionGate({ ...row, universal: true }, "rogue", undefined, 20, "EDITION_2024")).toBe(false);
  });
});

describe("deriveActions — regrants (#1431)", () => {
  const regrantsFor = (actions: AvailableAction[], key: string) =>
    actions.find((a) => a.key === key)?.regrants;

  it("Cunning Action re-costs Dash/Disengage/Hide for a rogue L2", () => {
    expect(regrantsFor(atRows("rogue", undefined, 2, []), "cunningAction")).toEqual([
      "dash",
      "disengage",
      "hide",
    ]);
  });

  it("carries the monk grants as data even though no card renders them", () => {
    const monkL10 = atRows("monk", undefined, 10, [pool("focus", 5)]);
    expect(regrantsFor(monkL10, "patientDefense")).toEqual(["disengage"]);
    expect(regrantsFor(monkL10, "patientDefenseFocus")).toEqual(["disengage", "dodge"]);
    expect(regrantsFor(monkL10, "stepOfTheWind")).toEqual(["dash"]);
    expect(regrantsFor(monkL10, "stepOfTheWindFocus")).toEqual(["disengage", "dash"]);
  });

  it("a row with no regrants omits the field entirely", () => {
    // Second Wind (formerly this test's fixture) is row-driven now (#1528) —
    // wildShape is row-driven too now (#1909), with no `regrants` column set.
    const wildShape = atRows("druid", undefined, 2, []).find((a) => a.key === "wildShape");
    expect(wildShape).toBeDefined();
    expect(wildShape).not.toHaveProperty("regrants");
  });

  // Every regranting row moved onto seeded ClassFeature rows (#1912) —
  // `summonBondedWeapon` (the one DERIVED_ACTIONS row left) regrants nothing,
  // so this is legitimately empty now. The row-level equivalent (every
  // ClassFeature row's own `regrants` union) is seed-data.test.ts's own drift
  // gate — a seed-side check, not this pure-TS-table one.
  it("REGRANTED_UNIVERSAL_KEYS is empty — DERIVED_ACTIONS regrants nothing (#1912)", () => {
    expect([...REGRANTED_UNIVERSAL_KEYS]).toEqual([]);
  });
});

describe("deriveActions — Fast Hands (Thief L3, #1431)", () => {
  it("a Thief rogue gets fastHands at L3, re-costing the object-use action", () => {
    const thief = atRows("rogue", "Thief", 3, []);
    expect(keys(thief)).toContain("fastHands");
    const row = thief.find((a) => a.key === "fastHands");
    expect(row?.cost).toBe("bonusAction");
    expect(row?.regrants).toEqual(["useObject"]);
    // Both editions spend Cunning Action's OWN Bonus Action, and no action-economy
    // field can express "these two cards share a slot" — so the reminder is the
    // only place that rule can be stated (SRD 5.1 / SRD 5.2, Thief: Fast Hands).
    expect(row?.reminder).toMatch(/Cunning Action/);
  });

  it("no fastHands below L3, for a non-Thief rogue, or for a rogue with no subclass", () => {
    expect(keys(atRows("rogue", "Thief", 2, []))).not.toContain("fastHands");
    expect(keys(atRows("rogue", "Assassin", 3, []))).not.toContain("fastHands");
    expect(keys(atRows("rogue", undefined, 3, []))).not.toContain("fastHands");
  });
});

describe("deriveActions — case-insensitivity", () => {
  it("matches class name regardless of case", () => {
    // Fighter (formerly this test's fixture) has no DERIVED_ACTIONS entries
    // left (#1528 — row-driven now); paladin/barbarian cover the same gate.
    // #1229: divineSense is EDITION_2014-only now, so this case-insensitivity
    // check passes the edition explicitly rather than relying on the
    // (still-2024) default. divineSense/channelDivinity are row-driven now
    // (#1909), so this uses `atRows`; Barbarian's own case here checks
    // recklessAttack, not rage — rage is row-driven now (#1686) and bare
    // `atRows()` (no featureRows carrier) can never see it; recklessAttack is
    // untouched (still a bare DERIVED_ACTIONS row, `at` stays correct there).
    expect(keys(atRows("Paladin", undefined, 1, [], true, "EDITION_2014"))).toContain("divineSense");
    expect(keys(atRows("PALADIN", undefined, 3, []))).toContain("channelDivinity");
    expect(keys(atRows("Barbarian", undefined, 2, []))).toContain("recklessAttack");
  });
});

describe("deriveActions — resource gating", () => {
  // rage's own enable/disable-by-pool coverage moved to the "Rage —
  // row-driven toggle (#1686)" describe block below (it's a row-driven
  // action now, not a bare DERIVED_ACTIONS entry) — flurryOfBlows here
  // already proves the SAME resolveEnablement mechanism against a
  // DERIVED_ACTIONS row.
  it("flurryOfBlows needs 1 focus: disabled with 'No focus remaining' at 0 (#1217)", () => {
    const actions = atRows("monk", undefined, 2, [pool("focus", 0)]);
    const flurry = actions.find((a) => a.key === "flurryOfBlows");
    expect(flurry?.enabled).toBe(false);
    expect(flurry?.disabledReason).toBe("No focus remaining");
  });

  it("flurryOfBlows is enabled when focus >= 1 (still usable without the Attack action)", () => {
    const actions = atRows("monk", undefined, 2, [pool("focus", 1)]);
    const flurry = actions.find((a) => a.key === "flurryOfBlows");
    expect(flurry?.enabled).toBe(true);
  });

  it("actions without a resourceKey are always enabled", () => {
    // recklessAttack has no resourceKey — should always be enabled.
    const actions = atRows("barbarian", undefined, 2, []);
    const reckless = actions.find((a) => a.key === "recklessAttack");
    expect(reckless?.enabled).toBe(true);
  });

  it("empty pools default to 0 remaining (action disabled)", () => {
    // No pool entry for "wildShape" → defaults to remaining=0 → disabled.
    // wildShape is row-driven now (#1909) — uses `atRows`; this is also the
    // enablement-fix's own regression pin, since wildShape's identity key
    // ("wildShape") happens to equal its cost pool key, unlike Metamagic.
    const actions = atRows("druid", undefined, 2, []);
    const wildShape = actions.find((a) => a.key === "wildShape");
    expect(wildShape?.enabled).toBe(false);
    expect(wildShape?.disabledReason).toBe("No wildShape remaining");
  });
});

describe("deriveActions — requiresUnarmored gate (Bonus Unarmed Strike, #1218)", () => {
  it("is enabled when unarmoredUnshielded is true (default)", () => {
    const actions = atRows("monk", undefined, 1, []);
    const bonusUnarmedStrike = actions.find((a) => a.key === "bonusUnarmedStrike");
    expect(bonusUnarmedStrike?.enabled).toBe(true);
    expect(bonusUnarmedStrike?.disabledReason).toBeUndefined();
  });

  it("is disabled with 'Requires no armor or Shield' when unarmoredUnshielded is false", () => {
    const actions = atRows("monk", undefined, 1, [], false);
    const bonusUnarmedStrike = actions.find((a) => a.key === "bonusUnarmedStrike");
    expect(bonusUnarmedStrike?.enabled).toBe(false);
    expect(bonusUnarmedStrike?.disabledReason).toBe("Requires no armor or Shield");
  });

  it("has no resourceKey — spends no resource", () => {
    const bonusUnarmedStrike = atRows("monk", undefined, 1, []).find(
      (a) => a.key === "bonusUnarmedStrike",
    );
    expect(bonusUnarmedStrike?.cost).toBe("bonusAction");
    expect(ACTION_EFFECT_FN.bonusUnarmedStrike({})).toEqual([]);
  });

  it("actions with no requiresUnarmored flag ignore the unarmoredUnshielded param", () => {
    // flurryOfBlows carries no requiresUnarmored — armored/shielded is
    // irrelevant to it (Rage, formerly this test's fixture, is row-driven
    // now — #1686 — and carries no requiresUnarmored either, but bare
    // `atRows()` can no longer see it at all).
    const actions = atRows("monk", undefined, 2, [pool("focus", 1)], false);
    const flurry = actions.find((a) => a.key === "flurryOfBlows");
    expect(flurry?.enabled).toBe(true);
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
    // actionSurge is row-driven now (#1528) — no ACTION_EFFECT_FN entry; its
    // pure-counter spend is covered by actions-cast.test.ts (routes).
    ["divineSense", "divineSense"],
  ];

  for (const [key, resourceKey] of singleResource) {
    it(`${key} → [spendResource key="${resourceKey}"]`, () => {
      const ops = ACTION_EFFECT_FN[key]({});
      expect(ops).toEqual([{ type: "spendResource", key: resourceKey }]);
    });
  }
});

// Rage/endRage retired from DERIVED_ACTIONS/ACTION_EFFECT_FN (#1686) — now a
// row-driven "toggle" (barbarian-features.ts), reached through
// deriveEntryScopedActions (toggleActionsFromRow) + toggleRowOps, off the
// SAME literal rows test-feature-rows.fixture.ts mirrors for barbarian-
// features.ts (literal-fixture-parity.test.ts pins level/description parity;
// this suite is the descriptor-column parity proof). Byte-identity with the
// retired closures (modifier/resistDamageTypes/rollEffects/spend shape) is
// also pinned end-to-end through the real HTTP route by
// routes/character/__tests__/actions-rage.test.ts, unmodified by this
// migration.
describe("Rage — row-driven toggle (#1686, retired from ACTION_EFFECT_FN)", () => {
  const rageRow = (edition: "EDITION_2014" | "EDITION_2024") =>
    testFeatureRowsFor("barbarian", undefined).classRows.find((r) => r.name === "Rage" && r.edition === edition)!;

  it("rage/endRage are absent from the bare DERIVED_ACTIONS table", () => {
    const l1 = keys(at("barbarian", undefined, 1, []));
    expect(l1).not.toContain("rage");
    expect(l1).not.toContain("endRage");
  });

  it("Barbarian L1 gets a row-driven rage/endRage pair (bonusAction, resolverKind toggle)", () => {
    const actions = deriveEntryScopedActions(
      [{ name: "barbarian", subclass: undefined, level: 1 }],
      1,
      [{ key: "rage", remaining: 2 }],
      true,
      "EDITION_2024",
      (e) => testFeatureRowsFor(e.name, undefined),
    );
    expect(actions.find((a) => a.key === "rage")).toMatchObject({ name: "Rage", cost: "bonusAction", resolverKind: "toggle", enabled: true });
    expect(actions.find((a) => a.key === "endRage")).toMatchObject({ name: "End Rage", cost: "bonusAction", resolverKind: "toggle", enabled: true });
  });

  it("rage is disabled with 'No rage remaining' at 0, while endRage stays enabled — same disabledReason text the retired DERIVED_ACTIONS row produced", () => {
    const actions = deriveEntryScopedActions(
      [{ name: "barbarian", subclass: undefined, level: 1 }],
      1,
      [{ key: "rage", remaining: 0 }],
      true,
      "EDITION_2024",
      (e) => testFeatureRowsFor(e.name, undefined),
    );
    expect(actions.find((a) => a.key === "rage")).toMatchObject({ enabled: false, disabledReason: "No rage remaining" });
    expect(actions.find((a) => a.key === "endRage")).toMatchObject({ enabled: true });
  });

  it("activation applies a while-active meleeDamage buff carrying b/p/s resistance + advantage on Strength checks/saves — same shape the retired ACTION_EFFECT_FN.rage closure hand-rolled", () => {
    const ops = toggleRowOps(rageRow("EDITION_2024"), { level: 1, abilityScores: {}, profBonus: 2 }, false);
    expect(ops).toEqual([
      {
        type: "applyBuff",
        buff: {
          key: "rage",
          target: "meleeDamage",
          modifier: 2,
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

  it("the melee-damage bonus scales +2 / +3 / +4 by the granting entry's level — the tiered effectBuffs modifier replacing the retired rageMeleeDamageBonus function", () => {
    const modifierAt = (level: number) =>
      (toggleRowOps(rageRow("EDITION_2024"), { level, abilityScores: {}, profBonus: 2 }, false)[0] as { buff: { modifier: number } }).buff.modifier;
    expect(modifierAt(1)).toBe(2);
    expect(modifierAt(8)).toBe(2);
    expect(modifierAt(9)).toBe(3);
    expect(modifierAt(15)).toBe(3);
    expect(modifierAt(16)).toBe(4);
    expect(modifierAt(20)).toBe(4);
  });

  it("endRage clears the rage buff by key, same reason text as the retired ACTION_EFFECT_FN.endRage (manual + auto turn-hook both route here)", () => {
    expect(toggleRowOps(rageRow("EDITION_2024"), { level: 1, abilityScores: {}, profBonus: 2 }, true)).toEqual([
      { type: "clearBuff", key: "rage", reason: "Rage ended" },
    ]);
  });

  it("the 2014 Rage row carries the identical buff shape (edition-invariant mechanic)", () => {
    const ops = toggleRowOps(rageRow("EDITION_2014"), { level: 9, abilityScores: {}, profBonus: 4 }, false);
    const buff = (ops[0] as { buff: { modifier: number; resistDamageTypes?: string[] } }).buff;
    expect(buff.modifier).toBe(3);
    expect(buff.resistDamageTypes).toEqual(["bludgeoning", "piercing", "slashing"]);
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
    const l2 = keys(atRows("monk", undefined, 2, []));
    expect(l2).toEqual(
      expect.arrayContaining(["patientDefense", "patientDefenseFocus", "stepOfTheWind", "stepOfTheWindFocus"]),
    );
  });

  it("free variants are always enabled — no resourceKey gate — regardless of remaining focus", () => {
    const noFocus = atRows("monk", undefined, 2, [pool("focus", 0)]);
    const patientFree = noFocus.find((a) => a.key === "patientDefense");
    const stepFree = noFocus.find((a) => a.key === "stepOfTheWind");
    expect(patientFree?.enabled).toBe(true);
    expect(stepFree?.enabled).toBe(true);
  });

  it("Focus variants are gated on 1 remaining focus, like any other resource-gated action", () => {
    const noFocus = atRows("monk", undefined, 2, [pool("focus", 0)]);
    expect(noFocus.find((a) => a.key === "patientDefenseFocus")?.enabled).toBe(false);
    expect(noFocus.find((a) => a.key === "stepOfTheWindFocus")?.enabled).toBe(false);

    const withFocus = atRows("monk", undefined, 2, [pool("focus", 1)]);
    expect(withFocus.find((a) => a.key === "patientDefenseFocus")?.enabled).toBe(true);
    expect(withFocus.find((a) => a.key === "stepOfTheWindFocus")?.enabled).toBe(true);
  });

  it("Patient Defense reminders name Disengage-only free vs Disengage+Dodge paid", () => {
    const l2 = atRows("monk", undefined, 2, [pool("focus", 1)]);
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
    const l2 = atRows("monk", undefined, 2, [pool("focus", 1)]);
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
    expect(ACTION_EFFECT_FN.stepOfTheWind).toBeUndefined();
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
    const l9 = atRows("monk", undefined, 9, [pool("focus", 1)]);
    const l10 = atRows("monk", undefined, 10, [pool("focus", 1)]);
    expect(l9.find((a) => a.key === "patientDefenseFocus")?.reminder).not.toMatch(/temporary hit points/i);
    expect(l10.find((a) => a.key === "patientDefenseFocus")?.reminder).toMatch(/temporary hit points/i);
    expect(l10.find((a) => a.key === "patientDefenseFocus")?.reminder).toMatch(/martial arts die/i);
  });

  it("stepOfTheWindFocus reminder names the move-a-willing-creature rider only at monk L10+", () => {
    const l9 = atRows("monk", undefined, 9, [pool("focus", 1)]);
    const l10 = atRows("monk", undefined, 10, [pool("focus", 1)]);
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
    expect(keys(atRows("monk", undefined, 4, []))).not.toContain("stunningStrike");
    expect(keys(atRows("monk", undefined, 5, []))).not.toContain("stunningStrike");
    expect(keys(atRows("monk", undefined, 20, []))).not.toContain("stunningStrike");
  });

  it("has no ACTION_EFFECT_FN entry (post-hit rider, not a selectable action)", () => {
    expect(ACTION_EFFECT_FN.stunningStrike).toBeUndefined();
  });
});

describe("Warrior of Shadow — Shadow Step (2024 rewrite, #1246)", () => {
  const SHADOW = "Warrior of Shadow";

  it("Shadow monk gets shadowStep as a bonus action at L6, not at L5", () => {
    expect(keys(atRows("monk", SHADOW, 5, []))).not.toContain("shadowStep");
    const l6 = atRows("monk", SHADOW, 6, []);
    const shadowStep = l6.find((a) => a.key === "shadowStep");
    expect(shadowStep).toBeDefined();
    expect(shadowStep?.cost).toBe("bonusAction");
  });

  it("is always enabled (no resourceKey gate)", () => {
    const l17 = atRows("monk", SHADOW, 17, []);
    const shadowStep = l17.find((a) => a.key === "shadowStep");
    expect(shadowStep?.enabled).toBe(true);
    expect(shadowStep?.disabledReason).toBeUndefined();
  });

  it("has no opportunist entry at any level (2014 L17 feature retired)", () => {
    for (const level of [17, 20]) {
      expect(keys(atRows("monk", SHADOW, level, []))).not.toContain("opportunist");
    }
  });

  it("subclass gate: a non-Shadow monk doesn't get shadowStep at L17", () => {
    const openHand = keys(atRows("monk", "Warrior of the Open Hand", 17, []));
    expect(openHand).not.toContain("shadowStep");
    const noSub = keys(atRows("monk", undefined, 17, []));
    expect(noSub).not.toContain("shadowStep");
  });

  it("class gate: a non-monk doesn't get shadowStep even with a Shadow-like subclass", () => {
    // An explicit empty row carrier, not atRows/testFeatureRowsFor: that
    // fixture's subclass-name key is flat ACROSS all twelve classes (its own
    // header warns "testFeatureRowsFor('fighter','life domain') would
    // silently hand back Cleric rows"), so calling it with rogue + a monk
    // subclass NAME would hit exactly that collision — a fixture artifact,
    // not evidence about the real gate. Production's row-driven actions are
    // scoped by the DB's classId FK, an entirely different mechanism from
    // matchesActionGate's class-name check.
    const emptyRows = () => ({ classRows: [], subclassRows: [] });
    const rogue = keys(
      deriveEntryScopedActions([{ name: "rogue", subclass: SHADOW, level: 20 }], 20, [], true, "EDITION_2024", emptyRows),
    );
    expect(rogue).not.toContain("shadowStep");
  });

  it("matches the subclass NAME case-insensitively", () => {
    expect(keys(atRows("Monk", "warrior of shadow", 6, []))).toContain("shadowStep");
  });

  it("carries its rule text as a reminder for in-session surfacing", () => {
    const l6 = atRows("monk", SHADOW, 6, []);
    const shadowStep = l6.find((a) => a.key === "shadowStep");
    expect(shadowStep?.reminder).toMatch(/teleport/i);
    expect(shadowStep?.reminder).toMatch(/dim light|darkness/i);
    expect(shadowStep?.reminder).toMatch(/unarmed strike/i);
  });

  it("Improved Shadow Step (L11) upgrades the reminder in place — no separate catalog row", () => {
    const l10 = atRows("monk", SHADOW, 10, []).find((a) => a.key === "shadowStep");
    const l11 = atRows("monk", SHADOW, 11, []).find((a) => a.key === "shadowStep");
    expect(l10?.reminder).not.toMatch(/1 focus/i);
    expect(l11?.reminder).toMatch(/1 focus/i);
    expect(keys(atRows("monk", SHADOW, 11, []))).not.toContain("improvedShadowStep");
  });

  it("resource-gated class actions carry no reminder (reminder is Shadow-only)", () => {
    const flurry = atRows("monk", SHADOW, 17, []).find((a) => a.key === "flurryOfBlows");
    expect(flurry?.reminder).toBeUndefined();
  });

  it("is a pure reminder action — no server effect fn (no ACTION_EFFECT_FN entry)", () => {
    expect(ACTION_EFFECT_FN.shadowStep).toBeUndefined();
  });
});

describe("Monk Deflect Attacks / Deflect Energy (#1241)", () => {
  it("is granted at monk L3 as a reaction with no resourceKey (free reminder, base reduction costs nothing)", () => {
    expect(keys(atRows("monk", undefined, 2, []))).not.toContain("deflectAttacks");
    const l3 = atRows("monk", undefined, 3, []);
    const deflect = l3.find((a) => a.key === "deflectAttacks");
    expect(deflect).toBeDefined();
    expect(deflect?.cost).toBe("reaction");
    expect(deflect?.enabled).toBe(true);
    expect(deflect?.disabledReason).toBeUndefined();
  });

  it("carries its rule text as a reminder for in-session surfacing", () => {
    const deflect = atRows("monk", undefined, 3, []).find((a) => a.key === "deflectAttacks");
    expect(deflect?.reminder).toMatch(/bludgeoning, piercing, or slashing/i);
    expect(deflect?.reminder).toMatch(/reaction/i);
  });

  it("is a pure reminder action — no server effect fn for the base reduction", () => {
    // Mirrors Warrior of Shadow's shadowStep (#1246): the client rolls
    // 1d10 + Dex + monk level and never calls the transactions endpoint for the
    // base reduction (nothing persisted). Only the redirect spends Focus.
    expect(ACTION_EFFECT_FN.deflectAttacks).toBeUndefined();
  });

  it("deflectAttacksRedirect is granted at monk L3 as a free-cost Focus spend", () => {
    expect(keys(atRows("monk", undefined, 2, []))).not.toContain("deflectAttacksRedirect");
    const l3 = atRows("monk", undefined, 3, [pool("focus", 3)]);
    const redirect = l3.find((a) => a.key === "deflectAttacksRedirect");
    expect(redirect).toBeDefined();
    expect(redirect?.cost).toBe("free");
    expect(redirect?.enabled).toBe(true);
  });

  it("deflectAttacksRedirect is disabled with no Focus remaining", () => {
    const redirect = atRows("monk", undefined, 3, [pool("focus", 0)]).find(
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
    const fighter = keys(atRows("fighter", undefined, 20, []));
    expect(fighter).not.toContain("deflectAttacks");
    expect(fighter).not.toContain("deflectAttacksRedirect");
  });

  it("resolves damageTypeClause server-side (#1505) — B/P/S below L13, any damage type at L13+", () => {
    const l3 = atRows("monk", undefined, 3, []).find((a) => a.key === "deflectAttacks");
    expect(l3?.damageTypeClause).toBe("bludgeoning, piercing, or slashing damage");
    const l13 = atRows("monk", undefined, 13, []).find((a) => a.key === "deflectAttacks");
    expect(l13?.damageTypeClause).toBe("any damage type");
  });

  it("damageTypeClause resolves off the Monk entry's own level for a multiclass character (Monk 3 / Fighter 10)", () => {
    const entries = [
      { name: "monk", level: 3 },
      { name: "fighter", level: 10 },
    ];
    // deflectAttacks is row-driven now (#1912) — needs the featureRows carrier.
    const actions = deriveEntryScopedActions(entries, 13, [], true, "EDITION_2024", (e) =>
      testFeatureRowsFor(e.name, undefined),
    );
    expect(actions.find((a) => a.key === "deflectAttacks")?.damageTypeClause).toBe(
      "bludgeoning, piercing, or slashing damage",
    );
  });
});

describe("Flurry of Blows strike count (#1505) — resolved server-side, never a client threshold", () => {
  it("2024: count is 2 below Heightened Focus (monk L10) and 3 at L10+", () => {
    expect(atRows("monk", undefined, 9, [pool("focus", 1)]).find((a) => a.key === "flurryOfBlows")?.count).toBe(2);
    expect(atRows("monk", undefined, 10, [pool("focus", 1)]).find((a) => a.key === "flurryOfBlows")?.count).toBe(3);
    expect(atRows("monk", undefined, 20, [pool("focus", 1)]).find((a) => a.key === "flurryOfBlows")?.count).toBe(3);
  });

  it("2014: count is a flat 2 at every level — no Heightened Focus upgrade exists", () => {
    const l2 = atRows("monk", undefined, 2, [pool("ki", 1)], true, "EDITION_2014").find((a) => a.key === "flurryOfBlows");
    const l10 = atRows("monk", undefined, 10, [pool("ki", 1)], true, "EDITION_2014").find((a) => a.key === "flurryOfBlows");
    const l20 = atRows("monk", undefined, 20, [pool("ki", 1)], true, "EDITION_2014").find((a) => a.key === "flurryOfBlows");
    expect(l2?.count).toBe(2);
    expect(l10?.count).toBe(2);
    expect(l20?.count).toBe(2);
  });

  it("count resolves off the Monk entry's own level for a multiclass 2024 character (Monk 10 / Fighter 5)", () => {
    const entries = [
      { name: "monk", level: 10 },
      { name: "fighter", level: 5 },
    ];
    // flurryOfBlows is row-driven now (#1912) — needs the featureRows carrier.
    const actions = deriveEntryScopedActions(entries, 15, [pool("focus", 1)], true, "EDITION_2024", (e) =>
      testFeatureRowsFor(e.name, undefined),
    );
    expect(actions.find((a) => a.key === "flurryOfBlows")?.count).toBe(3);
  });
});

describe("2014 Monk ki actions — Flurry of Blows / Patient Defense / Step of the Wind (#1500)", () => {
  it("2014 monk L2 gets flurryOfBlows/patientDefenseKi/stepOfTheWindKi, each resourceKey ki amount 1 — and NOT the 2024 free/paid pair", () => {
    const l2 = atRows("monk", undefined, 2, [pool("ki", 2)], true, "EDITION_2014");
    const l2Keys = keys(l2);
    expect(l2Keys).toContain("flurryOfBlows");
    expect(l2Keys).toContain("patientDefenseKi");
    expect(l2Keys).toContain("stepOfTheWindKi");
    expect(l2Keys).not.toContain("patientDefense");
    expect(l2Keys).not.toContain("patientDefenseFocus");
    expect(l2Keys).not.toContain("stepOfTheWind");
    expect(l2Keys).not.toContain("stepOfTheWindFocus");

    for (const key of ["flurryOfBlows", "patientDefenseKi", "stepOfTheWindKi"]) {
      const action = l2.find((a) => a.key === key);
      expect(action, key).toBeDefined();
      expect(action?.cost, key).toBe("bonusAction");
    }
  });

  it("exactly one 2014 Patient Defense row and one 2014 Step of the Wind row — never two menu entries like 2024", () => {
    const l2 = keys(atRows("monk", undefined, 2, [], true, "EDITION_2014"));
    expect(l2.filter((k) => k === "patientDefenseKi")).toHaveLength(1);
    expect(l2.filter((k) => k === "stepOfTheWindKi")).toHaveLength(1);
  });

  it("all three are gated on 1 remaining ki, like any other resource-gated action", () => {
    const noKi = atRows("monk", undefined, 2, [pool("ki", 0)], true, "EDITION_2014");
    for (const key of ["flurryOfBlows", "patientDefenseKi", "stepOfTheWindKi"]) {
      const action = noKi.find((a) => a.key === key);
      expect(action?.enabled, key).toBe(false);
      expect(action?.disabledReason, key).toBe("No ki remaining");
    }
    const withKi = atRows("monk", undefined, 2, [pool("ki", 1)], true, "EDITION_2014");
    for (const key of ["flurryOfBlows", "patientDefenseKi", "stepOfTheWindKi"]) {
      expect(withKi.find((a) => a.key === key)?.enabled, key).toBe(true);
    }
  });

  it("flurryOfBlows spends the EDITION-CORRECT pool via ctx.edition — ki for 2014, focus for 2024 (#1500)", () => {
    expect(ACTION_EFFECT_FN.flurryOfBlows({ edition: "EDITION_2014" })).toEqual([
      { type: "spendResource", key: "ki" },
    ]);
    expect(ACTION_EFFECT_FN.flurryOfBlows({ edition: "EDITION_2024" })).toEqual([
      { type: "spendResource", key: "focus" },
    ]);
  });

  it("patientDefenseKi/stepOfTheWindKi each spend exactly 1 ki", () => {
    expect(ACTION_EFFECT_FN.patientDefenseKi({})).toEqual([{ type: "spendResource", key: "ki" }]);
    expect(ACTION_EFFECT_FN.stepOfTheWindKi({})).toEqual([{ type: "spendResource", key: "ki" }]);
  });

  it("class gate: a non-monk gets none of the three keys", () => {
    const fighter = keys(atRows("fighter", undefined, 20, [], true, "EDITION_2014"));
    expect(fighter).not.toContain("flurryOfBlows");
    expect(fighter).not.toContain("patientDefenseKi");
    expect(fighter).not.toContain("stepOfTheWindKi");
  });
});

describe("2014 Monk Deflect Missiles (#1500)", () => {
  it("is granted at monk L3 as a reaction with no resourceKey (free reminder, base reduction costs nothing) — ranged only", () => {
    expect(keys(atRows("monk", undefined, 2, [], true, "EDITION_2014"))).not.toContain("deflectMissiles");
    const l3 = atRows("monk", undefined, 3, [], true, "EDITION_2014");
    const deflect = l3.find((a) => a.key === "deflectMissiles");
    expect(deflect).toBeDefined();
    expect(deflect?.cost).toBe("reaction");
    expect(deflect?.enabled).toBe(true);
    expect(deflect?.reminder).toMatch(/ranged weapon attack/i);
  });

  it("is a pure reminder action — no server effect fn for the base reduction", () => {
    expect(ACTION_EFFECT_FN.deflectMissiles).toBeUndefined();
  });

  it("deflectMissilesThrow is granted at monk L3, costs 1 ki, and spends it", () => {
    const l3 = atRows("monk", undefined, 3, [pool("ki", 3)], true, "EDITION_2014");
    const throwBack = l3.find((a) => a.key === "deflectMissilesThrow");
    expect(throwBack).toBeDefined();
    expect(throwBack?.cost).toBe("free");
    expect(throwBack?.enabled).toBe(true);
    expect(ACTION_EFFECT_FN.deflectMissilesThrow({})).toEqual([{ type: "spendResource", key: "ki" }]);
  });

  it("deflectMissilesThrow is disabled with no ki remaining", () => {
    const throwBack = atRows("monk", undefined, 3, [pool("ki", 0)], true, "EDITION_2014").find(
      (a) => a.key === "deflectMissilesThrow",
    );
    expect(throwBack?.enabled).toBe(false);
  });

  it("neither deflectAttacks/deflectAttacksRedirect (2024) is served to a 2014 monk, and vice versa", () => {
    const monk2014 = keys(atRows("monk", undefined, 20, [pool("ki", 20)], true, "EDITION_2014"));
    expect(monk2014).not.toContain("deflectAttacks");
    expect(monk2014).not.toContain("deflectAttacksRedirect");
    const monk2024 = keys(atRows("monk", undefined, 20, [pool("focus", 20)], true, "EDITION_2024"));
    expect(monk2024).not.toContain("deflectMissiles");
    expect(monk2024).not.toContain("deflectMissilesThrow");
  });
});

describe("2014 Monk Empty Body (L18, #1500) — gating/reminder rows, no dedicated cast vertical yet", () => {
  it("emptyBody (4 ki) and emptyBodyAstralProjection (8 ki) are granted at L18, not L17", () => {
    expect(keys(atRows("monk", undefined, 17, [], true, "EDITION_2014"))).not.toContain("emptyBody");
    const l18 = atRows("monk", undefined, 18, [pool("ki", 18)], true, "EDITION_2014");
    const body = l18.find((a) => a.key === "emptyBody");
    const astral = l18.find((a) => a.key === "emptyBodyAstralProjection");
    expect(body?.enabled).toBe(true);
    expect(astral?.enabled).toBe(true);
  });

  it("each is disabled below its own ki cost", () => {
    const l18 = atRows("monk", undefined, 18, [pool("ki", 5)], true, "EDITION_2014");
    expect(l18.find((a) => a.key === "emptyBody")?.enabled).toBe(true); // 5 >= 4
    expect(l18.find((a) => a.key === "emptyBodyAstralProjection")?.enabled).toBe(false); // 5 < 8
  });

  it("neither has an ACTION_EFFECT_FN entry — reminder-only, like shadowArts/cloakOfShadows", () => {
    expect(ACTION_EFFECT_FN.emptyBody).toBeUndefined();
    expect(ACTION_EFFECT_FN.emptyBodyAstralProjection).toBeUndefined();
  });
});

// #1499/#1500: the class-derivation layer's edition axis. Six base-class
// monk rows are EDITION_2024-only (patientDefense/patientDefenseFocus/
// stepOfTheWind/stepOfTheWindFocus/deflectAttacks/deflectAttacksRedirect —
// no 2014 shape resembles the 2024 free/paid-pair or melee+ranged model);
// flurryOfBlows is tagged for BOTH editions now under the SAME key (#1500,
// mirrors Lay on Hands) rather than being 2024-exclusive; bonusUnarmedStrike
// stays deliberately shared/untagged.
describe("DERIVED_ACTIONS edition axis — 2014 Monk gets none of the six 2024-only rows (#1499/#1500)", () => {
  const TAGGED_2024_ONLY_ROWS = [
    "patientDefense",
    "patientDefenseFocus",
    "stepOfTheWind",
    "stepOfTheWindFocus",
    "deflectAttacks",
    "deflectAttacksRedirect",
  ];

  it("a level-20 EDITION_2014 monk has none of the six 2024-only rows", () => {
    const l20 = keys(
      atRows("monk", undefined, 20, [pool("focus", 20), pool("wholenessOfBody", 5)], true, "EDITION_2014"),
    );
    for (const key of TAGGED_2024_ONLY_ROWS) {
      expect(l20).not.toContain(key);
    }
  });

  it("the same 2014 monk still has bonusUnarmedStrike (shared) and its OWN flurryOfBlows/patientDefenseKi/stepOfTheWindKi rows (#1500)", () => {
    const l20 = keys(atRows("monk", undefined, 20, [pool("ki", 20)], true, "EDITION_2014"));
    expect(l20).toContain("bonusUnarmedStrike");
    expect(l20).toContain("flurryOfBlows");
    expect(l20).toContain("patientDefenseKi");
    expect(l20).toContain("stepOfTheWindKi");
  });

  it("a level-20 EDITION_2024 monk is unaffected — has every one of the six 2024-only rows plus flurryOfBlows", () => {
    const l20 = keys(
      atRows("monk", undefined, 20, [pool("focus", 20), pool("wholenessOfBody", 5)], true, "EDITION_2024"),
    );
    for (const key of TAGGED_2024_ONLY_ROWS) {
      expect(l20).toContain(key);
    }
    expect(l20).toContain("bonusUnarmedStrike");
    expect(l20).toContain("flurryOfBlows");
    expect(l20).not.toContain("patientDefenseKi");
    expect(l20).not.toContain("stepOfTheWindKi");
  });

  // Extends the #1431 synthetic-record test onto the edition axis: the SAME
  // row with and without an edition tag, so a green "false" can only come from
  // the edition branch and not from a class/level/subclass gate.
  it("matchesActionGate rejects a row tagged for the other edition (#1499)", () => {
    const row = { key: "synthetic2024", name: "Synthetic", cost: "action" as const, grantClass: "monk", grantLevel: 1 };
    expect(matchesActionGate(row, "monk", undefined, 20, "EDITION_2014")).toBe(true);
    expect(matchesActionGate({ ...row, edition: "EDITION_2024" as const }, "monk", undefined, 20, "EDITION_2014")).toBe(false);
    expect(matchesActionGate({ ...row, edition: "EDITION_2024" as const }, "monk", undefined, 20, "EDITION_2024")).toBe(true);
  });

  it("actionGrantLevel resolves flurryOfBlows for BOTH editions now (#1500 — was EDITION_2014-undefined before this slice)", () => {
    // flurryOfBlows/bonusUnarmedStrike/patientDefenseKi/stepOfTheWindKi are
    // all row-driven now (#1912) — actionGrantLevel needs the row list as its
    // 3rd argument to resolve a key that isn't in DERIVED_ACTIONS any more.
    const { classRows, subclassRows } = testFeatureRowsFor("monk", undefined);
    const rows = [...classRows, ...subclassRows];
    expect(actionGrantLevel("flurryOfBlows", "EDITION_2024", rows)).toBe(2);
    expect(actionGrantLevel("flurryOfBlows", "EDITION_2014", rows)).toBe(2);
    // bonusUnarmedStrike is untagged (shared) — resolves for both editions.
    expect(actionGrantLevel("bonusUnarmedStrike", "EDITION_2014", rows)).toBe(1);
    expect(actionGrantLevel("bonusUnarmedStrike", "EDITION_2024", rows)).toBe(1);
    // patientDefenseKi/stepOfTheWindKi are EDITION_2014-only.
    expect(actionGrantLevel("patientDefenseKi", "EDITION_2014", rows)).toBe(2);
    expect(actionGrantLevel("patientDefenseKi", "EDITION_2024", rows)).toBeUndefined();
    expect(actionGrantLevel("stepOfTheWindKi", "EDITION_2014", rows)).toBe(2);
    expect(actionGrantLevel("stepOfTheWindKi", "EDITION_2024", rows)).toBeUndefined();
  });
});

// A synthetic Second Wind row (EDITION_2014 shape) matching
// prisma/seed/fighter-features.ts's authored descriptor columns — the
// row-driven counterpart to ACTION_CAST_FN's retired secondWind closure (#1528).
function secondWindRow(): ClassFeatureRow {
  return {
    name: "Second Wind",
    level: 1,
    description: "As a bonus action, regain 1d10 + your fighter level HP.",
    edition: "EDITION_2014",
    resourceKey: "secondWind",
    resourceRecharge: "short-or-long",
    resourceTotals: [{ minLevel: 1, total: 1 }],
    activationCost: "bonusAction",
    resolverKind: "heal-roll",
    costKind: "pool",
    costPoolKey: "secondWind",
    costBase: 1,
    effectKind: "heal",
    effectDiceCount: 1,
    effectDiceFaces: 10,
    effectModifierSource: "classLevel",
  };
}

describe("castSpecFromRow — Second Wind, row-driven (#1528, retired ACTION_CAST_FN)", () => {
  it("is row-driven now, not an ACTION_EFFECT_FN op-list action", () => {
    expect(ACTION_EFFECT_FN.secondWind).toBeUndefined();
  });

  it("spends the secondWind pool (base 1), rolls 1d10 + Fighter level server-side, and self-heals the total", () => {
    const { spec, roll } = castSpecFromRow(secondWindRow(), 3, () => 7); // fixed die roll of 7
    expect(spec.name).toBe("Second Wind");
    expect(spec.cost).toEqual({ kind: "pool", key: "secondWind", base: 1 });
    expect(spec.effect.effectType).toBe("heal");
    expect(spec.effect.dice).toEqual({ count: 1, faces: 10, modifier: 0 });
    expect(roll).toBe(10); // 7 (die) + 3 (level)
    expect(spec.apply).toEqual({ target: "self", kind: "heal", amount: 10 });
  });

  it("a die roll of 0 with level 0 applies no heal (self-apply is guarded on amount > 0)", () => {
    const { spec, roll } = castSpecFromRow(secondWindRow(), 0, () => 0);
    expect(roll).toBe(0);
    expect(spec.apply).toBeUndefined();
  });

  // Mutation proof (#1528's own AC): changing the SEEDED modifierSource
  // changes the served heal with no frontend edit — effectModifierSource is
  // read purely off the row, so a level-14 cast with the axis REMOVED must
  // roll noticeably lower than the SAME cast with it present, for the exact
  // die roll fixed in both branches.
  it("mutation proof: removing the row's effectModifierSource drops the level term from the served roll", () => {
    const withAxis = castSpecFromRow(secondWindRow(), 14, () => 4);
    expect(withAxis.roll).toBe(18); // 4 (die) + 14 (level)

    const rowWithoutAxis: ClassFeatureRow = { ...secondWindRow(), effectModifierSource: undefined };
    const withoutAxis = castSpecFromRow(rowWithoutAxis, 14, () => 4);
    expect(withoutAxis.roll).toBe(4); // die only — the level term never applied
  });
});

describe("Action Surge stays a counter, row-driven (#1528, retired ACTION_CAST_FN/ACTION_EFFECT_FN entries)", () => {
  it("has no ACTION_EFFECT_FN entry — the pure-counter spend is dispatched via the row's costKind, not this table", () => {
    // The extra-action grant is client-side (grantExtraAction) — nothing to
    // apply server-side; routes/character/__tests__/actions-cast.test.ts
    // covers the end-to-end spend through the row-driven dispatcher.
    expect(ACTION_EFFECT_FN.actionSurge).toBeUndefined();
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
    expect(keys(atRows("monk", OPEN_HAND, 5, []))).not.toContain("wholenessOfBody");
    const l6 = atRows("monk", OPEN_HAND, 6, []);
    const wholeness = l6.find((a) => a.key === "wholenessOfBody");
    expect(wholeness).toBeDefined();
    expect(wholeness?.cost).toBe("bonusAction");
  });

  it("wholenessOfBody is gated on the wholenessOfBody pool like any other resource-gated action", () => {
    const noUses = atRows("monk", OPEN_HAND, 6, [pool("wholenessOfBody", 0)]);
    expect(noUses.find((a) => a.key === "wholenessOfBody")?.enabled).toBe(false);
    const withUses = atRows("monk", OPEN_HAND, 6, [pool("wholenessOfBody", 1)]);
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
    expect(keys(atRows("monk", OPEN_HAND, 10, []))).not.toContain("fleetStep");
    const l11 = atRows("monk", OPEN_HAND, 11, []);
    const fleetStep = l11.find((a) => a.key === "fleetStep");
    expect(fleetStep).toBeDefined();
    expect(fleetStep?.cost).toBe("free");
    expect(fleetStep?.enabled).toBe(true);
    expect(fleetStep?.reminder).toMatch(/step of the wind/i);
  });

  it("fleetStep is a pure reminder — no server effect fn (like recklessAttack/metamagic's free cost siblings)", () => {
    expect(ACTION_EFFECT_FN.fleetStep).toBeUndefined();
  });

  it("subclass gate: a non-Open-Hand monk gets neither at L11+", () => {
    const shadow = keys(atRows("monk", "Warrior of Shadow", 17, []));
    expect(shadow).not.toContain("wholenessOfBody");
    expect(shadow).not.toContain("fleetStep");
    const noSub = keys(atRows("monk", undefined, 17, []));
    expect(noSub).not.toContain("wholenessOfBody");
    expect(noSub).not.toContain("fleetStep");
  });

  it("Open Hand Technique and Quivering Palm are post-hit riders, not catalog actions", () => {
    const l20 = keys(atRows("monk", OPEN_HAND, 20, []));
    expect(l20).not.toContain("openHandTechnique");
    expect(l20).not.toContain("quiveringPalm");
    expect(ACTION_EFFECT_FN.openHandTechnique).toBeUndefined();
    expect(ACTION_EFFECT_FN.quiveringPalm).toBeUndefined();
  });
});

describe("Way of the Open Hand — 2014 Wholeness of Body / Tranquility (#1501)", () => {
  const WAY_OPEN_HAND = "Way of the Open Hand";
  const edition = "EDITION_2014" as const;

  it("2014 monk gets wholenessOfBodyAction as an ACTION at L6, not at L5 — never the 2024 bonusAction key", () => {
    expect(keys(atRows("monk", WAY_OPEN_HAND, 5, [], true, edition))).not.toContain("wholenessOfBodyAction");
    const l6 = atRows("monk", WAY_OPEN_HAND, 6, [], true, edition);
    const wholeness = l6.find((a) => a.key === "wholenessOfBodyAction");
    expect(wholeness).toBeDefined();
    expect(wholeness?.cost).toBe("action");
    expect(keys(l6)).not.toContain("wholenessOfBody");
  });

  it("wholenessOfBodyAction is gated on the SAME wholenessOfBody pool as the 2024 key", () => {
    const noUses = atRows("monk", WAY_OPEN_HAND, 6, [pool("wholenessOfBody", 0)], true, edition);
    expect(noUses.find((a) => a.key === "wholenessOfBodyAction")?.enabled).toBe(false);
    const withUses = atRows("monk", WAY_OPEN_HAND, 6, [pool("wholenessOfBody", 1)], true, edition);
    expect(withUses.find((a) => a.key === "wholenessOfBodyAction")?.enabled).toBe(true);
  });

  it("ACTION_EFFECT_FN.wholenessOfBodyAction: with roll=18, spends 1 use and heals 18 (mirrors the 2024 handler's shape)", () => {
    expect(ACTION_EFFECT_FN.wholenessOfBodyAction({ roll: 18 })).toEqual([
      { type: "spendResource", key: "wholenessOfBody" },
      { type: "heal", amount: 18 },
    ]);
  });

  it("ACTION_EFFECT_FN.wholenessOfBodyAction: without a roll, spends the use but heals nothing", () => {
    expect(ACTION_EFFECT_FN.wholenessOfBodyAction({})).toEqual([
      { type: "spendResource", key: "wholenessOfBody" },
    ]);
  });

  it("2014 monk gets tranquility as a free-cost reminder at L11, not at L10", () => {
    expect(keys(atRows("monk", WAY_OPEN_HAND, 10, [], true, edition))).not.toContain("tranquility");
    const l11 = atRows("monk", WAY_OPEN_HAND, 11, [], true, edition);
    const tranquility = l11.find((a) => a.key === "tranquility");
    expect(tranquility).toBeDefined();
    expect(tranquility?.cost).toBe("free");
    expect(tranquility?.enabled).toBe(true);
    expect(tranquility?.reminder).toMatch(/sanctuary/i);
  });

  it("tranquility is a pure reminder — no server effect fn", () => {
    expect(ACTION_EFFECT_FN.tranquility).toBeUndefined();
  });

  it("a 2024 monk never sees the 2014 keys, and vice versa", () => {
    const openHand2024 = keys(atRows("monk", "Warrior of the Open Hand", 20, [pool("wholenessOfBody", 5)]));
    expect(openHand2024).not.toContain("wholenessOfBodyAction");
    expect(openHand2024).not.toContain("tranquility");

    const wayOpenHand2014 = keys(atRows("monk", WAY_OPEN_HAND, 20, [pool("wholenessOfBody", 5)], true, edition));
    expect(wayOpenHand2014).not.toContain("wholenessOfBody");
    expect(wayOpenHand2014).not.toContain("fleetStep");
  });

  it("subclass gate: a non-Way-of-the-Open-Hand 2014 monk gets neither key", () => {
    const shadow = keys(atRows("monk", "Warrior of Shadow", 17, [], true, edition));
    expect(shadow).not.toContain("wholenessOfBodyAction");
    expect(shadow).not.toContain("tranquility");
  });
});

describe("Warrior of Mercy — Hand of Healing (#1248)", () => {
  const MERCY = "Warrior of Mercy";

  it("Warrior of Mercy monk gets handOfHealing (action) and handOfHealingFlurry (bonus action) at L3", () => {
    const l3 = atRows("monk", MERCY, 3, []);
    const healing = l3.find((a) => a.key === "handOfHealing");
    expect(healing).toBeDefined();
    expect(healing?.cost).toBe("action");
    const flurry = l3.find((a) => a.key === "handOfHealingFlurry");
    expect(flurry).toBeDefined();
    expect(flurry?.cost).toBe("bonusAction");
  });

  it("handOfHealing is gated on the focus pool like any other resource-gated action", () => {
    const noFocus = atRows("monk", MERCY, 3, [pool("focus", 0)]);
    expect(noFocus.find((a) => a.key === "handOfHealing")?.enabled).toBe(false);
    const withFocus = atRows("monk", MERCY, 3, [pool("focus", 1)]);
    expect(withFocus.find((a) => a.key === "handOfHealing")?.enabled).toBe(true);
  });

  it("handOfHealingFlurry has no resource gate — it's always enabled once granted", () => {
    const noFocus = atRows("monk", MERCY, 3, [pool("focus", 0)]);
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
    const shadow = keys(atRows("monk", "Way of Shadow", 20, []));
    expect(shadow).not.toContain("handOfHealing");
    expect(shadow).not.toContain("handOfHealingFlurry");
    const noSub = keys(atRows("monk", undefined, 20, []));
    expect(noSub).not.toContain("handOfHealing");
    expect(noSub).not.toContain("handOfHealingFlurry");
  });

  it("Hand of Harm and Hand of Ultimate Mercy are dedicated verticals, not catalog actions", () => {
    const l20 = keys(atRows("monk", MERCY, 20, []));
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
// DerivedClassInfo booleans and onto ClassFeature rows (#1912 moved them off
// DERIVED_ACTIONS in turn). The dedicated endpoint (shadow-arts.ts) still
// owns the actual cast/activate — these rows only express the level gate as
// data. Uses `atRows()` with the display NAME now (row-driven, not a
// DERIVED_ACTIONS slug literal) — the slug-vs-name resolution contract
// itself is covered generically by the "subclass gate resolves via slug"
// describe block further down (#1339, #1277).
describe("Warrior of Shadow — Shadow Arts / Cloak of Shadows catalog rows (#1315)", () => {
  it("Shadow monk gets shadowArts at L3, not L2", () => {
    expect(keys(atRows("monk", "Warrior of Shadow", 2, [], true, "EDITION_2024"))).not.toContain("shadowArts");
    const l3 = atRows("monk", "Warrior of Shadow", 3, [pool("focus", 1)], true, "EDITION_2024");
    const shadowArts = l3.find((a) => a.key === "shadowArts");
    expect(shadowArts).toBeDefined();
    expect(shadowArts?.cost).toBe("action");
  });

  it("shadowArts is gated on 1 focus like any other resource-gated action", () => {
    const noFocus = atRows("monk", "Warrior of Shadow", 3, [pool("focus", 0)], true, "EDITION_2024");
    expect(noFocus.find((a) => a.key === "shadowArts")?.enabled).toBe(false);
    const withFocus = atRows("monk", "Warrior of Shadow", 3, [pool("focus", 1)], true, "EDITION_2024");
    expect(withFocus.find((a) => a.key === "shadowArts")?.enabled).toBe(true);
  });

  it("Shadow monk gets cloakOfShadows at L17, not L16", () => {
    expect(keys(atRows("monk", "Warrior of Shadow", 16, [], true, "EDITION_2024"))).not.toContain("cloakOfShadows");
    const l17 = atRows("monk", "Warrior of Shadow", 17, [pool("focus", 3)], true, "EDITION_2024");
    const cloak = l17.find((a) => a.key === "cloakOfShadows");
    expect(cloak).toBeDefined();
    expect(cloak?.cost).toBe("action");
  });

  it("cloakOfShadows costs 3 focus", () => {
    const short = atRows("monk", "Warrior of Shadow", 17, [pool("focus", 2)], true, "EDITION_2024");
    expect(short.find((a) => a.key === "cloakOfShadows")?.enabled).toBe(false);
    const enough = atRows("monk", "Warrior of Shadow", 17, [pool("focus", 3)], true, "EDITION_2024");
    expect(enough.find((a) => a.key === "cloakOfShadows")?.enabled).toBe(true);
  });

  it("subclass gate: a non-Shadow monk gets neither at any level", () => {
    const openHand = keys(atRows("monk", "Warrior of the Open Hand", 20, [pool("focus", 5)]));
    expect(openHand).not.toContain("shadowArts");
    expect(openHand).not.toContain("cloakOfShadows");
    const noSub = keys(atRows("monk", undefined, 20, [pool("focus", 5)]));
    expect(noSub).not.toContain("shadowArts");
    expect(noSub).not.toContain("cloakOfShadows");
  });

  it("both cast through the dedicated /abilities/shadow-arts endpoint — no ACTION_EFFECT_FN entry", () => {
    expect(ACTION_EFFECT_FN.shadowArts).toBeUndefined();
    expect(ACTION_EFFECT_FN.cloakOfShadows).toBeUndefined();
  });
});

// #1502: 2014 Way of Shadow (PHB'14 pp. 79-80 — not in SRD 5.1) reinstates the
// four-spell 2-ki Shadow Arts menu, Shadow Step without the free unarmed
// strike, Cloak of Shadows at L11 with no resource cost, and Opportunist at
// L17 — under the SAME action keys as the 2024 Warrior of Shadow rows
// (shadowArts/shadowStep/cloakOfShadows), disambiguated by `edition` +
// its own subclassId (#1912, was `grantSubclassSlugs` before the row move).
describe("Way of Shadow (2014) — Shadow Arts / Shadow Step / Cloak of Shadows / Opportunist (#1502)", () => {

  it("gets shadowArts at L3, not L2, gated on 2 ki", () => {
    expect(keys(atRows("monk", "Way of Shadow", 2, [], true, "EDITION_2014"))).not.toContain("shadowArts");
    const l3 = atRows("monk", "Way of Shadow", 3, [pool("ki", 2)], true, "EDITION_2014");
    const shadowArts = l3.find((a) => a.key === "shadowArts");
    expect(shadowArts).toBeDefined();
    expect(shadowArts?.cost).toBe("action");
    expect(shadowArts?.enabled).toBe(true);
    const short = atRows("monk", "Way of Shadow", 3, [pool("ki", 1)], true, "EDITION_2014");
    expect(short.find((a) => a.key === "shadowArts")?.enabled).toBe(false);
  });

  it("gets shadowStep at L6, not L5, free (no resourceKey), with no unarmed-strike clause", () => {
    expect(keys(atRows("monk", "Way of Shadow", 5, [], true, "EDITION_2014"))).not.toContain("shadowStep");
    const l6 = atRows("monk", "Way of Shadow", 6, [], true, "EDITION_2014");
    const shadowStep = l6.find((a) => a.key === "shadowStep");
    expect(shadowStep).toBeDefined();
    expect(shadowStep?.cost).toBe("bonusAction");
    expect(shadowStep?.enabled).toBe(true);
    expect(shadowStep?.reminder).not.toMatch(/unarmed strike/i);
  });

  it("gets cloakOfShadows at L11, not L10, with no resource cost", () => {
    expect(keys(atRows("monk", "Way of Shadow", 10, [], true, "EDITION_2014"))).not.toContain("cloakOfShadows");
    const l11 = atRows("monk", "Way of Shadow", 11, [], true, "EDITION_2014");
    const cloak = l11.find((a) => a.key === "cloakOfShadows");
    expect(cloak).toBeDefined();
    expect(cloak?.cost).toBe("action");
    expect(cloak?.enabled).toBe(true);
  });

  it("gets opportunist at L17, not L16, as a reminder-only reaction", () => {
    expect(keys(atRows("monk", "Way of Shadow", 16, [], true, "EDITION_2014"))).not.toContain("opportunist");
    const l17 = atRows("monk", "Way of Shadow", 17, [], true, "EDITION_2014");
    const opportunist = l17.find((a) => a.key === "opportunist");
    expect(opportunist).toBeDefined();
    expect(opportunist?.cost).toBe("reaction");
    expect(opportunist?.enabled).toBe(true);
  });

  it("is a pure reminder action — no ACTION_EFFECT_FN entry (mirrors 2014's own shadowStep)", () => {
    expect(ACTION_EFFECT_FN.opportunist).toBeUndefined();
  });

  it("none of the four rows leak to an EDITION_2024 request, even for the same slug", () => {
    const asIf2024 = keys(atRows("monk", "Way of Shadow", 20, [pool("ki", 5)], true, "EDITION_2024"));
    expect(asIf2024).not.toContain("shadowArts");
    expect(asIf2024).not.toContain("shadowStep");
    expect(asIf2024).not.toContain("cloakOfShadows");
    expect(asIf2024).not.toContain("opportunist");
  });

  it("subclass gate: the 2024 Warrior of Shadow slug never gets Opportunist, even under EDITION_2014", () => {
    // opportunist has no 2024 counterpart at all, so it's the one key here
    // that isolates the subclass gate cleanly (shadowArts/shadowStep/
    // cloakOfShadows share their KEY NAME with the 2024 rows, so a same-slug
    // mismatch on those is already covered by the edition-gate test above).
    const warriorOfShadow2014 = keys(
      deriveActions("monk", "monk-warrior-of-shadow", 20, [pool("ki", 5)], true, "EDITION_2014"),
    );
    expect(warriorOfShadow2014).not.toContain("opportunist");
  });
});

describe("Warrior of the Elements — Elemental Attunement / Elemental Burst catalog rows (#1315)", () => {
  const ELEMENTS = "Warrior of the Elements";

  // Elemental Attunement is row-driven now (#1686) — a bare `atRows()` call (no
  // featureRows carrier) can never see it, since Monk's own module carries no
  // DERIVED_ACTIONS entry for it any more. Mirrors monk.ts's real
  // AuthoredFeature entry exactly (the row-driven counterpart of every other
  // literal-class fixture row in test-feature-rows.fixture.ts).
  const ELEMENTAL_ATTUNEMENT_ROW: ClassFeatureRow = {
    name: "Elemental Attunement",
    level: 3,
    description: "test",
    edition: "EDITION_2024",
    resourceKey: "elementalAttunement",
    activationCost: "free",
    resolverKind: "toggle",
    costKind: "pool",
    costPoolKey: "focus",
    costBase: 1,
    effectBuffs: [{ key: "elementalAttunement", target: "elementalAttunement", modifier: 0, duration: "while-active" }],
  };
  const elementsAt = (level: number, pools: ResourcePool[]) =>
    deriveEntryScopedActions(
      [{ name: "monk", subclass: ELEMENTS, level }],
      level,
      pools,
      true,
      "EDITION_2024",
      () => ({ classRows: [], subclassRows: [ELEMENTAL_ATTUNEMENT_ROW] }),
    );

  it("gets elementalAttunement at L3, not L2, as a no-action (free) toggle", () => {
    expect(elementsAt(2, []).some((a) => a.key === "elementalAttunement")).toBe(false);
    const attune = elementsAt(3, [pool("focus", 1)]).find((a) => a.key === "elementalAttunement");
    expect(attune).toBeDefined();
    expect(attune?.cost).toBe("free");
    expect(attune?.resolverKind).toBe("toggle");
  });

  it("gets elementalBurst at L6, not L5, as a Magic action", () => {
    expect(keys(atRows("monk", ELEMENTS, 5, []))).not.toContain("elementalBurst");
    const l6 = atRows("monk", ELEMENTS, 6, [pool("focus", 2)]);
    const burst = l6.find((a) => a.key === "elementalBurst");
    expect(burst).toBeDefined();
    expect(burst?.cost).toBe("action");
  });

  it("elementalAttunement costs 1 focus (row-driven gate)", () => {
    expect(elementsAt(6, [pool("focus", 0)]).find((a) => a.key === "elementalAttunement")?.enabled).toBe(false);
    expect(elementsAt(6, [pool("focus", 1)]).find((a) => a.key === "elementalAttunement")?.enabled).toBe(true);
  });

  it("elementalBurst costs 2 focus (DERIVED_ACTIONS gate)", () => {
    expect(atRows("monk", ELEMENTS, 6, [pool("focus", 0)]).find((a) => a.key === "elementalBurst")?.enabled).toBe(false);
    expect(atRows("monk", ELEMENTS, 6, [pool("focus", 1)]).find((a) => a.key === "elementalBurst")?.enabled).toBe(false);
    expect(atRows("monk", ELEMENTS, 6, [pool("focus", 2)]).find((a) => a.key === "elementalBurst")?.enabled).toBe(true);
  });

  it("subclass gate: a non-Elements monk gets neither at any level", () => {
    const shadow = keys(atRows("monk", "Warrior of Shadow", 20, [pool("focus", 5)]));
    expect(shadow).not.toContain("elementalAttunement");
    expect(shadow).not.toContain("elementalBurst");
    const noSub = keys(atRows("monk", undefined, 20, [pool("focus", 5)]));
    expect(noSub).not.toContain("elementalAttunement");
    expect(noSub).not.toContain("elementalBurst");
  });

  it("both cast through the dedicated /abilities/warrior-of-elements endpoint — no ACTION_EFFECT_FN entry", () => {
    expect(ACTION_EFFECT_FN.elementalAttunement).toBeUndefined();
    expect(ACTION_EFFECT_FN.elementalBurst).toBeUndefined();
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
  // Row-driven now (#1909, onto cleric-features.ts's + paladin-features.ts's
  // own rows) — every case below uses `atRows`.
  it("granted class gate: cleric reaches it at L2, paladin at L3, in isolation", () => {
    expect(keys(atRows("cleric", undefined, 1, []))).not.toContain("channelDivinity");
    expect(keys(atRows("cleric", undefined, 2, []))).toContain("channelDivinity");
    expect(keys(atRows("paladin", undefined, 2, []))).not.toContain("channelDivinity");
    expect(keys(atRows("paladin", undefined, 3, []))).toContain("channelDivinity");
  });

  it("no other class gets it at any level", () => {
    expect(keys(atRows("fighter", undefined, 20, []))).not.toContain("channelDivinity");
    expect(keys(atRows("bard", undefined, 20, []))).not.toContain("channelDivinity");
  });

  it("the reminder names both classes' effect menus", () => {
    const cleric = atRows("cleric", undefined, 2, []).find((a) => a.key === "channelDivinity");
    expect(cleric?.reminder).toMatch(/Cleric/);
    expect(cleric?.reminder).toMatch(/Paladin/);
  });

  it("spends the channelDivinity pool, gated on the merged remaining count", () => {
    expect(ACTION_EFFECT_FN.channelDivinity({})).toEqual([{ type: "spendResource", key: "channelDivinity" }]);
    const disabled = atRows("cleric", undefined, 2, [pool("channelDivinity", 0)]).find(
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
// — this block now exercises the fallback path via `atRows()`, which resolves
// through the real resolver, so a display-name gate and a slug gate are
// asserted by the SAME mechanism.
describe("subclass gate resolves via slug — FK preferred, exact name as fallback, never substring (#1339, #1277)", () => {
  it('a 2014 "Way of Shadow" monk gets none of the Warrior of Shadow rows at L20', () => {
    const wayOfShadow = keys(atRows("monk", "Way of Shadow", 20, [pool("focus", 5)]));
    expect(wayOfShadow).not.toContain("shadowArts");
    expect(wayOfShadow).not.toContain("cloakOfShadows");
    expect(wayOfShadow).not.toContain("shadowStep");
  });

  it('the 2024 "Warrior of Shadow" monk is unaffected at every gate level', () => {
    expect(keys(atRows("monk", "Warrior of Shadow", 2, []))).not.toContain("shadowArts");
    expect(keys(atRows("monk", "Warrior of Shadow", 3, [pool("focus", 1)]))).toContain("shadowArts");
    expect(keys(atRows("monk", "Warrior of Shadow", 5, []))).not.toContain("shadowStep");
    expect(keys(atRows("monk", "Warrior of Shadow", 6, []))).toContain("shadowStep");
    expect(keys(atRows("monk", "Warrior of Shadow", 16, [pool("focus", 3)]))).not.toContain("cloakOfShadows");
    expect(keys(atRows("monk", "Warrior of Shadow", 17, [pool("focus", 3)]))).toContain("cloakOfShadows");
  });

  it("a homebrew name containing a seeded subclass's name inherits nothing", () => {
    const openHandbook = keys(
      atRows("monk", "Warrior of the Open Handbook", 20, [pool("wholenessOfBody", 5)]),
    );
    expect(openHandbook).not.toContain("wholenessOfBody");
    expect(openHandbook).not.toContain("fleetStep");

    const mercyReborn = keys(atRows("monk", "Way of Mercy Reborn", 20, [pool("focus", 5)]));
    expect(mercyReborn).not.toContain("handOfHealing");
    expect(mercyReborn).not.toContain("handOfHealingFlurry");

    const elementsPrime = keys(atRows("monk", "Warrior of the Elements Prime", 20, [pool("focus", 5)]));
    expect(elementsPrime).not.toContain("elementalAttunement");
    expect(elementsPrime).not.toContain("elementalBurst");
  });

  it("normalizes case and stray whitespace on both sides", () => {
    expect(keys(atRows("Monk", "  WARRIOR OF SHADOW  ", 6, []))).toContain("shadowStep");
  });

  it("the other three families still match their registry names exactly", () => {
    // elementalAttunement is row-driven (#1686) — bare atRows() can't reach it;
    // elementalBurst alone still proves the slug match for this subclass.
    const elements = keys(atRows("monk", "warrior of the elements", 6, [pool("focus", 2)]));
    expect(elements).toContain("elementalBurst");

    const openHand = keys(atRows("monk", "warrior of the open hand", 11, [pool("wholenessOfBody", 1)]));
    expect(openHand).toContain("wholenessOfBody");
    expect(openHand).toContain("fleetStep");

    const mercy = keys(atRows("monk", "warrior of mercy", 3, [pool("focus", 1)]));
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
  // through `atRows()`, so this is the same mechanism the FK path uses, minus the FK.
  // elementalAttunement is deliberately absent from the 2024 Warrior of the
  // Elements/Warrior of Shadow/Warrior of the Open Hand lists here — it's
  // row-driven (#1686) and unreachable through the bare atRows() this test uses;
  // elementalBurst alone still proves the slug match for that subclass. The
  // 2014 Way of the Four Elements elementalAttunement is a PLAIN
  // DERIVED_ACTIONS reminder row (#1503, not row-driven), so it IS reachable
  // and listed. Each entry carries its OWN `edition` (#1501/#1502/#1503):
  // "monk-way-of-the-open-hand", "monk-way-of-shadow", and
  // "monk-way-of-the-four-elements" are each EDITION_2014-only, so a blanket
  // EDITION_2024 loop (the shape before these three slices) would wrongly
  // report their rows unreachable — `atRows()`'s own default (EDITION_2024)
  // would silently exclude them, the exact same-key-different-edition trap
  // #1499 anticipated.
  const MONK_SUBCLASS_GRANT_KEYS: Record<
    Extract<SubclassSlug, `monk-${string}`>,
    { edition: "EDITION_2014" | "EDITION_2024"; keys: string[] }
  > = {
    "monk-warrior-of-shadow": { edition: "EDITION_2024", keys: ["shadowStep", "shadowArts", "cloakOfShadows"] },
    "monk-warrior-of-the-elements": { edition: "EDITION_2024", keys: ["elementalBurst"] },
    "monk-warrior-of-the-open-hand": { edition: "EDITION_2024", keys: ["wholenessOfBody", "fleetStep"] },
    "monk-warrior-of-mercy": { edition: "EDITION_2024", keys: ["handOfHealing", "handOfHealingFlurry"] },
    "monk-way-of-the-four-elements": { edition: "EDITION_2014", keys: ["elementalAttunement", "castDiscipline"] },
    "monk-way-of-the-open-hand": { edition: "EDITION_2014", keys: ["wholenessOfBodyAction", "tranquility"] },
    "monk-way-of-shadow": { edition: "EDITION_2014", keys: ["shadowArts", "shadowStep", "cloakOfShadows", "opportunist"] },
  };
  it("every subclass-gated row is reachable from its accepted name (#1339, retargeted #1277)", () => {
    for (const [slug, { edition, keys: expectedKeys }] of Object.entries(MONK_SUBCLASS_GRANT_KEYS) as [
      SubclassSlug,
      { edition: "EDITION_2014" | "EDITION_2024"; keys: string[] },
    ][]) {
      const name = SUBCLASS_IDENTITY[slug].nameKey;
      const granted = keys(
        atRows("monk", name, 20, [pool("focus", 5), pool("wholenessOfBody", 5), pool("ki", 5)], true, edition),
      );
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
// audit — Channel Divinity must stay the only cross-class action name/row-set,
// whether hand-rolled (DERIVED_ACTIONS) or row-driven (#1909's
// channelDivinity migration onto cleric-features.ts's/paladin-features.ts's
// own rows — `atRows` sees both). Loops every class × its subclasses (mirrors
// class-features-snapshot.test.ts's CLASS_SUBCLASSES table) at the max level
// so the next action a second class grants under the same display name fails
// THIS test instead of silently shipping two identical cards.
describe("no two actions from different classes share a display name (#1340)", () => {
  const CLASS_SUBCLASSES: Record<string, (string | undefined)[]> = {
    barbarian: [undefined, "totem warrior", "berserker"],
    bard: [undefined, "college of lore", "college of valor"],
    cleric: [undefined, "life domain", "trickery domain"],
    druid: [undefined, "circle of the land", "circle of the moon"],
    fighter: [undefined, "battle master", "champion", "eldritch knight"],
    monk: [undefined, "warrior of the open hand", "way of the open hand", "warrior of shadow", "warrior of the elements", "warrior of mercy"],
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
        for (const action of atRows(className, subclass, 20, [])) {
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

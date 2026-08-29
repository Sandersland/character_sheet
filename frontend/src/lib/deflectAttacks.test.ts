import { describe, expect, it } from "vitest";

import {
  deflectAttacksDamageTypeClause,
  deflectBaseAction,
  deflectRollFromAction,
  formatDeflectAttacksMessage,
  formatDeflectAttacksRedirectMessage,
  formatDeflectMissilesThrowMessage,
} from "@/lib/deflectAttacks";
import { summarizeRoll } from "@/lib/dice";
import type { AvailableAction, Character } from "@/types/character";

const DEFLECT_ATTACKS_2024 = (damageTypeClause: string): AvailableAction => ({
  key: "deflectAttacks",
  name: "Deflect Attacks",
  cost: "reaction",
  enabled: true,
  damageTypeClause,
});

const DEFLECT_MISSILES_2014: AvailableAction = {
  key: "deflectMissiles",
  name: "Deflect Missiles",
  cost: "reaction",
  enabled: true,
};

function monk(overrides: Partial<Character> = {}): Character {
  return {
    level: 5,
    // classEntryLevel's single-class path needs a class to match against
    // (#1441) — without this every assertion here read `classEntryLevel` as 0.
    class: "Monk",
    abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 14, charisma: 10 },
    unarmedStrike: {
      attackBonus: 6,
      damage: { count: 1, faces: 8, modifier: 3, damageType: "bludgeoning" },
    },
    availableActions: [DEFLECT_ATTACKS_2024("bludgeoning, piercing, or slashing damage")],
    ...overrides,
  } as unknown as Character;
}

// Monk 3 / Fighter 10 (character.level 13) — Deflect Attacks must scale on the
// Monk *entry* level (3), not the total character level (13).
function monkFighter(overrides: Partial<Character> = {}): Character {
  return monk({
    level: 13,
    class: "Monk",
    classes: [
      { name: "Monk", level: 3 },
      { name: "Fighter", level: 10 },
    ],
    ...overrides,
  } as unknown as Partial<Character>);
}

describe("deflectBaseAction", () => {
  it("finds the served deflectAttacks row (SRD 5.2)", () => {
    expect(deflectBaseAction(monk())?.key).toBe("deflectAttacks");
  });

  it("finds the served deflectMissiles row (SRD 5.1) when that's what's served instead", () => {
    const character = monk({ availableActions: [DEFLECT_MISSILES_2014] });
    expect(deflectBaseAction(character)?.key).toBe("deflectMissiles");
  });

  it("is undefined for a non-monk with neither row", () => {
    expect(deflectBaseAction(monk({ availableActions: [] }))).toBeUndefined();
  });
});

describe("deflectAttacksDamageTypeClause", () => {
  it("reads the served row's resolved clause verbatim — never a level threshold", () => {
    expect(deflectAttacksDamageTypeClause(monk({ availableActions: [DEFLECT_ATTACKS_2024("bludgeoning, piercing, or slashing damage")] }))).toBe(
      "bludgeoning, piercing, or slashing damage",
    );
    expect(deflectAttacksDamageTypeClause(monk({ availableActions: [DEFLECT_ATTACKS_2024("any damage type")] }))).toBe(
      "any damage type",
    );
  });

  it("falls back to the B/P/S default when the row isn't served (e.g. mid-fetch)", () => {
    expect(deflectAttacksDamageTypeClause(monk({ availableActions: [] }))).toMatch(/bludgeoning, piercing, or slashing/);
  });
});

// The client only reads the roll spec off the served row's `effect.dice`
// (deriveDeflectSpec on the backend), never re-deriving it.
describe("deflectRollFromAction", () => {
  it("reads the served reduction spec off the base row's effect.dice", () => {
    const row: AvailableAction = {
      key: "deflectAttacks",
      name: "Deflect Attacks",
      cost: "reaction",
      enabled: true,
      effect: { effectType: "utility", dice: { count: 1, faces: 10, modifier: 8 }, scaling: { mode: "none" } },
    };
    expect(deflectRollFromAction(row)).toEqual({ count: 1, faces: 10, modifier: 8 });
  });

  it("reads the served redirect spec off the redirect row's effect.dice", () => {
    const row: AvailableAction = {
      key: "deflectAttacksRedirect",
      name: "Deflect Attacks — Redirect",
      cost: "free",
      enabled: true,
      effect: { effectType: "damage", dice: { count: 2, faces: 8, modifier: 3 }, scaling: { mode: "none" } },
    };
    expect(deflectRollFromAction(row)).toEqual({ count: 2, faces: 8, modifier: 3 });
  });

  it("defaults a missing modifier to 0", () => {
    const row: AvailableAction = {
      key: "deflectMissilesThrow",
      name: "Deflect Missiles — Throw Back",
      cost: "free",
      enabled: true,
      effect: { effectType: "damage", dice: { count: 1, faces: 6 }, scaling: { mode: "none" } },
    };
    expect(deflectRollFromAction(row)).toEqual({ count: 1, faces: 6, modifier: 0 });
  });

  it("is undefined when the row (or its spec) isn't served yet", () => {
    expect(deflectRollFromAction(undefined)).toBeUndefined();
    expect(
      deflectRollFromAction({ key: "deflectAttacks", name: "Deflect Attacks", cost: "reaction", enabled: true }),
    ).toBeUndefined();
  });
});

describe("formatDeflectAttacksMessage", () => {
  it("reports the total and the rolled components for the SRD 5.2 row", () => {
    const character = monk({ level: 5, availableActions: [DEFLECT_ATTACKS_2024("bludgeoning, piercing, or slashing damage")] });
    const roll = summarizeRoll([6], { count: 1, faces: 10, modifier: 8 });
    const msg = formatDeflectAttacksMessage(character, DEFLECT_ATTACKS_2024("bludgeoning, piercing, or slashing damage"), roll, true);
    expect(msg).toMatch(/^Deflect Attacks/);
    expect(msg).toMatch(/reduce bludgeoning, piercing, or slashing damage/);
    expect(msg).toMatch(/by 14/); // 6 + 8
    expect(msg).toMatch(/1d10 rolled 6/);
    expect(msg).toMatch(/DEX \+3/);
    expect(msg).toMatch(/monk level 5/);
    // Redirect hint only when the redirect's resource is available.
    expect(msg).toMatch(/redirect/i);
  });

  it("names any damage type when the served row's clause says so, and omits the redirect hint when the resource is unavailable", () => {
    const character = monk({ level: 13, availableActions: [DEFLECT_ATTACKS_2024("any damage type")] });
    const roll = summarizeRoll([4], { count: 1, faces: 10, modifier: 16 });
    const msg = formatDeflectAttacksMessage(character, DEFLECT_ATTACKS_2024("any damage type"), roll, false);
    expect(msg).toMatch(/reduce any damage type/);
    expect(msg).not.toMatch(/redirect/i);
  });

  it("names Deflect Missiles and the SRD 5.1 ranged-only flavor for the deflectMissiles row", () => {
    const character = monk({ availableActions: [DEFLECT_MISSILES_2014] });
    const roll = summarizeRoll([6], { count: 1, faces: 10, modifier: 8 });
    const msg = formatDeflectAttacksMessage(character, DEFLECT_MISSILES_2014, roll, true);
    expect(msg).toMatch(/^Deflect Missiles/);
    expect(msg).toMatch(/reduce ranged weapon attack damage/);
    expect(msg).not.toMatch(/bludgeoning, piercing, or slashing/);
    expect(msg).toMatch(/throw it back/i);
  });

  it("reports the Monk entry level for a multiclass character below Monk 13", () => {
    const character = monkFighter({ availableActions: [DEFLECT_ATTACKS_2024("bludgeoning, piercing, or slashing damage")] });
    const roll = summarizeRoll([6], { count: 1, faces: 10, modifier: 6 });
    const msg = formatDeflectAttacksMessage(character, DEFLECT_ATTACKS_2024("bludgeoning, piercing, or slashing damage"), roll, true);
    expect(msg).toContain("monk level 3)");
  });

  it("names the served spend-pool label in the redirect hint so it agrees with the button (#1435)", () => {
    const character = monk({ level: 5, availableActions: [DEFLECT_ATTACKS_2024("bludgeoning, piercing, or slashing damage")] });
    const roll = summarizeRoll([6], { count: 1, faces: 10, modifier: 8 });
    // SRD 5.2: the served pool label is "Focus Points".
    expect(formatDeflectAttacksMessage(character, DEFLECT_ATTACKS_2024("bludgeoning, piercing, or slashing damage"), roll, true, "Focus Points")).toMatch(
      /Spend 1 Focus Points to redirect/,
    );
    // SRD 5.1 throw-back with the served "Ki Points" label.
    expect(formatDeflectAttacksMessage(monk({ availableActions: [DEFLECT_MISSILES_2014] }), DEFLECT_MISSILES_2014, roll, true, "Ki Points")).toMatch(
      /Spend 1 Ki Points to throw it back/,
    );
  });

  it("falls back to 'point' when no spend label is served", () => {
    const character = monk({ level: 5, availableActions: [DEFLECT_ATTACKS_2024("bludgeoning, piercing, or slashing damage")] });
    const roll = summarizeRoll([6], { count: 1, faces: 10, modifier: 8 });
    expect(formatDeflectAttacksMessage(character, DEFLECT_ATTACKS_2024("bludgeoning, piercing, or slashing damage"), roll, true)).toMatch(
      /Spend 1 point to redirect/,
    );
  });
});

describe("formatDeflectAttacksRedirectMessage", () => {
  it("reports the Dexterity-save redirect damage (SRD 5.2 — a save, not an attack roll)", () => {
    const roll = summarizeRoll([5, 3], { count: 2, faces: 8, modifier: 3 });
    const msg = formatDeflectAttacksRedirectMessage(roll);
    expect(msg).toMatch(/Dexterity sav/i);
    expect(msg).toMatch(/11/); // 5 + 3 + 3
    expect(msg).toMatch(/60 ft/);
  });
});

describe("formatDeflectMissilesThrowMessage", () => {
  it("reports the throw-back's attack-roll damage (SRD 5.1 — an attack, not a save)", () => {
    const roll = summarizeRoll([4], { count: 1, faces: 6, modifier: 3 });
    const msg = formatDeflectMissilesThrowMessage(roll);
    expect(msg).toMatch(/ranged attack/i);
    expect(msg).toMatch(/7/); // 4 + 3
    expect(msg).toMatch(/bludgeoning/);
    expect(msg).not.toMatch(/sav/i);
  });
});

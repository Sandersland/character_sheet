import { describe, expect, it } from "vitest";

import {
  deflectAttacksDamageTypeClause,
  deflectAttacksReductionRoll,
  deflectAttacksRedirectRoll,
  deflectBaseAction,
  deflectMissilesThrowRoll,
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

describe("deflectAttacksReductionRoll", () => {
  it("is 1d10 + Dex modifier + monk level (edition-invariant)", () => {
    // Dex 16 → +3 modifier; level 5 → spec modifier is 3 + 5 = 8.
    expect(deflectAttacksReductionRoll(monk({ level: 5 }))).toEqual({ count: 1, faces: 10, modifier: 8 });
  });

  it("scales the flat modifier with monk level", () => {
    expect(deflectAttacksReductionRoll(monk({ level: 13 }))).toEqual({ count: 1, faces: 10, modifier: 16 });
  });

  it("scales the flat modifier with the Monk entry level, not total character level (Monk 3 / Fighter 10)", () => {
    // Dex 16 → +3 modifier; Monk entry level 3 → spec modifier is 3 + 3 = 6 (not 3 + 13 = 16).
    expect(deflectAttacksReductionRoll(monkFighter())).toEqual({ count: 1, faces: 10, modifier: 6 });
  });

  it("single-class Monk 13 still scales on the full character level — regression guard", () => {
    expect(
      deflectAttacksReductionRoll(monk({ level: 13, classes: [{ name: "Monk", level: 13 }] } as unknown as Partial<Character>)),
    ).toEqual({ count: 1, faces: 10, modifier: 16 });
  });
});

describe("deflectAttacksRedirectRoll", () => {
  it("is two Martial Arts die rolls + Dex modifier, reusing the derived unarmedStrike die (SRD 5.2)", () => {
    // faces: 8 (from the unarmedStrike fixture) — count 2, Dex mod +3.
    expect(deflectAttacksRedirectRoll(monk())).toEqual({ count: 2, faces: 8, modifier: 3 });
  });
});

describe("deflectMissilesThrowRoll", () => {
  it("is 1d6 + Dex modifier (SRD 5.1 throw-back, an attack roll not a save)", () => {
    expect(deflectMissilesThrowRoll(monk())).toEqual({ count: 1, faces: 6, modifier: 3 });
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

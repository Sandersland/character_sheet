import { describe, expect, it } from "vitest";

import {
  deflectAttacksDamageTypeClause,
  deflectAttacksReductionRoll,
  deflectAttacksRedirectRoll,
  formatDeflectAttacksMessage,
  formatDeflectAttacksRedirectMessage,
  hasDeflectEnergy,
} from "@/lib/deflectAttacks";
import { summarizeRoll } from "@/lib/dice";
import type { Character } from "@/types/character";

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

describe("hasDeflectEnergy", () => {
  it("is false below monk L13 and true at L13+", () => {
    expect(hasDeflectEnergy(monk({ level: 12 }))).toBe(false);
    expect(hasDeflectEnergy(monk({ level: 13 }))).toBe(true);
    expect(hasDeflectEnergy(monk({ level: 20 }))).toBe(true);
  });

  it("reads the Monk entry level, not total character level, for a multiclass character (Monk 3 / Fighter 10)", () => {
    expect(hasDeflectEnergy(monkFighter())).toBe(false);
  });

  it("single-class Monk 13 (no multiclassing) still gets Deflect Energy — regression guard", () => {
    expect(hasDeflectEnergy(monk({ level: 13, classes: [{ name: "Monk", level: 13 }] } as unknown as Partial<Character>))).toBe(
      true,
    );
    // The no-`classes` fallback path (deriveRoster) must behave identically.
    expect(hasDeflectEnergy(monk({ level: 13, class: "Monk" } as unknown as Partial<Character>))).toBe(true);
  });
});

describe("deflectAttacksDamageTypeClause", () => {
  it("names B/P/S below L13 and any damage type at L13+", () => {
    expect(deflectAttacksDamageTypeClause(monk({ level: 3 }))).toMatch(/bludgeoning, piercing, or slashing/);
    expect(deflectAttacksDamageTypeClause(monk({ level: 13 }))).toBe("any damage type");
  });
});

describe("deflectAttacksReductionRoll", () => {
  it("is 1d10 + Dex modifier + monk level (SRD 5.2 L3)", () => {
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
  it("is two Martial Arts die rolls + Dex modifier, reusing the derived unarmedStrike die", () => {
    // faces: 8 (from the unarmedStrike fixture) — count 2, Dex mod +3.
    expect(deflectAttacksRedirectRoll(monk())).toEqual({ count: 2, faces: 8, modifier: 3 });
  });
});

describe("formatDeflectAttacksMessage", () => {
  it("reports the total and the rolled components, below L13", () => {
    const roll = summarizeRoll([6], { count: 1, faces: 10, modifier: 8 });
    const msg = formatDeflectAttacksMessage(monk({ level: 5 }), roll, true);
    expect(msg).toMatch(/reduce bludgeoning, piercing, or slashing damage/);
    expect(msg).toMatch(/by 14/); // 6 + 8
    expect(msg).toMatch(/1d10 rolled 6/);
    expect(msg).toMatch(/DEX \+3/);
    expect(msg).toMatch(/monk level 5/);
    // Redirect hint only when a Focus point is available.
    expect(msg).toMatch(/redirect/i);
  });

  it("names any damage type at L13+ and omits the redirect hint when Focus is unavailable", () => {
    const roll = summarizeRoll([4], { count: 1, faces: 10, modifier: 16 });
    const msg = formatDeflectAttacksMessage(monk({ level: 13 }), roll, false);
    expect(msg).toMatch(/reduce any damage type/);
    expect(msg).not.toMatch(/redirect/i);
  });

  it("reports the Monk entry level, not total character level, and the B/P/S clause for a multiclass character below Monk 13", () => {
    const roll = summarizeRoll([6], { count: 1, faces: 10, modifier: 6 });
    const msg = formatDeflectAttacksMessage(monkFighter(), roll, true);
    expect(msg).toContain("monk level 3)");
    expect(msg).not.toMatch(/any damage type/);
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

import { describe, it, expect } from "vitest";

import { deriveMartialArtsDie, deriveUnarmedStrike } from "@/lib/srd/srd.js";

const scores = (strength: number, dexterity: number) => ({ strength, dexterity });

describe("deriveMartialArtsDie", () => {
  it("returns 0 below monk level 1", () => {
    expect(deriveMartialArtsDie(0)).toBe(0);
    expect(deriveMartialArtsDie(-3)).toBe(0);
  });

  it("scales by level band", () => {
    expect(deriveMartialArtsDie(1)).toBe(6);
    expect(deriveMartialArtsDie(4)).toBe(6);
    expect(deriveMartialArtsDie(5)).toBe(8);
    expect(deriveMartialArtsDie(10)).toBe(8);
    expect(deriveMartialArtsDie(11)).toBe(10);
    expect(deriveMartialArtsDie(16)).toBe(10);
    expect(deriveMartialArtsDie(17)).toBe(12);
    expect(deriveMartialArtsDie(20)).toBe(12);
  });

  it("crosses each threshold at the exact boundary", () => {
    expect(deriveMartialArtsDie(4)).toBe(6);
    expect(deriveMartialArtsDie(5)).toBe(8);
    expect(deriveMartialArtsDie(10)).toBe(8);
    expect(deriveMartialArtsDie(11)).toBe(10);
    expect(deriveMartialArtsDie(16)).toBe(10);
    expect(deriveMartialArtsDie(17)).toBe(12);
  });
});

describe("deriveUnarmedStrike — Monk Martial Arts", () => {
  const monk = (level: number, isUnarmored = true, hasShield = false) => ({
    level,
    isUnarmored,
    hasShield,
  });

  it("L1 monk, unarmored, Dex 16 / Str 10 uses Dex for attack + damage", () => {
    const s = deriveUnarmedStrike(scores(10, 16), 2, 1, monk(1));
    expect(s.attackBonus).toBe(3 + 2); // dexMod 3 + prof 2
    expect(s.damage).toMatchObject({ count: 1, faces: 6, modifier: 3, damageType: "bludgeoning" });
  });

  it("scales the martial-arts die with monk level at each boundary", () => {
    expect(deriveUnarmedStrike(scores(10, 16), 2, 1, monk(4)).damage.faces).toBe(6);
    expect(deriveUnarmedStrike(scores(10, 16), 2, 1, monk(5)).damage.faces).toBe(8);
    expect(deriveUnarmedStrike(scores(10, 16), 2, 1, monk(10)).damage.faces).toBe(8);
    expect(deriveUnarmedStrike(scores(10, 16), 2, 1, monk(11)).damage.faces).toBe(10);
    expect(deriveUnarmedStrike(scores(10, 16), 2, 1, monk(16)).damage.faces).toBe(10);
    expect(deriveUnarmedStrike(scores(10, 16), 2, 1, monk(17)).damage.faces).toBe(12);
  });

  it("uses Str when Str exceeds Dex — never worse than STR-only", () => {
    const s = deriveUnarmedStrike(scores(16, 10), 2, 1, monk(1));
    expect(s.attackBonus).toBe(3 + 2); // strMod 3
    expect(s.damage.modifier).toBe(3);
    expect(s.damage.faces).toBe(6);
  });

  it("falls back to STR + feat die when wearing armor", () => {
    const s = deriveUnarmedStrike(scores(10, 16), 2, 1, monk(5, false, false));
    expect(s.attackBonus).toBe(0 + 2); // strMod 0
    expect(s.damage.faces).toBe(1); // no martial-arts die while armored
    expect(s.damage.modifier).toBe(0);
  });

  it("falls back to STR + feat die while wielding a shield", () => {
    const s = deriveUnarmedStrike(scores(10, 16), 2, 1, monk(5, true, true));
    expect(s.attackBonus).toBe(2);
    expect(s.damage.faces).toBe(1);
  });

  it("Tavern Brawler: Monk die wins once it exceeds the feat die", () => {
    // L1 monk with Tavern Brawler (feat die 4): max(4, 6) = 6 — the 2024 martial-arts
    // floor (1d6) already exceeds the feat die, unlike the 2014 1d4 floor.
    expect(deriveUnarmedStrike(scores(10, 16), 2, 4, monk(1)).damage.faces).toBe(6);
    // L5 monk with Tavern Brawler: max(4, 8) = 8
    expect(deriveUnarmedStrike(scores(10, 16), 2, 4, monk(5)).damage.faces).toBe(8);
  });

  it("non-monk (no context) keeps STR-based flat-1 unarmed strike", () => {
    const s = deriveUnarmedStrike(scores(10, 16), 3, 1);
    expect(s.attackBonus).toBe(0 + 3); // strMod 0 + prof
    expect(s.damage).toMatchObject({ count: 1, faces: 1, modifier: 0 });
  });

  it("non-monk with Tavern Brawler is unchanged (STR + d4)", () => {
    const s = deriveUnarmedStrike(scores(14, 18), 2, 4);
    expect(s.attackBonus).toBe(2 + 2); // strMod 2
    expect(s.damage).toMatchObject({ faces: 4, modifier: 2 });
  });

  it("monk level 0 context (multiclass with no monk levels) stays STR-based", () => {
    const s = deriveUnarmedStrike(scores(10, 16), 2, 1, monk(0));
    expect(s.damage.faces).toBe(1);
    expect(s.damage.modifier).toBe(0);
  });
});

describe("deriveUnarmedStrike — Empowered Strikes (magical at monk L6+)", () => {
  const monk = (level: number, isUnarmored = true, hasShield = false) => ({
    level,
    isUnarmored,
    hasShield,
  });

  it("L5 monk unarmed strike is not magical", () => {
    expect(deriveUnarmedStrike(scores(10, 16), 2, 1, monk(5)).magical).toBe(false);
  });

  it("L6 monk unarmed strike is magical", () => {
    expect(deriveUnarmedStrike(scores(10, 16), 2, 1, monk(6)).magical).toBe(true);
  });

  it("stays magical at higher monk levels", () => {
    expect(deriveUnarmedStrike(scores(10, 16), 2, 1, monk(20)).magical).toBe(true);
  });

  it("non-monk of any level is never magical", () => {
    expect(deriveUnarmedStrike(scores(16, 10), 4, 1).magical).toBe(false);
    expect(deriveUnarmedStrike(scores(16, 10), 4, 1, monk(0)).magical).toBe(false);
  });

  it("magical is independent of armor/shield — gates only on monk level", () => {
    expect(deriveUnarmedStrike(scores(10, 16), 2, 1, monk(6, false, false)).magical).toBe(true);
    expect(deriveUnarmedStrike(scores(10, 16), 2, 1, monk(6, true, true)).magical).toBe(true);
  });

  it("multiclass gates off the monk class-entry level, not total level", () => {
    // Fighter 10 / Monk 6 → magical; the caller passes only the monk level.
    expect(deriveUnarmedStrike(scores(16, 10), 4, 1, monk(6)).magical).toBe(true);
    // Fighter 6 / Monk 5 → not magical.
    expect(deriveUnarmedStrike(scores(16, 10), 3, 1, monk(5)).magical).toBe(false);
  });
});

import { describe, it, expect } from "vitest";

import { deriveMartialArtsDie, deriveUnarmedStrike } from "@/lib/srd/srd.js";

const scores = (strength: number, dexterity: number) => ({ strength, dexterity });

describe("deriveMartialArtsDie — EDITION_2024 (SRD 5.2 / PHB'24 p.88)", () => {
  it("returns 0 below monk level 1", () => {
    expect(deriveMartialArtsDie(0, "EDITION_2024")).toBe(0);
    expect(deriveMartialArtsDie(-3, "EDITION_2024")).toBe(0);
  });

  it("scales by level band", () => {
    expect(deriveMartialArtsDie(1, "EDITION_2024")).toBe(6);
    expect(deriveMartialArtsDie(4, "EDITION_2024")).toBe(6);
    expect(deriveMartialArtsDie(5, "EDITION_2024")).toBe(8);
    expect(deriveMartialArtsDie(10, "EDITION_2024")).toBe(8);
    expect(deriveMartialArtsDie(11, "EDITION_2024")).toBe(10);
    expect(deriveMartialArtsDie(16, "EDITION_2024")).toBe(10);
    expect(deriveMartialArtsDie(17, "EDITION_2024")).toBe(12);
    expect(deriveMartialArtsDie(20, "EDITION_2024")).toBe(12);
  });

  it("crosses each threshold at the exact boundary", () => {
    expect(deriveMartialArtsDie(4, "EDITION_2024")).toBe(6);
    expect(deriveMartialArtsDie(5, "EDITION_2024")).toBe(8);
    expect(deriveMartialArtsDie(10, "EDITION_2024")).toBe(8);
    expect(deriveMartialArtsDie(11, "EDITION_2024")).toBe(10);
    expect(deriveMartialArtsDie(16, "EDITION_2024")).toBe(10);
    expect(deriveMartialArtsDie(17, "EDITION_2024")).toBe(12);
  });
});

// SRD 5.1 / PHB'14 p.78: 1d4 (L1-4), 1d6 (L5-10), 1d8 (L11-16), 1d10 (L17-20).
// The level-band thresholds (L5/L11/L17) are IDENTICAL to the 2024 table above
// — only the die faces fork (#1499).
describe("deriveMartialArtsDie — EDITION_2014 (SRD 5.1 / PHB'14 p.78)", () => {
  it("returns 0 below monk level 1", () => {
    expect(deriveMartialArtsDie(0, "EDITION_2014")).toBe(0);
    expect(deriveMartialArtsDie(-3, "EDITION_2014")).toBe(0);
  });

  it("scales by level band", () => {
    expect(deriveMartialArtsDie(1, "EDITION_2014")).toBe(4);
    expect(deriveMartialArtsDie(4, "EDITION_2014")).toBe(4);
    expect(deriveMartialArtsDie(5, "EDITION_2014")).toBe(6);
    expect(deriveMartialArtsDie(10, "EDITION_2014")).toBe(6);
    expect(deriveMartialArtsDie(11, "EDITION_2014")).toBe(8);
    expect(deriveMartialArtsDie(16, "EDITION_2014")).toBe(8);
    expect(deriveMartialArtsDie(17, "EDITION_2014")).toBe(10);
    expect(deriveMartialArtsDie(20, "EDITION_2014")).toBe(10);
  });

  it("crosses each threshold at the exact boundary — the SAME boundaries as EDITION_2024", () => {
    expect(deriveMartialArtsDie(4, "EDITION_2014")).toBe(4);
    expect(deriveMartialArtsDie(5, "EDITION_2014")).toBe(6);
    expect(deriveMartialArtsDie(10, "EDITION_2014")).toBe(6);
    expect(deriveMartialArtsDie(11, "EDITION_2014")).toBe(8);
    expect(deriveMartialArtsDie(16, "EDITION_2014")).toBe(8);
    expect(deriveMartialArtsDie(17, "EDITION_2014")).toBe(10);
  });
});

describe("deriveUnarmedStrike — Monk Martial Arts (EDITION_2024)", () => {
  const monk = (level: number, isUnarmored = true, hasShield = false) => ({
    level,
    isUnarmored,
    hasShield,
  });

  it("L1 monk, unarmored, Dex 16 / Str 10 uses Dex for attack + damage", () => {
    const s = deriveUnarmedStrike(scores(10, 16), 2, 1, monk(1), "EDITION_2024");
    expect(s.attackBonus).toBe(3 + 2); // dexMod 3 + prof 2
    expect(s.damage).toMatchObject({ count: 1, faces: 6, modifier: 3, damageType: "bludgeoning" });
  });

  it("scales the martial-arts die with monk level at each boundary", () => {
    expect(deriveUnarmedStrike(scores(10, 16), 2, 1, monk(4), "EDITION_2024").damage.faces).toBe(6);
    expect(deriveUnarmedStrike(scores(10, 16), 2, 1, monk(5), "EDITION_2024").damage.faces).toBe(8);
    expect(deriveUnarmedStrike(scores(10, 16), 2, 1, monk(10), "EDITION_2024").damage.faces).toBe(8);
    expect(deriveUnarmedStrike(scores(10, 16), 2, 1, monk(11), "EDITION_2024").damage.faces).toBe(10);
    expect(deriveUnarmedStrike(scores(10, 16), 2, 1, monk(16), "EDITION_2024").damage.faces).toBe(10);
    expect(deriveUnarmedStrike(scores(10, 16), 2, 1, monk(17), "EDITION_2024").damage.faces).toBe(12);
  });

  it("uses Str when Str exceeds Dex — never worse than STR-only", () => {
    const s = deriveUnarmedStrike(scores(16, 10), 2, 1, monk(1), "EDITION_2024");
    expect(s.attackBonus).toBe(3 + 2); // strMod 3
    expect(s.damage.modifier).toBe(3);
    expect(s.damage.faces).toBe(6);
  });

  it("falls back to STR + feat die when wearing armor", () => {
    const s = deriveUnarmedStrike(scores(10, 16), 2, 1, monk(5, false, false), "EDITION_2024");
    expect(s.attackBonus).toBe(0 + 2); // strMod 0
    expect(s.damage.faces).toBe(1); // no martial-arts die while armored
    expect(s.damage.modifier).toBe(0);
  });

  it("falls back to STR + feat die while wielding a shield", () => {
    const s = deriveUnarmedStrike(scores(10, 16), 2, 1, monk(5, true, true), "EDITION_2024");
    expect(s.attackBonus).toBe(2);
    expect(s.damage.faces).toBe(1);
  });

  it("Tavern Brawler: Monk die wins once it exceeds the feat die", () => {
    // L1 monk with Tavern Brawler (feat die 4): max(4, 6) = 6 — the 2024 martial-arts
    // floor (1d6) already exceeds the feat die, unlike the 2014 1d4 floor.
    expect(deriveUnarmedStrike(scores(10, 16), 2, 4, monk(1), "EDITION_2024").damage.faces).toBe(6);
    // L5 monk with Tavern Brawler: max(4, 8) = 8
    expect(deriveUnarmedStrike(scores(10, 16), 2, 4, monk(5), "EDITION_2024").damage.faces).toBe(8);
  });

  it("non-monk (no context) keeps STR-based flat-1 unarmed strike", () => {
    const s = deriveUnarmedStrike(scores(10, 16), 3, 1, undefined, "EDITION_2024");
    expect(s.attackBonus).toBe(0 + 3); // strMod 0 + prof
    expect(s.damage).toMatchObject({ count: 1, faces: 1, modifier: 0 });
  });

  it("non-monk with Tavern Brawler is unchanged (STR + d4)", () => {
    const s = deriveUnarmedStrike(scores(14, 18), 2, 4, undefined, "EDITION_2024");
    expect(s.attackBonus).toBe(2 + 2); // strMod 2
    expect(s.damage).toMatchObject({ faces: 4, modifier: 2 });
  });

  it("monk level 0 context (multiclass with no monk levels) stays STR-based", () => {
    const s = deriveUnarmedStrike(scores(10, 16), 2, 1, monk(0), "EDITION_2024");
    expect(s.damage.faces).toBe(1);
    expect(s.damage.modifier).toBe(0);
  });
});

// A serialized EDITION_2014 Monk's unarmedStrike.damage.faces must be 4 at monk
// level 1 and 10 at level 17 (#1499's acceptance criteria).
describe("deriveUnarmedStrike — Monk Martial Arts (EDITION_2014)", () => {
  const monk = (level: number, isUnarmored = true, hasShield = false) => ({
    level,
    isUnarmored,
    hasShield,
  });

  it("L1 monk, unarmored, Dex 16 / Str 10 uses the 2014 1d4 floor", () => {
    const s = deriveUnarmedStrike(scores(10, 16), 2, 1, monk(1), "EDITION_2014");
    expect(s.attackBonus).toBe(3 + 2); // dexMod 3 + prof 2
    expect(s.damage).toMatchObject({ count: 1, faces: 4, modifier: 3, damageType: "bludgeoning" });
  });

  it("scales the 2014 martial-arts die with monk level at each boundary", () => {
    expect(deriveUnarmedStrike(scores(10, 16), 2, 1, monk(4), "EDITION_2014").damage.faces).toBe(4);
    expect(deriveUnarmedStrike(scores(10, 16), 2, 1, monk(5), "EDITION_2014").damage.faces).toBe(6);
    expect(deriveUnarmedStrike(scores(10, 16), 2, 1, monk(10), "EDITION_2014").damage.faces).toBe(6);
    expect(deriveUnarmedStrike(scores(10, 16), 2, 1, monk(11), "EDITION_2014").damage.faces).toBe(8);
    expect(deriveUnarmedStrike(scores(10, 16), 2, 1, monk(16), "EDITION_2014").damage.faces).toBe(8);
    expect(deriveUnarmedStrike(scores(10, 16), 2, 1, monk(17), "EDITION_2014").damage.faces).toBe(10);
  });

  it("Tavern Brawler: the feat die (4) wins over the 2014 L1-4 floor of 1d4 (tie, feat die kept)", () => {
    // max(4, 4) = 4 — unlike 2024's 1d6 floor, the 2014 1d4 floor never exceeds
    // the feat die at L1-4, so this is the one place the two editions' Tavern
    // Brawler interaction differs in RESULT, not just in which table is read.
    expect(deriveUnarmedStrike(scores(10, 16), 2, 4, monk(1), "EDITION_2014").damage.faces).toBe(4);
    // L5 monk with Tavern Brawler: max(4, 6) = 6
    expect(deriveUnarmedStrike(scores(10, 16), 2, 4, monk(5), "EDITION_2014").damage.faces).toBe(6);
  });

  it("falls back to STR + feat die when wearing armor or a shield, same as 2024", () => {
    expect(deriveUnarmedStrike(scores(10, 16), 2, 1, monk(5, false, false), "EDITION_2014").damage.faces).toBe(1);
    expect(deriveUnarmedStrike(scores(10, 16), 2, 1, monk(5, true, true), "EDITION_2014").damage.faces).toBe(1);
  });
});

describe("deriveUnarmedStrike — Empowered Strikes (magical at monk L6+, edition-invariant)", () => {
  const monk = (level: number, isUnarmored = true, hasShield = false) => ({
    level,
    isUnarmored,
    hasShield,
  });

  it("L5 monk unarmed strike is not magical", () => {
    expect(deriveUnarmedStrike(scores(10, 16), 2, 1, monk(5), "EDITION_2024").magical).toBe(false);
  });

  it("L6 monk unarmed strike is magical", () => {
    expect(deriveUnarmedStrike(scores(10, 16), 2, 1, monk(6), "EDITION_2024").magical).toBe(true);
  });

  it("stays magical at higher monk levels", () => {
    expect(deriveUnarmedStrike(scores(10, 16), 2, 1, monk(20), "EDITION_2024").magical).toBe(true);
  });

  it("non-monk of any level is never magical", () => {
    expect(deriveUnarmedStrike(scores(16, 10), 4, 1, undefined, "EDITION_2024").magical).toBe(false);
    expect(deriveUnarmedStrike(scores(16, 10), 4, 1, monk(0), "EDITION_2024").magical).toBe(false);
  });

  it("magical is independent of armor/shield — gates only on monk level", () => {
    expect(deriveUnarmedStrike(scores(10, 16), 2, 1, monk(6, false, false), "EDITION_2024").magical).toBe(true);
    expect(deriveUnarmedStrike(scores(10, 16), 2, 1, monk(6, true, true), "EDITION_2024").magical).toBe(true);
  });

  it("multiclass gates off the monk class-entry level, not total level", () => {
    // Fighter 10 / Monk 6 → magical; the caller passes only the monk level.
    expect(deriveUnarmedStrike(scores(16, 10), 4, 1, monk(6), "EDITION_2024").magical).toBe(true);
    // Fighter 6 / Monk 5 → not magical.
    expect(deriveUnarmedStrike(scores(16, 10), 3, 1, monk(5), "EDITION_2024").magical).toBe(false);
  });

  it("is unaffected by edition (same magical gate for EDITION_2014)", () => {
    expect(deriveUnarmedStrike(scores(10, 16), 2, 1, monk(6), "EDITION_2014").magical).toBe(true);
    expect(deriveUnarmedStrike(scores(10, 16), 2, 1, monk(5), "EDITION_2014").magical).toBe(false);
  });
});

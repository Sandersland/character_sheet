import { describe, expect, it } from "vitest";

import {
  eldritchKnightEntry,
  hasWeaponBond,
  weaponBondAvailable,
  weaponBondEligible,
  WEAPON_BOND_LEVEL,
} from "../weapon-bond.js";

describe("weaponBondAvailable", () => {
  it("is available in 2014", () => {
    expect(weaponBondAvailable("EDITION_2014")).toBe(true);
  });

  // 2024 Eldritch Knight text is unverified/PARKED (#1531) — Weapon Bond stays
  // 2014-only until that lands (#1854 Decision).
  it("is NOT available in 2024", () => {
    expect(weaponBondAvailable("EDITION_2024")).toBe(false);
  });
});

describe("hasWeaponBond", () => {
  it("is true for an Eldritch Knight at level 3+ in 2014", () => {
    expect(hasWeaponBond(WEAPON_BOND_LEVEL, true, "EDITION_2014")).toBe(true);
    expect(hasWeaponBond(WEAPON_BOND_LEVEL + 5, true, "EDITION_2014")).toBe(true);
  });

  it("is false below level 3", () => {
    expect(hasWeaponBond(WEAPON_BOND_LEVEL - 1, true, "EDITION_2014")).toBe(false);
  });

  it("is false for a non-Eldritch-Knight, whatever the level", () => {
    expect(hasWeaponBond(20, false, "EDITION_2014")).toBe(false);
  });

  it("is false in 2024, even for a qualifying level/subclass", () => {
    expect(hasWeaponBond(WEAPON_BOND_LEVEL, true, "EDITION_2024")).toBe(false);
  });
});

describe("eldritchKnightEntry", () => {
  it("finds the fighter entry resolved to fighter-eldritch-knight (exact-name fallback)", () => {
    const entries = [{ name: "fighter", level: 3, subclass: "Eldritch Knight" }];
    expect(eldritchKnightEntry(entries)).toBe(entries[0]);
  });

  it("is case/whitespace-insensitive on the class name and subclass text", () => {
    const entries = [{ name: "Fighter", level: 3, subclass: " eldritch knight " }];
    expect(eldritchKnightEntry(entries)).toBe(entries[0]);
  });

  it("returns undefined for a different fighter subclass", () => {
    const entries = [{ name: "fighter", level: 3, subclass: "Champion" }];
    expect(eldritchKnightEntry(entries)).toBeUndefined();
  });

  it("returns undefined for a non-fighter class", () => {
    const entries = [{ name: "wizard", level: 3, subclass: "Eldritch Knight" }];
    expect(eldritchKnightEntry(entries)).toBeUndefined();
  });

  it("prefers the subclassRef FK slug over the name text", () => {
    const entries = [{ name: "fighter", level: 3, subclass: "stale name", subclassRef: { slug: "fighter-eldritch-knight" } }];
    expect(eldritchKnightEntry(entries)).toBe(entries[0]);
  });
});

describe("weaponBondEligible — single-class (effectiveEntryLevel = derived total)", () => {
  it("is eligible for a 2014 Eldritch Knight at total level 3", () => {
    const entries = [{ name: "fighter", level: 3, subclass: "Eldritch Knight" }];
    const result = weaponBondEligible(entries, 3, "EDITION_2014");
    expect(result.eligible).toBe(true);
    expect(result.entry).toBe(entries[0]);
  });

  it("uses the DERIVED total level, not a stale per-entry level, for a single class", () => {
    // entry.level says 1 (stale), but the XP-derived total is 3 — single-class
    // characters trust the derived total (mirrors effectiveEntryLevel).
    const entries = [{ name: "fighter", level: 1, subclass: "Eldritch Knight" }];
    expect(weaponBondEligible(entries, 3, "EDITION_2014").eligible).toBe(true);
  });

  it("is ineligible below level 3", () => {
    const entries = [{ name: "fighter", level: 2, subclass: "Eldritch Knight" }];
    expect(weaponBondEligible(entries, 2, "EDITION_2014").eligible).toBe(false);
  });
});

describe("weaponBondEligible — multiclass (effectiveEntryLevel = own entry level)", () => {
  it("gates on the fighter entry's OWN level, not the total character level", () => {
    // Fighter 2 / Rogue 5 = total level 7, but the fighter entry itself is
    // only 2 — below the Weapon Bond gate (mirrors monkLevel in stunning-strike.ts).
    const entries = [
      { name: "fighter", level: 2, subclass: "Eldritch Knight" },
      { name: "rogue", level: 5 },
    ];
    expect(weaponBondEligible(entries, 7, "EDITION_2014").eligible).toBe(false);
  });

  it("is eligible once the fighter entry itself reaches level 3", () => {
    const entries = [
      { name: "fighter", level: 3, subclass: "Eldritch Knight" },
      { name: "rogue", level: 5 },
    ];
    expect(weaponBondEligible(entries, 8, "EDITION_2014").eligible).toBe(true);
  });
});

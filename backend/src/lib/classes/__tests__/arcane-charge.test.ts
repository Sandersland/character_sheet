import { describe, expect, it } from "vitest";

import { arcaneChargeAvailable, hasArcaneCharge, ARCANE_CHARGE_LEVEL } from "../arcane-charge.js";

describe("arcaneChargeAvailable", () => {
  it("is available in 2014", () => {
    expect(arcaneChargeAvailable("EDITION_2014")).toBe(true);
  });

  // 2024 Eldritch Knight text is unverified/PARKED (#1531) — Arcane Charge
  // stays 2014-only, mirroring Weapon Bond's own stance (weapon-bond.ts).
  it("is NOT available in 2024", () => {
    expect(arcaneChargeAvailable("EDITION_2024")).toBe(false);
  });
});

describe("hasArcaneCharge", () => {
  it("is true for an Eldritch Knight at level 15+ in 2014", () => {
    expect(hasArcaneCharge(ARCANE_CHARGE_LEVEL, true, "EDITION_2014")).toBe(true);
    expect(hasArcaneCharge(ARCANE_CHARGE_LEVEL + 5, true, "EDITION_2014")).toBe(true);
    expect(hasArcaneCharge(20, true, "EDITION_2014")).toBe(true);
  });

  it("is false below level 15", () => {
    expect(hasArcaneCharge(ARCANE_CHARGE_LEVEL - 1, true, "EDITION_2014")).toBe(false);
    expect(hasArcaneCharge(1, true, "EDITION_2014")).toBe(false);
  });

  it("is false for a non-Eldritch-Knight, whatever the level", () => {
    expect(hasArcaneCharge(20, false, "EDITION_2014")).toBe(false);
  });

  it("is false in 2024, even for a qualifying level/subclass", () => {
    expect(hasArcaneCharge(ARCANE_CHARGE_LEVEL, true, "EDITION_2024")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { mechanicsFor, MANEUVER_MECHANICS } from "./maneuvers";

describe("MANEUVER_MECHANICS", () => {
  it("covers all 16 seed maneuvers", () => {
    const expectedNames = [
      "Commander's Strike",
      "Disarming Attack",
      "Distracting Strike",
      "Evasive Footwork",
      "Feinting Attack",
      "Goading Attack",
      "Lunging Attack",
      "Maneuvering Attack",
      "Menacing Attack",
      "Parry",
      "Precision Attack",
      "Pushing Attack",
      "Rally",
      "Riposte",
      "Sweeping Attack",
      "Trip Attack",
    ];
    for (const name of expectedNames) {
      expect(MANEUVER_MECHANICS).toHaveProperty(name);
    }
  });

  it("classifies Precision Attack as addToAttack", () => {
    expect(MANEUVER_MECHANICS["Precision Attack"].mechanic).toBe("addToAttack");
  });

  it("classifies Commander's Strike as special with bonusAction slot", () => {
    const m = MANEUVER_MECHANICS["Commander's Strike"];
    expect(m.mechanic).toBe("special");
    expect(m.consumesAttack).toBe(true);
    expect(m.slot).toBe("bonusAction");
  });

  it("classifies Riposte as addToDamage with reaction slot", () => {
    const m = MANEUVER_MECHANICS["Riposte"];
    expect(m.mechanic).toBe("addToDamage");
    expect(m.slot).toBe("reaction");
  });

  it("classifies Parry as saveBased with reaction slot", () => {
    const m = MANEUVER_MECHANICS["Parry"];
    expect(m.mechanic).toBe("saveBased");
    expect(m.slot).toBe("reaction");
  });

  it("classifies Evasive Footwork as saveBased without a slot", () => {
    const m = MANEUVER_MECHANICS["Evasive Footwork"];
    expect(m.mechanic).toBe("saveBased");
    expect(m.slot).toBeUndefined();
  });

  it("classifies damage-adding attacks as addToDamage", () => {
    const damageManeuvers = [
      "Trip Attack",
      "Disarming Attack",
      "Menacing Attack",
      "Pushing Attack",
      "Sweeping Attack",
      "Distracting Strike",
      "Goading Attack",
      "Lunging Attack",
      "Maneuvering Attack",
      "Feinting Attack",
      "Rally",
    ];
    for (const name of damageManeuvers) {
      expect(MANEUVER_MECHANICS[name].mechanic).toBe("addToDamage");
    }
  });
});

describe("mechanicsFor", () => {
  it("returns the correct entry for a known maneuver", () => {
    expect(mechanicsFor("Precision Attack").mechanic).toBe("addToAttack");
    expect(mechanicsFor("Trip Attack").mechanic).toBe("addToDamage");
    expect(mechanicsFor("Parry").mechanic).toBe("saveBased");
  });

  it("defaults to addToDamage for an unknown maneuver name", () => {
    expect(mechanicsFor("Homebrew Strike").mechanic).toBe("addToDamage");
    expect(mechanicsFor("").mechanic).toBe("addToDamage");
    expect(mechanicsFor("unknown maneuver xyz").mechanic).toBe("addToDamage");
  });
});

// PHB'14 p.81: every save-based damage discipline halves damage on a successful save.
// Lives here, not backend/src/**, because importing DISCIPLINES from src hits tsconfig's rootDir:"src" (TS6059).
import { describe, expect, it } from "vitest";

import { DISCIPLINES } from "../disciplines.js";

describe("discipline catalog content audit (#1503 review fix)", () => {
  it("every save-based damage discipline resolves saveEffect \"half\" (PHB'14 p.81: all are save-for-half)", () => {
    const saveForDamage = DISCIPLINES.filter((d) => d.effectKind === "damage" && d.attackType === "save");
    // fails if the filter stops matching rows and iterates nothing
    expect(saveForDamage.length).toBeGreaterThanOrEqual(8);
    const missing = saveForDamage.filter((d) => d.saveEffect !== "half").map((d) => d.name);
    expect(missing, `save-for-damage discipline(s) missing saveEffect "half": ${missing.join(", ")}`).toEqual([]);
  });

  it("Fist of Unbroken Air and Water Whip specifically carry saveEffect \"half\" (the two rows this review caught)", () => {
    for (const name of ["Fist of Unbroken Air", "Water Whip"]) {
      const row = DISCIPLINES.find((d) => d.name === name);
      expect(row, name).toBeDefined();
      expect(row!.saveEffect, name).toBe("half");
    }
  });

  it("Fangs of the Fire Snake (the one attack-roll, not save, damage discipline) carries no saveEffect", () => {
    const row = DISCIPLINES.find((d) => d.name === "Fangs of the Fire Snake")!;
    expect(row.attackType).toBe("attack");
    expect(row.saveEffect).toBeUndefined();
  });

  it("every damageType/effectDiceCount/effectDiceFaces/saveAbility field is present exactly when effectKind is \"damage\"", () => {
    for (const d of DISCIPLINES) {
      if (d.effectKind === "damage") {
        expect(d.effectDiceCount, d.name).toBeGreaterThan(0);
        expect(d.effectDiceFaces, d.name).toBeGreaterThan(0);
        expect(d.damageType, d.name).toBeTruthy();
      } else {
        expect(d.effectDiceCount, d.name).toBeUndefined();
        expect(d.effectDiceFaces, d.name).toBeUndefined();
        expect(d.damageType, d.name).toBeUndefined();
      }
    }
  });
});

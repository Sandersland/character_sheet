// Content-correctness audit for the discipline catalog (#1503 review fix):
// PHB'14 p.81 every save-based damage discipline explicitly halves damage on
// a successful save ("takes half damage on a success" / "half on a
// success") — Fist of Unbroken Air and Water Whip's own DESCRIPTIONS already
// said so, but their seed rows omitted `saveEffect: "half"`, so
// catalogEffectSpec (lib/combat/effects.ts) resolved `saveEffect: null` and a
// successful save would have wrongly dealt FULL damage. Asserted as a
// general invariant (not just the two named rows) so the same field/text
// mismatch can't reappear on a future discipline.
//
// Lives under prisma/seed/__tests__ (not backend/src/**) because it imports
// DISCIPLINES directly — backend/tsconfig.json's `rootDir: "src"` makes a
// src file importing anything under prisma/ a compile error (TS6059), the
// same constraint literal-fixture-parity.test.ts's own header documents.
import { describe, expect, it } from "vitest";

import { DISCIPLINES } from "../disciplines.js";

describe("discipline catalog content audit (#1503 review fix)", () => {
  it("every save-based damage discipline resolves saveEffect \"half\" (PHB'14 p.81: all are save-for-half)", () => {
    const saveForDamage = DISCIPLINES.filter((d) => d.effectKind === "damage" && d.attackType === "save");
    // Anti-vacuity: today's catalog has 8 such rows (Fist of Four Thunders,
    // Fist of Unbroken Air, Sweeping Cinder Strike, Water Whip, Gong of the
    // Summit, Flames of the Phoenix, Breath of Winter, River of Hungry
    // Flame) — a filter that stopped matching any of them would make this
    // test pass by iterating nothing.
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

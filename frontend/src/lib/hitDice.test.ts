import { describe, it, expect } from "vitest";

import {
  advancingHitDie,
  averageHitPointGain,
  dieFaces,
  hitPointGainRange,
  hitPointStepMath,
} from "@/lib/hitDice";
import type { Character, ClassOption, LevelUpTarget } from "@/types/character";

describe("dieFaces", () => {
  it("parses a hit-die string to its face count", () => {
    expect(dieFaces("d10")).toBe(10);
    expect(dieFaces("d6")).toBe(6);
    expect(dieFaces("d12")).toBe(12);
  });

  it("is case-insensitive on the leading d", () => {
    expect(dieFaces("D8")).toBe(8);
  });
});

describe("averageHitPointGain", () => {
  it("applies the 5e fixed average plus Con mod", () => {
    expect(averageHitPointGain(10, 2)).toBe(8); // floor(10/2)+1+2
    expect(averageHitPointGain(6, 0)).toBe(4);
    expect(averageHitPointGain(8, -1)).toBe(4);
  });

  it("clamps at a minimum of 1 for large negative Con mods", () => {
    expect(averageHitPointGain(6, -10)).toBe(1);
  });
});

describe("hitPointGainRange", () => {
  it("returns the inclusive roll range with Con mod applied", () => {
    expect(hitPointGainRange(10, 2)).toEqual({ min: 3, max: 12 });
    expect(hitPointGainRange(6, 0)).toEqual({ min: 1, max: 6 });
  });

  it("clamps both ends at a minimum of 1", () => {
    expect(hitPointGainRange(6, -5)).toEqual({ min: 1, max: 1 });
  });
});

describe("advancingHitDie", () => {
  const refs = [
    { id: "cls-fighter", name: "Fighter", hitDie: "d10" },
    { id: "cls-wizard", name: "Wizard", hitDie: "d6" },
  ] as ClassOption[];

  const character = {
    hitDice: { die: "d10", total: 3, spent: 0 },
    classes: [{ id: "entry-1", name: "Fighter" }],
  } as unknown as Character;

  it("resolves an existing class entry's die by its class name", () => {
    const target: LevelUpTarget = { kind: "existing", classEntryId: "entry-1" };
    expect(advancingHitDie(character, refs, target)).toBe("d10");
  });

  it("resolves a new multiclass die by the referenced class id", () => {
    const target: LevelUpTarget = { kind: "new", classId: "cls-wizard" };
    expect(advancingHitDie(character, refs, target)).toBe("d6");
  });

  it("falls back to the primary die when target is undefined", () => {
    expect(advancingHitDie(character, refs, undefined)).toBe("d10");
  });

  it("falls back to the primary die when the class is not in the reference list", () => {
    const target: LevelUpTarget = { kind: "new", classId: "cls-unknown" };
    expect(advancingHitDie(character, refs, target)).toBe("d10");
  });

  it("falls back to the primary die when no reference classes are supplied", () => {
    const target: LevelUpTarget = { kind: "existing", classEntryId: "entry-1" };
    expect(advancingHitDie(character, [], target)).toBe("d10");
  });
});

describe("hitPointStepMath", () => {
  const refs = [
    { id: "cls-fighter", name: "fighter", hitDie: "d10" },
    { id: "cls-wizard", name: "wizard", hitDie: "d6" },
  ] as ClassOption[];

  function characterWith(constitution: number): Character {
    return {
      abilityScores: { constitution } as Character["abilityScores"],
      hitDice: { die: "d10", total: 7, spent: 0 },
      classes: [
        { id: "entry-1", name: "fighter", level: 7 },
        { id: "entry-2", name: "wizard", level: 3 },
      ],
    } as unknown as Character;
  }

  it("derives the advancing die, faces, and average/roll gains with the Con modifier", () => {
    const math = hitPointStepMath(characterWith(16), refs, "entry-1"); // d10, +3 Con
    expect(math).toMatchObject({
      die: "d10",
      faces: 10,
      conMod: 3,
      conLabel: "+3",
      conText: "+3 CON",
      averageGain: 9, // 6 + 3
      fixedBase: 6, // Con-free base
      minRoll: 4, // 1 + 3
      maxRoll: 13, // 10 + 3
    });
  });

  it("follows the selected entry to its class's die (wizard → d6)", () => {
    const math = hitPointStepMath(characterWith(10), refs, "entry-2"); // d6, +0 Con
    expect(math).toMatchObject({ die: "d6", faces: 6, averageGain: 4, minRoll: 1, maxRoll: 6 });
  });

  it("falls back to the character's own die when reference is empty", () => {
    const math = hitPointStepMath(characterWith(10), [], "entry-2");
    expect(math.die).toBe("d10");
  });
});

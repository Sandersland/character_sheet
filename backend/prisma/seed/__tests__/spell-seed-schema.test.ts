// spellSeedSchema is the validation surface for SPELLS/SPELLS_2014 (#1277).
import { describe, expect, it } from "vitest";

import { spellSeedSchema } from "../spells.js";

const baseSpell = {
  name: "Test Spell",
  level: 1,
  school: "evocation" as const,
  castingTime: "1 action",
  range: "60 feet",
  duration: "Instantaneous",
  description: "test",
  classes: ["wizard"],
};

describe("spellSeedSchema — identity + required fields", () => {
  it("accepts a minimal valid spell", () => {
    expect(spellSeedSchema.safeParse(baseSpell).success).toBe(true);
  });

  it("rejects a negative spell level", () => {
    expect(spellSeedSchema.safeParse({ ...baseSpell, level: -1 }).success).toBe(false);
  });
});

describe("spellSeedSchema — school (mirrors the DB SpellSchool enum)", () => {
  it("accepts every real school", () => {
    for (const school of ["abjuration", "conjuration", "divination", "enchantment", "evocation", "illusion", "necromancy", "transmutation"]) {
      expect(spellSeedSchema.safeParse({ ...baseSpell, school }).success).toBe(true);
    }
  });

  it("rejects a school outside the DB enum", () => {
    expect(spellSeedSchema.safeParse({ ...baseSpell, school: "arcana" }).success).toBe(false);
  });
});

describe("spellSeedSchema — effectKind (no 'utility' — omission expresses that for a spell)", () => {
  it("accepts damage/heal/buff", () => {
    for (const effectKind of ["damage", "heal", "buff"]) {
      expect(spellSeedSchema.safeParse({ ...baseSpell, effectKind }).success).toBe(true);
    }
  });

  it("rejects 'utility' — never authored on a Spell row", () => {
    expect(spellSeedSchema.safeParse({ ...baseSpell, effectKind: "utility" }).success).toBe(false);
  });
});

describe("spellSeedSchema — damageType (every 5e damage type)", () => {
  it("accepts a real damage type", () => {
    expect(spellSeedSchema.safeParse({ ...baseSpell, damageType: "fire" }).success).toBe(true);
  });

  it("rejects a non-5e damage type", () => {
    expect(spellSeedSchema.safeParse({ ...baseSpell, damageType: "holy" }).success).toBe(false);
  });
});

describe("spellSeedSchema — attackType", () => {
  it("rejects an unknown attackType", () => {
    expect(spellSeedSchema.safeParse({ ...baseSpell, attackType: "melee" }).success).toBe(false);
  });
});

describe("spellSeedSchema — saveAbility (six ability keys)", () => {
  it("rejects a non-ability saveAbility", () => {
    expect(spellSeedSchema.safeParse({ ...baseSpell, saveAbility: "luck" }).success).toBe(false);
  });
});

describe("spellSeedSchema — saveEffect", () => {
  it("rejects an unknown saveEffect", () => {
    expect(spellSeedSchema.safeParse({ ...baseSpell, saveEffect: "quarter" }).success).toBe(false);
  });
});

describe("spellSeedSchema — multi-instance fields (#1981)", () => {
  it("accepts instanceCount + instanceRoll + upcastInstancesPerLevel", () => {
    expect(
      spellSeedSchema.safeParse({ ...baseSpell, instanceCount: 3, instanceRoll: "once", upcastInstancesPerLevel: 1 })
        .success,
    ).toBe(true);
  });

  it("rejects an instanceRoll outside each/once", () => {
    expect(spellSeedSchema.safeParse({ ...baseSpell, instanceCount: 3, instanceRoll: "all" }).success).toBe(false);
  });

  it("rejects a non-positive instanceCount", () => {
    expect(spellSeedSchema.safeParse({ ...baseSpell, instanceCount: 0 }).success).toBe(false);
  });

  it("rejects instanceRoll without instanceCount — this is THE cross-catalog guard SPELLS_2014 needs too (#1981 review)", () => {
    expect(spellSeedSchema.safeParse({ ...baseSpell, instanceRoll: "once" }).success).toBe(false);
  });

  it("rejects upcastInstancesPerLevel without instanceCount", () => {
    expect(spellSeedSchema.safeParse({ ...baseSpell, upcastInstancesPerLevel: 1 }).success).toBe(false);
  });

  it("rejects upcastInstancesPerLevel on a cantrip (level 0)", () => {
    expect(
      spellSeedSchema.safeParse({ ...baseSpell, level: 0, instanceCount: 1, upcastInstancesPerLevel: 1 }).success,
    ).toBe(false);
  });

  it("accepts upcastInstancesPerLevel on a leveled spell with instanceCount", () => {
    expect(
      spellSeedSchema.safeParse({ ...baseSpell, level: 1, instanceCount: 3, upcastInstancesPerLevel: 1 }).success,
    ).toBe(true);
  });
});

describe("spellSeedSchema — buffTarget (narrower than ClassFeature's: AC family only)", () => {
  it("accepts ac/acUnarmoredBase/acFloor", () => {
    for (const buffTarget of ["ac", "acUnarmoredBase", "acFloor"]) {
      expect(spellSeedSchema.safeParse({ ...baseSpell, buffTarget }).success).toBe(true);
    }
  });

  it("rejects attackRoll — legal for a ClassFeature/GrantedAbility row, not a Spell row", () => {
    expect(spellSeedSchema.safeParse({ ...baseSpell, buffTarget: "attackRoll" }).success).toBe(false);
  });
});

// Every ClassFeature string-union / stringly-typed column now parses against a zod enum derived
// from its named TS union (#1277's gap: these columns used to accept ANY string). One test per
// column proves the schema actually rejects a bad value, not just that valid rows still pass.
import { describe, expect, it } from "vitest";

import { classFeatureSeedSchema, KNOWN_BUFF_TARGETS } from "../class-features.js";

const baseRow = {
  className: "Fighter",
  subclassSlug: null,
  name: "Test Feature",
  level: 1,
  description: "test",
  edition: "EDITION_2024" as const,
};

describe("classFeatureSeedSchema — activationCost (mirrors ActionCost)", () => {
  it("accepts every real ActionCost value", () => {
    for (const activationCost of ["action", "bonusAction", "reaction", "free", "special"]) {
      expect(classFeatureSeedSchema.safeParse({ ...baseRow, activationCost }).success).toBe(true);
    }
  });

  it("rejects a value outside ActionCost", () => {
    const result = classFeatureSeedSchema.safeParse({ ...baseRow, activationCost: "movement" });
    expect(result.success).toBe(false);
  });
});

describe("classFeatureSeedSchema — resolverKind (mirrors frontend ResolutionKind)", () => {
  it("accepts a real ResolutionKind value", () => {
    expect(classFeatureSeedSchema.safeParse({ ...baseRow, resolverKind: "slot-picker" }).success).toBe(true);
  });

  it("rejects a value outside ResolutionKind", () => {
    const result = classFeatureSeedSchema.safeParse({ ...baseRow, resolverKind: "modal-picker" });
    expect(result.success).toBe(false);
  });
});

describe("classFeatureSeedSchema — costKind (mirrors AbilityCost's kind discriminant)", () => {
  it("accepts none/pool/slot", () => {
    for (const costKind of ["none", "pool", "slot"]) {
      expect(classFeatureSeedSchema.safeParse({ ...baseRow, costKind }).success).toBe(true);
    }
  });

  it("rejects an unknown costKind", () => {
    const result = classFeatureSeedSchema.safeParse({ ...baseRow, costKind: "charge" });
    expect(result.success).toBe(false);
  });
});

describe("classFeatureSeedSchema — effectKind (mirrors shared-types EffectType)", () => {
  it("accepts damage/heal/buff/utility", () => {
    for (const effectKind of ["damage", "heal", "buff", "utility"]) {
      expect(classFeatureSeedSchema.safeParse({ ...baseRow, effectKind }).success).toBe(true);
    }
  });

  it("rejects an unknown effectKind", () => {
    const result = classFeatureSeedSchema.safeParse({ ...baseRow, effectKind: "debuff" });
    expect(result.success).toBe(false);
  });
});

describe("classFeatureSeedSchema — damageType (every 5e damage type)", () => {
  it("accepts a real damage type", () => {
    expect(classFeatureSeedSchema.safeParse({ ...baseRow, damageType: "radiant" }).success).toBe(true);
  });

  it("rejects a non-5e damage type (a likely typo)", () => {
    const result = classFeatureSeedSchema.safeParse({ ...baseRow, damageType: "shadow" });
    expect(result.success).toBe(false);
  });
});

describe("classFeatureSeedSchema — attackType", () => {
  it("accepts attack/save", () => {
    expect(classFeatureSeedSchema.safeParse({ ...baseRow, attackType: "attack" }).success).toBe(true);
    expect(classFeatureSeedSchema.safeParse({ ...baseRow, attackType: "save" }).success).toBe(true);
  });

  it("rejects an unknown attackType", () => {
    const result = classFeatureSeedSchema.safeParse({ ...baseRow, attackType: "melee" });
    expect(result.success).toBe(false);
  });
});

describe("classFeatureSeedSchema — saveAbility / saveDcAbilities (six ability keys)", () => {
  it("accepts a real ability for saveAbility", () => {
    expect(classFeatureSeedSchema.safeParse({ ...baseRow, saveAbility: "wisdom" }).success).toBe(true);
  });

  it("rejects a non-ability saveAbility (e.g. a skill key typo'd in)", () => {
    const result = classFeatureSeedSchema.safeParse({ ...baseRow, saveAbility: "perception" });
    expect(result.success).toBe(false);
  });

  it("accepts a saveDcAbilities array of real abilities", () => {
    expect(classFeatureSeedSchema.safeParse({ ...baseRow, saveDcAbilities: ["strength", "charisma"] }).success).toBe(true);
  });

  it("rejects a saveDcAbilities entry outside the six abilities", () => {
    const result = classFeatureSeedSchema.safeParse({ ...baseRow, saveDcAbilities: ["strength", "luck"] });
    expect(result.success).toBe(false);
  });
});

describe("classFeatureSeedSchema — saveEffect", () => {
  it("accepts half/none", () => {
    expect(classFeatureSeedSchema.safeParse({ ...baseRow, saveEffect: "half" }).success).toBe(true);
    expect(classFeatureSeedSchema.safeParse({ ...baseRow, saveEffect: "none" }).success).toBe(true);
  });

  it("rejects an unknown saveEffect", () => {
    const result = classFeatureSeedSchema.safeParse({ ...baseRow, saveEffect: "quarter" });
    expect(result.success).toBe(false);
  });
});

describe("classFeatureSeedSchema — derivedStat (every derivedStatFromRows call-site name)", () => {
  it("accepts every real derivedStat name", () => {
    for (const derivedStat of ["attacksPerAction", "critRange", "expertiseChoiceCount", "maneuverChoiceCount", "toolProfChoiceCount"]) {
      expect(classFeatureSeedSchema.safeParse({ ...baseRow, derivedStat }).success).toBe(true);
    }
  });

  it("rejects a derivedStat name with no reader", () => {
    const result = classFeatureSeedSchema.safeParse({ ...baseRow, derivedStat: "spellSlotBonus" });
    expect(result.success).toBe(false);
  });
});

describe("classFeatureSeedSchema — effectModifierSource", () => {
  it("accepts classLevel", () => {
    expect(classFeatureSeedSchema.safeParse({ ...baseRow, effectModifierSource: "classLevel" }).success).toBe(true);
  });

  it("rejects the reserved-but-unimplemented abilityMod:<ability> pattern (no reader resolves it yet)", () => {
    const result = classFeatureSeedSchema.safeParse({ ...baseRow, effectModifierSource: "abilityMod:wisdom" });
    expect(result.success).toBe(false);
  });

  it("rejects an unrelated string", () => {
    const result = classFeatureSeedSchema.safeParse({ ...baseRow, effectModifierSource: "characterLevel" });
    expect(result.success).toBe(false);
  });
});

describe("classFeatureSeedSchema — buffTarget (KNOWN_BUFF_TARGETS membership)", () => {
  it("accepts every KNOWN_BUFF_TARGETS entry", () => {
    for (const buffTarget of KNOWN_BUFF_TARGETS) {
      expect(classFeatureSeedSchema.safeParse({ ...baseRow, buffTarget }).success).toBe(true);
    }
  });

  it("rejects a buffTarget outside KNOWN_BUFF_TARGETS", () => {
    const result = classFeatureSeedSchema.safeParse({ ...baseRow, buffTarget: "hitPoints" });
    expect(result.success).toBe(false);
  });
});

describe("classFeatureSeedSchema — resourceLabel (previously unvalidated)", () => {
  it("accepts a non-empty label", () => {
    expect(classFeatureSeedSchema.safeParse({ ...baseRow, resourceLabel: "Ki Points" }).success).toBe(true);
  });

  it("rejects an empty label", () => {
    const result = classFeatureSeedSchema.safeParse({ ...baseRow, resourceLabel: "" });
    expect(result.success).toBe(false);
  });
});

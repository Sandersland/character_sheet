// The five GrantedAbility source-family schemas (#1277's gap: none of these had a seed-time
// schema before this) — MANEUVERS, SHADOW_ARTS, DISCIPLINES, CHANNEL_DIVINITIES,
// SUBCLASS_CHOICE_OPTIONS. One negative case per string-union column proves each schema
// actually rejects a bad value.
import { describe, expect, it } from "vitest";

import { maneuverSeedSchema } from "../maneuvers.js";
import { shadowArtSeedSchema } from "../shadow-arts.js";
import { disciplineSeedSchema } from "../disciplines.js";
import { channelDivinitySeedSchema } from "../channel-divinity.js";
import { subclassChoiceOptionSeedSchema } from "../subclass-choices.js";

describe("maneuverSeedSchema", () => {
  const base = { name: "Test Maneuver", description: "test", placement: "damageRoll" as const };

  it("accepts a minimal valid maneuver", () => {
    expect(maneuverSeedSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a placement outside ManeuverPlacement", () => {
    expect(maneuverSeedSchema.safeParse({ ...base, placement: "bonusRoll" }).success).toBe(false);
  });

  it("rejects an actionSlot outside bonusAction/reaction", () => {
    expect(maneuverSeedSchema.safeParse({ ...base, actionSlot: "action" }).success).toBe(false);
  });

  it("rejects a saveAbility outside the four maneuver save abilities", () => {
    expect(maneuverSeedSchema.safeParse({ ...base, saveAbility: "charisma" }).success).toBe(false);
  });

  it("accepts every real saveAbility", () => {
    for (const saveAbility of ["strength", "dexterity", "wisdom", "constitution"]) {
      expect(maneuverSeedSchema.safeParse({ ...base, saveAbility }).success).toBe(true);
    }
  });
});

describe("shadowArtSeedSchema", () => {
  const base = { name: "Shadow Arts: Test", description: "test", edition: "EDITION_2024" as const, costPoolKey: "focus" as const, costBase: 1 };

  it("accepts a minimal valid row", () => {
    expect(shadowArtSeedSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a costPoolKey outside ki/focus", () => {
    expect(shadowArtSeedSchema.safeParse({ ...base, costPoolKey: "sorceryPoints" }).success).toBe(false);
  });

  it("rejects a zero costBase — every shadow art spends at least 1", () => {
    expect(shadowArtSeedSchema.safeParse({ ...base, costBase: 0 }).success).toBe(false);
  });
});

describe("disciplineSeedSchema", () => {
  const base = { name: "Test Discipline", description: "test", minLevel: 3, edition: "EDITION_2014" as const, costKind: "pool" as const };

  it("accepts a minimal valid row", () => {
    expect(disciplineSeedSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a costKind outside pool/none", () => {
    expect(disciplineSeedSchema.safeParse({ ...base, costKind: "slot" }).success).toBe(false);
  });

  it("rejects effectKind other than damage — no discipline heals or buffs", () => {
    expect(disciplineSeedSchema.safeParse({ ...base, effectKind: "heal" }).success).toBe(false);
  });

  it("rejects a non-5e damageType", () => {
    expect(disciplineSeedSchema.safeParse({ ...base, damageType: "holy" }).success).toBe(false);
  });

  it("rejects saveEffect other than half — no discipline negates damage entirely on save", () => {
    expect(disciplineSeedSchema.safeParse({ ...base, saveEffect: "none" }).success).toBe(false);
  });
});

describe("channelDivinitySeedSchema", () => {
  const base = { name: "Channel Divinity: Test", description: "test" };

  it("accepts a minimal valid row", () => {
    expect(channelDivinitySeedSchema.safeParse(base).success).toBe(true);
  });

  it("rejects effectKind other than buff", () => {
    expect(channelDivinitySeedSchema.safeParse({ ...base, effectKind: "damage" }).success).toBe(false);
  });

  it("accepts a KNOWN_BUFF_TARGETS buffTarget (attackRoll — Sacred Weapon's own value)", () => {
    expect(channelDivinitySeedSchema.safeParse({ ...base, effectKind: "buff", buffTarget: "attackRoll" }).success).toBe(true);
  });

  it("rejects a buffTarget outside KNOWN_BUFF_TARGETS", () => {
    expect(channelDivinitySeedSchema.safeParse({ ...base, effectKind: "buff", buffTarget: "hitPoints" }).success).toBe(false);
  });

  it("rejects a saveAbility outside the six abilities", () => {
    expect(channelDivinitySeedSchema.safeParse({ ...base, saveAbility: "luck" }).success).toBe(false);
  });
});

describe("subclassChoiceOptionSeedSchema", () => {
  const base = { name: "Test Option", source: "huntersPrey", description: "test", minLevel: 3 };

  it("accepts a minimal valid row", () => {
    expect(subclassChoiceOptionSeedSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a non-positive minLevel", () => {
    expect(subclassChoiceOptionSeedSchema.safeParse({ ...base, minLevel: 0 }).success).toBe(false);
  });

  it("rejects an unknown edition", () => {
    expect(subclassChoiceOptionSeedSchema.safeParse({ ...base, edition: "EDITION_1999" }).success).toBe(false);
  });
});

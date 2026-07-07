import { describe, expect, it } from "vitest";

import {
  capabilitySummary,
  describeAttunementPrereq,
  targetUsesAbilityKey,
  targetUsesSkillKey,
} from "@/lib/capabilities";

describe("capabilitySummary", () => {
  it("resolves a skill targetKey through skillLabel (never a raw key)", () => {
    expect(
      capabilitySummary({ kind: "passiveBonus", target: "skill", op: "add", value: 2, targetKey: "sleightOfHand" }),
    ).toBe("+2 Sleight of Hand");
  });

  it("resolves a save targetKey through abilityLabel", () => {
    expect(
      capabilitySummary({ kind: "passiveBonus", target: "save", op: "add", value: 1, targetKey: "dexterity" }),
    ).toBe("+1 Dexterity save");
  });

  it("formats a dice-valued damage bonus with type + condition", () => {
    expect(
      capabilitySummary({
        kind: "passiveBonus",
        target: "damage",
        op: "add",
        dice: { count: 2, faces: 6, damageType: "fire" },
        condition: "on hit",
      }),
    ).toBe("+2d6 fire Damage (when on hit)");
  });

  it("formats a negative scalar and a setTo op", () => {
    expect(capabilitySummary({ kind: "passiveBonus", target: "ac", op: "add", value: -1 })).toBe("-1 AC");
    expect(capabilitySummary({ kind: "passiveBonus", target: "speed", op: "setTo", value: 40 })).toBe(
      "set to 40 Speed",
    );
  });

  it("falls back to description for a reserved (opaque) kind", () => {
    expect(capabilitySummary({ kind: "charges", description: "3 charges of light" })).toBe("3 charges of light");
  });
});

describe("target key predicates", () => {
  it("marks save/abilityScore as ability-keyed and skill as skill-keyed", () => {
    expect(targetUsesAbilityKey("save")).toBe(true);
    expect(targetUsesAbilityKey("abilityScore")).toBe(true);
    expect(targetUsesAbilityKey("skill")).toBe(false);
    expect(targetUsesSkillKey("skill")).toBe(true);
    expect(targetUsesSkillKey("ac")).toBe(false);
  });
});

describe("describeAttunementPrereq", () => {
  it("phrases each kind", () => {
    expect(describeAttunementPrereq("spellcaster")).toBe("a spellcaster");
    expect(describeAttunementPrereq("class", "Wizard")).toBe("a Wizard");
    expect(describeAttunementPrereq("species", "Elf")).toBe("a Elf");
    expect(describeAttunementPrereq("alignment", "Lawful Good")).toBe("a Lawful Good creature");
  });

  it("degrades gracefully with no value", () => {
    expect(describeAttunementPrereq("class")).toBe("a specific class");
  });
});

import { describe, expect, it } from "vitest";

import {
  advantageGrantSummary,
  capabilitySummary,
  castSpellSummary,
  describeAttunementPrereq,
  grantSummary,
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

  it("falls back to description for a malformed charges cap (no maxCharges)", () => {
    expect(capabilitySummary({ kind: "charges", description: "3 charges of light" })).toBe("3 charges of light");
  });

  it("summarizes a charges pool (#555)", () => {
    expect(
      capabilitySummary({
        kind: "charges",
        maxCharges: 7,
        recharge: { trigger: "dawn", dice: { count: 1, faces: 6 }, bonus: 1 },
      }),
    ).toBe("7 charges · regains 1d6+1 at dawn");
    expect(capabilitySummary({ kind: "charges", maxCharges: 3, recharge: { trigger: "long" } })).toBe(
      "3 charges · refills on a long rest",
    );
    expect(capabilitySummary({ kind: "charges", maxCharges: 1, recharge: { trigger: "dawn", bonus: 1 } })).toBe(
      "1 charge · regains 1 at dawn",
    );
  });

  it("routes a castSpell cap through castSpellSummary", () => {
    expect(
      capabilitySummary({
        kind: "castSpell",
        spellName: "Witch Bolt",
        resource: "perRestShort",
        dcMode: "fixed",
        dcValue: 15,
      }),
    ).toBe("Casts Witch Bolt · 1×/short rest · DC 15");
  });

  it("shows the pool cost on a charges-costed castSpell (#555)", () => {
    expect(
      capabilitySummary({ kind: "castSpell", spellName: "Magic Missile", resource: "charges", chargeCost: 3, dcMode: "fixed" }),
    ).toBe("Casts Magic Missile · costs 3 charges");
    expect(
      capabilitySummary({ kind: "castSpell", spellName: "Magic Missile", resource: "charges", dcMode: "fixed" }),
    ).toBe("Casts Magic Missile · costs 1 charge");
  });
});

describe("castSpellSummary", () => {
  it("names the spell, resource, and a fixed DC", () => {
    expect(
      castSpellSummary({
        kind: "castSpell",
        spellName: "Fireball",
        resource: "perDayDawn",
        dcMode: "fixed",
        dcValue: 15,
      }),
    ).toBe("Casts Fireball · 1×/day (dawn) · DC 15");
  });

  it("phrases wielder mode without a numeric DC", () => {
    expect(
      castSpellSummary({ kind: "castSpell", spellName: "Bless", resource: "perRestLong", dcMode: "wielder", dcValue: 15 }),
    ).toBe("Casts Bless · 1×/long rest · wielder DC");
  });

  it("omits the DC segment when fixed mode carries no value, and falls back to 'spell'", () => {
    expect(castSpellSummary({ kind: "castSpell", resource: "atWill", dcMode: "fixed" })).toBe("Casts spell · At will");
  });
});

describe("grant summaries (#529)", () => {
  it("resolves a check-axis advantage skill through skillLabel", () => {
    expect(
      capabilitySummary({ kind: "grant", grantType: "advantage", grantOn: "check", grantValueKind: "skill", grantValue: "perception" }),
    ).toBe("Advantage on Ability check (Perception)");
  });

  it("ignores a stale skill/ability qualifier on a whole-axis (initiative) advantage", () => {
    // Even if a stale grantValue survives, initiative renders without "(Perception)".
    expect(
      grantSummary({ kind: "grant", grantType: "advantage", grantOn: "initiative", grantValueKind: "skill", grantValue: "perception", cantBeSurprised: true }),
    ).toBe("Advantage on Initiative; can't be surprised");
    expect(
      advantageGrantSummary({ on: "initiative", valueKind: "skill", value: "perception", cantBeSurprised: true, source: "Weapon of Warning" }),
    ).toBe("Advantage on Initiative; can't be surprised");
  });

  it("ignores a stale qualifier on an attack-axis advantage too", () => {
    expect(
      advantageGrantSummary({ on: "attack", valueKind: "skill", value: "perception", cantBeSurprised: false, source: "X" }),
    ).toBe("Advantage on Attack roll");
  });

  it("resolves resistance/condition-immunity grants through label helpers", () => {
    expect(capabilitySummary({ kind: "grant", grantType: "resistance", grantValueKind: "damageType", grantValue: "fire" })).toBe("Resistance to Fire");
    expect(capabilitySummary({ kind: "grant", grantType: "conditionImmunity", grantValueKind: "condition", grantValue: "poisoned" })).toBe("Immune to Poisoned");
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

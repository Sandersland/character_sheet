import { describe, expect, it } from "vitest";

import {
  activatedMaxUses,
  activatedRechargeRest,
  describeActivatedReminder,
  deriveItemPassiveBonuses,
  describeAttunementPrereq,
  meetsAttunementPrereq,
  passiveBonusChannel,
  readCapability,
  type ActivatedEffectCapability,
  type CapabilityColumns,
} from "../capabilities.js";

const bootsOfSpeed: CapabilityColumns = {
  kind: "activatedEffect",
  activation: "bonus",
  target: "speed",
  op: "add",
  value: 30,
  activatedDuration: "untilRest",
  resourceKind: "perRest",
  resourcePeriod: "long",
  resourceCharges: 1,
};

const scalarSkill: CapabilityColumns = {
  kind: "passiveBonus",
  target: "skill",
  op: "add",
  value: 2,
  targetKey: "stealth",
};

describe("readCapability", () => {
  it("materializes a scalar passiveBonus", () => {
    const cap = readCapability(scalarSkill);
    expect(cap).toMatchObject({ kind: "passiveBonus", target: "skill", op: "add", value: 2, targetKey: "stealth", dice: null });
  });

  it("round-trips a dice-valued passiveBonus (count/faces/damageType)", () => {
    const cap = readCapability({
      kind: "passiveBonus",
      target: "damage",
      op: "add",
      value: 0,
      valueDiceCount: 1,
      valueDiceFaces: 6,
      valueDamageType: "fire",
    });
    expect(cap.kind).toBe("passiveBonus");
    if (cap.kind !== "passiveBonus") return;
    expect(cap.dice).toEqual({ count: 1, faces: 6, damageType: "fire" });
  });

  it("materializes an activatedEffect (Boots of Speed)", () => {
    const cap = readCapability(bootsOfSpeed);
    expect(cap).toMatchObject({
      kind: "activatedEffect",
      activation: "bonus",
      target: "speed",
      op: "add",
      value: 30,
      duration: "untilRest",
      resourceKind: "perRest",
      resourcePeriod: "long",
      resourceCharges: 1,
    });
  });

  it("reads an activatedEffect missing activation as opaque", () => {
    const cap = readCapability({ kind: "activatedEffect", target: "speed", op: "add", value: 30 });
    expect(cap).toEqual({ kind: "activatedEffect", description: null });
  });

  it("defaults an activatedEffect's recharge to atWill / 1 charge", () => {
    const cap = readCapability({ kind: "activatedEffect", activation: "commandWord", target: "ac", op: "add", value: 1 });
    expect(cap.kind).toBe("activatedEffect");
    if (cap.kind !== "activatedEffect") return;
    expect(cap.resourceKind).toBe("atWill");
    expect(cap.resourceCharges).toBe(1);
    expect(cap.duration).toBe("whileActive");
  });

  it("reads a reserved kind as opaque", () => {
    expect(readCapability({ kind: "castSpell", description: "cast fireball" })).toEqual({
      kind: "castSpell",
      description: "cast fireball",
    });
  });

  it("reads a malformed passiveBonus (missing op) as opaque", () => {
    expect(readCapability({ kind: "passiveBonus", target: "skill", value: 2 }).kind).toBe("passiveBonus");
    // no op → falls through to opaque, value dropped
    const cap = readCapability({ kind: "passiveBonus", target: "skill", value: 2 });
    expect("value" in cap).toBe(false);
  });
});

describe("passiveBonusChannel", () => {
  it("maps skill to its targetKey", () => {
    expect(passiveBonusChannel({ kind: "passiveBonus", target: "skill", op: "add", value: 1, targetKey: "stealth" })).toBe("stealth");
  });
  it("maps damage and attack to the shared buff channels", () => {
    expect(passiveBonusChannel({ kind: "passiveBonus", target: "damage", op: "add", value: 1 })).toBe("meleeDamage");
    expect(passiveBonusChannel({ kind: "passiveBonus", target: "attack", op: "add", value: 1 })).toBe("attackRoll");
  });
  it("returns null for deferred targets (ac, maxHp)", () => {
    expect(passiveBonusChannel({ kind: "passiveBonus", target: "ac", op: "add", value: 1 })).toBeNull();
    expect(passiveBonusChannel({ kind: "passiveBonus", target: "maxHp", op: "add", value: 1 })).toBeNull();
  });
});

describe("deriveItemPassiveBonuses", () => {
  it("includes active (equipped or attuned) items' scalar add bonuses", () => {
    const out = deriveItemPassiveBonuses([
      { name: "Cloak", equipped: true, attuned: false, capabilities: [scalarSkill] },
      { name: "Ring", equipped: false, attuned: true, capabilities: [{ kind: "passiveBonus", target: "attack", op: "add", value: 1 }] },
    ]);
    expect(out).toEqual([
      { target: "stealth", modifier: 2, source: "Cloak" },
      { target: "attackRoll", modifier: 1, source: "Ring" },
    ]);
  });

  it("excludes inactive items (neither equipped nor attuned)", () => {
    expect(
      deriveItemPassiveBonuses([{ name: "Cloak", equipped: false, attuned: false, capabilities: [scalarSkill] }]),
    ).toEqual([]);
  });

  it("skips setTo, dice-valued, and unchanneled targets", () => {
    const out = deriveItemPassiveBonuses([
      {
        name: "Mixed",
        equipped: true,
        attuned: false,
        capabilities: [
          { kind: "passiveBonus", target: "skill", op: "setTo", value: 20, targetKey: "stealth" },
          { kind: "passiveBonus", target: "damage", op: "add", value: 0, valueDiceCount: 1, valueDiceFaces: 6 },
          { kind: "passiveBonus", target: "ac", op: "add", value: 1 },
        ],
      },
    ]);
    expect(out).toEqual([]);
  });
});

describe("activatedEffect helpers", () => {
  const boots = readCapability(bootsOfSpeed) as ActivatedEffectCapability;
  const atWill = readCapability({
    kind: "activatedEffect",
    activation: "commandWord",
    target: "ac",
    op: "add",
    value: 1,
    resourceKind: "atWill",
  }) as ActivatedEffectCapability;

  it("caps uses per recharge (null for atWill)", () => {
    expect(activatedMaxUses(boots)).toBe(1);
    expect(activatedMaxUses(atWill)).toBeNull();
  });

  it("resolves the recharge rest (long for perRest(long), null for atWill)", () => {
    expect(activatedRechargeRest(boots)).toBe("long");
    expect(activatedRechargeRest(atWill)).toBeNull();
    const shortRest = readCapability({ ...bootsOfSpeed, resourcePeriod: "short" }) as ActivatedEffectCapability;
    expect(activatedRechargeRest(shortRest)).toBe("short");
  });

  it("surfaces activation + duration as reminder text", () => {
    expect(describeActivatedReminder(boots)).toBe("Bonus action · until a long rest");
    const timed = readCapability({ ...bootsOfSpeed, durationText: "10 minutes" }) as ActivatedEffectCapability;
    expect(describeActivatedReminder(timed)).toContain("10 minutes");
    expect(describeActivatedReminder(atWill)).toContain("Command word");
  });
});

describe("attunement prerequisites", () => {
  const subject = {
    classEntries: [{ name: "Wizard", subclass: null }],
    raceName: "Elf",
    alignment: "Chaotic Good",
  };

  it("passes a matching class / species / alignment (case-insensitive)", () => {
    expect(meetsAttunementPrereq({ kind: "class", value: "wizard" }, subject)).toBe(true);
    expect(meetsAttunementPrereq({ kind: "species", value: "elf" }, subject)).toBe(true);
    expect(meetsAttunementPrereq({ kind: "alignment", value: "chaotic good" }, subject)).toBe(true);
  });

  it("passes spellcaster when a caster class is present", () => {
    expect(meetsAttunementPrereq({ kind: "spellcaster", value: null }, subject)).toBe(true);
    expect(
      meetsAttunementPrereq({ kind: "spellcaster", value: null }, { classEntries: [{ name: "Barbarian" }], raceName: null, alignment: null }),
    ).toBe(false);
  });

  it("fails a non-matching prerequisite", () => {
    expect(meetsAttunementPrereq({ kind: "class", value: "Fighter" }, subject)).toBe(false);
  });

  it("describes the prerequisite for the error message", () => {
    expect(describeAttunementPrereq({ kind: "spellcaster", value: null })).toBe("a spellcaster");
    expect(describeAttunementPrereq({ kind: "class", value: "Wizard" })).toBe("a Wizard");
  });
});

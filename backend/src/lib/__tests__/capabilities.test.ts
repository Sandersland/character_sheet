import { describe, expect, it } from "vitest";

import {
  castUsesTotal,
  deriveItemPassiveBonuses,
  describeAttunementPrereq,
  meetsAttunementPrereq,
  passiveBonusChannel,
  readCapability,
  serializeCapability,
  type CapabilityColumns,
} from "../capabilities.js";

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

const castSpellRow: CapabilityColumns = {
  kind: "castSpell",
  spellId: "spell-witch-bolt",
  spellName: "Witch Bolt",
  spellLevel: 1,
  castLevel: 1,
  castResource: "perRestShort",
  castUses: 1,
  castConcentration: true,
  dcMode: "fixed",
  dcValue: 15,
  attackMode: "fixed",
  attackValue: 7,
};

describe("readCapability — castSpell (#528)", () => {
  it("materializes a castSpell capability with fixed DC/attack", () => {
    const cap = readCapability(castSpellRow);
    expect(cap).toMatchObject({
      kind: "castSpell",
      spellId: "spell-witch-bolt",
      spellName: "Witch Bolt",
      spellLevel: 1,
      castLevel: 1,
      resource: "perRestShort",
      uses: 1,
      concentration: true,
      dcMode: "fixed",
      dcValue: 15,
      attackMode: "fixed",
      attackValue: 7,
    });
  });

  it("defaults resource/uses/modes when unset", () => {
    const cap = readCapability({ kind: "castSpell", spellId: "s1", spellName: "X", spellLevel: 0 });
    if (cap.kind !== "castSpell") throw new Error("expected castSpell");
    expect(cap.resource).toBe("perDayDawn");
    expect(cap.uses).toBe(1);
    expect(cap.dcMode).toBe("fixed");
    expect(cap.attackMode).toBe("fixed");
  });

  it("reads a castSpell without a spellId as opaque", () => {
    expect(readCapability({ kind: "castSpell", description: "cast fireball" })).toEqual({
      kind: "castSpell",
      description: "cast fireball",
    });
  });

  it("round-trips through serializeCapability", () => {
    expect(serializeCapability(castSpellRow)).toEqual({
      kind: "castSpell",
      spellId: "spell-witch-bolt",
      spellName: "Witch Bolt",
      spellLevel: 1,
      castLevel: 1,
      resource: "perRestShort",
      uses: 1,
      concentration: true,
      dcMode: "fixed",
      dcValue: 15,
      attackMode: "fixed",
      attackValue: 7,
    });
  });
});

describe("castUsesTotal", () => {
  it("returns Infinity for atWill", () => {
    const cap = readCapability({ ...castSpellRow, castResource: "atWill" });
    if (cap.kind !== "castSpell") throw new Error("expected castSpell");
    expect(castUsesTotal(cap)).toBe(Infinity);
  });
  it("returns the authored uses for a rest resource", () => {
    const cap = readCapability({ ...castSpellRow, castUses: 3 });
    if (cap.kind !== "castSpell") throw new Error("expected castSpell");
    expect(castUsesTotal(cap)).toBe(3);
  });
  it("floors to 1 when uses is zero/unset", () => {
    const cap = readCapability({ ...castSpellRow, castUses: 0 });
    if (cap.kind !== "castSpell") throw new Error("expected castSpell");
    expect(castUsesTotal(cap)).toBe(1);
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
  it("maps ac to its own channel (#383)", () => {
    expect(passiveBonusChannel({ kind: "passiveBonus", target: "ac", op: "add", value: 1 })).toBe("ac");
  });
  it("returns null for still-deferred targets (maxHp)", () => {
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

  it("channels an active item's ac bonus, carrying condition text when present (#383)", () => {
    const out = deriveItemPassiveBonuses([
      { name: "Ring of Protection", equipped: false, attuned: true, capabilities: [{ kind: "passiveBonus", target: "ac", op: "add", value: 1 }] },
      { name: "Bracers of Defense", equipped: false, attuned: true, capabilities: [{ kind: "passiveBonus", target: "ac", op: "add", value: 2, condition: "while wearing no armor and no shield" }] },
    ]);
    expect(out).toEqual([
      { target: "ac", modifier: 1, source: "Ring of Protection" },
      { target: "ac", modifier: 2, source: "Bracers of Defense", condition: "while wearing no armor and no shield" },
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
          { kind: "passiveBonus", target: "maxHp", op: "add", value: 1 },
        ],
      },
    ]);
    expect(out).toEqual([]);
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

import { describe, expect, it } from "vitest";

import {
  deriveItemGrants,
  deriveItemPassiveBonuses,
  describeAttunementPrereq,
  isItemActive,
  itemResistedDamageTypes,
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

describe("grant capabilities (#529)", () => {
  const resistFire: CapabilityColumns = { kind: "grant", grantType: "resistance", grantValueKind: "damageType", grantValue: "fire" };
  const profPerception: CapabilityColumns = { kind: "grant", grantType: "proficiency", grantValueKind: "skill", grantValue: "perception" };
  const advCheckPerception: CapabilityColumns = { kind: "grant", grantType: "advantage", grantOn: "check", grantValueKind: "skill", grantValue: "perception" };
  const advInitSurprise: CapabilityColumns = { kind: "grant", grantType: "advantage", grantOn: "initiative", cantBeSurprised: true };
  const immPoisoned: CapabilityColumns = { kind: "grant", grantType: "conditionImmunity", grantValueKind: "condition", grantValue: "poisoned" };

  it("materializes a grant capability", () => {
    expect(readCapability(resistFire)).toEqual({
      kind: "grant",
      grantType: "resistance",
      grantOn: null,
      grantValueKind: "damageType",
      grantValue: "fire",
      cantBeSurprised: false,
      description: null,
    });
  });

  it("reads a grant missing grantType as opaque", () => {
    expect(readCapability({ kind: "grant" }).kind).toBe("grant");
    expect("grantType" in readCapability({ kind: "grant" })).toBe(false);
  });

  it("round-trips a grant through serializeCapability (nulls dropped)", () => {
    expect(serializeCapability(advInitSurprise)).toEqual({ kind: "grant", grantType: "advantage", grantOn: "initiative", cantBeSurprised: true });
    expect(serializeCapability(resistFire)).toEqual({ kind: "grant", grantType: "resistance", grantValueKind: "damageType", grantValue: "fire" });
  });

  it("gates activation: attunement item active only when attuned; else when equipped", () => {
    expect(isItemActive({ equipped: true, attuned: false, requiresAttunement: true })).toBe(false);
    expect(isItemActive({ equipped: false, attuned: true, requiresAttunement: true })).toBe(true);
    expect(isItemActive({ equipped: true, attuned: false, requiresAttunement: false })).toBe(true);
    expect(isItemActive({ equipped: false, attuned: false, requiresAttunement: false })).toBe(false);
  });

  it("buckets grants from active items by derivation channel", () => {
    const out = deriveItemGrants([
      { name: "Ring of Fire Resistance", equipped: false, attuned: true, requiresAttunement: true, capabilities: [resistFire] },
      { name: "Eyes of the Eagle", equipped: false, attuned: true, requiresAttunement: true, capabilities: [advCheckPerception, profPerception] },
      { name: "Weapon of Warning", equipped: true, attuned: true, requiresAttunement: true, capabilities: [advInitSurprise] },
      { name: "Amulet", equipped: false, attuned: true, requiresAttunement: true, capabilities: [immPoisoned] },
    ]);
    expect(out.resistances).toEqual([{ value: "fire", source: "Ring of Fire Resistance" }]);
    expect(out.proficiencies).toEqual([{ profType: "skill", value: "perception", source: "Eyes of the Eagle" }]);
    expect(out.conditionImmunities).toEqual([{ value: "poisoned", source: "Amulet" }]);
    expect(out.advantages).toEqual([
      { on: "check", valueKind: "skill", value: "perception", cantBeSurprised: false, source: "Eyes of the Eagle" },
      { on: "initiative", cantBeSurprised: true, source: "Weapon of Warning" },
    ]);
  });

  it("drops grants from an inactive (unattuned) item — no residue", () => {
    const out = deriveItemGrants([
      { name: "Ring of Fire Resistance", equipped: true, attuned: false, requiresAttunement: true, capabilities: [resistFire] },
    ]);
    expect(out.resistances).toEqual([]);
    expect(itemResistedDamageTypes([
      { name: "Ring of Fire Resistance", equipped: true, attuned: false, requiresAttunement: true, capabilities: [resistFire] },
    ]).size).toBe(0);
  });

  it("exposes active resistances as a damage-type set for the #456 halve flow", () => {
    const set = itemResistedDamageTypes([
      { name: "Ring of Fire Resistance", equipped: false, attuned: true, requiresAttunement: true, capabilities: [resistFire] },
    ]);
    expect(set.has("fire")).toBe(true);
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

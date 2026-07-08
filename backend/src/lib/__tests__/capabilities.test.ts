import { describe, expect, it } from "vitest";

import {
  activatedMaxUses,
  activatedRechargeRest,
  castResourceRechargesOn,
  castUsesTotal,
  chargePoolOf,
  chargeTriggerRechargesOn,
  describeActivatedReminder,
  describeChargeRecharge,
  deriveItemGrants,
  deriveItemPassiveBonuses,
  describeAttunementPrereq,
  isItemActive,
  itemImmuneDamageTypes,
  itemResistedDamageTypes,
  meetsAttunementPrereq,
  passiveBonusChannel,
  readCapability,
  serializeCapability,
  type ActivatedEffectCapability,
  type CapabilityColumns,
  type ChargesCapability,
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

  it("exposes active damage immunities as a set for the damage-apply zeroing", () => {
    const immFire: CapabilityColumns = { kind: "grant", grantType: "immunity", grantValueKind: "damageType", grantValue: "fire" };
    const set = itemImmuneDamageTypes([
      { name: "Amulet", equipped: false, attuned: true, requiresAttunement: true, capabilities: [immFire] },
    ]);
    expect(set.has("fire")).toBe(true);
    // Inactive item contributes nothing.
    expect(itemImmuneDamageTypes([
      { name: "Amulet", equipped: false, attuned: false, requiresAttunement: true, capabilities: [immFire] },
    ]).size).toBe(0);
  });

  it("drops a stale skill/ability qualifier from a whole-axis (initiative/attack) advantage", () => {
    // A grant mis-authored with a leftover skill value on an initiative axis.
    const staleInit: CapabilityColumns = {
      kind: "grant",
      grantType: "advantage",
      grantOn: "initiative",
      grantValueKind: "skill",
      grantValue: "perception",
      cantBeSurprised: true,
    };
    const out = deriveItemGrants([
      { name: "Weapon of Warning", equipped: true, attuned: true, requiresAttunement: true, capabilities: [staleInit] },
    ]);
    expect(out.advantages).toEqual([
      { on: "initiative", cantBeSurprised: true, source: "Weapon of Warning" },
    ]);
  });
});

describe("charges pool (#555)", () => {
  // Wand of Magic Missiles: 7 charges, regains 1d6+1 daily at dawn.
  const wandPool: CapabilityColumns = {
    kind: "charges",
    maxCharges: 7,
    rechargeDiceCount: 1,
    rechargeDiceFaces: 6,
    rechargeBonus: 1,
    rechargeTrigger: "dawn",
  };

  it("materializes a charges capability", () => {
    expect(readCapability(wandPool)).toEqual({
      kind: "charges",
      maxCharges: 7,
      rechargeTrigger: "dawn",
      rechargeDice: { count: 1, faces: 6 },
      rechargeBonus: 1,
      description: null,
    });
  });

  it("defaults the trigger to dawn and dice to null", () => {
    const cap = readCapability({ kind: "charges", maxCharges: 3 });
    expect(cap).toEqual({ kind: "charges", maxCharges: 3, rechargeTrigger: "dawn", rechargeDice: null, rechargeBonus: null, description: null });
  });

  it("reads a charges row missing maxCharges as opaque", () => {
    const cap = readCapability({ kind: "charges", description: "3 charges of light" });
    expect(cap).toEqual({ kind: "charges", description: "3 charges of light" });
    expect("maxCharges" in cap).toBe(false);
  });

  it("round-trips through serializeCapability with a nested recharge", () => {
    expect(serializeCapability(wandPool)).toEqual({
      kind: "charges",
      maxCharges: 7,
      recharge: { trigger: "dawn", dice: { count: 1, faces: 6 }, bonus: 1 },
    });
    // Dice-less full-refill pool: recharge carries only the trigger.
    expect(serializeCapability({ kind: "charges", maxCharges: 3, rechargeTrigger: "long" })).toEqual({
      kind: "charges",
      maxCharges: 3,
      recharge: { trigger: "long" },
    });
  });

  it("serializes chargeCost on a charges-costed castSpell (and defaults it to 1)", () => {
    expect(serializeCapability({ ...castSpellRow, castResource: "charges", chargeCost: 2 })).toMatchObject({
      kind: "castSpell",
      resource: "charges",
      chargeCost: 2,
    });
    expect(serializeCapability({ ...castSpellRow, castResource: "charges" })).toMatchObject({ chargeCost: 1 });
    // Non-charges resources don't carry a chargeCost.
    expect("chargeCost" in serializeCapability(castSpellRow)).toBe(false);
  });

  it("finds the item's pool (first well-formed charges row) with its raw row", () => {
    const rows = [scalarSkill, { ...wandPool, id: "cap-pool" } as CapabilityColumns & { id: string }];
    const pool = chargePoolOf(rows);
    expect(pool?.cap.maxCharges).toBe(7);
    expect((pool?.row as { id?: string })?.id).toBe("cap-pool");
    // Malformed charges rows don't count as a pool.
    expect(chargePoolOf([{ kind: "charges" } as CapabilityColumns])).toBeNull();
    expect(chargePoolOf([scalarSkill])).toBeNull();
  });

  it("maps recharge triggers to rests (short fires on both; dawn/dusk/long on long only)", () => {
    expect(chargeTriggerRechargesOn("short", "short")).toBe(true);
    expect(chargeTriggerRechargesOn("short", "long")).toBe(true);
    expect(chargeTriggerRechargesOn("dawn", "short")).toBe(false);
    expect(chargeTriggerRechargesOn("dawn", "long")).toBe(true);
    expect(chargeTriggerRechargesOn("dusk", "long")).toBe(true);
    expect(chargeTriggerRechargesOn("long", "short")).toBe(false);
  });

  it("never recharges a charges-costed castSpell's own counter (the pool recharges)", () => {
    expect(castResourceRechargesOn("charges", "short")).toBe(false);
    expect(castResourceRechargesOn("charges", "long")).toBe(false);
  });

  it("pool-gates a charges-costed activatedEffect (no per-item counter, no rest reset)", () => {
    const cap = readCapability({
      kind: "activatedEffect",
      activation: "commandWord",
      target: "ac",
      op: "add",
      value: 1,
      resourceKind: "charges",
      chargeCost: 2,
    }) as ActivatedEffectCapability;
    expect(cap.chargeCost).toBe(2);
    expect(activatedMaxUses(cap)).toBeNull();
    expect(activatedRechargeRest(cap)).toBeNull();
  });

  it("describes the recharge for the pill tooltip", () => {
    const pool = readCapability(wandPool) as ChargesCapability;
    expect(describeChargeRecharge(pool)).toBe("regains 1d6+1 at dawn");
    expect(describeChargeRecharge(readCapability({ kind: "charges", maxCharges: 3, rechargeTrigger: "long" }) as ChargesCapability)).toBe(
      "refills on a long rest",
    );
    expect(
      describeChargeRecharge(readCapability({ kind: "charges", maxCharges: 3, rechargeTrigger: "dawn", rechargeBonus: 1 }) as ChargesCapability),
    ).toBe("regains 1 at dawn");
    expect(
      describeChargeRecharge(readCapability({ kind: "charges", maxCharges: 3, rechargeTrigger: "short", rechargeDiceCount: 1, rechargeDiceFaces: 4 }) as ChargesCapability),
    ).toBe("regains 1d4 on a short rest");
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

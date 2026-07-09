import { describe, it, expect } from "vitest";

import {
  NEW_CAST,
  applyAdvantageOn,
  applyDiceToggle,
  applyGrantType,
  applyProfKind,
  applySpell,
  applyTarget,
  draftForKind,
  keyOptions,
} from "@/lib/capabilityDraft";
import type { CatalogSpell, ItemCapability } from "@/types/character";

function spell(partial: Partial<CatalogSpell> & Pick<CatalogSpell, "id" | "name" | "level">): CatalogSpell {
  return {
    school: "evocation",
    castingTime: "1 action",
    range: "60 ft",
    duration: "Instantaneous",
    description: "",
    concentration: false,
    ritual: false,
    classes: ["wizard"],
    cantripScaling: false,
    ...partial,
  };
}

describe("draftForKind", () => {
  it("returns a fresh copy per kind (not the shared default reference)", () => {
    const a = draftForKind("castSpell");
    const b = draftForKind("castSpell");
    expect(a).toEqual(NEW_CAST);
    expect(a).not.toBe(NEW_CAST);
    expect(a).not.toBe(b);
  });

  it("maps each kind to its default", () => {
    expect(draftForKind("castSpell").kind).toBe("castSpell");
    expect(draftForKind("grant").kind).toBe("grant");
    expect(draftForKind("charges").kind).toBe("charges");
    expect(draftForKind("passiveBonus").kind).toBe("passiveBonus");
  });
});

describe("keyOptions", () => {
  it("skill target uses skills, save/abilityScore use abilities, others none", () => {
    expect(keyOptions("skill").length).toBeGreaterThan(0);
    expect(keyOptions("skill")[0]).toHaveProperty("key");
    expect(keyOptions("save").length).toBeGreaterThan(0);
    expect(keyOptions("abilityScore").length).toBeGreaterThan(0);
    expect(keyOptions("ac")).toEqual([]);
  });
});

describe("applySpell", () => {
  const cap: ItemCapability = { ...NEW_CAST };

  it("save spell keeps a DC and clears the attack value", () => {
    const patch = applySpell(cap, spell({ id: "s1", name: "Fireball", level: 3, attackType: "save" }));
    expect(patch.dcValue).toBe(13);
    expect(patch.attackValue).toBeUndefined();
  });

  it("attack spell keeps an attack value and clears the DC", () => {
    const patch = applySpell(cap, spell({ id: "s2", name: "Fire Bolt", level: 0, attackType: "attack" }));
    expect(patch.attackValue).toBe(5);
    expect(patch.dcValue).toBeUndefined();
  });

  it("utility spell clears both DC and attack (no stale default rides along)", () => {
    const patch = applySpell(cap, spell({ id: "s3", name: "Fly", level: 3 }));
    expect(patch.dcValue).toBeUndefined();
    expect(patch.attackValue).toBeUndefined();
    expect(patch.spellId).toBe("s3");
  });
});

describe("applyTarget", () => {
  it("preserves a still-valid targetKey but resets an incompatible one", () => {
    const withStealth: ItemCapability = { kind: "passiveBonus", target: "skill", targetKey: "stealth" };
    expect(applyTarget(withStealth, "skill").targetKey).toBe("stealth");
    // A skill key is invalid for an ability-keyed save target → falls to first ability.
    expect(applyTarget(withStealth, "save").targetKey).toBe(keyOptions("save")[0].key);
  });

  it("clears targetKey when the new target keys off nothing", () => {
    const cap: ItemCapability = { kind: "passiveBonus", target: "skill", targetKey: "stealth" };
    expect(applyTarget(cap, "ac").targetKey).toBeUndefined();
  });
});

describe("applyDiceToggle", () => {
  it("on adds a dice default and clears the scalar; off does the reverse", () => {
    expect(applyDiceToggle(true)).toEqual({ dice: { count: 1, faces: 6 }, value: undefined });
    expect(applyDiceToggle(false)).toEqual({ dice: undefined, value: 1 });
  });
});

describe("applyGrantType", () => {
  it("advantage seeds a check axis; switching away clears advantage-only fields", () => {
    const adv = applyGrantType("advantage");
    expect(adv.grantOn).toBe("check");
    expect(adv.cantBeSurprised).toBe(false);
    const res = applyGrantType("resistance");
    expect(res.grantOn).toBeUndefined();
    expect(res.cantBeSurprised).toBeUndefined();
    expect(res.grantValueKind).toBe("damageType");
  });
});

describe("applyProfKind", () => {
  it("seeds a default value per kind, empty for free-text kinds", () => {
    expect(applyProfKind("skill")).toEqual({ grantValueKind: "skill", grantValue: "perception" });
    expect(applyProfKind("save")).toEqual({ grantValueKind: "save", grantValue: "strength" });
    expect(applyProfKind("weapon")).toEqual({ grantValueKind: "weapon", grantValue: "" });
  });
});

describe("applyAdvantageOn", () => {
  it("whole-axis clears the qualifier; check/save reset it to the matching kind", () => {
    expect(applyAdvantageOn("initiative")).toEqual({ grantOn: "initiative", grantValueKind: undefined, grantValue: undefined });
    expect(applyAdvantageOn("check")).toEqual({ grantOn: "check", grantValueKind: "skill", grantValue: undefined });
    expect(applyAdvantageOn("save")).toEqual({ grantOn: "save", grantValueKind: "save", grantValue: undefined });
  });
});

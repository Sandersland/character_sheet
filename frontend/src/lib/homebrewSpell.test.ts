import { describe, expect, it } from "vitest";

import {
  BLANK_HOMEBREW_SPELL,
  buildHomebrewSpellPayload,
  ownedHomebrewSpells,
  toHomebrewSpellInput,
  validateHomebrewSpellDraft,
} from "@/lib/homebrewSpell";
import type { CatalogSpell, HomebrewSpellInput } from "@/types/character";

describe("buildHomebrewSpellPayload", () => {
  it("trims text fields and carries the core fields + classes", () => {
    const payload = buildHomebrewSpellPayload(
      { ...BLANK_HOMEBREW_SPELL, name: "  Zap  ", castingTime: " 1 action ", classes: ["wizard"] },
      false,
    );
    expect(payload.name).toBe("Zap");
    expect(payload.castingTime).toBe("1 action");
    expect(payload.classes).toEqual(["wizard"]);
    expect(payload.effectKind).toBeUndefined();
  });

  it("omits effect fields when hasEffect is false even if set on the draft", () => {
    const payload = buildHomebrewSpellPayload(
      { ...BLANK_HOMEBREW_SPELL, name: "Zap", effectKind: "damage", effectDiceCount: 4, effectDiceFaces: 6 },
      false,
    );
    expect(payload.effectKind).toBeUndefined();
    expect(payload.effectDiceCount).toBeUndefined();
  });

  it("omits effect fields when hasEffect is true but no effectKind chosen", () => {
    const payload = buildHomebrewSpellPayload({ ...BLANK_HOMEBREW_SPELL, name: "Zap", effectDiceCount: 4 }, true);
    expect(payload.effectKind).toBeUndefined();
    expect(payload.effectDiceCount).toBeUndefined();
  });

  it("includes dice/modifier fields when hasEffect is true and a kind is chosen", () => {
    const payload = buildHomebrewSpellPayload(
      { ...BLANK_HOMEBREW_SPELL, name: "Zap", effectKind: "heal", effectDiceCount: 2, effectDiceFaces: 4, effectModifier: 1 },
      true,
    );
    expect(payload.effectKind).toBe("heal");
    expect(payload.effectDiceCount).toBe(2);
    expect(payload.effectDiceFaces).toBe(4);
    expect(payload.effectModifier).toBe(1);
  });

  it("includes damage type + attack type only for effectKind 'damage'", () => {
    const heal = buildHomebrewSpellPayload(
      { ...BLANK_HOMEBREW_SPELL, name: "Cure", effectKind: "heal", effectDiceCount: 2, effectDiceFaces: 4, damageType: "fire", attackType: "attack" },
      true,
    );
    expect(heal.damageType).toBeUndefined();
    expect(heal.attackType).toBeUndefined();

    const damage = buildHomebrewSpellPayload(
      { ...BLANK_HOMEBREW_SPELL, name: "Bolt", effectKind: "damage", effectDiceCount: 8, effectDiceFaces: 6, damageType: "fire", attackType: "attack" },
      true,
    );
    expect(damage.damageType).toBe("fire");
    expect(damage.attackType).toBe("attack");
  });

  it("includes saveAbility/saveEffect only when attackType is 'save'", () => {
    const attack = buildHomebrewSpellPayload(
      {
        ...BLANK_HOMEBREW_SPELL,
        name: "Bolt",
        effectKind: "damage",
        effectDiceCount: 8,
        effectDiceFaces: 6,
        attackType: "attack",
        saveAbility: "dexterity",
      },
      true,
    );
    expect(attack.saveAbility).toBeUndefined();
    expect(attack.saveEffect).toBeUndefined();

    const save = buildHomebrewSpellPayload(
      {
        ...BLANK_HOMEBREW_SPELL,
        name: "Fireball",
        effectKind: "damage",
        effectDiceCount: 8,
        effectDiceFaces: 6,
        attackType: "save",
        saveAbility: "dexterity",
        saveEffect: "half",
      },
      true,
    );
    expect(save.saveAbility).toBe("dexterity");
    expect(save.saveEffect).toBe("half");
  });

  it("includes upcastDicePerLevel when set, omits it when blank", () => {
    const withUpcast = buildHomebrewSpellPayload(
      { ...BLANK_HOMEBREW_SPELL, name: "Bolt", effectKind: "heal", effectDiceCount: 2, effectDiceFaces: 4, upcastDicePerLevel: 1 },
      true,
    );
    expect(withUpcast.upcastDicePerLevel).toBe(1);

    const withoutUpcast = buildHomebrewSpellPayload(
      { ...BLANK_HOMEBREW_SPELL, name: "Bolt", effectKind: "heal", effectDiceCount: 2, effectDiceFaces: 4 },
      true,
    );
    expect(withoutUpcast.upcastDicePerLevel).toBeUndefined();
  });

  describe("multi-instance fields (#1981/#1984)", () => {
    it("omits instanceCount/instanceRoll/upcastInstancesPerLevel when unset — un-instanced spells stay byte-identical", () => {
      const payload = buildHomebrewSpellPayload(
        { ...BLANK_HOMEBREW_SPELL, name: "Bolt", effectKind: "damage", effectDiceCount: 8, effectDiceFaces: 6 },
        true,
      );
      expect(payload.instanceCount).toBeUndefined();
      expect(payload.instanceRoll).toBeUndefined();
      expect(payload.upcastInstancesPerLevel).toBeUndefined();
    });

    it("includes instanceCount alone when set to 1 (no roll mode / upcast instances)", () => {
      const payload = buildHomebrewSpellPayload(
        { ...BLANK_HOMEBREW_SPELL, name: "Bolt", effectKind: "damage", effectDiceCount: 1, effectDiceFaces: 10, instanceCount: 1, instanceRoll: "once", upcastInstancesPerLevel: 1 },
        true,
      );
      expect(payload.instanceCount).toBe(1);
      expect(payload.instanceRoll).toBeUndefined();
      expect(payload.upcastInstancesPerLevel).toBeUndefined();
    });

    it("includes instanceRoll + upcastInstancesPerLevel once instanceCount is greater than 1", () => {
      const payload = buildHomebrewSpellPayload(
        {
          ...BLANK_HOMEBREW_SPELL,
          name: "Bolt",
          effectKind: "damage",
          effectDiceCount: 1,
          effectDiceFaces: 4,
          instanceCount: 3,
          instanceRoll: "once",
          upcastInstancesPerLevel: 1,
        },
        true,
      );
      expect(payload.instanceCount).toBe(3);
      expect(payload.instanceRoll).toBe("once");
      expect(payload.upcastInstancesPerLevel).toBe(1);
    });
  });
});

describe("validateHomebrewSpellDraft", () => {
  const base: HomebrewSpellInput = {
    ...BLANK_HOMEBREW_SPELL,
    name: "Bolt",
    description: "A bolt of arcane energy.",
    classes: [],
  };

  it("requires a name", () => {
    expect(validateHomebrewSpellDraft({ ...base, name: "  " }, false)).toMatch(/name/i);
  });

  it("requires a description", () => {
    expect(validateHomebrewSpellDraft({ ...base, description: "  " }, false)).toMatch(/description/i);
  });

  it("requires level between 0 and 9", () => {
    expect(validateHomebrewSpellDraft({ ...base, level: 10 }, false)).toMatch(/level/i);
    expect(validateHomebrewSpellDraft({ ...base, level: -1 }, false)).toMatch(/level/i);
    expect(validateHomebrewSpellDraft({ ...base, level: 9 }, false)).toBeNull();
  });

  it("passes for a utility spell with no effect enabled", () => {
    expect(validateHomebrewSpellDraft(base, false)).toBeNull();
  });

  it("requires dice count + faces when an effect is enabled with a kind", () => {
    expect(validateHomebrewSpellDraft({ ...base, effectKind: "damage" }, true)).toMatch(/dice/i);
    expect(
      validateHomebrewSpellDraft({ ...base, effectKind: "damage", effectDiceCount: 1, effectDiceFaces: 6 }, true),
    ).toBeNull();
  });

  it("requires saveAbility when attackType is 'save'", () => {
    expect(
      validateHomebrewSpellDraft(
        { ...base, effectKind: "damage", effectDiceCount: 1, effectDiceFaces: 6, attackType: "save" },
        true,
      ),
    ).toMatch(/save ability/i);
    expect(
      validateHomebrewSpellDraft(
        {
          ...base,
          effectKind: "damage",
          effectDiceCount: 1,
          effectDiceFaces: 6,
          attackType: "save",
          saveAbility: "wisdom",
        },
        true,
      ),
    ).toBeNull();
  });

  it("ignores effect fields entirely when hasEffect is false", () => {
    expect(validateHomebrewSpellDraft({ ...base, effectKind: "damage" }, false)).toBeNull();
  });

  describe("multi-instance fields (#1981/#1984)", () => {
    const instanced = { ...base, effectKind: "damage" as const, effectDiceCount: 1, effectDiceFaces: 6, level: 1 };

    it("rejects instanceRoll without instanceCount", () => {
      expect(validateHomebrewSpellDraft({ ...instanced, instanceRoll: "each" }, true)).toMatch(/instance count/i);
    });

    it("rejects upcastInstancesPerLevel without instanceCount", () => {
      expect(validateHomebrewSpellDraft({ ...instanced, upcastInstancesPerLevel: 1 }, true)).toMatch(/instance count/i);
    });

    it("rejects upcastInstancesPerLevel on a cantrip (level 0)", () => {
      expect(
        validateHomebrewSpellDraft({ ...instanced, level: 0, instanceCount: 2, upcastInstancesPerLevel: 1 }, true),
      ).toMatch(/cantrip/i);
    });

    it("accepts instanceCount + instanceRoll + upcastInstancesPerLevel together on a leveled spell", () => {
      expect(
        validateHomebrewSpellDraft(
          { ...instanced, instanceCount: 3, instanceRoll: "once", upcastInstancesPerLevel: 1 },
          true,
        ),
      ).toBeNull();
    });

    it("passes an un-instanced spell unaffected", () => {
      expect(validateHomebrewSpellDraft(instanced, true)).toBeNull();
    });
  });
});

function catalogSpell(over: Partial<CatalogSpell> = {}): CatalogSpell {
  return {
    id: "s1",
    name: "Test Bolt",
    level: 1,
    school: "evocation",
    castingTime: "1 action",
    range: "60 feet",
    duration: "Instantaneous",
    description: "A bolt of test energy.",
    concentration: false,
    ritual: false,
    classes: ["wizard"],
    cantripScaling: false,
    ...over,
  };
}

describe("ownedHomebrewSpells", () => {
  it("keeps only rows with catalog.editable true, dropping seeded rows", () => {
    const seeded = catalogSpell({
      id: "seeded",
      ownerId: undefined,
      catalog: { entryId: "entry-seeded", scope: "GLOBAL", isFork: false, forkedFromId: null, editable: false },
    });
    const homebrew = catalogSpell({
      id: "own",
      ownerId: "u1",
      catalog: { entryId: "entry-own", scope: "USER", isFork: false, forkedFromId: null, editable: true },
    });
    expect(ownedHomebrewSpells([seeded, homebrew])).toEqual([homebrew]);
  });

  it("returns an empty list when the catalog has no homebrew", () => {
    const seeded = catalogSpell({
      ownerId: undefined,
      catalog: { entryId: "entry-1", scope: "GLOBAL", isFork: false, forkedFromId: null, editable: false },
    });
    expect(ownedHomebrewSpells([seeded])).toEqual([]);
  });

  // `catalog.editable` is the only signal this function reads; it's false for a granted row regardless of what ownerId says.
  it("drops a granted (not owned) USER row even if ownerId carries the granter's id", () => {
    const granted = catalogSpell({
      id: "granted",
      ownerId: "granter-id",
      catalog: { entryId: "entry-granted", scope: "USER", isFork: false, forkedFromId: null, editable: false },
    });
    expect(ownedHomebrewSpells([granted])).toEqual([]);
  });

  // Gated on the server-computed `catalog.editable`, never on scope alone: a campaign-aware picker serves a CAMPAIGN row to every member, not just its DM.
  it("keeps a CAMPAIGN-scope row with no ownerId when catalog.editable is true (the DM's own fork)", () => {
    const campaignFork = catalogSpell({
      id: "campaign-fork",
      ownerId: undefined,
      catalog: { entryId: "entry-1", scope: "CAMPAIGN", isFork: true, forkedFromId: "entry-origin", editable: true },
    });
    expect(ownedHomebrewSpells([campaignFork])).toEqual([campaignFork]);
  });

  it("drops a CAMPAIGN-scope row when catalog.editable is false (a fellow, non-DM member)", () => {
    const notMyFork = catalogSpell({
      id: "campaign-fork",
      ownerId: undefined,
      catalog: { entryId: "entry-1", scope: "CAMPAIGN", isFork: true, forkedFromId: "entry-origin", editable: false },
    });
    expect(ownedHomebrewSpells([notMyFork])).toEqual([]);
  });

  it("still drops a GLOBAL row with no ownerId", () => {
    const seededGlobal = catalogSpell({
      id: "seeded",
      ownerId: undefined,
      catalog: { entryId: "entry-2", scope: "GLOBAL", isFork: false, forkedFromId: null, editable: false },
    });
    expect(ownedHomebrewSpells([seededGlobal])).toEqual([]);
  });
});

describe("toHomebrewSpellInput", () => {
  it("maps a served CatalogSpell into an editable draft", () => {
    const spell = catalogSpell({
      ownerId: "u1",
      name: "Ember Bolt",
      level: 2,
      components: { verbal: true, somatic: true, material: false },
      classes: ["wizard", "sorcerer"],
      effectKind: "damage",
      effectDiceCount: 3,
      effectDiceFaces: 6,
      damageType: "fire",
      attackType: "save",
      saveAbility: "dexterity",
      saveEffect: "half",
    });

    expect(toHomebrewSpellInput(spell)).toEqual({
      name: "Ember Bolt",
      level: 2,
      school: "evocation",
      castingTime: "1 action",
      range: "60 feet",
      duration: "Instantaneous",
      description: "A bolt of test energy.",
      concentration: false,
      ritual: false,
      components: { verbal: true, somatic: true, material: false },
      classes: ["wizard", "sorcerer"],
      effectKind: "damage",
      effectDiceCount: 3,
      effectDiceFaces: 6,
      effectModifier: undefined,
      damageType: "fire",
      attackType: "save",
      saveAbility: "dexterity",
      saveEffect: "half",
      upcastDicePerLevel: undefined,
    });
  });

  it("defaults components to all-false-but-verbal when the row has none", () => {
    const spell = catalogSpell({ ownerId: "u1", components: undefined });
    expect(toHomebrewSpellInput(spell).components).toEqual({ verbal: true, somatic: false, material: false });
  });

  it("carries instanceCount/instanceRoll/upcastInstancesPerLevel into the editable draft (#1984)", () => {
    const spell = catalogSpell({
      ownerId: "u1",
      instanceCount: 3,
      instanceRoll: "once",
      upcastInstancesPerLevel: 1,
    });
    expect(toHomebrewSpellInput(spell)).toMatchObject({
      instanceCount: 3,
      instanceRoll: "once",
      upcastInstancesPerLevel: 1,
    });
  });
});

import { describe, expect, it } from "vitest";

import { BLANK_HOMEBREW_SPELL, buildHomebrewSpellPayload, validateHomebrewSpellDraft } from "@/lib/homebrewSpell";
import type { HomebrewSpellInput } from "@/types/character";

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
});
